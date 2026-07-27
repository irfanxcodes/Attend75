"""
Push Notification Router — subscription, preferences, and history endpoints.
"""

import logging
import os

from fastapi import APIRouter, Query
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse

from models.schemas import (
    ApiResponse,
    NotificationPreferencesUpdateRequest,
    PushHistoryReadRequest,
    PushSubscribeRequest,
    PushUnsubscribeRequest,
)
from services import notification_history_service, preference_filter, subscription_manager
from services.session_store import session_store

router = APIRouter(prefix="/push", tags=["push"])
logger = logging.getLogger(__name__)


def _preferences_to_dict(prefs) -> dict:
    return {
        "noticesEnabled": prefs.notices_enabled,
        "attendanceEnabled": prefs.attendance_enabled,
        "timetableEnabled": prefs.timetable_enabled,
        "dailyDigestEnabled": prefs.daily_digest_enabled,
        "weeklySummaryEnabled": prefs.weekly_summary_enabled,
        "noticeExam": prefs.notice_exam,
        "noticeFee": prefs.notice_fee,
        "noticeAcademic": prefs.notice_academic,
        "noticeInternship": prefs.notice_internship,
        "noticeEvent": prefs.notice_event,
        "noticeGuestLecture": prefs.notice_guest_lecture,
        "noticeGeneral": prefs.notice_general,
        "reminderLeadMinutes": prefs.reminder_lead_minutes,
        "dailyDigestHour": prefs.daily_digest_hour,
        "dailyDigestMinute": prefs.daily_digest_minute,
    }


def _require_roll_number(token: str) -> str | None:
    record = session_store.get(token)
    if record is None:
        return None
    return record.roll_number


# GET /push/vapid-public-key — public, no session required (browser needs it to call subscribe())
@router.get("/vapid-public-key", response_model=ApiResponse)
async def get_vapid_public_key():
    public_key = os.getenv("VAPID_PUBLIC_KEY", "")
    return ApiResponse(status="success", message="VAPID public key fetched", data={"publicKey": public_key})


# POST /push/subscribe
@router.post("/subscribe", response_model=ApiResponse)
async def subscribe(payload: PushSubscribeRequest):
    roll_number = _require_roll_number(payload.token)
    if roll_number is None:
        return JSONResponse(status_code=401, content={"status": "error", "message": "Session expired"})

    try:
        result = await run_in_threadpool(
            subscription_manager.register_subscription,
            roll_number,
            payload.endpoint,
            payload.keys.p256dh,
            payload.keys.auth,
            payload.device_info,
        )

        # If the session has cached attendance rows from login, resolve and
        # persist subjects immediately — zero portal requests, all in-memory data.
        record = session_store.get(payload.token)
        if record is not None:
            attendance_rows = getattr(record, "cached_attendance_rows", None) or []
            if attendance_rows:
                try:
                    from services.timetable_subject_resolver import resolve_and_cache_subjects_for_student
                    await run_in_threadpool(
                        resolve_and_cache_subjects_for_student, roll_number, attendance_rows
                    )
                except Exception as subj_exc:
                    logger.debug("Subject caching on subscribe failed for %s: %s", roll_number, subj_exc)

        return ApiResponse(status="success", message="Subscribed to push notifications", data=result)
    except subscription_manager.RateLimitExceededError:
        return JSONResponse(
            status_code=429,
            content={"status": "error", "message": "Too many subscription requests. Please try again later."},
        )
    except Exception:
        logger.exception("Failed to register push subscription")
        return JSONResponse(status_code=500, content={"status": "error", "message": "Unable to register subscription"})


# DELETE /push/subscribe
@router.delete("/subscribe", response_model=ApiResponse)
async def unsubscribe(payload: PushUnsubscribeRequest):
    roll_number = _require_roll_number(payload.token)
    if roll_number is None:
        return JSONResponse(status_code=401, content={"status": "error", "message": "Session expired"})

    try:
        removed = await run_in_threadpool(subscription_manager.remove_subscription, roll_number, payload.endpoint)
        return ApiResponse(status="success", message="Unsubscribed", data={"removed": removed})
    except Exception:
        logger.exception("Failed to remove push subscription")
        return JSONResponse(status_code=500, content={"status": "error", "message": "Unable to unsubscribe"})


