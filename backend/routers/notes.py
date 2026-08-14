"""
Notes Router — Notes Solver Feature

Endpoints:
  POST   /studyme/notes/upload                    Upload notes file, returns upload_id
  GET    /studyme/notes/{upload_id}/status        Poll ingestion status
  GET    /studyme/notes/{subject_id}/available    List ready problem sets for a subject
  GET    /studyme/notes/problems/{problem_id}/steps  Full problem + solution steps
  DELETE /studyme/notes/{upload_id}               Soft-delete own upload
  POST   /studyme/notes/{upload_id}/restore       Undo soft-delete
"""

import hashlib
import logging
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from db.session import SessionLocal
from db.models.chapter_upload import ChapterUpload
from db.models.notes_problem_set import NotesProblemSet
from db.models.notes_problem import NotesProblem
from db.models.notes_solution_step import NotesSolutionStep
from models.schemas import (
    NotesProblemOut,
    NotesProblemSetOut,
    NotesProblemSummaryOut,
    NotesStatusOut,
    NotesSolutionStepOut,
)
from services.llm_config import MAX_UPLOAD_SIZE_BYTES
from services.session_store import session_store

import json

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/studyme/notes", tags=["notes"])

_UPLOADS_DIR = Path(__file__).resolve().parent.parent / "uploads" / "notes"
_UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

_ALLOWED_EXTENSIONS = {".pdf", ".docx", ".doc", ".pptx", ".ppt"}


def _get_db():
    with SessionLocal() as session:
        yield session


def _resolve_roll_number(token: str) -> str | None:
    record = session_store.get(token)
    return record.roll_number if record else None


def _compute_hash(file_bytes: bytes) -> str:
    return hashlib.sha256(file_bytes).hexdigest()


def _run_notes_ingestion_task(upload_id: str) -> None:
    try:
        from services.notes_ingestion_service import run_notes_ingestion
        run_notes_ingestion(upload_id)
    except Exception as exc:
        logger.error("[NotesRouter] Ingestion crashed: upload_id=%s %s", upload_id, exc, exc_info=True)


# ── POST /upload ──────────────────────────────────────────────────────────────

@router.post("/upload")
async def upload_notes(
    background_tasks: BackgroundTasks,
    token: str = Form(...),
    subject_id: str = Form(...),
    chapter_key: str = Form(""),
    title: str = Form(""),
    file: UploadFile = File(...),
    db: Session = Depends(_get_db),
):
    """
    Upload a notes file for AI problem extraction.
    Returns immediately; processing happens in the background.
    Deduplicates by SHA-256 hash — identical file returns existing result.
    """
    roll_number = _resolve_roll_number(token)
    if not roll_number:
        raise HTTPException(status_code=401, detail="Invalid or expired session token")

    file_ext = Path(file.filename).suffix.lower() if file.filename else ""
    if not file_ext or file_ext not in _ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Only PDF, DOCX, DOC, PPTX, and PPT files are accepted",
        )

    file_bytes = await file.read()
    if len(file_bytes) > MAX_UPLOAD_SIZE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum size is {MAX_UPLOAD_SIZE_BYTES // (1024 * 1024)}MB",
        )

    file_hash = _compute_hash(file_bytes)

    # Deduplication: same bytes already processed?
    existing = db.query(ChapterUpload).filter(
        ChapterUpload.file_hash == file_hash,
        ChapterUpload.upload_type == "notes",
        ChapterUpload.upload_status.in_(["ready", "ready_low_coverage"]),
    ).first()

    if existing:
        ps = db.query(NotesProblemSet).filter(
            NotesProblemSet.upload_id == str(existing.id)
        ).first()
        return {
            "upload_id": str(existing.id),
            "problem_set_id": str(ps.id) if ps else None,
            "status": existing.upload_status,
            "already_processed": True,
            "message": "This file has already been processed.",
        }

    # Save file to disk
    upload_id = str(uuid.uuid4())
    safe_filename = f"{upload_id}{file_ext}"
    file_path = str(_UPLOADS_DIR / safe_filename)

    with open(file_path, "wb") as f:
        f.write(file_bytes)

    now = datetime.utcnow()
    upload = ChapterUpload(
        id=upload_id,
        subject_id=subject_id.lower().strip(),
        chapter_key=chapter_key.lower().strip() or None,
        chapter_title=title.strip() or None,
        uploaded_by=roll_number,
        upload_status="pending",
        upload_type="notes",
        file_path=file_path,
        original_filename=file.filename,
        file_size_bytes=len(file_bytes),
        file_hash=file_hash,
        created_at=now,
        updated_at=now,
    )
    db.add(upload)
    db.commit()

    background_tasks.add_task(_run_notes_ingestion_task, upload_id)

    logger.info("[NotesRouter] Upload queued: upload_id=%s subject=%s by=%s",
                upload_id, subject_id, roll_number)

    return {
        "upload_id": upload_id,
        "problem_set_id": None,
        "status": "pending",
        "already_processed": False,
        "message": "Notes received. Processing will take 1–3 minutes.",
    }


