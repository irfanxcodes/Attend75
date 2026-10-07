"""
Parse endpoint — accepts raw portal HTML from the browser-side scraper
and returns structured attendance data + a session token.

POST /parse/login
  Body: { roll_number, student_name, program_sn, program_full,
          attendance_html, courses_html, semesters, selected_semester }
  Returns: same shape as /login
"""
import logging

from fastapi import APIRouter
from fastapi.concurrency import run_in_threadpool

from models.schemas import ApiResponse
from scrapers.portal_scraper import PortalScraper

router = APIRouter(prefix="/parse", tags=["parse"])
logger = logging.getLogger(__name__)


@router.post("/login", response_model=ApiResponse)
async def parse_login(payload: dict):
    """
    Browser scraped the portal HTML — we parse it and return a session.
    This is the browser-side scraping endpoint.
    """
    roll_number = (payload.get("roll_number") or "").strip().upper()
    student_name = (payload.get("student_name") or "").strip() or roll_number
    program_sn = (payload.get("program_sn") or "").strip() or None
    program_full = (payload.get("program_full") or "").strip() or None
    attendance_html = (payload.get("attendance_html") or "").strip()
    courses_html = (payload.get("courses_html") or "").strip()
    semesters = payload.get("semesters") or []
    selected_semester = (payload.get("selected_semester") or "").strip() or None
    photo_url = (payload.get("student_photo_url") or "").strip() or None

    if not roll_number:
        return ApiResponse(status="error", error_code="INVALID_REQUEST", message="roll_number is required")

    if not attendance_html:
        return ApiResponse(status="error", error_code="INVALID_REQUEST", message="attendance_html is required")

    try:
        result = await run_in_threadpool(
            _parse_and_create_session,
            roll_number, student_name, program_sn, program_full,
            attendance_html, courses_html, semesters, selected_semester, photo_url,
        )
        return ApiResponse(status="success", message="Login successful", data=result)
    except Exception as exc:
        logger.exception("[parse/login] Failed for roll=%s", roll_number)
        return ApiResponse(status="error", error_code="PARSE_FAILED", message=str(exc))


def _parse_and_create_session(
    roll_number: str,
    student_name: str,
    program_sn: str | None,
    program_full: str | None,
    attendance_html: str,
    courses_html: str,
    semesters: list,
    selected_semester: str | None,
    photo_url: str | None,
) -> dict:
    import time
    from services.session_store import session_store
    from services.student_registry_service import register_student_login

    scraper = PortalScraper()  # no active portal session — parse only

    # Parse attendance from the HTML the browser sent us
    parsed = scraper._parse_attendance(attendance_html)
    attendance_items = parsed.get("attendance") or []

    # Parse semesters from the attendance HTML if not provided
    if not semesters:
        extracted_sems, extracted_selected = scraper._extract_semesters(attendance_html)
        semesters = extracted_sems
        if not selected_semester:
            selected_semester = extracted_selected

    # Enrich with short abbreviations from courses HTML
    if courses_html:
        abbr_map = scraper._parse_courses_name_map(courses_html)
        sessions_map = scraper._parse_courses_map(courses_html)
        if abbr_map:
            for item in attendance_items:
                code = scraper._normalize_code(str(item.get("code", "")))
                abbr = abbr_map.get(code, "")
                if abbr:
                    item["course_abbr"] = abbr
        # Merge total sessions
        if sessions_map:
            attendance_items = scraper._merge_attendance_with_total_sessions(attendance_items, sessions_map)

    feasibility = {"overall": scraper._build_overall_feasibility(attendance_items)}

    # Calculate overall attendance %
    total_attended = sum(int(r.get("attended") or 0) for r in attendance_items)
    total_sessions = sum(int(r.get("sessions") or 0) for r in attendance_items)
    overall_percent = round((total_attended / total_sessions) * 100, 1) if total_sessions > 0 else None

    # Create session
    record = session_store.create(
        roll_number=roll_number,
        scraper=scraper,
        user_name=student_name,
        photo_url=photo_url,
        attendance_percent=overall_percent,
        user_agent=None,
        program_sn=program_sn,
        program_full=program_full,
        selected_semester_label=next(
            (s["label"] for s in semesters if str(s.get("id")) == str(selected_semester)), None
        ),
    )

    # Cache attendance rows for timetable
    if attendance_items:
        record.cached_attendance_rows = list(attendance_items)

    # Register student
    register_student_login(
        roll_number, "guest",
        display_name=student_name,
        attendance_percent=overall_percent,
        user_agent=None,
        program=program_full,
        current_semester=next(
            (s["label"] for s in semesters if str(s.get("id")) == str(selected_semester)), None
        ),
    )

    return {
        "token": record.token,
        "roll_number": roll_number,
        "student_name": student_name,
        "student_photo_url": photo_url,
        "attendance": attendance_items,
        "semesters": semesters,
        "selected_semester": selected_semester,
        "programs": [],
        "selected_program": None,
        "program_sn": program_sn,
        "program_full": program_full,
        "feasibility": feasibility,
    }