# GET /push/preferences?token=...
@router.get("/preferences", response_model=ApiResponse)
async def get_preferences(token: str = Query(..., description="Session token")):
    roll_number = _require_roll_number(token)
    if roll_number is None:
        return JSONResponse(status_code=401, content={"status": "error", "message": "Session expired"})

    try:
        prefs = await run_in_threadpool(preference_filter.get_or_create_preferences, roll_number)
        return ApiResponse(status="success", message="Preferences fetched", data=_preferences_to_dict(prefs))
    except Exception:
        logger.exception("Failed to fetch notification preferences")
        return JSONResponse(status_code=500, content={"status": "error", "message": "Unable to fetch preferences"})


# PUT /push/preferences
@router.put("/preferences", response_model=ApiResponse)
async def put_preferences(payload: NotificationPreferencesUpdateRequest):
    roll_number = _require_roll_number(payload.token)
    if roll_number is None:
        return JSONResponse(status_code=401, content={"status": "error", "message": "Session expired"})

    updates = payload.model_dump(exclude={"token"}, exclude_none=True)

    try:
        prefs = await run_in_threadpool(preference_filter.update_preferences, roll_number, updates)
        return ApiResponse(status="success", message="Preferences updated", data=_preferences_to_dict(prefs))
    except Exception:
        logger.exception("Failed to update notification preferences")
        return JSONResponse(status_code=500, content={"status": "error", "message": "Unable to update preferences"})


# GET /push/history?token=...
@router.get("/history", response_model=ApiResponse)
async def get_history(token: str = Query(..., description="Session token")):
    roll_number = _require_roll_number(token)
    if roll_number is None:
        return JSONResponse(status_code=401, content={"status": "error", "message": "Session expired"})

    try:
        items = await run_in_threadpool(notification_history_service.list_history, roll_number)
        unread = await run_in_threadpool(notification_history_service.unread_count, roll_number)
        return ApiResponse(
            status="success",
            message="Notification history fetched",
            data={"items": items, "unreadCount": unread},
        )
    except Exception:
        logger.exception("Failed to fetch notification history")
        return JSONResponse(status_code=500, content={"status": "error", "message": "Unable to fetch history"})


# POST /push/history/{id}/read
@router.post("/history/{history_id}/read", response_model=ApiResponse)
async def mark_history_read(history_id: int, payload: PushHistoryReadRequest):
    roll_number = _require_roll_number(payload.token)
    if roll_number is None:
        return JSONResponse(status_code=401, content={"status": "error", "message": "Session expired"})

    try:
        ok = await run_in_threadpool(notification_history_service.mark_read, roll_number, history_id)
        if not ok:
            return JSONResponse(status_code=404, content={"status": "error", "message": "Notification not found"})
        return ApiResponse(status="success", message="Marked as read", data={"id": history_id})
    except Exception:
        logger.exception("Failed to mark notification as read")
        return JSONResponse(status_code=500, content={"status": "error", "message": "Unable to mark as read"})


# POST /push/fcm-register — Register an FCM token for reliable Android delivery
@router.post("/fcm-register", response_model=ApiResponse)
async def register_fcm_token(payload: dict):
    token = (payload.get("token") or "").strip()
    fcm_token = (payload.get("fcm_token") or "").strip()
    device_info = (payload.get("device_info") or "").strip()

    if not token or not fcm_token:
        return JSONResponse(status_code=422, content={"status": "error", "message": "token and fcm_token are required"})

    roll_number = _require_roll_number(token)
    if roll_number is None:
        return JSONResponse(status_code=401, content={"status": "error", "message": "Session expired"})

    try:
        from services.fcm_service import register_fcm_token as _register
        result = await run_in_threadpool(_register, roll_number, fcm_token, device_info)
        return ApiResponse(status="success", message="FCM token registered", data=result)
    except Exception:
        logger.exception("Failed to register FCM token for %s", roll_number)
        return JSONResponse(status_code=500, content={"status": "error", "message": "Unable to register FCM token"})