# ── GET /{upload_id}/status ───────────────────────────────────────────────────

@router.get("/{upload_id}/status", response_model=NotesStatusOut)
def get_notes_status(
    upload_id: str,
    token: str,
    db: Session = Depends(_get_db),
):
    if not _resolve_roll_number(token):
        raise HTTPException(status_code=401, detail="Invalid session token")

    upload = db.get(ChapterUpload, upload_id)
    if not upload or upload.upload_type != "notes":
        raise HTTPException(status_code=404, detail="Notes upload not found")

    ps = db.query(NotesProblemSet).filter(
        NotesProblemSet.upload_id == upload_id
    ).first()

    return NotesStatusOut(
        upload_id=upload_id,
        status=upload.upload_status,
        problem_count=ps.problem_count if ps else 0,
        error_message=upload.error_message if upload.upload_status == "failed" else None,
    )


# ── GET /{subject_id}/available ───────────────────────────────────────────────

@router.get("/{subject_id}/available", response_model=list[NotesProblemSetOut])
def list_available_notes(
    subject_id: str,
    token: str,
    db: Session = Depends(_get_db),
):
    """List all processed notes problem sets for a subject."""
    from db.models.student_registry import StudentRegistry

    roll_number = _resolve_roll_number(token)
    if not roll_number:
        raise HTTPException(status_code=401, detail="Invalid session token")

    uploads = db.query(ChapterUpload).filter(
        ChapterUpload.subject_id == subject_id,
        ChapterUpload.upload_type == "notes",
        ChapterUpload.upload_status.in_(["ready", "ready_low_coverage"]),
    ).order_by(ChapterUpload.created_at.desc()).all()

    # Batch-fetch display names
    uploader_rolls = {u.uploaded_by for u in uploads}
    registry_rows = db.query(StudentRegistry).filter(
        StudentRegistry.roll_number.in_(uploader_rolls)
    ).all()
    display_names = {r.roll_number: r.display_name for r in registry_rows}

    result = []
    for upload in uploads:
        ps = db.query(NotesProblemSet).filter(
            NotesProblemSet.upload_id == str(upload.id)
        ).first()
        if not ps:
            continue

        is_own = upload.uploaded_by == roll_number
        raw_name = display_names.get(upload.uploaded_by)
        uploader_name = None
        if not is_own and raw_name:
            uploader_name = raw_name.split()[0] if raw_name.strip() else None

        result.append(NotesProblemSetOut(
            upload_id=str(upload.id),
            problem_set_id=str(ps.id),
            subject_id=upload.subject_id,
            chapter_key=upload.chapter_key,
            title=ps.title or upload.chapter_title,
            problem_count=ps.problem_count,
            uploaded_by_label="you" if is_own else "a classmate",
            uploaded_by_name=uploader_name,
            is_own_upload=is_own,
        ))

    return result


# ── GET /problem-sets/{problem_set_id}/problems ───────────────────────────────

