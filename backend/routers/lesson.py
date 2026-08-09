"""
Lesson Router — AI Lesson Player

Endpoints:
  POST /studyme/chapters/upload          Upload chapter PDF, returns job_id
  GET  /studyme/chapters/{chapter_key}/status  Poll ingestion status
  GET  /studyme/chapters/{subject_id}/available  List chapters with ready AI lessons
  GET  /studyme/lessons/{lesson_id}/script  Fetch Teaching Script (blocks)
  POST /studyme/lessons/{lesson_id}/doubt  Ask a doubt, get RAG-grounded answer
  POST /studyme/lessons/{lesson_id}/progress  Save student progress
  GET  /studyme/lessons/{lesson_id}/progress  Restore student progress
"""

import hashlib
import logging
import os
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse, FileResponse
from sqlalchemy.orm import Session

from db.session import SessionLocal
from db.models.chapter_upload import ChapterUpload
from db.models.lesson_script import LessonScript
from db.models.lesson_block import LessonBlock
from db.models.ai_concept import AIConcept
from db.models.student_lesson_progress import StudentLessonProgress
from models.schemas import (
    AvailableChapterOut,
    DoubtRequest,
    DoubtResponse,
    IngestionStatusOut,
    LessonBlockOut,
    LessonScriptOut,
    ProgressOut,
    ProgressUpdate,
)
from services.llm_config import MAX_UPLOAD_SIZE_BYTES
from services.session_store import session_store

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/studyme", tags=["lesson"])

# Where uploaded PDFs are stored temporarily until processed
_UPLOADS_DIR = Path(__file__).resolve().parent.parent / "uploads" / "lesson_pdfs"
_UPLOADS_DIR.mkdir(parents=True, exist_ok=True)


def _get_db():
    with SessionLocal() as session:
        yield session


def _resolve_roll_number(token: str) -> str | None:
    """Get roll number from session token."""
    record = session_store.get(token)
    return record.roll_number if record else None


def _compute_hash(file_bytes: bytes) -> str:
    return hashlib.sha256(file_bytes).hexdigest()


# ── Upload PDF ─────────────────────────────────────────────────────────────

