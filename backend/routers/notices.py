"""
Notice Board API Router
"""

import logging

from fastapi import APIRouter, Query, UploadFile, File, Form
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse, StreamingResponse

from models.schemas import ApiResponse
from pydantic import BaseModel, Field
from services.notice_scheduler import notice_scheduler
from services.notice_service import (
    dismiss_notice,
    fetch_notices_for_user,
    get_notice_detail,
    get_notice_stats,
    toggle_bookmark,
)
from services.session_store import session_store

router = APIRouter(prefix="/notices", tags=["notices"])
logger = logging.getLogger(__name__)


class NoticeTokenRequest(BaseModel):
    token: str = Field(..., description="Session token")


# GET /notices?token=...&limit=10&offset=0&category=Exam&include_dismissed=false&q=
@router.get("", response_model=ApiResponse)
async def list_notices(
    token: str = Query(..., description="Session token"),
    limit: int = Query(default=10, ge=1, le=50),
    offset: int = Query(default=0, ge=0),
    category: str | None = Query(default=None),
    include_dismissed: bool = Query(default=False),
    q: str | None = Query(default=None),
):
    # Reserve "q" param for future search — return 501 if used
    if q:
        return JSONResponse(status_code=501, content={"status": "error", "message": "Search is not yet implemented"})

    try:
        data = await run_in_threadpool(
            fetch_notices_for_user, token, limit, offset, category, include_dismissed
        )
        return ApiResponse(status="success", message="Notices fetched", data=data)
    except PermissionError:
        return JSONResponse(status_code=401, content={"status": "error", "message": "Session expired"})
    except Exception:
        logger.exception("Failed to fetch notices")
        return JSONResponse(status_code=500, content={"status": "error", "message": "Unable to load notices"})


# GET /notices/stats?token=...
@router.get("/stats", response_model=ApiResponse)
async def notices_stats(token: str = Query(..., description="Session token")):
    try:
        data = await run_in_threadpool(get_notice_stats, token)
        return ApiResponse(status="success", message="Notice stats fetched", data=data)
    except PermissionError:
        return JSONResponse(status_code=401, content={"status": "error", "message": "Session expired"})
    except Exception:
        logger.exception("Failed to fetch notice stats")
        return JSONResponse(status_code=500, content={"status": "error", "message": "Unable to load notice stats"})


def get_timetable_candidates(token: str) -> list[dict]:
    """
    Return recent timetable notices that could be the student's timetable.
    Used when automatic matching fails, so the student can pick their own.
    """
    from db.models.notice import Notice
    from db.session import SessionLocal
    from services.timetable_service import _parse_timetable_from_text

    record = session_store.get(token)
    if record is None:
        raise PermissionError("Session expired")

    with SessionLocal() as session:
        notices = (
            session.query(Notice)
            .filter(Notice.processing_status == "done")
            .filter(Notice.title.isnot(None))
            .order_by(Notice.portal_date.desc(), Notice.notice_id.desc())
            .limit(200)
            .all()
        )

    candidates = []
    for notice in notices:
        title_upper = (notice.title or "").upper()
        if "TIMETABLE" not in title_upper and "TIME TABLE" not in title_upper:
            continue
        if "EXAM" in title_upper or "SPECIAL" in title_upper or "SUMMER" in title_upper or "REMEDIAL" in title_upper:
            continue
        if not notice.cleaned_text or len(notice.cleaned_text) < 100:
            continue
        schedule = _parse_timetable_from_text(notice.cleaned_text)
        if not schedule:
            continue
        semesters = sorted(set(e["semester"] for e in schedule if e["semester"]))
        sections = sorted(set(e["section"] for e in schedule if e["section"]))
        candidates.append({
            "noticeId": notice.notice_id,
            "title": notice.title,
            "date": notice.portal_date.isoformat() if notice.portal_date else None,
            "semesters": semesters,
            "sections": sections,
            "entryCount": len(schedule),
        })
        if len(candidates) >= 5:
            break

    return candidates