@router.get("/problem-sets/{problem_set_id}/problems", response_model=list[NotesProblemSummaryOut])
def list_problems_in_set(
    problem_set_id: str,
    token: str,
    db: Session = Depends(_get_db),
):
    """Return summary list of all problems in a problem set (no steps)."""
    if not _resolve_roll_number(token):
        raise HTTPException(status_code=401, detail="Invalid session token")

    problems = (
        db.query(NotesProblem)
        .filter(NotesProblem.problem_set_id == problem_set_id)
        .order_by(NotesProblem.sequence_order)
        .all()
    )

    return [
        NotesProblemSummaryOut(
            id=str(p.id),
            sequence_order=p.sequence_order,
            question_text=p.question_text,
            topic=p.topic,
            difficulty=p.difficulty or "medium",
            method=p.method,
        )
        for p in problems
    ]


# ── GET /problems/{problem_id}/steps ─────────────────────────────────────────

@router.get("/problems/{problem_id}/steps", response_model=NotesProblemOut)
def get_problem_steps(
    problem_id: str,
    token: str,
    db: Session = Depends(_get_db),
):
    """Return a full problem with all solution steps, ordered by sequence_order."""
    if not _resolve_roll_number(token):
        raise HTTPException(status_code=401, detail="Invalid session token")

    problem = db.get(NotesProblem, problem_id)
    if not problem:
        raise HTTPException(status_code=404, detail="Problem not found")

    steps = (
        db.query(NotesSolutionStep)
        .filter(NotesSolutionStep.problem_id == problem_id)
        .order_by(NotesSolutionStep.sequence_order)
        .all()
    )

    return NotesProblemOut(
        id=str(problem.id),
        sequence_order=problem.sequence_order,
        question_text=problem.question_text,
        topic=problem.topic,
        difficulty=problem.difficulty or "medium",
        method=problem.method,
        answer=problem.answer,
        steps=[
            NotesSolutionStepOut(
                id=str(s.id),
                sequence_order=s.sequence_order,
                step_type=s.step_type,
                content_format=getattr(s, 'content_format', 'text') or 'text',
                content=s.content,
                voice_text=s.voice_text,
                annotation=json.loads(s.annotation) if s.annotation else None,
            )
            for s in steps
        ],
    )


# ── DELETE /{upload_id} ───────────────────────────────────────────────────────

@router.delete("/{upload_id}")
def delete_notes_upload(
    upload_id: str,
    token: str,
    db: Session = Depends(_get_db),
):
    """Soft-delete a notes upload. Only the uploader can delete their own upload."""
    roll_number = _resolve_roll_number(token)
    if not roll_number:
        raise HTTPException(status_code=401, detail="Invalid session token")

    upload = db.get(ChapterUpload, upload_id)
    if not upload or upload.upload_type != "notes":
        raise HTTPException(status_code=404, detail="Notes upload not found")
    if upload.uploaded_by != roll_number:
        raise HTTPException(status_code=403, detail="You can only delete your own uploads")

    if not upload.error_message:
        upload.error_message = f"__deleted_from_status:{upload.upload_status}"
    upload.upload_status = "deleted"
    upload.file_deleted_at = datetime.utcnow()
    db.commit()

    logger.info("[NotesRouter] Soft-deleted upload_id=%s by=%s", upload_id, roll_number)
    return {"success": True, "upload_id": upload_id}


# ── POST /{upload_id}/restore ─────────────────────────────────────────────────

@router.post("/{upload_id}/restore")
def restore_notes_upload(
    upload_id: str,
    token: str,
    db: Session = Depends(_get_db),
):
    """Undo a soft-delete. Only the original uploader can restore."""
    roll_number = _resolve_roll_number(token)
    if not roll_number:
        raise HTTPException(status_code=401, detail="Invalid session token")

    upload = db.get(ChapterUpload, upload_id)
    if not upload or upload.upload_type != "notes":
        raise HTTPException(status_code=404, detail="Notes upload not found")
    if upload.uploaded_by != roll_number:
        raise HTTPException(status_code=403, detail="You can only restore your own uploads")
    if upload.upload_status != "deleted":
        raise HTTPException(status_code=400, detail="Upload is not deleted")

    original_status = "ready"
    if upload.error_message and upload.error_message.startswith("__deleted_from_status:"):
        original_status = upload.error_message.split(":", 1)[1]
        upload.error_message = None

    upload.upload_status = original_status
    upload.file_deleted_at = None
    db.commit()

    logger.info("[NotesRouter] Restored upload_id=%s by=%s", upload_id, roll_number)
    return {"success": True, "upload_id": upload_id}
