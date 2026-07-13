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
from services.admin_analytics_service import get_full_admin_analytics

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


@router.get("/analytics", response_model=ApiResponse)
async def admin_analytics(_: dict = Depends(require_admin_user)):
	"""Expanded analytics: ratings, engagement, retention, feature adoption, subject requests, college interests."""
	try:
		data = await run_in_threadpool(get_full_admin_analytics)
		return ApiResponse(status="success", message="Admin analytics fetched", data=data)
	except Exception:
		logger.exception("Failed to fetch admin analytics")
		return JSONResponse(
			status_code=500,
			content={"status": "error", "message": "Unable to fetch analytics"},
		)


@router.delete("/users/{user_id}", response_model=ApiResponse)
async def admin_delete_user(user_id: int, _: dict = Depends(require_admin_user)):
	"""Delete a registered user and their associated portal credentials + notification data."""
	try:
		from db.models.user import User
		from db.models.portal_credential import PortalCredential
		from db.session import SessionLocal
		from services.account_deletion_service import delete_notification_data_for_student

		with SessionLocal() as session:
			user = session.query(User).filter(User.id == user_id).first()
			if not user:
				return JSONResponse(
					status_code=404,
					content={"status": "error", "message": "User not found"},
				)

			# Get roll_number before deleting user (for notification data cascade)
			credential = session.query(PortalCredential).filter(PortalCredential.user_id == user.id).first()
			roll_number = credential.roll_number if credential else None

			session.delete(user)
			session.commit()

		# Cascade delete notification data if we have a roll_number
		if roll_number:
			delete_notification_data_for_student(roll_number)

		return ApiResponse(status="success", message="User deleted", data={"deleted_id": user_id})
	except Exception:
		logger.exception("Failed to delete user %s", user_id)
		return JSONResponse(
			status_code=500,
			content={"status": "error", "message": "Unable to delete user"},
		)


@router.post("/broadcast", response_model=ApiResponse)
async def admin_broadcast(
	payload: dict,
	_: dict = Depends(require_admin_user),
):
	"""Send a broadcast push notification to premium students."""
	from services.broadcast_service import send_broadcast

	title = (payload.get("title") or "").strip()
	body = (payload.get("body") or "").strip()
	if not title or not body:
		return JSONResponse(status_code=422, content={"status": "error", "message": "title and body are required"})

	audience = payload.get("audience", "all")
	program = payload.get("program")
	priority = payload.get("priority", "standard")
	deep_link = payload.get("deep_link")

	try:
		result = await run_in_threadpool(send_broadcast, title, body, audience, program, priority, deep_link)
		return ApiResponse(status="success", message="Broadcast queued", data=result)
	except Exception:
		logger.exception("Failed to send broadcast")
		return JSONResponse(status_code=500, content={"status": "error", "message": "Unable to send broadcast"})


@router.get("/broadcast/stats", response_model=ApiResponse)
async def admin_broadcast_stats(
	title: str = Query(..., description="Broadcast title to look up stats for"),
	_: dict = Depends(require_admin_user),
):
	"""Get delivery stats for a broadcast by title."""
	from services.broadcast_service import get_broadcast_stats

	try:
		stats = await run_in_threadpool(get_broadcast_stats, title)
		return ApiResponse(status="success", message="Broadcast stats fetched", data=stats)
	except Exception:
		logger.exception("Failed to fetch broadcast stats")
		return JSONResponse(status_code=500, content={"status": "error", "message": "Unable to fetch broadcast stats"})


@router.get("/fetcher/health", response_model=ApiResponse)
async def admin_fetcher_health(_: dict = Depends(require_admin_user)):
	"""Background fetcher health metrics."""
	from services.background_fetcher import get_fetcher_health

	try:
		data = await run_in_threadpool(get_fetcher_health)
		return ApiResponse(status="success", message="Fetcher health", data=data)
	except Exception:
		logger.exception("Failed to fetch background fetcher health")
		return JSONResponse(status_code=500, content={"status": "error", "message": "Unable to fetch health"})
