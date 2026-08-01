"""
FCM Service — Firebase Cloud Messaging for reliable push delivery.

Uses Firebase Admin SDK to send notifications via FCM which delivers
through Google Play Services on Android (always-on, bypasses battery
optimization that kills Chrome's Web Push receiver).

FCM tokens are stored alongside Web Push subscriptions. The push_worker
tries FCM first (if token exists), falls back to Web Push (pywebpush).
"""

import logging
import threading
from datetime import datetime, timezone

from db.session import SessionLocal
from db.models.push_subscription import PushSubscription

logger = logging.getLogger(__name__)

# Thread lock to prevent race conditions on Firebase Admin SDK initialization.
# Multiple push_worker threads may call send_fcm_notification simultaneously,
# and firebase_admin._apps is not thread-safe during initialization.
_firebase_init_lock = threading.Lock()


def register_fcm_token(roll_number: str, fcm_token: str, device_info: str = "") -> dict:
    """
    Store an FCM token for a student. Updates the fcm_token field on an
    existing subscription row (matched by device_info or most recent).
    Does NOT create standalone FCM-only rows.
    """
    now = datetime.now(timezone.utc)

    with SessionLocal() as session:
        # Remove this FCM token from any OTHER roll number to prevent
        # cross-account notification leakage after account switching.
        session.query(PushSubscription).filter(
            PushSubscription.roll_number != roll_number,
            PushSubscription.fcm_token == fcm_token,
        ).update({"fcm_token": None}, synchronize_session=False)

        # Find existing Web Push subscription for this roll + device
        existing = (
            session.query(PushSubscription)
            .filter(
                PushSubscription.roll_number == roll_number,
                PushSubscription.p256dh_key != "",  # Only real Web Push subscriptions
                PushSubscription.p256dh_key.isnot(None),
            )
            .order_by(PushSubscription.created_at.desc())
            .first()
        )

        if existing:
            existing.fcm_token = fcm_token
            existing.last_used_at = now
            session.commit()
            logger.info("FCM token set on existing sub %d for %s", existing.id, roll_number)
            return {"id": existing.id, "updated": True}
        else:
            # No valid Web Push subscription exists — store token for later
            # when the user subscribes via Web Push, the FCM token will be there
            logger.warning("FCM token received but no Web Push subscription for %s", roll_number)
            return {"id": None, "updated": False}


def send_fcm_notification(fcm_token: str, data: dict, subscription_id: int | None = None) -> bool:
    """
    Send a notification via Firebase Admin SDK.
    Returns True if sent successfully, False otherwise.
    If the token is NotRegistered/invalid, clears it from the DB so it stops being retried.
    """
    try:
        import firebase_admin
        from firebase_admin import messaging

        # Ensure Firebase is initialized — protected by a lock so multiple
        # push_worker threads don't race on firebase_admin._apps (not
        # thread-safe during initialization).
        if not firebase_admin._apps:
            with _firebase_init_lock:
                # Double-check after acquiring lock
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
        if "NOT_FOUND" in error_str or "UNREGISTERED" in error_str or "not a valid FCM" in error_str:
            logger.warning("FCM token invalid/expired — clearing from DB: %s", error_str[:100])
            # Clear the stale token so it doesn't get retried on every notification
            _clear_fcm_token(fcm_token, subscription_id)
        else:
            logger.warning("FCM send failed: %s", error_str[:200])
        return False


def _clear_fcm_token(fcm_token: str, subscription_id: int | None = None) -> None:
    """Remove a stale FCM token from the push_subscriptions table."""
    try:
        with SessionLocal() as session:
            query = session.query(PushSubscription)
            if subscription_id:
                query = query.filter(PushSubscription.id == subscription_id)
            else:
                query = query.filter(PushSubscription.fcm_token == fcm_token)
            query.update({"fcm_token": None}, synchronize_session=False)
            session.commit()
    except Exception as clear_err:
        logger.debug("Failed to clear FCM token: %s", clear_err)


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
