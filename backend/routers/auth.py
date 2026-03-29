from fastapi import APIRouter
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse

from models.schemas import ApiResponse, AttendanceHistoryRequest, AttendanceRequest, LoginRequest
from scrapers.portal_scraper import PortalAuthenticationError, PortalNetworkError
from services.auth_service import fetch_attendance_for_semester, fetch_subject_history, login_user

router = APIRouter(tags=["auth"])


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
        return JSONResponse(
            status_code=401,
            content={"status": "error", "message": str(exc) or "Invalid credentials"},
        )
    except PortalNetworkError as exc:
        return JSONResponse(
            status_code=502,
            content={"status": "error", "message": str(exc)},
        )
    except Exception:
        return JSONResponse(
            status_code=500,
            content={"status": "error", "message": "Server/network error"},
        )


@router.post("/attendance", response_model=ApiResponse)
async def attendance(payload: AttendanceRequest):
    try:
        data = await run_in_threadpool(
            fetch_attendance_for_semester,
            payload.token,
            payload.semester_id,
        )
        return ApiResponse(status="success", message="Attendance fetched", data=data)
    except PortalAuthenticationError as exc:
        return JSONResponse(
            status_code=401,
            content={"status": "error", "message": str(exc) or "Unauthorized"},
        )
    except PortalNetworkError as exc:
        return JSONResponse(
            status_code=502,
            content={"status": "error", "message": str(exc)},
        )
    except Exception:
        return JSONResponse(
            status_code=500,
            content={"status": "error", "message": "Server/network error"},
        )


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
        return JSONResponse(
            status_code=401,
            content={"status": "error", "message": str(exc) or "Unauthorized"},
        )
    except PortalNetworkError as exc:
        return JSONResponse(
            status_code=502,
            content={"status": "error", "message": str(exc)},
        )
    except Exception:
        return JSONResponse(
            status_code=500,
            content={"status": "error", "message": "Server/network error"},
        )
