"""
FCM Service — Firebase Cloud Messaging for reliable push delivery.

Uses Firebase Admin SDK to send notifications via FCM which delivers
through Google Play Services on Android (always-on, bypasses battery
optimization that kills Chrome's Web Push receiver).

FCM tokens are stored alongside Web Push subscriptions. The push_worker
tries FCM first (if token exists), falls back to Web Push (pywebpush).
"""

import logging
from datetime import datetime, timezone

from db.session import SessionLocal
from db.models.push_subscription import PushSubscription

logger = logging.getLogger(__name__)


def register_fcm_token(roll_number: str, fcm_token: str, device_info: str = "") -> dict:
    """
    Store an FCM token for a student. Updates existing subscription row
    if one exists for this device, otherwise creates a new record.
    """
    now = datetime.now(timezone.utc)

    with SessionLocal() as session:
        # Find existing subscription for this roll + device
        existing = (
            session.query(PushSubscription)
            .filter(
                PushSubscription.roll_number == roll_number,
                PushSubscription.device_info == (device_info or None),
            )
            .order_by(PushSubscription.created_at.desc())
            .first()
        )

        if existing:
            existing.fcm_token = fcm_token
            existing.last_used_at = now
            session.commit()
            logger.info("FCM token updated for %s (sub_id=%d)", roll_number, existing.id)
            return {"id": existing.id, "updated": True}
        else:
            # Create a new subscription entry with just FCM token (no Web Push endpoint)
            sub = PushSubscription(
                roll_number=roll_number,
                endpoint="fcm:" + fcm_token[:50],  # Placeholder — not used for delivery
                p256dh_key="",
                auth_key="",
                device_info=device_info or None,
                fcm_token=fcm_token,
                has_timetable=False,
                consent_at=now,
                consent_method="fcm",
                created_at=now,
            )
            session.add(sub)
            session.commit()
            session.refresh(sub)
            logger.info("FCM token created for %s (sub_id=%d)", roll_number, sub.id)
            return {"id": sub.id, "updated": False}


def send_fcm_notification(fcm_token: str, data: dict) -> bool:
    """
    Send a notification via Firebase Admin SDK.
    Returns True if sent successfully, False otherwise.
    """
    try:
        import firebase_admin
        from firebase_admin import messaging

        # Ensure Firebase is initialized
        if not firebase_admin._apps:
            import os
            from firebase_admin import credentials
            cred_file = os.getenv("FIREBASE_SERVICE_ACCOUNT_FILE", "")
            if cred_file:
                cred = credentials.Certificate(cred_file)
                firebase_admin.initialize_app(cred)
            else:
                firebase_admin.initialize_app()

        # Build the message — use data message (not notification) so SW handles display
        message = messaging.Message(
            token=fcm_token,
            data={k: str(v) if v is not None else "" for k, v in data.items()},
            android=messaging.AndroidConfig(
                priority="high",
                ttl=86400,
            ),
            webpush=messaging.WebpushConfig(
                headers={"Urgency": "high", "TTL": "86400"},
            ),
        )

        response = messaging.send(message)
        logger.info("FCM sent successfully: %s", response)
        return True

    except Exception as e:
        error_str = str(e)
        if "NOT_FOUND" in error_str or "UNREGISTERED" in error_str:
            logger.warning("FCM token invalid/expired: %s", error_str[:100])
        else:
            logger.warning("FCM send failed: %s", error_str[:200])
        return False


def get_fcm_tokens_for_roll(roll_number: str) -> list[dict]:
    """Get all FCM tokens for a student."""
    with SessionLocal() as session:
        rows = (
            session.query(PushSubscription)
            .filter(
                PushSubscription.roll_number == roll_number,
                PushSubscription.fcm_token.isnot(None),
                PushSubscription.fcm_token != "",
            )
            .all()
        )
        return [{"id": r.id, "fcm_token": r.fcm_token, "device_info": r.device_info} for r in rows]