def get_timetable_for_notice(token: str, notice_id: int, semester_id: str | None = None) -> dict | None:
    """
    Build a personalized timetable from a specific notice chosen by the student.
    Saves the chosen notice ID to the session so subsequent requests use it.
    """
    from db.models.notice import Notice
    from db.session import SessionLocal
    from services.timetable_service import (
        _build_abbr_lookup, _get_parsed_schedule, _infer_full_subjects_from_schedule,
        _match_student_classes, _resolve_subjects,
    )

    record = session_store.get(token)
    if record is None:
        raise PermissionError("Session expired")

    with SessionLocal() as db_session:
        notice = db_session.query(Notice).filter(Notice.notice_id == notice_id).one_or_none()
        if not notice:
            return None

    abbr_lookup = _build_abbr_lookup(notice.cleaned_text or "")
    student_subjects = _resolve_subjects(record, semester_id, abbr_lookup)
    if not student_subjects:
        student_subjects = record.cached_subjects or []

    schedule = _get_parsed_schedule(notice, record)
    if not schedule:
        return None

    my_classes = _match_student_classes(schedule, student_subjects)
    if my_classes:
        from services.timetable_service import _infer_full_subjects_from_schedule
        augmented = _infer_full_subjects_from_schedule(schedule, my_classes)
        if len(augmented) > len(student_subjects):
            student_subjects = augmented
            my_classes = _match_student_classes(schedule, student_subjects)

    # If subject matching failed, fall back to section-based display.
    # This helps students whose subjects can't be resolved (different semester,
    # stale session, etc.) — they still see their section's full timetable.
    if not my_classes and student_subjects:
        # Try to determine student's section from their subjects
        sections = set(s.get('section', '').upper() for s in student_subjects if s.get('section'))
        if sections:
            student_section = max(sections, key=lambda s: sum(1 for subj in student_subjects if subj.get('section', '').upper() == s))
            # Show all classes for this section (regardless of subject matching)
            my_classes = [
                cls for cls in schedule
                if cls.get('section', '').upper() == student_section
                or cls.get('section', '').upper().startswith(student_section)
                or student_section.startswith(cls.get('section', '').upper())
            ]
            if my_classes:
                # Infer subjects from section
                student_subjects = [{'abbr': c['course'], 'section': c['section']} for c in my_classes]
                student_subjects = list({f"{s['abbr']}-{s['section']}": s for s in student_subjects}.values())

    if not my_classes:
        return None

    # Save the chosen notice to session so automatic matching uses it next time
    record.pinned_timetable_notice_id = notice_id

    days_order = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
    by_day = {day: [] for day in days_order}
    for cls in my_classes:
        day = cls.get("day", "")
        if day in by_day:
            by_day[day].append(cls)
    for day in by_day:
        by_day[day].sort(key=lambda c: c.get("time_sort", ""))
    by_day = {day: classes for day, classes in by_day.items() if classes}

    if not by_day:
        return None

    return {
        "noticeTitle": notice.title,
        "noticeDate": notice.portal_date.isoformat() if notice.portal_date else None,
        "noticeId": notice.notice_id,
        "schedule": by_day,
        "totalClasses": len(my_classes),
        "subjects": [s["abbr"] for s in student_subjects],
    }


# GET /notices/timetable/candidates?token=...
@router.get("/timetable/candidates", response_model=ApiResponse)
async def timetable_candidates(token: str = Query(..., description="Session token")):
    """Return recent parseable timetable notices for manual selection."""
    try:
        data = await run_in_threadpool(get_timetable_candidates, token)
        return ApiResponse(status="success", message="Candidates fetched", data={"candidates": data})
    except PermissionError:
        return JSONResponse(status_code=401, content={"status": "error", "message": "Session expired"})
    except Exception:
        logger.exception("Failed to fetch timetable candidates")
        return JSONResponse(status_code=500, content={"status": "error", "message": "Unable to load candidates"})


class TimetableSelectRequest(BaseModel):
    token: str = Field(..., description="Session token")
    notice_id: int = Field(..., description="Notice ID chosen by student")
    semester_id: str | None = Field(default=None)


# POST /notices/timetable/select
@router.post("/timetable/select", response_model=ApiResponse)
async def select_timetable(payload: TimetableSelectRequest):
    """Build personalized timetable from a student-chosen notice."""
    try:
        data = await run_in_threadpool(
            get_timetable_for_notice, payload.token, payload.notice_id, payload.semester_id
        )
        if data is None:
            return ApiResponse(status="success", message="No timetable data", data={"schedule": None})
        return ApiResponse(status="success", message="Timetable fetched", data=data)
    except PermissionError:
        return JSONResponse(status_code=401, content={"status": "error", "message": "Session expired"})
    except Exception:
        logger.exception("Failed to build timetable from selected notice")
        return JSONResponse(status_code=500, content={"status": "error", "message": "Unable to load timetable"})


