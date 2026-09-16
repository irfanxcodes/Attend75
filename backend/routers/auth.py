import logging

from fastapi import APIRouter, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse

from models.schemas import ApiResponse, AttendanceHistoryRequest, AttendanceRequest, FeatureUsageEventRequest, LoginRequest, RatingRequest, SessionStatusRequest
from scrapers.portal_scraper import PortalAuthenticationError, PortalNetworkError
from services.auth_service import (
    calculate_attendance_streak,
    fetch_attendance_for_semester,
    fetch_consolidated_marks,
    fetch_faculty_contacts,
    fetch_subject_history,
    get_mails_sent,
    get_session_status,
    login_user,
    track_feature_usage_event,
)

router = APIRouter(tags=["auth"])
logger = logging.getLogger(__name__)


def _login_error_response(error_code: str) -> JSONResponse:
    message_map = {
        "INVALID_USERNAME": "Invalid username or roll number. Please check and try again.",
        "INCORRECT_PASSWORD": "Incorrect password. Please try again.",
        "LOGIN_FAILED": "Login failed. Please verify your credentials and try again.",
        "PORTAL_UNREACHABLE": "The college portal is currently down or not responding. Please try again later.",
        "PORTAL_TIMEOUT": "The college portal is taking too long to respond. Please try again in a few minutes.",
    }
    status_code = 502 if error_code in ("PORTAL_UNREACHABLE", "PORTAL_TIMEOUT") else 401
    return JSONResponse(
        status_code=status_code,
        content={
            "status": "error",
            "error_code": error_code,
            "message": message_map.get(error_code, "Login failed. Please verify your credentials and try again."),
        },
    )


def _data_error_response(error_code: str, status_code: int = 502) -> JSONResponse:
    message_map = {
        "SESSION_EXPIRED": "Your session has expired. Please log in again.",
        "DATA_FETCH_FAILED": "Unable to load your data. Please try again later.",
        "PORTAL_UNREACHABLE": "The college portal is currently down or not responding. Please try again later.",
        "PORTAL_TIMEOUT": "The college portal is taking too long to respond. Please try again in a few minutes.",
        "MARKS_TABLE_NOT_FOUND": "Marks are not available right now for this semester.",
        "MARKS_ROWS_NOT_FOUND": "Marks are not available right now for this semester.",
        "MARKS_EMPTY_RESPONSE": "Portal returned an empty marks response. Please try again.",
        "MARKS_PAGE_PATHS_NOT_FOUND": "Marks page is currently unavailable on portal. Please try again later.",
        "MARKS_HTML_STRUCTURE_CHANGED": "Portal marks format changed. Please try again later.",
        "MARKS_PARSER_FAILURE": "Unable to parse marks data from portal right now.",
        "FACULTY_FETCH_TIMEOUT": "Faculty details are taking too long to load. Please try again.",
        "FACULTY_TABLE_NOT_FOUND": "Faculty details are not available right now.",
        "FEATURE_USAGE_TRACK_FAILED": "Unable to track feature usage right now.",
        "SEMESTER_SWITCH_MISMATCH": "Unable to switch semester on portal. Please retry.",
    }
    return JSONResponse(
        status_code=status_code,
        content={
            "status": "error",
            "error_code": error_code,
            "message": message_map.get(error_code, "Unable to load your data. Please try again later."),
        },
    )


@router.post("/login", response_model=ApiResponse)
async def login(payload: LoginRequest, request: Request):
    try:
        ua = request.headers.get("user-agent", "")
        data = await run_in_threadpool(
            login_user,
            payload.roll_number,
            payload.password,
            ua,
        )
        return ApiResponse(status="success", message="Login successful", data=data)
    except PortalAuthenticationError as exc:
        error_code = getattr(exc, "code", "LOGIN_FAILED")
        logger.warning(
            "Guest login failed [code=%s, roll_number=%s, detail=%s]",
            error_code,
            payload.roll_number,
            str(exc),
        )
        return _login_error_response(error_code)
    except PortalNetworkError as exc:
        error_code = getattr(exc, "code", "DATA_FETCH_FAILED")
        is_timeout = "TIMEOUT" in str(error_code).upper() or "timeout" in str(exc).lower()
        logger.exception("Guest login portal/network error for roll_number=%s [code=%s]", payload.roll_number, error_code)
        return _login_error_response("PORTAL_TIMEOUT" if is_timeout else "PORTAL_UNREACHABLE")
    except Exception as exc:
        # Log full traceback for debugging unexpected errors
        logger.exception("Unexpected guest login error for roll_number=%s: %s", payload.roll_number, str(exc))
        return _login_error_response("PORTAL_UNREACHABLE")


