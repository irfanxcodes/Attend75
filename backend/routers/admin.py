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


@router.post("/notices/{notice_id}/reprocess-timetable", response_model=ApiResponse)
async def admin_reprocess_timetable(notice_id: int, _: dict = Depends(require_admin_user)):
	"""
	Force-reprocess a notice's PDF and update its cleaned_text in the database.
	Use this after parser fixes to refresh the stored timetable data without
	waiting for the next scrape cycle.
	"""
	import io
	import pdfplumber
	from db.models.notice import Notice
	from db.session import SessionLocal
	from services.notice_processor import _extract_page_with_tables
	from services.notice_classifier import clean_text
	from services.timetable_service import _timetable_cache
	from scrapers.portal_scraper import PortalScraper

	def _reprocess():
		with SessionLocal() as session:
			notice = session.query(Notice).filter(Notice.notice_id == notice_id).one_or_none()
			if not notice:
				raise ValueError(f"Notice {notice_id} not found")

			# Download PDF directly (no auth needed for public portal PDFs)
			import os
			import requests
			portal_base_url = os.getenv("PORTAL_BASE_URL", "http://111.93.16.209/sz")
			pdf_url = f"{portal_base_url.rstrip('/')}/{notice.pdf_url_path}"
			r = requests.get(pdf_url, timeout=20)
			if r.status_code != 200:
				raise RuntimeError(f"PDF download failed: HTTP {r.status_code}")

			pdf_bytes = io.BytesIO(r.content)
			extracted_text = ""
			with pdfplumber.open(pdf_bytes) as pdf:
				for page in pdf.pages[:10]:
					page_text = _extract_page_with_tables(page)
					if page_text:
						extracted_text += page_text + "\n"

			cleaned = clean_text(extracted_text)

			# Update the notice
			notice.extracted_text = extracted_text
			notice.cleaned_text = cleaned
			notice.processing_status = "done"
			from datetime import datetime
			notice.updated_at = datetime.utcnow()
			session.commit()

			# Invalidate cache for this notice
			_timetable_cache.pop(notice_id, None)

			# Count parseable entries
			from services.timetable_service import _parse_timetable_from_text
			schedule = _parse_timetable_from_text(cleaned)
			return {
				"notice_id": notice_id,
				"text_length": len(cleaned),
				"parsed_entries": len(schedule),
			}

	try:
		data = await run_in_threadpool(_reprocess)
		return ApiResponse(
			status="success",
			message=f"Notice {notice_id} reprocessed successfully",
			data=data,
		)
	except ValueError as e:
		return JSONResponse(status_code=404, content={"status": "error", "message": str(e)})
	except Exception:
		logger.exception("Failed to reprocess notice %d", notice_id)
		return JSONResponse(status_code=500, content={"status": "error", "message": "Reprocess failed"})


@router.post("/timetable/clear-cache", response_model=ApiResponse)
async def admin_clear_timetable_cache(_: dict = Depends(require_admin_user)):
	"""Clear the in-memory timetable parse cache. Forces all subsequent requests
	to re-parse from stored cleaned_text. Use after a reprocess or parser update."""
	from services.timetable_service import _timetable_cache
	count = len(_timetable_cache)
	_timetable_cache.clear()
	return ApiResponse(
		status="success",
		message=f"Cleared {count} cached timetable entries",
		data={"cleared": count},
	)


@router.get("/notices/{notice_id}/timetable-parse", response_model=ApiResponse)
async def admin_timetable_parse_debug(
    notice_id: int,
    section: str | None = Query(default=None, description="Filter by section (e.g. 'E')"),
    semester: str | None = Query(default=None, description="Filter by semester (e.g. '7')"),
    _: dict = Depends(require_admin_user),
):
	"""
	Show the parsed timetable schedule for a notice, optionally filtered by section/semester.
	Use this to diagnose why certain sections show incomplete timetables.
	"""
	from db.models.notice import Notice
	from db.session import SessionLocal
	from services.timetable_service import _parse_timetable_from_text, _btech_section_matches
	from collections import Counter

	def _parse():
		with SessionLocal() as sess:
			notice = sess.query(Notice).filter(Notice.notice_id == notice_id).one_or_none()
			if not notice:
				raise ValueError(f"Notice {notice_id} not found")

			schedule = _parse_timetable_from_text(notice.cleaned_text or "")

			# Summary: sections and semesters found
			sections_found = Counter(e.get('section', '') for e in schedule)
			sems_found = Counter(e.get('semester', '') for e in schedule)

			# Filter for requested section/semester
			filtered = schedule
			if section:
				filtered = [e for e in filtered if _btech_section_matches(e.get('section', ''), section.upper())]
			if semester:
				filtered = [e for e in filtered if e.get('semester', '') == semester]

			# Group by day
			by_day: dict[str, list] = {}
			for e in filtered:
				by_day.setdefault(e['day'], []).append({
					'time': e['time'],
					'course': e['course'],
					'section': e['section'],
					'faculty': e['faculty'],
					'semester': e['semester'],
					'room': e['room'],
				})

			return {
				"notice_id": notice_id,
				"notice_title": notice.title,
				"text_length": len(notice.cleaned_text or ""),
				"total_entries": len(schedule),
				"sections_found": dict(sections_found.most_common()),
				"semesters_found": dict(sems_found.most_common()),
				"filtered_entries": len(filtered),
				"by_day": by_day,
			}

	try:
		data = await run_in_threadpool(_parse)
		return ApiResponse(status="success", message="Parse result", data=data)
	except ValueError as e:
		return JSONResponse(status_code=404, content={"status": "error", "message": str(e)})
	except Exception:
		logger.exception("Failed to parse notice %d timetable", notice_id)
		return JSONResponse(status_code=500, content={"status": "error", "message": "Parse failed"})


