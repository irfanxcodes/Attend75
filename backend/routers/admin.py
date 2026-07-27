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
	target_roll = payload.get("target_roll")
	priority = payload.get("priority", "standard")
	deep_link = payload.get("deep_link")

	try:
		result = await run_in_threadpool(send_broadcast, title, body, audience, program, target_roll, priority, deep_link)
		return ApiResponse(status="success", message="Broadcast queued", data=result)
	except Exception:
		logger.exception("Failed to send broadcast")
		return JSONResponse(status_code=500, content={"status": "error", "message": "Unable to send broadcast"})


@router.post("/feedback/{feedback_id}/reply", response_model=ApiResponse)
async def admin_feedback_reply(
	feedback_id: str,
	payload: dict,
	_: dict = Depends(require_admin_user),
):
	"""Reply to a feedback entry via push notification to the student."""
	from services.feedback_reply_service import reply_to_feedback

	message = (payload.get("message") or "").strip()
	if not message:
		return JSONResponse(status_code=422, content={"status": "error", "message": "message is required"})

	try:
		result = await run_in_threadpool(reply_to_feedback, feedback_id, message)
		if result is None:
			return JSONResponse(status_code=404, content={"status": "error", "message": "Feedback entry not found"})
		return ApiResponse(status="success", message="Reply sent", data=result)
	except Exception:
		logger.exception("Failed to reply to feedback %s", feedback_id)
		return JSONResponse(status_code=500, content={"status": "error", "message": "Unable to send reply"})


@router.get("/premium/analytics", response_model=ApiResponse)
async def admin_premium_analytics(_: dict = Depends(require_admin_user)):
	"""Premium subscription analytics and notification queue health."""
	from services.premium_analytics_service import get_premium_analytics

	try:
		data = await run_in_threadpool(get_premium_analytics)
		return ApiResponse(status="success", message="Premium analytics fetched", data=data)
	except Exception:
		logger.exception("Failed to fetch premium analytics")
		return JSONResponse(status_code=500, content={"status": "error", "message": "Unable to fetch premium analytics"})


@router.post("/premium/{roll_number}/toggle", response_model=ApiResponse)
async def admin_toggle_premium(roll_number: str, payload: dict, _: dict = Depends(require_admin_user)):
	"""Enable or disable a student's premium subscription."""
	from services.premium_service import activate_premium, expire_subscription, get_subscription_status

	action = (payload.get("action") or "").strip()
	if action not in ("activate", "expire"):
		return JSONResponse(status_code=422, content={"status": "error", "message": "action must be 'activate' or 'expire'"})

	try:
		if action == "activate":
			await run_in_threadpool(activate_premium, roll_number)
		else:
			await run_in_threadpool(expire_subscription, roll_number)
		status = await run_in_threadpool(get_subscription_status, roll_number)
		return ApiResponse(status="success", message=f"Premium {action}d for {roll_number}", data=status)
	except Exception:
		logger.exception("Failed to toggle premium for %s", roll_number)
		return JSONResponse(status_code=500, content={"status": "error", "message": "Unable to toggle premium"})


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


@router.post("/notifications/trigger-timetable-reminders", response_model=ApiResponse)
async def admin_trigger_timetable_reminders(_: dict = Depends(require_admin_user)):
	"""Manually trigger today's timetable reminder scheduling (normally runs at 5:30 AM IST).
	Use this to test scheduled notifications without waiting for the timer."""
	from services.timetable_reminder_engine import schedule_reminders_for_today

	try:
		count = await run_in_threadpool(schedule_reminders_for_today)
		return ApiResponse(
			status="success",
			message=f"Timetable reminders scheduled",
			data={"jobs_enqueued": count},
		)
	except Exception:
		logger.exception("Failed to trigger timetable reminders")
		return JSONResponse(status_code=500, content={"status": "error", "message": "Unable to trigger timetable reminders"})


@router.post("/notifications/trigger-tomorrow-preview", response_model=ApiResponse)
async def admin_trigger_tomorrow_preview(_: dict = Depends(require_admin_user)):
	"""Manually trigger the 9 PM tomorrow preview notifications."""
	from services.timetable_reminder_engine import send_tomorrow_preview

	try:
		count = await run_in_threadpool(send_tomorrow_preview)
		return ApiResponse(
			status="success",
			message="Tomorrow preview notifications queued",
			data={"jobs_enqueued": count},
		)
	except Exception:
		logger.exception("Failed to trigger tomorrow preview")
		return JSONResponse(status_code=500, content={"status": "error", "message": "Unable to trigger tomorrow preview"})