@router.post("/chapters/upload")
async def upload_chapter_pdf(
    background_tasks: BackgroundTasks,
    token: str = Form(...),
    subject_id: str = Form(...),
    chapter_key: str = Form(...),
    chapter_title: str = Form(""),
    file: UploadFile = File(...),
    db: Session = Depends(_get_db),
):
    """
    Upload a chapter PDF, DOCX, DOC, PPTX, or PPT for AI lesson generation.
    Returns immediately with upload_id — processing happens in background.
    If same file was already processed, returns existing script immediately.
    """
    roll_number = _resolve_roll_number(token)
    if not roll_number:
        raise HTTPException(status_code=401, detail="Invalid or expired session token")

    _ALLOWED_EXTENSIONS = {".pdf", ".docx", ".doc", ".pptx", ".ppt"}
    file_ext = Path(file.filename).suffix.lower() if file.filename else ""
    if not file_ext or file_ext not in _ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Only PDF, DOCX, DOC, PPTX, and PPT files are accepted"
        )

    file_bytes = await file.read()
    if len(file_bytes) > MAX_UPLOAD_SIZE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum size is {MAX_UPLOAD_SIZE_BYTES // (1024*1024)}MB"
        )

    file_hash = _compute_hash(file_bytes)

    # Check if identical file already processed
    existing = db.query(ChapterUpload).filter(
        ChapterUpload.file_hash == file_hash,
        ChapterUpload.upload_status.in_(["ready", "ready_low_coverage"]),
    ).first()

    if existing:
        script = db.query(LessonScript).filter(
            LessonScript.upload_id == str(existing.id),
            LessonScript.is_active == True,
        ).first()
        return {
            "upload_id": str(existing.id),
            "script_id": str(script.id) if script else None,
            "status": existing.upload_status,
            "already_processed": True,
            "uploaded_by_label": "a classmate" if existing.uploaded_by != roll_number else "you",
            "message": "This chapter has already been processed. Starting lesson now.",
        }

    # Check if same chapter_key already has a ready lesson (different file, same chapter)
    existing_chapter = db.query(ChapterUpload).filter(
        ChapterUpload.subject_id == subject_id,
        ChapterUpload.chapter_key == chapter_key,
        ChapterUpload.upload_status.in_(["ready", "ready_low_coverage"]),
    ).first()

    if existing_chapter:
        script = db.query(LessonScript).filter(
            LessonScript.upload_id == str(existing_chapter.id),
            LessonScript.is_active == True,
        ).first()
        return {
            "upload_id": str(existing_chapter.id),
            "script_id": str(script.id) if script else None,
            "status": existing_chapter.upload_status,
            "already_processed": True,
            "uploaded_by_label": "a classmate" if existing_chapter.uploaded_by != roll_number else "you",
            "message": "A classmate already uploaded this chapter. Lesson is ready.",
        }

    # Save file to disk (preserve original extension for correct parser dispatch)
    upload_id = str(uuid.uuid4())
    safe_filename = f"{upload_id}{file_ext}"
    file_path = str(_UPLOADS_DIR / safe_filename)

    with open(file_path, "wb") as f:
        f.write(file_bytes)

    # Create upload row
    now = datetime.utcnow()
    upload = ChapterUpload(
        id=upload_id,
        subject_id=subject_id.lower().strip(),
        chapter_key=chapter_key.lower().strip(),
        chapter_title=chapter_title.strip() or None,
        uploaded_by=roll_number,
        upload_status="pending",
        file_path=file_path,
        original_filename=file.filename,
        file_size_bytes=len(file_bytes),
        file_hash=file_hash,
        created_at=now,
        updated_at=now,
    )
    db.add(upload)
    db.commit()

    # Kick off background processing
    background_tasks.add_task(_run_ingestion_task, upload_id)

    logger.info("[LessonRouter] Upload queued: upload_id=%s subject=%s chapter=%s by=%s",
                upload_id, subject_id, chapter_key, roll_number)

    return {
        "upload_id": upload_id,
        "script_id": None,
        "status": "pending",
        "already_processed": False,
        "message": "PDF received. Processing will take 1-3 minutes.",
    }


def _run_ingestion_task(upload_id: str) -> None:
    """Background task wrapper with error protection."""
    try:
        from services.lesson_ingestion_service import run_ingestion
        run_ingestion(upload_id)
    except Exception as exc:
        logger.error("[LessonRouter] Background ingestion crashed: %s", exc, exc_info=True)


# ── Poll Status ────────────────────────────────────────────────────────────

@router.get("/chapters/{chapter_key}/status", response_model=IngestionStatusOut)
def get_chapter_status(
    chapter_key: str,
    token: str,
    subject_id: str,
    db: Session = Depends(_get_db),
):
    """Poll the ingestion status of a chapter."""
    roll_number = _resolve_roll_number(token)
    if not roll_number:
        raise HTTPException(status_code=401, detail="Invalid session token")

    upload = db.query(ChapterUpload).filter(
        ChapterUpload.chapter_key == chapter_key,
        ChapterUpload.subject_id == subject_id,
    ).order_by(ChapterUpload.created_at.desc()).first()

    if not upload:
        raise HTTPException(status_code=404, detail="No upload found for this chapter")

    script = db.query(LessonScript).filter(
        LessonScript.upload_id == str(upload.id),
        LessonScript.is_active == True,
    ).first()

    uploader_label = "you" if upload.uploaded_by == roll_number else "a classmate"

    return IngestionStatusOut(
        chapter_key=upload.chapter_key,
        upload_status=upload.upload_status,
        coverage_score=upload.coverage_score,
        concept_count=upload.concept_count,
        block_count=upload.block_count,
        uploaded_by_label=uploader_label,
        script_id=str(script.id) if script else None,
        error_message=upload.error_message if upload.upload_status == "failed" else None,
    )