# GET /push/timetable-debug?token=... — per-student timetable notification readiness check
@router.get("/timetable-debug", response_model=ApiResponse)
async def timetable_debug(token: str = Query(..., description="Session token")):
    """
    Diagnostic endpoint: shows why a student is or isn't receiving timetable
    notifications. Checks has_timetable flag, cached_subjects_json, matching
    classes for today, and what jobs are pending in the queue.
    """
    import json
    from datetime import datetime, timezone, timedelta
    from db.models.push_subscription import PushSubscription
    from db.models.notification_job import NotificationJob
    from db.session import SessionLocal
    from services.timetable_service import (
        _find_latest_timetable_notice,
        _parse_timetable_from_text,
        _match_student_classes,
    )

    roll_number = _require_roll_number(token)
    if roll_number is None:
        return JSONResponse(status_code=401, content={"status": "error", "message": "Session expired"})

    IST = timezone(timedelta(hours=5, minutes=30))
    now_ist = datetime.now(IST)
    today_name = now_ist.strftime("%A")

    # 1. Fetch subscription rows for this student
    with SessionLocal() as session:
        subs = (
            session.query(PushSubscription)
            .filter(PushSubscription.roll_number == roll_number)
            .all()
        )
        sub_info = [
            {
                "id": s.id,
                "has_timetable": s.has_timetable,
                "has_cached_subjects": s.cached_subjects_json is not None,
                "cached_subjects": json.loads(s.cached_subjects_json) if s.cached_subjects_json else None,
                "device_info": s.device_info,
                "last_used_at": s.last_used_at.isoformat() if s.last_used_at else None,
            }
            for s in subs
        ]

        # 2. Pending timetable/digest jobs for this student
        pending_jobs = (
            session.query(NotificationJob)
            .filter(
                NotificationJob.target_roll == roll_number,
                NotificationJob.status == "pending",
                NotificationJob.job_type == "push_send",
            )
            .order_by(NotificationJob.scheduled_at)
            .all()
        )
        pending_info = [
            {
                "id": j.id,
                "scheduled_at_ist": (
                    j.scheduled_at.astimezone(IST).strftime("%H:%M IST")
                    if j.scheduled_at else None
                ),
                "category": (json.loads(j.payload).get("notification") or {}).get("category"),
                "title": (json.loads(j.payload).get("notification") or {}).get("title"),
            }
            for j in pending_jobs
        ]

    # 3. Check timetable matching for today
    timetable_check = {"status": "no_subscription"}
    if subs:
        # Use the first subscription's cached subjects
        cached_json = next((s.cached_subjects_json for s in subs if s.cached_subjects_json), None)
        if not cached_json:
            timetable_check = {
                "status": "no_cached_subjects",
                "fix": "Open the Timetable page once, or wait for the next background fetch (~6h cycle) to auto-populate your subjects.",
            }
        else:
            student_subjects = json.loads(cached_json)
            notice = _find_latest_timetable_notice(student_subjects)
            if not notice:
                timetable_check = {"status": "no_timetable_notice_in_db"}
            else:
                schedule = _parse_timetable_from_text(notice.cleaned_text or "")
                if not schedule:
                    timetable_check = {"status": "timetable_parse_failed", "notice_id": notice.notice_id}
                else:
                    all_classes = _match_student_classes(schedule, student_subjects)
                    today_classes = [c for c in all_classes if c.get("day") == today_name]
                    timetable_check = {
                        "status": "ok",
                        "notice_id": notice.notice_id,
                        "notice_title": notice.title,
                        "matched_subjects": student_subjects,
                        "today": today_name,
                        "classes_today": [
                            {"time": c["time"], "course": c["course"], "section": c["section"], "room": c.get("room", "")}
                            for c in today_classes
                        ],
                        "total_classes_this_week": len(all_classes),
                    }

    # 4. Check preferences
    prefs = await run_in_threadpool(preference_filter.get_or_create_preferences, roll_number)

    return ApiResponse(
        status="success",
        message="Timetable notification debug info",
        data={
            "roll_number": roll_number,
            "current_time_ist": now_ist.strftime("%A %H:%M IST"),
            "subscriptions": sub_info,
            "preferences": {
                "timetable_enabled": prefs.timetable_enabled,
                "daily_digest_enabled": prefs.daily_digest_enabled,
                "reminder_lead_minutes": prefs.reminder_lead_minutes,
                "daily_digest_time": f"{prefs.daily_digest_hour:02d}:{prefs.daily_digest_minute:02d} IST",
            },
            "timetable_match": timetable_check,
            "pending_jobs_today": pending_info,
        },
    )