@router.post("/attendance", response_model=ApiResponse)
async def attendance(payload: AttendanceRequest):
    try:
        data = await run_in_threadpool(
            fetch_attendance_for_semester,
            payload.token,
            payload.semester_id,
            payload.program_id,
            payload.force_refresh,
        )
        return ApiResponse(status="success", message="Attendance fetched", data=data)
    except PortalAuthenticationError as exc:
        error_code = getattr(exc, "code", "SESSION_EXPIRED")
        logger.warning("Attendance auth failure [code=%s, detail=%s]", error_code, str(exc))
        if str(error_code).strip().upper().startswith("SESSION_EXPIRED"):
            return _data_error_response(error_code, status_code=401)
        return _data_error_response(error_code, status_code=502)
    except PortalNetworkError as exc:
        error_code = getattr(exc, "code", "DATA_FETCH_FAILED")
        logger.exception("Attendance portal/network failure [code=%s]", error_code)
        status_code = int(getattr(exc, "http_status", 502) or 502)
        if status_code < 400:
            status_code = 502
        return _data_error_response(error_code, status_code=status_code)
    except Exception:
        logger.exception("Unexpected attendance fetch error")
        return _data_error_response("DATA_FETCH_FAILED", status_code=500)


@router.post("/attendance/history", response_model=ApiResponse)
async def attendance_history(payload: AttendanceHistoryRequest):
    try:
        data = await run_in_threadpool(
            fetch_subject_history,
            payload.token,
            payload.semester_id,
            payload.date,
        )
        return ApiResponse(status="success", message="Attendance history fetched", data=data)
    except PortalAuthenticationError as exc:
        error_code = getattr(exc, "code", "SESSION_EXPIRED")
        logger.warning("Attendance history auth failure [code=%s, detail=%s]", error_code, str(exc))
        if str(error_code).strip().upper().startswith("SESSION_EXPIRED"):
            return _data_error_response(error_code, status_code=401)
        return _data_error_response(error_code, status_code=502)
    except PortalNetworkError as exc:
        error_code = getattr(exc, "code", "DATA_FETCH_FAILED")
        logger.exception("Attendance history portal/network failure [code=%s]", error_code)
        status_code = int(getattr(exc, "http_status", 502) or 502)
        if status_code < 400:
            status_code = 502
        return _data_error_response(error_code, status_code=status_code)
    except Exception:
        logger.exception("Unexpected attendance history fetch error")
        return _data_error_response("DATA_FETCH_FAILED", status_code=500)


@router.post("/session/status", response_model=ApiResponse)
async def session_status(payload: SessionStatusRequest):
    try:
        data = await run_in_threadpool(
            get_session_status,
            payload.token,
        )
        return ApiResponse(status="success", message="Session status fetched", data=data)
    except Exception:
        logger.exception("Unexpected session status error")
        return JSONResponse(
            status_code=500,
            content={"status": "error", "error_code": "UNKNOWN_ERROR", "message": "Unable to load your data. Please try again later."},
        )


