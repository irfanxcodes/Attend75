"""
Handout Router — course handout upload and syllabus retrieval.

POST /studyme/handouts/upload   Upload DOCX/PDF, parse syllabus, store in DB
GET  /studyme/handouts/{subject_id}  Fetch active handout for a subject
GET  /studyme/handouts/{subject_id}/chapters  List all chapters across all modules
"""
import logging
import os
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from db.session import SessionLocal
from db.models.course_handout import CourseHandout
from services.session_store import session_store

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/studyme", tags=["handout"])

_UPLOAD_DIR = Path(__file__).resolve().parent.parent / "uploads" / "handouts"
_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

_ALLOWED_EXTENSIONS = {".pdf", ".docx", ".doc"}
_MAX_SIZE_BYTES = 20 * 1024 * 1024  # 20 MB


def _get_db():
    with SessionLocal() as session:
        yield session


def _resolve_roll(token: str) -> str | None:
    record = session_store.get(token)
    return record.roll_number if record else None


@router.post("/handouts/upload")
async def upload_handout(
    background_tasks: BackgroundTasks,
    token: str = Form(...),
    subject_id: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(_get_db),
):
    roll = _resolve_roll(token)
    if not roll:
        raise HTTPException(status_code=401, detail="Invalid or expired session token")

    ext = Path(file.filename or "").suffix.lower()
    if ext not in _ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Only PDF, DOCX files are accepted")

    data = await file.read()
    if len(data) > _MAX_SIZE_BYTES:
        raise HTTPException(status_code=413, detail="File too large. Maximum 20MB.")

    # Check if active handout already exists for this subject.
    # If so, mark it inactive so the new upload fully replaces it.
    existing = db.query(CourseHandout).filter(
        CourseHandout.subject_id == subject_id.lower(),
        CourseHandout.is_active == "1",
        CourseHandout.parse_status == "ready",
    ).first()
    if existing:
        existing.is_active = "0"
        existing.updated_at = datetime.utcnow()
        db.commit()
        logger.info(
            "[HandoutRouter] Replaced existing handout %s for subject %s",
            existing.id, subject_id,
        )

    # Save file
    handout_id = str(uuid.uuid4())
    file_path = str(_UPLOAD_DIR / f"{handout_id}{ext}")
    with open(file_path, "wb") as f:
        f.write(data)

    now = datetime.utcnow()
    row = CourseHandout(
        id=handout_id,
        subject_id=subject_id.lower().strip(),
        subject_name=subject_id.upper(),  # placeholder, updated after parse
        uploaded_by=roll,
        parse_status="pending",
        structured_syllabus={},
        created_at=now,
        updated_at=now,
    )
    db.add(row)
    db.commit()

    background_tasks.add_task(_parse_handout_task, handout_id, file_path)

    return {
        "handout_id": handout_id,
        "status": "pending",
        "already_exists": False,
        "message": "Handout received. Extracting syllabus (~15 seconds)...",
    }


def _parse_handout_task(handout_id: str, file_path: str) -> None:
    from db.session import SessionLocal as SL
    from services.handout_parser import parse_handout
    import os

    try:
        with SL() as s:
            row = s.get(CourseHandout, handout_id)
            if not row:
                return
            row.parse_status = "processing"
            row.updated_at = datetime.utcnow()
            s.commit()

        raw_text, structured = parse_handout(file_path)

        with SL() as s:
            row = s.get(CourseHandout, handout_id)
            if row:
                row.subject_name = structured.get("subject_name", row.subject_id.upper())
                row.subject_code = structured.get("subject_code")
                row.program = structured.get("program")
                row.semester = structured.get("semester")
                row.credits = structured.get("credits")
                row.instructor_name = structured.get("instructor_name")
                row.instructor_email = structured.get("instructor_email")
                row.structured_syllabus = structured
                row.raw_text = raw_text[:10000]  # store first 10k chars for debugging
                row.parse_status = "ready"
                row.updated_at = datetime.utcnow()
                s.commit()
                logger.info("[HandoutRouter] Parsed: %s — %d modules",
                            row.subject_name, len(structured.get("modules", [])))
    except Exception as exc:
        logger.error("[HandoutRouter] Parse failed for %s: %s", handout_id, exc)
        try:
            with SL() as s:
                row = s.get(CourseHandout, handout_id)
                if row:
                    row.parse_status = "failed"
                    row.error_message = str(exc)[:500]
                    row.updated_at = datetime.utcnow()
                    s.commit()
        except Exception:
            pass
    finally:
        # Delete the uploaded file
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
        except Exception:
            pass


@router.get("/handouts/{subject_id}/status")
def get_handout_status(subject_id: str, token: str, db: Session = Depends(_get_db)):
    roll = _resolve_roll(token)
    if not roll:
        raise HTTPException(status_code=401, detail="Invalid session token")

    row = db.query(CourseHandout).filter(
        CourseHandout.subject_id == subject_id.lower(),
        CourseHandout.is_active == "1",
    ).order_by(CourseHandout.created_at.desc()).first()

    if not row:
        return {"status": "not_found", "subject_id": subject_id}

    result = {
        "handout_id": str(row.id),
        "status": row.parse_status,
        "subject_name": row.subject_name,
        "subject_code": row.subject_code,
        "program": row.program,
        "semester": row.semester,
        "uploaded_by_label": "you" if row.uploaded_by == roll else "a classmate",
        "error_message": row.error_message if row.parse_status == "failed" else None,
    }
    if row.parse_status == "ready":
        syllabus = row.structured_syllabus or {}
        modules = syllabus.get("modules", [])
        result["module_count"] = len(modules)
        result["chapter_count"] = sum(len(m.get("chapters", [])) for m in modules)
    return result


@router.get("/handouts/{subject_id}")
def get_handout(subject_id: str, token: str, db: Session = Depends(_get_db)):
    """Full handout data including structured syllabus."""
    roll = _resolve_roll(token)
    if not roll:
        raise HTTPException(status_code=401, detail="Invalid session token")

    row = db.query(CourseHandout).filter(
        CourseHandout.subject_id == subject_id.lower(),
        CourseHandout.is_active == "1",
        CourseHandout.parse_status == "ready",
    ).order_by(CourseHandout.created_at.desc()).first()

    if not row:
        raise HTTPException(status_code=404, detail="No handout found for this subject")

    syllabus = row.structured_syllabus or {}
    return {
        "handout_id": str(row.id),
        "subject_id": row.subject_id,
        "subject_name": row.subject_name,
        "subject_code": row.subject_code,
        "program": row.program,
        "semester": row.semester,
        "credits": row.credits,
        "instructor_name": row.instructor_name,
        "instructor_email": row.instructor_email,
        "course_description": syllabus.get("course_description"),
        "modules": syllabus.get("modules", []),
        "uploaded_by_label": "you" if row.uploaded_by == roll else "a classmate",
    }