# POST /push/schedule-my-reminders — manually trigger today's reminders for yourself
@router.post("/schedule-my-reminders", response_model=ApiResponse)
async def schedule_my_reminders(payload: dict):
    """
    Immediately schedule today's class reminders for the authenticated student.
    Useful after subscribing or updating preferences — no need to wait until 5:30 AM.
    """
    import json
    import hashlib
    from datetime import datetime, timezone, timedelta
    from db.models.push_subscription import PushSubscription
    from db.session import SessionLocal
    from services.timetable_service import (
        _find_latest_timetable_notice,
        _parse_timetable_from_text,
        _match_student_classes,
    )
    from services.timetable_reminder_engine import (
        VALID_LEAD_MINUTES,
        PAGE_TIME_SLOTS_HOURS,
        _time_sort_to_hour_minute,
    )
    from services import notification_queue
    from services.payload_builder import build_payload
    from services.preference_filter import get_or_create_preferences, should_send

    token = (payload.get("token") or "").strip()
    roll_number = _require_roll_number(token)
    if roll_number is None:
        return JSONResponse(status_code=401, content={"status": "error", "message": "Session expired"})

    IST = timezone(timedelta(hours=5, minutes=30))
    now_ist = datetime.now(IST)
    today_name = now_ist.strftime("%A")

    # Load cached subjects
    with SessionLocal() as session:
        row = (
            session.query(PushSubscription.cached_subjects_json)
            .filter(
                PushSubscription.roll_number == roll_number,
                PushSubscription.cached_subjects_json.isnot(None),
            )
            .first()
        )

    if not row or not row[0]:
        return JSONResponse(
            status_code=400,
            content={
                "status": "error",
                "message": "No cached subjects found. Open the Timetable page first so your subjects can be resolved.",
            },
        )

    student_subjects = json.loads(row[0])
    notice = _find_latest_timetable_notice(student_subjects)
    if not notice or not notice.cleaned_text:
        return JSONResponse(status_code=400, content={"status": "error", "message": "No timetable notice found in database."})

    schedule = _parse_timetable_from_text(notice.cleaned_text)
    if not schedule:
        return JSONResponse(status_code=400, content={"status": "error", "message": "Could not parse timetable from notice."})

    all_classes = _match_student_classes(schedule, student_subjects)
    today_classes = [c for c in all_classes if c.get("day") == today_name]

    if not today_classes:
        return ApiResponse(
            status="success",
            message=f"No classes found for {today_name}. Nothing to schedule.",
            data={"enqueued": 0, "today": today_name},
        )

    prefs = await run_in_threadpool(preference_filter.get_or_create_preferences, roll_number)
    enqueued = 0

    # Daily digest
    if should_send(prefs, "daily_digest_enabled"):
        jitter_seconds = int(hashlib.md5(roll_number.encode()).hexdigest()[:4], 16) % 900
        digest_time = now_ist.replace(
            hour=prefs.daily_digest_hour, minute=prefs.daily_digest_minute, second=0, microsecond=0
        ) + timedelta(seconds=jitter_seconds)

        if digest_time > now_ist:
            class_count = len(today_classes)
            subjects_str = ", ".join(sorted(set(c.get("course", "") for c in today_classes))[:5])
            first_time = today_classes[0].get("time", "")
            payload_data = build_payload(
                category="digest",
                title=f"Good morning! {class_count} class{'es' if class_count != 1 else ''} today",
                body=f"⏰ First class at {first_time}\n📚 Subjects: {subjects_str}",
                deep_link="/app/notices",
                priority="standard",
            )
            notification_queue.enqueue(
                "push_send",
                {"roll_number": roll_number, "notification": payload_data},
                target_roll=roll_number,
                scheduled_at=digest_time.astimezone(timezone.utc),
            )
            enqueued += 1

    # Class reminders
    if should_send(prefs, "timetable_enabled"):
        lead_minutes = prefs.reminder_lead_minutes
        if lead_minutes not in VALID_LEAD_MINUTES:
            lead_minutes = 15

        for cls in today_classes:
            hm = _time_sort_to_hour_minute(cls.get("time_sort", ""))
            if not hm:
                continue
            class_start = now_ist.replace(hour=hm[0], minute=hm[1], second=0, microsecond=0)
            reminder_time = class_start - timedelta(minutes=lead_minutes)
            if reminder_time <= now_ist:
                continue

            course = cls.get("course", "?")
            section = cls.get("section", "")
            room = cls.get("room", "")
            faculty = cls.get("faculty", "")
            body_parts = [f"{course}-{section}" if section else course]
            if room:
                body_parts.append(f"Room: {room}")
            if faculty:
                body_parts.append(faculty)
            body_parts.append(f"Starts in {lead_minutes} min")

            payload_data = build_payload(
                category="timetable",
                title=f"🔔 {course} in {lead_minutes} min",
                body=" · ".join(body_parts),
                deep_link="/app/notices",
                priority="standard",
            )
            notification_queue.enqueue(
                "push_send",
                {"roll_number": roll_number, "notification": payload_data},
                target_roll=roll_number,
                scheduled_at=reminder_time.astimezone(timezone.utc),
            )
            enqueued += 1

    return ApiResponse(
        status="success",
        message=f"Scheduled {enqueued} reminder(s) for today ({today_name})",
        data={
            "enqueued": enqueued,
            "today": today_name,
            "classes_today": [
                {"time": c["time"], "course": c["course"], "section": c["section"]}
                for c in today_classes
            ],
        },
    )