# ── List Available Chapters ───────────────────────────────────────────────

@router.get("/chapters/{subject_id}/available", response_model=list[AvailableChapterOut])
def list_available_chapters(
    subject_id: str,
    token: str,
    db: Session = Depends(_get_db),
):
    """List all chapters for a subject that have a ready AI lesson."""
    roll_number = _resolve_roll_number(token)
    if not roll_number:
        raise HTTPException(status_code=401, detail="Invalid session token")

    uploads = db.query(ChapterUpload).filter(
        ChapterUpload.subject_id == subject_id,
        ChapterUpload.upload_status.in_(["ready", "ready_low_coverage"]),
    ).order_by(ChapterUpload.created_at.desc()).all()

    result = []
    for upload in uploads:
        script = db.query(LessonScript).filter(
            LessonScript.upload_id == str(upload.id),
            LessonScript.is_active == True,
        ).first()
        if not script:
            continue

        result.append(AvailableChapterOut(
            chapter_key=upload.chapter_key,
            chapter_title=upload.chapter_title or upload.chapter_key.replace("-", " ").title(),
            subject_id=upload.subject_id,
            script_id=str(script.id),
            upload_id=str(upload.id),
            uploaded_by_label="you" if upload.uploaded_by == roll_number else "a classmate",
            coverage_score=upload.coverage_score,
            concept_count=upload.concept_count or 0,
            block_count=upload.block_count or 0,
        ))

    return result


# ── Fetch Teaching Script ─────────────────────────────────────────────────

@router.get("/lessons/{lesson_id}/script", response_model=LessonScriptOut)
def get_lesson_script(
    lesson_id: str,
    token: str,
    db: Session = Depends(_get_db),
):
    """Fetch the full Teaching Script for a lesson. Used by LessonPlayer on startup."""
    if not _resolve_roll_number(token):
        raise HTTPException(status_code=401, detail="Invalid session token")

    script = db.get(LessonScript, lesson_id)
    if not script or not script.is_active:
        raise HTTPException(status_code=404, detail="Lesson not found")

    blocks = (
        db.query(LessonBlock)
        .filter(LessonBlock.script_id == lesson_id)
        .order_by(LessonBlock.sequence_order)
        .all()
    )

    return LessonScriptOut(
        script_id=str(script.id),
        subject_id=script.subject_id,
        chapter_key=script.chapter_key,
        title=script.title,
        total_blocks=script.total_blocks,
        estimated_duration_seconds=script.estimated_duration_seconds,
        concept_count=script.concept_count,
        blocks=[
            LessonBlockOut(
                id=str(b.id),
                sequence_order=b.sequence_order,
                block_type=b.block_type,
                content=b.content,
                voice_text=b.voice_text,
                expected_answer=b.expected_answer,
                concept_id=str(b.concept_id) if b.concept_id else None,
            )
            for b in blocks
        ],
    )


# ── Workspace context (StudyMe 2.0) ──────────────────────────────────────

@router.get("/lessons/{lesson_id}/workspace-context")
def get_workspace_context(
    lesson_id: str,
    token: str,
    db: Session = Depends(_get_db),
):
    """
    Return the upload_id and chapter metadata for a lesson.
    Used by WorkspacePlayer to call /curriculum without a separate lookup.
    """
    if not _resolve_roll_number(token):
        raise HTTPException(status_code=401, detail="Invalid session token")

    script = db.get(LessonScript, lesson_id)
    if not script or not script.is_active:
        raise HTTPException(status_code=404, detail="Lesson not found")

    return {
        "script_id": str(script.id),
        "upload_id": str(script.upload_id),
        "subject_id": script.subject_id,
        "chapter_key": script.chapter_key,
        "title": script.title,
    }


