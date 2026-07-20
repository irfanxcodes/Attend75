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
