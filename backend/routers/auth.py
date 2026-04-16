import logging

from fastapi import APIRouter
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse

from models.schemas import ApiResponse, AttendanceHistoryRequest, AttendanceRequest, FeatureUsageEventRequest, LoginRequest, SessionStatusRequest
from scrapers.portal_scraper import PortalAuthenticationError, PortalNetworkError
from services.auth_service import (
    fetch_attendance_for_semester,
    fetch_consolidated_marks,
    fetch_faculty_contacts,
    fetch_subject_history,
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
    }
    return JSONResponse(
        status_code=401,
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
async def login(payload: LoginRequest):
    try:
        data = await run_in_threadpool(
            login_user,
            payload.roll_number,
            payload.password,
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
        logger.exception("Guest login portal/network error for roll_number=%s", payload.roll_number)
        return _login_error_response("LOGIN_FAILED")
    except Exception:
        logger.exception("Unexpected guest login error for roll_number=%s", payload.roll_number)
        return _login_error_response("LOGIN_FAILED")


@router.post("/attendance", response_model=ApiResponse)
async def attendance(payload: AttendanceRequest):
    try:
        data = await run_in_threadpool(
            fetch_attendance_for_semester,
            payload.token,
            payload.semester_id,
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
