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

import pydantic
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


# ── Synthetic handout creation (no file needed) ───────────────────────────────

class _CreateFromTextRequest(pydantic.BaseModel):
    token: str
    subject_id: str
    subject_name: str
    mode: str  # "syllabus_paste" | "manual"
    # syllabus_paste mode
    syllabus_text: str | None = None
    # manual mode
    chapters: list[str] | None = None  # plain chapter titles, one per item


@router.post("/handouts/create-from-text")
async def create_handout_from_text(
    background_tasks: BackgroundTasks,
    payload: _CreateFromTextRequest,
    db: Session = Depends(_get_db),
):
    """
    Create a CourseHandout without uploading a file.

    mode=syllabus_paste: parse the provided syllabus text with Gemini
        (same LLM pipeline as file upload). Returns status=pending while
        background processing runs; poll /status to detect completion.

    mode=manual: build a synthetic structured_syllabus directly from the
        provided chapter titles — no AI required, completes synchronously
        and returns status=ready immediately.
    """
    roll = _resolve_roll(payload.token)
    if not roll:
        raise HTTPException(status_code=401, detail="Invalid or expired session token")

    if payload.mode not in ("syllabus_paste", "manual"):
        raise HTTPException(status_code=400, detail="mode must be 'syllabus_paste' or 'manual'")

    if payload.mode == "syllabus_paste":
        text = (payload.syllabus_text or "").strip()
        if len(text) < 30:
            raise HTTPException(status_code=400, detail="Syllabus text is too short. Paste more content.")

    if payload.mode == "manual":
        chapters = [c.strip() for c in (payload.chapters or []) if c.strip()]
        if not chapters:
            raise HTTPException(status_code=400, detail="Please provide at least one chapter title.")

    subject_id = payload.subject_id.lower().strip()
    subject_name = payload.subject_name.strip() or subject_id.upper()

    # Deactivate any existing active handout for this subject
    existing = db.query(CourseHandout).filter(
        CourseHandout.subject_id == subject_id,
        CourseHandout.is_active == "1",
        CourseHandout.parse_status == "ready",
    ).first()
    if existing:
        existing.is_active = "0"
        existing.updated_at = datetime.utcnow()
        db.commit()

    handout_id = str(uuid.uuid4())
    now = datetime.utcnow()

    if payload.mode == "manual":
        # Build synthetic syllabus synchronously — no LLM needed
        chapters = [c.strip() for c in (payload.chapters or []) if c.strip()]
        structured = _build_manual_syllabus(subject_name, chapters)
        row = CourseHandout(
            id=handout_id,
            subject_id=subject_id,
            subject_name=subject_name,
            uploaded_by=roll,
            parse_status="ready",
            structured_syllabus=structured,
            created_at=now,
            updated_at=now,
        )
        db.add(row)
        db.commit()
        return {
            "handout_id": handout_id,
            "status": "ready",
            "module_count": len(structured["modules"]),
            "chapter_count": sum(len(m["chapters"]) for m in structured["modules"]),
        }

    # syllabus_paste — process with LLM in background
    row = CourseHandout(
        id=handout_id,
        subject_id=subject_id,
        subject_name=subject_name,
        uploaded_by=roll,
        parse_status="pending",
        structured_syllabus={},
        created_at=now,
        updated_at=now,
    )
    db.add(row)
    db.commit()

    syllabus_text = (payload.syllabus_text or "").strip()
    background_tasks.add_task(_parse_syllabus_text_task, handout_id, syllabus_text, subject_name)

    return {
        "handout_id": handout_id,
        "status": "pending",
        "message": "Extracting chapter structure from your syllabus (~10 seconds)…",
    }


def _build_manual_syllabus(subject_name: str, chapter_titles: list[str]) -> dict:
    """
    Build a structured_syllabus dict from a flat chapter list.
    Groups chapters into 1–3 modules depending on count.
    """
    n = len(chapter_titles)
    if n <= 5:
        # Single module — small subject
        modules = [{
            "number": 1,
            "title": subject_name,
            "session_range": None,
            "overview_topics": chapter_titles,
            "chapters": [{"title": t, "sessions": None, "topics": []} for t in chapter_titles],
        }]
    else:
        # Split into ~3 modules
        group_size = max(2, n // 3)
        groups = [chapter_titles[i:i + group_size] for i in range(0, n, group_size)]
        # Absorb a lone trailing group into the previous
        if len(groups) > 1 and len(groups[-1]) == 1:
            groups[-2].extend(groups.pop())
        modules = []
        for idx, group in enumerate(groups, start=1):
            modules.append({
                "number": idx,
                "title": f"Module {idx}",
                "session_range": None,
                "overview_topics": group,
                "chapters": [{"title": t, "sessions": None, "topics": []} for t in group],
            })
    return {
        "subject_name": subject_name,
        "subject_code": None,
        "program": None,
        "semester": None,
        "credits": None,
        "instructor_name": None,
        "instructor_email": None,
        "course_description": None,
        "modules": modules,
    }


def _parse_syllabus_text_task(handout_id: str, syllabus_text: str, subject_name: str) -> None:
    """Background task: run LLM syllabus extraction on pasted text."""
    from db.session import SessionLocal as SL
    from services.handout_parser import parse_syllabus_with_llm, _trim_to_relevant_sections

    try:
        with SL() as s:
            row = s.get(CourseHandout, handout_id)
            if not row:
                return
            row.parse_status = "processing"
            row.updated_at = datetime.utcnow()
            s.commit()

        trimmed = _trim_to_relevant_sections(syllabus_text)
        structured = parse_syllabus_with_llm(trimmed)

        # Use provided subject_name if LLM couldn't detect one
        if not structured.get("subject_name"):
            structured["subject_name"] = subject_name

        with SL() as s:
            row = s.get(CourseHandout, handout_id)
            if row:
                row.subject_name = structured.get("subject_name", subject_name)
                row.subject_code = structured.get("subject_code")
                row.program = structured.get("program")
                row.semester = structured.get("semester")
                row.credits = structured.get("credits")
                row.instructor_name = structured.get("instructor_name")
                row.instructor_email = structured.get("instructor_email")
                row.structured_syllabus = structured
                row.raw_text = syllabus_text[:10000]
                row.parse_status = "ready"
                row.updated_at = datetime.utcnow()
                s.commit()
                logger.info("[HandoutRouter] Syllabus paste parsed: %s — %d modules",
                            row.subject_name, len(structured.get("modules", [])))
    except Exception as exc:
        logger.error("[HandoutRouter] Syllabus paste parse failed for %s: %s", handout_id, exc)
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