@router.get("/timetable", response_model=ApiResponse)
async def get_timetable(
    token: str = Query(..., description="Session token"),
    semester_id: str | None = Query(default=None),
):
    """Get personalized timetable for the student."""
    from services.timetable_service import get_personalized_timetable

    try:
        # Check if the student has manually pinned a specific timetable notice
        record = session_store.get(token)
        pinned_id = getattr(record, "pinned_timetable_notice_id", None) if record else None

        if pinned_id:
            data = await run_in_threadpool(get_timetable_for_notice, token, pinned_id, semester_id)
        else:
            data = await run_in_threadpool(get_personalized_timetable, token, semester_id)

        if data is None:
            return ApiResponse(status="success", message="No timetable available", data={"schedule": None})
        return ApiResponse(status="success", message="Timetable fetched", data=data)
    except PermissionError:
        return JSONResponse(status_code=401, content={"status": "error", "message": "Session expired"})
    except Exception:
        logger.exception("Failed to fetch timetable")
        return JSONResponse(status_code=500, content={"status": "error", "message": "Unable to load timetable"})


# POST /notices/timetable/upload — Upload a timetable PDF for parsing
@router.post("/timetable/upload", response_model=ApiResponse)
async def upload_timetable(token: str = Form(...), file: UploadFile = File(...)):
    """Parse an uploaded timetable PDF and return personalized schedule."""
    import io
    from services.timetable_service import _parse_timetable_pdf, _match_student_classes, _infer_full_subjects_from_schedule
    from services.session_store import session_store as _ss

    record = _ss.get(token)
    if record is None:
        return JSONResponse(status_code=401, content={"status": "error", "message": "Session expired"})

    # Validate file
    if not file.filename or not file.filename.lower().endswith('.pdf'):
        return JSONResponse(status_code=422, content={"status": "error", "message": "Please upload a PDF file"})

    content = await file.read()
    if len(content) > 10 * 1024 * 1024:  # 10MB limit
        return JSONResponse(status_code=422, content={"status": "error", "message": "File too large (max 10MB)"})

    if len(content) < 100:
        return JSONResponse(status_code=422, content={"status": "error", "message": "File appears to be empty"})

    try:
        schedule = await run_in_threadpool(_parse_timetable_pdf, io.BytesIO(content))
    except Exception:
        logger.exception("Failed to parse uploaded timetable PDF")
        return JSONResponse(status_code=422, content={"status": "error", "message": "Could not parse this PDF. Make sure it's a valid timetable."})

    if not schedule:
        return JSONResponse(status_code=422, content={"status": "error", "message": "No timetable data found in this PDF. Make sure it's your class timetable."})

    # Try to match to student's subjects
    student_subjects = record.cached_subjects or []
    my_classes = _match_student_classes(schedule, student_subjects) if student_subjects else []

    # If subject matching fails, try section-based fallback
    if not my_classes and student_subjects:
        sections = set(s.get('section', '').upper() for s in student_subjects if s.get('section'))
        if sections:
            student_section = max(sections, key=lambda s: sum(1 for subj in student_subjects if subj.get('section', '').upper() == s))
            my_classes = [
                cls for cls in schedule
                if cls.get('section', '').upper() == student_section
                or cls.get('section', '').upper().startswith(student_section)
                or student_section.startswith(cls.get('section', '').upper())
            ]

    # If still no match, try augmentation
    if my_classes:
        augmented = _infer_full_subjects_from_schedule(schedule, my_classes)
        if len(augmented) > len(student_subjects):
            student_subjects = augmented
            my_classes = _match_student_classes(schedule, student_subjects)

    # If absolutely no matching possible, show all classes (user can figure out which are theirs)
    if not my_classes:
        my_classes = schedule

    # Organize by day
    days_order = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
    by_day = {day: [] for day in days_order}
    for cls in my_classes:
        day = cls.get("day", "")
        if day in by_day:
            by_day[day].append(cls)
    for day in by_day:
        by_day[day].sort(key=lambda c: c.get("time_sort", ""))
    by_day = {day: classes for day, classes in by_day.items() if classes}

    if not by_day:
        return JSONResponse(status_code=422, content={"status": "error", "message": "No classes found in the uploaded timetable."})

    result = {
        "noticeTitle": f"Uploaded: {file.filename}",
        "noticeDate": None,
        "noticeId": None,
        "schedule": by_day,
        "totalClasses": len(my_classes),
        "subjects": list(set(s.get("abbr", s.get("course", "")) for s in student_subjects)) if student_subjects else [],
        "uploaded": True,
    }

    logger.info("Timetable upload: parsed %d classes from %s for %s", len(my_classes), file.filename, record.roll_number)
    return ApiResponse(status="success", message="Timetable parsed successfully", data=result)


