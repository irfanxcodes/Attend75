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


def _persist_uploaded_timetable_notice(roll_number: str, classes: list, fname: str) -> None:
    """
    Store a student-uploaded timetable as a Notice row so:
    - GET /notices/timetable can serve it after session restart
    - The reminder engine can schedule class reminders for it

    The cleaned_text is a compact text encoding of the schedule that all
    parsers (timetable_service, reminder_engine) can read back.
    """
    try:
        import json as _json
        from datetime import datetime, timezone, date
        from db.session import SessionLocal
        from db.models.notice import Notice
        from db.models.push_subscription import PushSubscription

        # Encode schedule as JSON for lossless round-trip storage
        store_text = _json.dumps(classes, ensure_ascii=False)

        now = datetime.now(timezone.utc)
        title = f"[STUDENT_TIMETABLE] {roll_number}"
        with SessionLocal() as session:
            existing = session.query(Notice).filter(
                Notice.title == title,
                Notice.processing_status == "done",
            ).first()
            if existing:
                existing.cleaned_text = store_text
                existing.portal_date = date.today()
            else:
                session.add(Notice(
                    title=title,
                    portal_date=date.today(),
                    pdf_url_path="",
                    processing_status="done",
                    cleaned_text=store_text,
                    source_program=roll_number,
                    category="Academic",
                    notification_sent_at=now,
                    created_at=now,
                    updated_at=now,
                ))
            session.commit()

        # Mark has_timetable=True so the reminder engine picks this student up
        with SessionLocal() as session:
            session.query(PushSubscription).filter(
                PushSubscription.roll_number == roll_number,
            ).update({"has_timetable": True}, synchronize_session=False)
            session.commit()
    except Exception:
        logger.warning("Failed to persist uploaded timetable for %s", roll_number, exc_info=True)


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
    Only returns notices from the student's own program — non-BBA/non-BCA students
    should never see BBA timetable notices here.
    Used when automatic matching fails, so the student can pick their own.
    """
    from db.models.notice import Notice
    from db.session import SessionLocal
    from services.timetable_service import _parse_schedule_from_notice_text
    from services.notice_service import get_student_program
    from sqlalchemy import or_

    record = session_store.get(token)
    if record is None:
        raise PermissionError("Session expired")

    # Determine student's own program — same logic as fetch_notices_for_user
    program = get_student_program(record.roll_number) or record.program_full or record.program_sn

    with SessionLocal() as session:
        query = (
            session.query(Notice)
            .filter(Notice.processing_status == "done")
            .filter(Notice.title.isnot(None))
        )

        # Filter by program — students should only see timetable notices
        # from their own program's portal scrape, not other programs'.
        if program:
            query = query.filter(
                or_(Notice.source_program == program, Notice.source_program == None)
            )

        notices = (
            query
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
        schedule = _parse_schedule_from_notice_text(notice.cleaned_text)
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


# POST /notices/timetable/upload — Upload a timetable PDF, image, or spreadsheet
@router.post("/timetable/upload", response_model=ApiResponse)
async def upload_timetable(token: str = Form(...), file: UploadFile = File(...)):
    """
    Parse an uploaded timetable and return personalized schedule.
    Accepts: PDF, JPG/PNG/WEBP images (OCR), XLSX/XLS spreadsheets.
    """
    import io
    from collections import Counter
    from services.timetable_service import (
        _parse_timetable_pdf, _match_student_classes,
        _infer_full_subjects_from_schedule,
    )
    from services.timetable_ocr import (
        is_image, is_xlsx, extract_timetable_from_upload,
        ALL_SUPPORTED,
    )
    from services.session_store import session_store as _ss

    record = _ss.get(token)
    if record is None:
        return JSONResponse(status_code=401, content={"status": "error", "message": "Session expired"})

    fname = (file.filename or "").strip()
    fname_lower = fname.lower()

    # Validate file type
    is_pdf = fname_lower.endswith(".pdf")
    if not fname or not (is_pdf or is_image(fname_lower) or is_xlsx(fname_lower)):
        return JSONResponse(
            status_code=422,
            content={
                "status": "error",
                "message": "Unsupported file type. Please upload a PDF, image (JPG/PNG/WEBP), or spreadsheet (XLSX).",
            },
        )

    content = await file.read()

    # Size limits: images 20MB, xlsx 10MB, pdf 10MB
    max_size = 20 * 1024 * 1024 if is_image(fname_lower) else 10 * 1024 * 1024
    if len(content) > max_size:
        return JSONResponse(
            status_code=422,
            content={"status": "error", "message": f"File too large (max {max_size // (1024*1024)}MB)"},
        )
    if len(content) < 100:
        return JSONResponse(status_code=422, content={"status": "error", "message": "File appears to be empty"})

    # Determine student section + year hint for matching (NOT for parsing)
    student_subjects = record.cached_subjects or []
    student_section_hint = None
    student_year_hint = ""
    if student_subjects:
        sec_counts = Counter(s.get('section', '').upper() for s in student_subjects if s.get('section'))
        if sec_counts:
            student_section_hint = max(sec_counts, key=sec_counts.get)
    # Derive year from semester label: "Semester 3" → "II", "5th Sem" → "III"
    sem_label = getattr(record, 'selected_semester_label', None) or ""
    if sem_label:
        from services.timetable_service import _semester_to_year
        student_year_hint = _semester_to_year(sem_label)

    # ── Parse full schedule (NO section filter — always parse everything) ───
    # Section filtering happens AFTER parsing so needs_section has all options.
    try:
        if is_pdf:
            schedule = await run_in_threadpool(
                _parse_timetable_pdf, io.BytesIO(content), None, ""
            )
        else:
            schedule = await run_in_threadpool(
                extract_timetable_from_upload, content, fname, None
            )
    except RuntimeError as exc:
        return JSONResponse(status_code=422, content={"status": "error", "message": str(exc)})
    except Exception:
        logger.exception("Failed to parse uploaded timetable")
        return JSONResponse(
            status_code=422,
            content={"status": "error", "message": "Could not parse this file. Make sure it's a valid timetable."},
        )

    if not schedule:
        return JSONResponse(
            status_code=422,
            content={"status": "error", "message": "No timetable data found in this file. Make sure it's your class timetable."},
        )

    # ── Filter to student's section using hints from session ────────────────
    my_classes = []

    # Try subject matching first (most precise)
    if student_subjects:
        my_classes = _match_student_classes(schedule, student_subjects)

    # Section-based fallback using section + year + dept hints
    if not my_classes and student_section_hint:
        from services.timetable_service import _btech_section_matches, _dept_matches
        my_classes = [
            cls for cls in schedule
            if _btech_section_matches(
                cls.get('section', ''), student_section_hint,
                pdf_year=cls.get('pdf_year', ''), student_year=student_year_hint,
            )
        ]

    # Subject augmentation
    if my_classes:
        augmented = _infer_full_subjects_from_schedule(schedule, my_classes)
        if len(augmented) > len(student_subjects):
            student_subjects = augmented
            my_classes = _match_student_classes(schedule, student_subjects)

    # Hard stop — never dump all classes. Return needs_section response instead.
    if not my_classes:
        # Extract unique sections and depts from the parsed schedule
        from services.timetable_service import _normalize_pdf_section
        raw_sections = set(cls.get('section', '') for cls in schedule if cls.get('section', ''))
        available_sections = sorted(set(
            _normalize_pdf_section(s) for s in raw_sections if _normalize_pdf_section(s)
        ))

        # Build dept options: unique (section_norm, year, dept, room) combos for display
        seen = set()
        available_combos = []
        for cls in schedule:
            sec_norm = _normalize_pdf_section(cls.get('section', ''))
            yr   = cls.get('pdf_year', '')
            dept = cls.get('pdf_dept', '')
            room = cls.get('room', '')
            raw_sec = cls.get('section', '')
            # Extract room from raw section string like "A (G-16)" → "G-16"
            if not room:
                import re as _re
                rm = _re.search(r'\(([A-Z][A-Z0-9\-]+)\)', raw_sec)
                if rm:
                    room = rm.group(1)
            key = (sec_norm, yr, dept)
            if key not in seen and sec_norm:
                seen.add(key)
                available_combos.append({
                    "section": sec_norm,
                    "year": yr,
                    "dept": dept,
                    "room": room,
                    "label": f"Section {sec_norm} ({room}) — Year {yr} {dept}".strip(" —()").replace("()", "").strip(),
                })
        available_combos.sort(key=lambda x: (x['year'], x['section']))
        # Store parsed schedule in session for the section-override retry
        record.pending_timetable_schedule = schedule
        record.pending_timetable_filename = fname

        return JSONResponse(
            status_code=200,
            content={
                "status": "needs_section",
                "message": "Timetable found — please tell us your section and department.",
                "data": {
                    "needsSection": True,
                    "availableSections": available_sections,
                    "availableCombos": available_combos,
                    "noticeTitle": f"Uploaded: {fname}",
                },
            },
        )

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

    # Persist the uploaded timetable to the DB so it survives session restarts.
    # The reminder engine and timetable fetch will find it via _find_latest_timetable_notice.
    _persist_uploaded_timetable_notice(record.roll_number, my_classes, fname)

    result = {
        "noticeTitle": f"Uploaded: {fname}",
        "noticeDate": None,
        "noticeId": None,
        "schedule": by_day,
        "totalClasses": len(my_classes),
        "subjects": list(set(s.get("abbr", s.get("course", "")) for s in student_subjects)) if student_subjects else [],
        "uploaded": True,
    }

    logger.info("Timetable upload: parsed %d classes from %s for %s", len(my_classes), fname, record.roll_number)
    return ApiResponse(status="success", message="Timetable parsed successfully", data=result)


class TimetableSectionOverrideRequest(BaseModel):
    token: str = Field(..., description="Session token")
    section: str = Field(..., description="Section chosen by the student")
    year: str | None = Field(default=None, description="Year hint e.g. II, III")
    dept: str | None = Field(default=None, description="Department e.g. CSE, AI&ML")


# GET /notices/timetable/upload/combos?token=... — re-fetch combos for Wrong? flow
@router.get("/timetable/upload/combos", response_model=ApiResponse)
async def get_upload_combos(token: str = Query(..., description="Session token")):
    """Return the section/year/dept combos from the last uploaded timetable (for Wrong? re-pick)."""
    import re as _re
    from services.timetable_service import _normalize_pdf_section

    record = session_store.get(token)
    if record is None:
        return JSONResponse(status_code=401, content={"status": "error", "message": "Session expired"})

    schedule = getattr(record, 'pending_timetable_schedule', None)
    if not schedule:
        return ApiResponse(status="success", message="No pending schedule", data={"availableCombos": []})

    seen = set()
    combos = []
    for cls in schedule:
        sec_norm = _normalize_pdf_section(cls.get('section', ''))
        yr   = cls.get('pdf_year', '')
        dept = cls.get('pdf_dept', '')
        room = cls.get('room', '')
        raw_sec = cls.get('section', '')
        if not room:
            rm = _re.search(r'\(([A-Z][A-Z0-9\-]+)\)', raw_sec)
            if rm:
                room = rm.group(1)
        key = (sec_norm, yr, dept)
        if key not in seen and sec_norm:
            seen.add(key)
            combos.append({"section": sec_norm, "year": yr, "dept": dept, "room": room})

    combos.sort(key=lambda x: (x['year'], x['section']))
    return ApiResponse(
        status="success", message="Combos fetched",
        data={"availableCombos": combos, "availableSections": sorted(set(c['section'] for c in combos))}
    )


# POST /notices/timetable/upload/set-section
@router.post("/timetable/upload/set-section", response_model=ApiResponse)
async def upload_timetable_set_section(payload: TimetableSectionOverrideRequest):
    """
    Called after the upload endpoint returns needsSection=true.
    Uses the cached parsed schedule from the session, filtered by the student's chosen section.
    """
    from services.timetable_service import _btech_section_matches, _semester_to_year, _dept_matches

    record = session_store.get(payload.token)
    if record is None:
        return JSONResponse(status_code=401, content={"status": "error", "message": "Session expired"})

    schedule = getattr(record, 'pending_timetable_schedule', None)
    fname = getattr(record, 'pending_timetable_filename', 'timetable')

    if not schedule:
        return JSONResponse(
            status_code=422,
            content={"status": "error", "message": "No pending timetable found. Please upload your file again."},
        )

    chosen_section = payload.section.strip().upper()
    chosen_dept = (payload.dept or "").strip()
    # Use year from payload if provided, else derive from session's semester label
    student_year = payload.year or ""
    if not student_year:
        sem_label = getattr(record, 'selected_semester_label', None) or ""
        if sem_label:
            from services.timetable_service import _semester_to_year
            student_year = _semester_to_year(sem_label)

    # Filter schedule to the chosen section + year + dept
    my_classes = [
        cls for cls in schedule
        if _btech_section_matches(
            cls.get('section', ''),
            chosen_section,
            pdf_year=cls.get('pdf_year', ''),
            student_year=student_year,
        )
        and (not chosen_dept or _dept_matches(cls.get('pdf_dept', ''), chosen_dept))
    ]

    # If nothing matched with dept filter, try without dept (be lenient)
    if not my_classes:
        my_classes = [
            cls for cls in schedule
            if _btech_section_matches(
                cls.get('section', ''), chosen_section,
                pdf_year=cls.get('pdf_year', ''), student_year=student_year,
            )
        ]

    # If still nothing, try without year constraint
    if not my_classes:
        my_classes = [
            cls for cls in schedule
            if _btech_section_matches(cls.get('section', ''), chosen_section)
        ]

    if not my_classes:
        # Try direct section string match as last resort
        my_classes = [
            cls for cls in schedule
            if cls.get('section', '').upper() == chosen_section
        ]

    if not my_classes:
        available = sorted(set(cls.get('section', '') for cls in schedule if cls.get('section')))
        return JSONResponse(
            status_code=422,
            content={
                "status": "error",
                "message": f"Section '{payload.section}' not found in this timetable. Available: {', '.join(available)}",
            },
        )

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
        return JSONResponse(
            status_code=422,
            content={"status": "error", "message": "No classes found for this section."},
        )

    # Clear the pending schedule from session
    record.pending_timetable_schedule = None
    record.pending_timetable_filename = None

    # Persist the uploaded timetable to the DB so it survives session restarts.
    _persist_uploaded_timetable_notice(record.roll_number, my_classes, fname)

    result = {
        "noticeTitle": f"Uploaded: {fname}",
        "noticeDate": None,
        "noticeId": None,
        "schedule": by_day,
        "totalClasses": len(my_classes),
        "subjects": [],
        "uploaded": True,
        "section": chosen_section,
    }

    logger.info("Timetable section override: %d classes for section=%s from %s for %s",
                len(my_classes), chosen_section, fname, record.roll_number)
    return ApiResponse(status="success", message="Timetable loaded", data=result)


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
