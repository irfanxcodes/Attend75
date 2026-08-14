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
    skip_filename_check: bool = Form(False),
    file: UploadFile = File(...),
    db: Session = Depends(_get_db),
):
    """
    Upload a chapter PDF, DOCX, DOC, PPTX, or PPT for AI lesson generation.
    Returns immediately with upload_id — processing happens in background.
    If same file was already processed, returns existing script immediately.

    Validation: the uploaded filename (without extension) must contain at least
    one significant word from chapter_title, preventing completely unrelated uploads.
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

    # ── Filename vs chapter title validation ──────────────────────────────
    # Skip when the caller explicitly opts out (e.g. master/flexible upload mode)
    if chapter_title.strip() and not skip_filename_check:
        import re as _re

        def _sig_words(text: str) -> set[str]:
            cleaned = _re.sub(r"[^a-z0-9\s]", " ", text.lower())
            return {w for w in cleaned.split() if len(w) > 2}

        filename_stem = Path(file.filename).stem if file.filename else ""
        file_words = _sig_words(filename_stem)
        title_words = _sig_words(chapter_title)

        if title_words and file_words and not file_words.intersection(title_words):
            raise HTTPException(
                status_code=422,
                detail=(
                    f"File name doesn't seem to match the chapter \"{chapter_title}\". "
                    "Please rename your file to include the chapter name before uploading."
                ),
            )
    # ── End validation ─────────────────────────────────────────────────────

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
        # Trigger slide rendering in background if slides are missing
        # (handles uploads processed before slide rendering was added)
        from db.models.lesson_slide import LessonSlide
        has_slides = db.query(LessonSlide).filter(
            LessonSlide.upload_id == str(existing.id)
        ).first() is not None
        if not has_slides and existing.file_path and Path(existing.file_path).exists():
            background_tasks.add_task(_run_slide_render_task, str(existing.id))
        return {
            "upload_id": str(existing.id),
            "script_id": str(script.id) if script else None,
            "status": existing.upload_status,
            "already_processed": True,
            "uploaded_by_label": "a classmate" if existing.uploaded_by != roll_number else "you",
            "message": "This chapter has already been processed. Starting lesson now.",
        }

    # Check if same chapter_key already has an admin-approved PUBLIC lesson.
    # We ONLY short-circuit for is_public=True uploads — these have been
    # reviewed by an admin who confirmed the file is the canonical version
    # for this chapter. Without is_public, two students could upload
    # completely different files for "fm-chapter-3" and accidentally see
    # each other's slides.
    existing_chapter = db.query(ChapterUpload).filter(
        ChapterUpload.subject_id == subject_id,
        ChapterUpload.chapter_key == chapter_key,
        ChapterUpload.upload_status.in_(["ready", "ready_low_coverage"]),
        ChapterUpload.is_public == True,  # noqa: E712 — SQLAlchemy requires ==
    ).first()

    if existing_chapter:
        script = db.query(LessonScript).filter(
            LessonScript.upload_id == str(existing_chapter.id),
            LessonScript.is_active == True,
        ).first()
        # Trigger slide rendering in background if slides are missing
        from db.models.lesson_slide import LessonSlide
        has_slides = db.query(LessonSlide).filter(
            LessonSlide.upload_id == str(existing_chapter.id)
        ).first() is not None
        if not has_slides and existing_chapter.file_path and Path(existing_chapter.file_path).exists():
            background_tasks.add_task(_run_slide_render_task, str(existing_chapter.id))
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


def _run_slide_render_task(upload_id: str) -> None:
    """
    Background task: render slide images for an existing ready upload.
    Used when slides are missing for an upload processed before slide rendering was added,
    or when the file is still on disk from a re-upload of an existing chapter.
    """
    try:
        from db.session import SessionLocal
        from db.models.chapter_upload import ChapterUpload
        from db.models.lesson_slide import LessonSlide
        from services.slide_renderer import render_slides
        from services.source_map_service import build_source_map
        import uuid
        from datetime import datetime

        with SessionLocal() as session:
            upload = session.get(ChapterUpload, upload_id)
            if not upload or not upload.file_path:
                return
            file_path = upload.file_path
            original_filename = upload.original_filename or ""

        from pathlib import Path as _Path
        file_ext = _Path(original_filename or file_path).suffix.lower()
        rendered = render_slides(upload_id=upload_id, file_path=file_path, file_ext=file_ext)

        if rendered:
            from services.source_map_service import build_source_map
            source_slides = {s["number"]: s for s in build_source_map(upload_id)}
            with SessionLocal() as session:
                now = datetime.utcnow()
                for slide_data in rendered:
                    sn = slide_data["slide_number"]
                    src = source_slides.get(sn, {})
                    exists = session.query(LessonSlide).filter(
                        LessonSlide.upload_id == upload_id,
                        LessonSlide.slide_number == sn,
                    ).first()
                    if not exists:
                        session.add(LessonSlide(
                            id=str(uuid.uuid4()),
                            upload_id=upload_id,
                            slide_number=sn,
                            image_url=slide_data["url"],
                            width_px=slide_data.get("width_px"),
                            height_px=slide_data.get("height_px"),
                            title=src.get("title", f"Slide {sn}"),
                            body_preview=src.get("body_preview", ""),
                            created_at=now,
                        ))
                session.commit()
            logger.info("[LessonRouter] Backfill: rendered %d slides for upload_id=%s", len(rendered), upload_id)
    except Exception as exc:
        from services.storage_cap_service import StorageCapExceeded
        if isinstance(exc, StorageCapExceeded):
            logger.error("[LessonRouter] Storage cap exceeded for upload_id=%s: %s", upload_id, exc)
        else:
            logger.error("[LessonRouter] Slide render task failed for %s: %s", upload_id, exc, exc_info=True)



# ── Delete Chapter Upload ─────────────────────────────────────────────────

@router.delete("/chapters/{upload_id}")
def delete_chapter_upload(
    upload_id: str,
    token: str,
    db: Session = Depends(_get_db),
):
    """
    Soft-delete a chapter upload. Only the student who uploaded it can delete it.
    Marks the LessonScript as inactive and records deleted_at on the upload row.
    The data is not hard-deleted so an admin can still review/restore it.
    """
    roll_number = _resolve_roll_number(token)
    if not roll_number:
        raise HTTPException(status_code=401, detail="Invalid session token")

    upload = db.get(ChapterUpload, upload_id)
    if not upload:
        raise HTTPException(status_code=404, detail="Upload not found")
    if upload.uploaded_by != roll_number:
        raise HTTPException(status_code=403, detail="You can only delete your own uploads")

    # Soft-delete: mark the lesson script inactive
    script = db.query(LessonScript).filter(
        LessonScript.upload_id == upload_id,
        LessonScript.is_active == True,  # noqa: E712
    ).first()
    if script:
        script.is_active = False

    # Mark upload as deleted (reuse file_deleted_at to avoid schema change)
    upload.file_deleted_at = datetime.utcnow()
    # Store original status in error_message temporarily so restore can use it,
    # then set status to "deleted" to hide it from listings
    if not upload.error_message:
        upload.error_message = f"__deleted_from_status:{upload.upload_status}"
    upload.upload_status = "deleted"
    db.commit()

    logger.info("[LessonRouter] Chapter soft-deleted: upload_id=%s by=%s", upload_id, roll_number)
    return {"success": True, "upload_id": upload_id}


@router.post("/chapters/{upload_id}/restore")
def restore_chapter_upload(
    upload_id: str,
    token: str,
    db: Session = Depends(_get_db),
):
    """
    Undo a delete — restores the upload and re-activates the lesson script.
    Only available to the student who originally uploaded it.
    """
    roll_number = _resolve_roll_number(token)
    if not roll_number:
        raise HTTPException(status_code=401, detail="Invalid session token")

    upload = db.get(ChapterUpload, upload_id)
    if not upload:
        raise HTTPException(status_code=404, detail="Upload not found")
    if upload.uploaded_by != roll_number:
        raise HTTPException(status_code=403, detail="You can only restore your own uploads")
    if upload.upload_status != "deleted":
        raise HTTPException(status_code=400, detail="Upload is not deleted")

    # Restore to original status (saved when deleted)
    original_status = "ready"
    if upload.error_message and upload.error_message.startswith("__deleted_from_status:"):
        original_status = upload.error_message.split(":", 1)[1]
        upload.error_message = None

    upload.upload_status = original_status
    upload.file_deleted_at = None

    # Re-activate the lesson script
    script = db.query(LessonScript).filter(
        LessonScript.upload_id == upload_id,
    ).first()
    if script:
        script.is_active = True

    db.commit()

    logger.info("[LessonRouter] Chapter restored: upload_id=%s by=%s", upload_id, roll_number)
    return {"success": True, "upload_id": upload_id}


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
    from db.models.student_registry import StudentRegistry

    roll_number = _resolve_roll_number(token)
    if not roll_number:
        raise HTTPException(status_code=401, detail="Invalid session token")

    uploads = db.query(ChapterUpload).filter(
        ChapterUpload.subject_id == subject_id,
        ChapterUpload.upload_status.in_(["ready", "ready_low_coverage"]),
    ).order_by(ChapterUpload.created_at.desc()).all()

    # Batch-fetch display names for all uploaders to avoid N+1 queries
    uploader_roll_numbers = {u.uploaded_by for u in uploads}
    registry_rows = db.query(StudentRegistry).filter(
        StudentRegistry.roll_number.in_(uploader_roll_numbers)
    ).all()
    display_names: dict[str, str | None] = {r.roll_number: r.display_name for r in registry_rows}

    result = []
    for upload in uploads:
        script = db.query(LessonScript).filter(
            LessonScript.upload_id == str(upload.id),
            LessonScript.is_active == True,
        ).first()
        if not script:
            continue

        is_own = upload.uploaded_by == roll_number
        raw_name = display_names.get(upload.uploaded_by)
        # For own uploads show nothing (frontend handles "you"); for others show
        # only first name to keep it light and anonymous-ish.
        uploader_name: str | None = None
        if not is_own and raw_name:
            uploader_name = raw_name.split()[0] if raw_name.strip() else None

        result.append(AvailableChapterOut(
            chapter_key=upload.chapter_key,
            chapter_title=upload.chapter_title or upload.chapter_key.replace("-", " ").title(),
            subject_id=upload.subject_id,
            script_id=str(script.id),
            upload_id=str(upload.id),
            uploaded_by_label="you" if is_own else "a classmate",
            uploaded_by_name=uploader_name,
            is_own_upload=is_own,
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