@router.post("/marks/consolidated", response_model=ApiResponse)
async def marks_consolidated(payload: AttendanceRequest):
    try:
        data = await run_in_threadpool(
            fetch_consolidated_marks,
            payload.token,
            payload.semester_id,
            payload.force_refresh,
        )
        return ApiResponse(status="success", message="Consolidated marks fetched", data=data)
    except PortalAuthenticationError as exc:
        error_code = getattr(exc, "code", "SESSION_EXPIRED")
        logger.warning("Consolidated marks auth failure [code=%s, detail=%s]", error_code, str(exc))
        if str(error_code).strip().upper().startswith("SESSION_EXPIRED"):
            return _data_error_response(error_code, status_code=401)
        return _data_error_response(error_code, status_code=502)
    except PortalNetworkError as exc:
        error_code = getattr(exc, "code", "DATA_FETCH_FAILED")
        logger.exception("Consolidated marks portal/network failure [code=%s, detail=%s]", error_code, str(exc))
        transient_codes = {
            "MARKS_TABLE_NOT_FOUND",
            "MARKS_ROWS_NOT_FOUND",
            "MARKS_PAGE_PATHS_NOT_FOUND",
        }
        if str(error_code).strip().upper() in transient_codes:
            return ApiResponse(
                status="success",
                message="Consolidated marks temporarily unavailable; returning controlled empty result",
                data={
                    "subjects": [],
                    "semesters": [],
                    "selected_semester": payload.semester_id,
                    "portal_error": {
                        "code": str(error_code).strip().upper(),
                        "message": str(exc),
                        "transient": True,
                    },
                },
            )
        status_code = int(getattr(exc, "http_status", 502) or 502)
        if status_code < 400:
            status_code = 502
        return _data_error_response(error_code, status_code=status_code)
    except Exception:
        logger.exception("Unexpected consolidated marks fetch error")
        return _data_error_response("DATA_FETCH_FAILED", status_code=500)


@router.post("/faculty/contacts", response_model=ApiResponse)
async def faculty_contacts(payload: AttendanceRequest):
    try:
        data = await run_in_threadpool(
            fetch_faculty_contacts,
            payload.token,
            payload.semester_id,
            payload.force_refresh,
        )
        return ApiResponse(status="success", message="Faculty contacts fetched", data=data)
    except PortalAuthenticationError as exc:
        error_code = getattr(exc, "code", "SESSION_EXPIRED")
        logger.warning("Faculty contacts auth failure [code=%s, detail=%s]", error_code, str(exc))
        if str(error_code).strip().upper().startswith("SESSION_EXPIRED"):
            return _data_error_response(error_code, status_code=401)
        return _data_error_response(error_code, status_code=502)
    except PortalNetworkError as exc:
        error_code = getattr(exc, "code", "DATA_FETCH_FAILED")
        logger.exception("Faculty contacts portal/network failure [code=%s]", error_code)
        status_code = int(getattr(exc, "http_status", 502) or 502)
        if status_code < 400:
            status_code = 502
        return _data_error_response(error_code, status_code=status_code)
    except Exception:
        logger.exception("Unexpected faculty contacts fetch error")
        return _data_error_response("DATA_FETCH_FAILED", status_code=500)


@router.post("/feature-usage/track", response_model=ApiResponse)
async def feature_usage_track(payload: FeatureUsageEventRequest):
    try:
        data = await run_in_threadpool(
            track_feature_usage_event,
            payload.token,
            payload.feature_name,
            payload.action_type,
            payload.subject_code,
            payload.subject_name,
            payload.attendance_date,
        )
        return ApiResponse(status="success", message="Feature usage tracked", data=data)
    except PortalAuthenticationError as exc:
        error_code = getattr(exc, "code", "SESSION_EXPIRED")
        logger.warning("Feature usage track auth failure [code=%s, detail=%s]", error_code, str(exc))
        if str(error_code).strip().upper().startswith("SESSION_EXPIRED"):
            return _data_error_response(error_code, status_code=401)
        return _data_error_response(error_code, status_code=502)
    except Exception:
        logger.exception("Unexpected feature usage track error")
        return _data_error_response("FEATURE_USAGE_TRACK_FAILED", status_code=500)


@router.post("/feature-usage/mails-sent", response_model=ApiResponse)
async def feature_usage_mails_sent(payload: SessionStatusRequest):
    try:
        data = await run_in_threadpool(
            get_mails_sent,
            payload.token,
        )
        return ApiResponse(status="success", message="Mails sent count fetched", data=data)
    except PortalAuthenticationError as exc:
        error_code = getattr(exc, "code", "SESSION_EXPIRED")
        logger.warning("Mails sent count auth failure [code=%s, detail=%s]", error_code, str(exc))
        if str(error_code).strip().upper().startswith("SESSION_EXPIRED"):
            return _data_error_response(error_code, status_code=401)
        return _data_error_response(error_code, status_code=502)
    except Exception:
        logger.exception("Unexpected mails sent count error")
        return _data_error_response("DATA_FETCH_FAILED", status_code=500)


