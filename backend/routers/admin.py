import logging
from datetime import date

from fastapi import APIRouter, Depends, Query
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse

from models.schemas import AdminFeedbackStatusUpdateRequest, AdminPasswordLoginRequest, ApiResponse
from services.admin_service import (
	get_admin_overview,
	get_feedback_log,
	set_feedback_status,
	login_admin_with_password,
	logout_admin_session,
	require_admin_user,
)

router = APIRouter(prefix="/admin", tags=["admin"])
logger = logging.getLogger(__name__)


@router.post("/auth/login", response_model=ApiResponse)
async def admin_login(payload: AdminPasswordLoginRequest):
	try:
		admin_session = await run_in_threadpool(login_admin_with_password, payload.username, payload.password)
		return ApiResponse(
			status="success",
			message="Admin authentication successful",
			data={
				"session_token": admin_session["session_token"],
				"username": admin_session["username"],
				"session_ttl_seconds": admin_session["session_ttl_seconds"],
			},
		)
	except Exception as exc:
		status_code = getattr(exc, "status_code", 500)
		detail = getattr(exc, "detail", "Unable to authenticate admin")
		logger.warning("Admin login denied: %s", detail)
		return JSONResponse(
			status_code=status_code,
			content={"status": "error", "message": str(detail)},
		)


@router.post("/auth/logout", response_model=ApiResponse)
async def admin_logout(admin_user: dict = Depends(require_admin_user)):
	try:
		await run_in_threadpool(logout_admin_session, admin_user["session_token"])
		return ApiResponse(status="success", message="Admin session closed", data={})
	except Exception:
		logger.exception("Failed to logout admin session")
		return JSONResponse(
			status_code=500,
			content={"status": "error", "message": "Unable to logout admin session"},
		)


@router.get("/overview", response_model=ApiResponse)
async def admin_overview(_: dict = Depends(require_admin_user)):
	try:
		data = await run_in_threadpool(get_admin_overview)
		return ApiResponse(status="success", message="Admin overview fetched", data=data)
	except Exception:
		logger.exception("Failed to fetch admin overview")
		return JSONResponse(
			status_code=500,
			content={"status": "error", "message": "Unable to fetch admin overview"},
		)


@router.get("/feedback", response_model=ApiResponse)
async def admin_feedback(
	_: dict = Depends(require_admin_user),
	limit: int = Query(default=50, ge=1, le=200),
	query: str | None = Query(default=None, max_length=200),
	start_date: date | None = Query(default=None),
	end_date: date | None = Query(default=None),
	status: str | None = Query(default=None),
	sort: str = Query(default="latest"),
):
	try:
		items = await run_in_threadpool(get_feedback_log, limit, query, start_date, end_date, status, sort)
		return ApiResponse(status="success", message="Admin feedback log fetched", data={"items": items})
	except Exception:
		logger.exception("Failed to fetch admin feedback log")
		return JSONResponse(
			status_code=500,
			content={"status": "error", "message": "Unable to fetch feedback log"},
		)


@router.patch("/feedback/{feedback_id}/status", response_model=ApiResponse)
async def admin_feedback_status_update(
	feedback_id: str,
	payload: AdminFeedbackStatusUpdateRequest,
	_: dict = Depends(require_admin_user),
):
	try:
		updated = await run_in_threadpool(set_feedback_status, feedback_id, payload.status)
		if not updated:
			return JSONResponse(
				status_code=404,
				content={"status": "error", "message": "Feedback entry not found"},
			)
		return ApiResponse(status="success", message="Feedback status updated", data={"item": updated})
	except ValueError as exc:
		return JSONResponse(
			status_code=422,
			content={"status": "error", "message": str(exc)},
		)
	except Exception:
		logger.exception("Failed to update feedback status")
		return JSONResponse(
			status_code=500,
			content={"status": "error", "message": "Unable to update feedback status"},
		)

