from fastapi import APIRouter
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse

from models.schemas import ApiResponse, LoginRequest
from scrapers.portal_scraper import PortalAuthenticationError, PortalNetworkError
from services.auth_service import login_user

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
    except PortalAuthenticationError:
        return JSONResponse(
            status_code=401,
            content={"status": "error", "message": "Invalid credentials"},
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