@router.post("/timetable/reprocess-recent", response_model=ApiResponse)
async def admin_reprocess_recent_timetables(
    days: int = Query(default=7, ge=1, le=60, description="Reprocess timetable notices from the last N days"),
    _: dict = Depends(require_admin_user),
):
	"""
	Re-download and reparse all timetable notices from the last N days.
	Use this after a parser fix to refresh stored cleaned_text for recently
	posted timetables (e.g. a new semester's timetable that was stored with
	an older parser version).

	Also clears the in-memory timetable cache so all students get fresh data.
	"""
	import io
	import os
	import requests as _requests
	from datetime import datetime, timedelta
	import pdfplumber

	from db.models.notice import Notice
	from db.session import SessionLocal
	from services.notice_processor import _extract_page_with_tables
	from services.notice_classifier import clean_text
	from services.timetable_service import _timetable_cache, _parse_timetable_from_text

	def _reprocess_batch():
		portal_base_url = os.getenv("PORTAL_BASE_URL", "http://111.93.16.209/sz")
		cutoff = datetime.utcnow().date() - timedelta(days=days)

		with SessionLocal() as session:
			notices = (
				session.query(Notice)
				.filter(Notice.processing_status == "done")
				.filter(Notice.portal_date >= cutoff)
				.filter(Notice.title.isnot(None))
				.all()
			)

			timetable_notices = [
				n for n in notices
				if ("TIMETABLE" in (n.title or "").upper() or "TIME TABLE" in (n.title or "").upper())
				and "EXAM" not in (n.title or "").upper()
			]

		results = []
		for notice in timetable_notices:
			try:
				pdf_url = f"{portal_base_url.rstrip('/')}/{notice.pdf_url_path}"
				r = _requests.get(pdf_url, timeout=20)
				if r.status_code != 200:
					results.append({"notice_id": notice.notice_id, "status": "download_failed", "http": r.status_code})
					continue

				pdf_bytes = io.BytesIO(r.content)
				extracted_text = ""
				with pdfplumber.open(pdf_bytes) as pdf:
					for page in pdf.pages[:10]:
						page_text = _extract_page_with_tables(page)
						if page_text:
							extracted_text += page_text + "\n"

				cleaned = clean_text(extracted_text)
				schedule = _parse_timetable_from_text(cleaned)

				with SessionLocal() as session:
					db_notice = session.query(Notice).filter(Notice.notice_id == notice.notice_id).one_or_none()
					if db_notice:
						db_notice.extracted_text = extracted_text
						db_notice.cleaned_text = cleaned
						db_notice.updated_at = datetime.utcnow()
						session.commit()

				# Invalidate cache
				_timetable_cache.pop(notice.notice_id, None)

				results.append({
					"notice_id": notice.notice_id,
					"title": notice.title[:60],
					"status": "ok",
					"parsed_entries": len(schedule),
				})
			except Exception as exc:
				results.append({"notice_id": notice.notice_id, "status": "error", "error": str(exc)})

		return {"processed": len(results), "results": results}

	try:
		data = await run_in_threadpool(_reprocess_batch)
		return ApiResponse(status="success", message="Reprocess complete", data=data)
	except Exception:
		logger.exception("Failed to reprocess timetable notices")
		return JSONResponse(status_code=500, content={"status": "error", "message": "Reprocess failed"})


# ── Storage Cap Endpoints ─────────────────────────────────────────────────────