# ── Answer Doubt ──────────────────────────────────────────────────────────

@router.post("/lessons/{lesson_id}/doubt", response_model=DoubtResponse)
def answer_doubt(
    lesson_id: str,
    body: DoubtRequest,
    db: Session = Depends(_get_db),
):
    """Ask a doubt during a lesson. Returns RAG-grounded answer."""
    roll_number = _resolve_roll_number(body.token)
    if not roll_number:
        raise HTTPException(status_code=401, detail="Invalid session token")

    script = db.get(LessonScript, lesson_id)
    if not script:
        raise HTTPException(status_code=404, detail="Lesson not found")

    # Get current concept from block index
    current_concept_title = script.title
    if body.current_block_index > 0:
        block = (
            db.query(LessonBlock)
            .filter(
                LessonBlock.script_id == lesson_id,
                LessonBlock.sequence_order <= body.current_block_index,
                LessonBlock.block_type == "narration",
            )
            .order_by(LessonBlock.sequence_order.desc())
            .first()
        )
        if block and block.concept_id:
            concept = db.get(AIConcept, str(block.concept_id))
            if concept:
                current_concept_title = concept.title

    from services.doubt_service import answer_doubt as _answer_doubt

    # Subject name from subject_id (simple lookup)
    subject_name_map = {
        "ob": "Organizational Behavior",
        "fm": "Financial Management",
        "qbm": "Quantitative Business Methods",
        "ccfa": "Cloud Computing Foundations and Applications",
    }
    subject_name = subject_name_map.get(script.subject_id, script.subject_id.upper())

    answer, model_used = _answer_doubt(
        question=body.question,
        upload_id=script.upload_id,
        current_concept_title=current_concept_title,
        subject_name=subject_name,
        script_id=lesson_id,
    )

    # Increment doubts_asked in progress
    progress = db.query(StudentLessonProgress).filter(
        StudentLessonProgress.roll_number == roll_number,
        StudentLessonProgress.script_id == lesson_id,
    ).first()
    if progress:
        progress.doubts_asked = (progress.doubts_asked or 0) + 1
        progress.updated_at = datetime.utcnow()
        db.commit()

    return DoubtResponse(answer=answer, model_used=model_used)


# ── Progress Save / Restore ───────────────────────────────────────────────

@router.post("/lessons/{lesson_id}/progress")
def save_progress(
    lesson_id: str,
    body: ProgressUpdate,
    db: Session = Depends(_get_db),
):
    """Save student lesson progress. Creates or updates."""
    roll_number = _resolve_roll_number(body.token)
    if not roll_number:
        raise HTTPException(status_code=401, detail="Invalid session token")

    script = db.get(LessonScript, lesson_id)
    if not script:
        raise HTTPException(status_code=404, detail="Lesson not found")

    now = datetime.utcnow()
    existing = db.query(StudentLessonProgress).filter(
        StudentLessonProgress.roll_number == roll_number,
        StudentLessonProgress.script_id == lesson_id,
    ).first()

    if existing:
        existing.last_block_index = body.last_block_index
        existing.completed = body.completed
        existing.concepts_seen = body.concepts_seen
        existing.quiz_results = body.quiz_results
        existing.doubts_asked = body.doubts_asked
        existing.updated_at = now
        if body.completed and not existing.completed_at:
            existing.completed_at = now
    else:
        progress = StudentLessonProgress(
            id=str(uuid.uuid4()),
            roll_number=roll_number,
            script_id=lesson_id,
            last_block_index=body.last_block_index,
            completed=body.completed,
            concepts_seen=body.concepts_seen,
            quiz_results=body.quiz_results,
            doubts_asked=body.doubts_asked,
            started_at=now,
            completed_at=now if body.completed else None,
            updated_at=now,
        )
        db.add(progress)

    db.commit()
    return {"saved": True}