@router.get("/notifications/queue-stats", response_model=ApiResponse)
async def admin_notification_queue_stats(_: dict = Depends(require_admin_user)):
	"""Get current notification job queue statistics and recent failed jobs."""
	from services.notification_queue import get_queue_stats
	from db.models.notification_job import NotificationJob
	from db.session import SessionLocal
	from datetime import datetime, timedelta

	try:
		stats = await run_in_threadpool(get_queue_stats)

		# Fetch recent failed jobs for diagnostics
		cutoff = datetime.utcnow() - timedelta(hours=24)
		with SessionLocal() as session:
			failed_jobs = (
				session.query(NotificationJob)
				.filter(
					NotificationJob.status == "failed",
					NotificationJob.created_at >= cutoff,
				)
				.order_by(NotificationJob.created_at.desc())
				.limit(20)
				.all()
			)
			recent_scheduled = (
				session.query(NotificationJob)
				.filter(
					NotificationJob.status == "pending",
					NotificationJob.job_type == "push_send",
				)
				.order_by(NotificationJob.scheduled_at)
				.limit(10)
				.all()
			)
			failed_details = [
				{
					"id": j.id,
					"job_type": j.job_type,
					"target_roll": j.target_roll,
					"last_error": j.last_error,
					"attempts": j.attempts,
					"created_at": j.created_at.isoformat() if j.created_at else None,
				}
				for j in failed_jobs
			]
			pending_details = [
				{
					"id": j.id,
					"target_roll": j.target_roll,
					"scheduled_at": j.scheduled_at.isoformat() if j.scheduled_at else None,
					"created_at": j.created_at.isoformat() if j.created_at else None,
				}
				for j in recent_scheduled
			]

		return ApiResponse(
			status="success",
			message="Notification queue stats",
			data={
				"queue": stats,
				"recent_failed_24h": failed_details,
				"upcoming_pending": pending_details,
			},
		)
	except Exception:
		logger.exception("Failed to fetch notification queue stats")
		return JSONResponse(status_code=500, content={"status": "error", "message": "Unable to fetch queue stats"})


@router.get("/notifications/timetable-status", response_model=ApiResponse)
async def admin_timetable_notification_status(_: dict = Depends(require_admin_user)):
	"""Check how many students are eligible for timetable notifications and their readiness."""
	from db.models.push_subscription import PushSubscription
	from db.session import SessionLocal

	try:
		with SessionLocal() as session:
			total_subscriptions = session.query(PushSubscription).count()
			has_timetable_count = (
				session.query(PushSubscription)
				.filter(PushSubscription.has_timetable.is_(True))
				.count()
			)
			has_subjects_count = (
				session.query(PushSubscription)
				.filter(
					PushSubscription.has_timetable.is_(True),
					PushSubscription.cached_subjects_json.isnot(None),
				)
				.count()
			)
			# Distinct students
			distinct_with_subjects = (
				session.query(PushSubscription.roll_number)
				.filter(
					PushSubscription.has_timetable.is_(True),
					PushSubscription.cached_subjects_json.isnot(None),
				)
				.distinct()
				.count()
			)

		return ApiResponse(
			status="success",
			message="Timetable notification eligibility",
			data={
				"total_push_subscriptions": total_subscriptions,
				"subscriptions_with_has_timetable": has_timetable_count,
				"subscriptions_with_cached_subjects": has_subjects_count,
				"distinct_students_eligible": distinct_with_subjects,
				"note": "Students need to open the timetable page at least once to cache their subjects and become eligible for class reminders.",
			},
		)
	except Exception:
		logger.exception("Failed to fetch timetable notification status")
		return JSONResponse(status_code=500, content={"status": "error", "message": "Unable to fetch status"})


@router.get("/notifications/health", response_model=ApiResponse)
async def admin_notification_health(_: dict = Depends(require_admin_user)):
	"""
	Comprehensive push notification system health check.

	Returns:
	- VAPID and FCM configuration status
	- Push worker health (alive, jobs processed, last delivery)
	- Queue depth (pending, processing, done, failed, cancelled)
	- Delivery stats (last 24h success/failure, failure rate)
	- Recent failed jobs with error details
	- Upcoming pending jobs
	- Push subscription counts and timetable eligibility
	- Device breakdown
	- 7-day notification history by category
	"""
	from services.notification_health_service import get_push_notification_health

	try:
		data = await run_in_threadpool(get_push_notification_health)
		return ApiResponse(status="success", message="Push notification health data", data=data)
	except Exception:
		logger.exception("Failed to fetch push notification health")
		return JSONResponse(status_code=500, content={"status": "error", "message": "Unable to fetch push notification health"})