@router.get("/storage/caps", response_model=ApiResponse)
async def admin_storage_caps(_: dict = Depends(require_admin_user)):
	"""
	Full R2 cost-safety status across all three guards.

	Guard 1 — storage_bytes  (PRIMARY, AUTHORITATIVE — actual WebP bytes reserved)
	Guard 2 — class_a_ops    (AUTHORITATIVE — monthly PUT operation counter)
	Guard 3 — slide_count    (AUTHORITATIVE — secondary slide count guard)
	Class B  — NOT authoritatively tracked (see note in response)

	Alerts fire at 50%, 75%, 90% per guard; hard block at 100%.
	"""
	from services.storage_cap_service import get_status
	try:
		data = await run_in_threadpool(get_status)
		return ApiResponse(status="success", message="Storage cap status", data=data)
	except Exception:
		logger.exception("Failed to fetch storage cap status")
		return JSONResponse(status_code=500, content={"status": "error", "message": "Unable to fetch storage cap status"})


@router.post("/storage/reset-cap-block", response_model=ApiResponse)
async def admin_reset_cap_block(payload: dict = {}, _: dict = Depends(require_admin_user)):
	"""
	Lift the hard cap block for one or all guards so uploads can resume.

	Body (optional): { "guard": "bytes" | "class_a" | "slides" | "all" }
	Default: "all"

	Call this AFTER either:
	  (a) Raising the relevant cap env var and restarting the server, OR
	  (b) Deleting old chapter uploads to free space.

	This does NOT change any counter — it only removes the block flag and
	re-arms threshold alerts.  If the cap is still breached (usage >= cap),
	the next upload will immediately re-trigger the block.
	"""
	from services.storage_cap_service import admin_reset_cap_block
	guard = (payload.get("guard") or "all").strip()
	if guard not in ("bytes", "class_a", "slides", "all"):
		return JSONResponse(status_code=422, content={"status": "error",
			"message": "guard must be 'bytes', 'class_a', 'slides', or 'all'"})
	try:
		data = await run_in_threadpool(admin_reset_cap_block, guard)
		return ApiResponse(status="success", message=f"Storage cap block reset (guard={guard})", data=data)
	except Exception:
		logger.exception("Failed to reset storage cap block")
		return JSONResponse(status_code=500, content={"status": "error", "message": "Unable to reset cap block"})


@router.post("/storage/reset-class-a-monthly", response_model=ApiResponse)
async def admin_reset_class_a_monthly(_: dict = Depends(require_admin_user)):
	"""
	Reset the monthly Class A (PUT) operation counter to zero.

	Class A ops auto-reset when the UTC month changes, but use this endpoint
	to manually reset it if needed (e.g. after a runaway test upload in dev).
	"""
	from services.storage_cap_service import admin_reset_class_a_monthly
	try:
		data = await run_in_threadpool(admin_reset_class_a_monthly)
		return ApiResponse(status="success", message="Class A monthly counter reset", data=data)
	except Exception:
		logger.exception("Failed to reset Class A monthly counter")
		return JSONResponse(status_code=500, content={"status": "error", "message": "Unable to reset Class A counter"})


@router.post("/storage/sync-count", response_model=ApiResponse)
async def admin_sync_storage_count(_: dict = Depends(require_admin_user)):
	"""
	Resync the slide-count tracker from the real lesson_slides row count.
	Use after manually deleting chapter uploads or slides from the DB so the
	cap counter reflects the true current state.

	Note: the storage_bytes counter tracks actual reserved bytes and is NOT
	recomputed here (byte sizes are not stored per-slide in the DB). If you
	delete slides and want to reclaim byte budget, use reset-cap-block after
	the sync.
	"""
	from services.storage_cap_service import sync_real_count
	try:
		data = await run_in_threadpool(sync_real_count)
		return ApiResponse(status="success", message="Storage counter synced", data=data)
	except Exception:
		logger.exception("Failed to sync storage count")
		return JSONResponse(status_code=500, content={"status": "error", "message": "Unable to sync storage count"})


@router.post("/storage/trigger-health-check", response_model=ApiResponse)
async def admin_trigger_storage_health_check(_: dict = Depends(require_admin_user)):
	"""
	Manually trigger the weekly R2 storage health check right now.
	Normally runs automatically every Monday at 9:30 AM IST.
	Sends a push notification to ADMIN_ROLL_NUMBER and returns the current status.
	"""
	from services.storage_health_scheduler import run_storage_health_check
	try:
		data = await run_in_threadpool(run_storage_health_check)
		return ApiResponse(status="success", message="Storage health check complete", data=data)
	except Exception:
		logger.exception("Failed to run storage health check")
		return JSONResponse(status_code=500, content={"status": "error", "message": "Health check failed"})