@router.get("/lessons/{lesson_id}/progress", response_model=ProgressOut)
def get_progress(
    lesson_id: str,
    token: str,
    db: Session = Depends(_get_db),
):
    """Restore student progress for a lesson. Used when returning to a lesson."""
    roll_number = _resolve_roll_number(token)
    if not roll_number:
        raise HTTPException(status_code=401, detail="Invalid session token")

    progress = db.query(StudentLessonProgress).filter(
        StudentLessonProgress.roll_number == roll_number,
        StudentLessonProgress.script_id == lesson_id,
    ).first()

    if not progress:
        return ProgressOut(
            script_id=lesson_id,
            last_block_index=0,
            completed=False,
            concepts_seen=[],
            quiz_results={},
            doubts_asked=0,
        )

    return ProgressOut(
        script_id=lesson_id,
        last_block_index=progress.last_block_index,
        completed=progress.completed,
        concepts_seen=progress.concepts_seen or [],
        quiz_results=progress.quiz_results or {},
        doubts_asked=progress.doubts_asked or 0,
        started_at=progress.started_at.isoformat() if progress.started_at else None,
        completed_at=progress.completed_at.isoformat() if progress.completed_at else None,
    )

# ── TTS Audio ─────────────────────────────────────────────────────────────

@router.get("/blocks/{block_id}/audio")
def get_block_audio(
    block_id: str,
    token: str,
    db: Session = Depends(_get_db),
):
    """
    Return pre-generated WAV audio for a lesson block.
    If audio was pre-generated during ingestion, serves the cached file immediately.
    If not yet generated (e.g. legacy blocks), generates on demand and caches.
    Returns 404 if block not found or TTS is unavailable.
    """
    if not _resolve_roll_number(token):
        raise HTTPException(status_code=401, detail="Invalid session token")

    from services.tts_service import audio_exists, get_audio_path, generate_and_cache

    # Serve cached audio immediately if it exists
    if audio_exists(block_id):
        path = get_audio_path(block_id)
        return FileResponse(
            path=str(path),
            media_type="audio/wav",
            headers={"Cache-Control": "public, max-age=31536000"},  # 1 year — content never changes
        )

    # On-demand generation for blocks without pre-generated audio
    block = db.get(LessonBlock, block_id)
    if not block:
        raise HTTPException(status_code=404, detail="Block not found")

    if not block.voice_text or not block.voice_text.strip():
        raise HTTPException(status_code=404, detail="No voice text for this block")

    # Only generate audio for narration-type blocks on demand
    ALLOWED_TYPES = {"narration", "definition", "recap", "example"}
    if block.block_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=404, detail="Audio not available for this block type")

    success = generate_and_cache(block_id, block.voice_text)
    if not success:
        raise HTTPException(status_code=503, detail="TTS generation failed or unavailable")

    path = get_audio_path(block_id)
    return FileResponse(
        path=str(path),
        media_type="audio/wav",
        headers={"Cache-Control": "public, max-age=31536000"},
    )


@router.get("/lessons/{lesson_id}/audio-status")
def get_lesson_audio_status(
    lesson_id: str,
    token: str,
    db: Session = Depends(_get_db),
):
    """
    Returns which blocks in a lesson have pre-generated audio ready.
    Frontend uses this to show a loading indicator or fall back to Web Speech.
    """
    if not _resolve_roll_number(token):
        raise HTTPException(status_code=401, detail="Invalid session token")

    from services.tts_service import audio_exists

    blocks = (
        db.query(LessonBlock)
        .filter(
            LessonBlock.script_id == lesson_id,
            LessonBlock.block_type.in_(["narration", "definition", "recap", "example"]),
        )
        .all()
    )

    ready = [str(b.id) for b in blocks if audio_exists(str(b.id))]
    total = len(blocks)

    return {
        "lesson_id": lesson_id,
        "audio_ready_count": len(ready),
        "total_audio_blocks": total,
        "audio_ready": len(ready) == total and total > 0,
        "ready_block_ids": ready,
    }