# GET /notices/{id}?token=...
@router.get("/{notice_id}", response_model=ApiResponse)
async def notice_detail(notice_id: int, token: str = Query(..., description="Session token")):
    try:
        data = await run_in_threadpool(get_notice_detail, token, notice_id)
        if data is None:
            return JSONResponse(status_code=404, content={"status": "error", "message": "Notice not found"})
        return ApiResponse(status="success", message="Notice detail fetched", data=data)
    except PermissionError:
        return JSONResponse(status_code=401, content={"status": "error", "message": "Session expired"})
    except Exception:
        logger.exception("Failed to fetch notice detail")
        return JSONResponse(status_code=500, content={"status": "error", "message": "Unable to load notice"})


# GET /notices/{id}/pdf?token=...
@router.get("/{notice_id}/pdf")
async def notice_pdf_proxy(notice_id: int, token: str = Query(..., description="Session token")):
    """Stream PDF from portal without exposing credentials."""
    record = session_store.get(token)
    if record is None:
        return JSONResponse(status_code=401, content={"status": "error", "message": "Session expired"})

    from db.models.notice import Notice
    from db.session import SessionLocal

    with SessionLocal() as session:
        notice = session.query(Notice).filter(Notice.notice_id == notice_id).one_or_none()
        if not notice:
            return JSONResponse(status_code=404, content={"status": "error", "message": "Notice not found"})
        pdf_url_path = notice.pdf_url_path

    # Stream PDF from portal
    try:
        scraper = record.scraper
        pdf_url = f"{scraper.base_url.rstrip('/')}/{pdf_url_path}"

        with record.scraper_lock:
            response = scraper.session.get(pdf_url, timeout=30, stream=True)

        if response.status_code != 200:
            return JSONResponse(status_code=404, content={"status": "error", "message": "PDF not available on portal"})

        def generate():
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    yield chunk

        return StreamingResponse(
            generate(),
            media_type="application/pdf",
            headers={"Content-Disposition": f"inline; filename=notice_{notice_id}.pdf"},
        )
    except Exception:
        logger.exception("Failed to stream PDF for notice %d", notice_id)
        return JSONResponse(status_code=502, content={"status": "error", "message": "Unable to fetch PDF from portal"})


# POST /notices/{id}/bookmark
@router.post("/{notice_id}/bookmark", response_model=ApiResponse)
async def bookmark_notice(notice_id: int, payload: NoticeTokenRequest):
    try:
        data = await run_in_threadpool(toggle_bookmark, payload.token, notice_id)
        return ApiResponse(status="success", message="Bookmark toggled", data=data)
    except PermissionError:
        return JSONResponse(status_code=401, content={"status": "error", "message": "Session expired"})
    except Exception:
        logger.exception("Failed to toggle bookmark")
        return JSONResponse(status_code=500, content={"status": "error", "message": "Unable to update bookmark"})


# POST /notices/{id}/dismiss
@router.post("/{notice_id}/dismiss", response_model=ApiResponse)
async def dismiss_notice_endpoint(notice_id: int, payload: NoticeTokenRequest):
    try:
        data = await run_in_threadpool(dismiss_notice, payload.token, notice_id)
        return ApiResponse(status="success", message="Notice dismissed", data=data)
    except PermissionError:
        return JSONResponse(status_code=401, content={"status": "error", "message": "Session expired"})
    except Exception:
        logger.exception("Failed to dismiss notice")
        return JSONResponse(status_code=500, content={"status": "error", "message": "Unable to dismiss notice"})


# POST /notices/refresh
@router.post("/refresh", response_model=ApiResponse)
async def refresh_notices(payload: NoticeTokenRequest):
    record = session_store.get(payload.token)
    if record is None:
        return JSONResponse(status_code=401, content={"status": "error", "message": "Session expired"})

    try:
        source_program = record.program_full or record.program_sn
        with record.scraper_lock:
            data = await run_in_threadpool(
                notice_scheduler.trigger_immediate, record.scraper, source_program
            )
        return ApiResponse(status="success", message="Notice refresh complete", data=data)
    except Exception:
        logger.exception("Failed to refresh notices")
        return JSONResponse(status_code=500, content={"status": "error", "message": "Unable to refresh notices"})