@router.post("/rating/submit", response_model=ApiResponse)
async def submit_rating_endpoint(payload: RatingRequest):
    from services.rating_service import submit_rating
    from services.session_store import session_store

    try:
        record = session_store.get(payload.token)
        if record is None:
            return _data_error_response("SESSION_EXPIRED", status_code=401)

        data = await run_in_threadpool(submit_rating, record.roll_number, payload.rating)
        return ApiResponse(status="success", message="Rating submitted", data=data)
    except ValueError as exc:
        return JSONResponse(status_code=422, content={"status": "error", "message": str(exc)})
    except Exception:
        logger.exception("Unexpected rating submit error")
        return JSONResponse(status_code=500, content={"status": "error", "message": "Unable to submit rating"})


@router.post("/rating/get", response_model=ApiResponse)
async def get_rating_endpoint(payload: SessionStatusRequest):
    from services.rating_service import get_user_rating
    from services.session_store import session_store

    try:
        record = session_store.get(payload.token)
        if record is None:
            return _data_error_response("SESSION_EXPIRED", status_code=401)

        rating = await run_in_threadpool(get_user_rating, record.roll_number)
        return ApiResponse(status="success", message="Rating fetched", data={"rating": rating})
    except Exception:
        logger.exception("Unexpected rating fetch error")
        return JSONResponse(status_code=500, content={"status": "error", "message": "Unable to fetch rating"})


@router.post("/attendance/streak", response_model=ApiResponse)
async def attendance_streak(payload: AttendanceRequest):
    try:
        data = await run_in_threadpool(
            calculate_attendance_streak,
            payload.token,
            payload.semester_id,
        )
        return ApiResponse(status="success", message="Streak calculated", data=data)
    except PortalAuthenticationError as exc:
        error_code = getattr(exc, "code", "SESSION_EXPIRED")
        logger.warning("Streak calculation auth failure [code=%s]", error_code)
        if str(error_code).strip().upper().startswith("SESSION_EXPIRED"):
            return _data_error_response(error_code, status_code=401)
        return _data_error_response(error_code, status_code=502)
    except PortalNetworkError as exc:
        error_code = getattr(exc, "code", "DATA_FETCH_FAILED")
        logger.exception("Streak calculation network failure [code=%s]", error_code)
        status_code = int(getattr(exc, "http_status", 502) or 502)
        if status_code < 400:
            status_code = 502
        return _data_error_response(error_code, status_code=status_code)
    except Exception:
        logger.exception("Unexpected streak calculation error")
        return _data_error_response("DATA_FETCH_FAILED", status_code=500)


@router.get("/photo/{roll_number}")
async def proxy_student_photo(roll_number: str):
    """Proxy student photo from the college portal to avoid mixed-content blocking."""
    import os
    import requests as http_requests
    from fastapi.responses import Response

    normalized_roll = (roll_number or "").strip().upper()
    if not normalized_roll or len(normalized_roll) > 32:
        return JSONResponse(status_code=400, content={"status": "error", "message": "Invalid roll number"})

    portal_photo_base = os.getenv("PORTAL_PHOTO_BASE_URL", "http://111.93.16.209/photos")
    photo_url = f"{portal_photo_base}/{normalized_roll}.jpg"

    try:
        resp = http_requests.get(photo_url, timeout=10)
        if resp.status_code != 200:
            return JSONResponse(status_code=404, content={"status": "error", "message": "Photo not found"})

        content_type = resp.headers.get("Content-Type", "image/jpeg")
        return Response(
            content=resp.content,
            media_type=content_type,
            headers={"Cache-Control": "public, max-age=86400"},
        )
    except Exception:
        return JSONResponse(status_code=502, content={"status": "error", "message": "Unable to fetch photo"})
