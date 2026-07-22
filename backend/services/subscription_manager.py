"""
Subscription Manager — CRUD for Web Push subscription endpoints.

Owns all push_subscriptions access: registration (with premium gating, rate
limiting, encryption-at-rest, and 5-device eviction), removal (explicit
unsubscribe or HTTP 410 cleanup), and listing for the settings UI.
"""

import logging
import threading
import time
from collections import defaultdict, deque
from datetime import datetime, timezone

from db.models.push_subscription import PushSubscription
from db.session import SessionLocal
from services.crypto_service import credential_crypto_service
from services import premium_service

logger = logging.getLogger(__name__)

MAX_DEVICES_PER_STUDENT = 5
RATE_LIMIT_MAX_REQUESTS = 30
RATE_LIMIT_WINDOW_SECONDS = 3600


class PremiumRequiredError(Exception):
    """Raised when a non-premium student attempts a premium-gated action."""


class RateLimitExceededError(Exception):
    """Raised when a student exceeds the subscription registration rate limit."""


class RateLimiter:
    """
    Simple in-memory sliding-window counter, keyed by roll_number, storing a
    deque of registration attempt timestamps. Mirrors the lightweight,
    no-new-infra style already used by session_store.

    Not persisted across process restarts — acceptable since a restart resets
    everyone's window, which only ever makes the limit more permissive, never
    less safe.
    """

    def __init__(self, max_requests: int = RATE_LIMIT_MAX_REQUESTS, window_seconds: int = RATE_LIMIT_WINDOW_SECONDS):
        self._max_requests = max_requests
        self._window_seconds = window_seconds
        self._lock = threading.Lock()
        self._attempts: dict[str, deque] = defaultdict(deque)

    def check_and_record(self, roll_number: str) -> bool:
        """
        Returns True and records the attempt if under the limit; returns False
        (does NOT record) if the limit has been reached.
        """
        now = time.time()
        with self._lock:
            attempts = self._attempts[roll_number]
            cutoff = now - self._window_seconds
            while attempts and attempts[0] < cutoff:
                attempts.popleft()

            if len(attempts) >= self._max_requests:
                return False

            attempts.append(now)
            return True

    def count_in_window(self, roll_number: str) -> int:
        now = time.time()
        with self._lock:
            attempts = self._attempts[roll_number]
            cutoff = now - self._window_seconds
            while attempts and attempts[0] < cutoff:
                attempts.popleft()
            return len(attempts)


# Module-level singleton, mirrors session_store's module-level instance pattern.
rate_limiter = RateLimiter()


def register_subscription(
    roll_number: str,
    endpoint: str,
    p256dh_key: str,
    auth_key: str,
    device_info: str | None = None,
    consent_method: str = "browser_prompt",
) -> dict:
    """
    Register (or re-register) a Web Push subscription for a student.

    1. Premium gate — raises PremiumRequiredError if not premium.
    2. Rate limit — raises RateLimitExceededError if >= 10 registrations in the
       last rolling hour for this student.
    3. Encrypt endpoint/p256dh_key/auth_key before persisting.
    4. Upsert by (roll_number, endpoint): re-registering the same endpoint
       updates keys/consent/device_info in place rather than duplicating.
    5. If the student now has more than 5 subscriptions, delete the oldest
       (by created_at) until exactly 5 remain.

    Returns a dict describing the subscription (id, device_info, created_at) —
    never returns the raw/decrypted endpoint or keys.
    """
    # Premium gate is removed — all logged-in users can register for push.
    # Premium status is checked at notification DISPATCH time (attendance alerts,
    # timetable reminders, etc.) not at subscription registration time.
    # This allows admin-initiated notifications (feedback replies, broadcasts)
    # to reach all users who have opted in.

    if not rate_limiter.check_and_record(roll_number):
        raise RateLimitExceededError(f"{roll_number} exceeded {RATE_LIMIT_MAX_REQUESTS} subscription requests/hour")

    now = datetime.now(timezone.utc)
    encrypted_endpoint = credential_crypto_service.encrypt(endpoint)
    encrypted_p256dh = credential_crypto_service.encrypt(p256dh_key)
    encrypted_auth = credential_crypto_service.encrypt(auth_key)

    with SessionLocal() as session:
        # Upsert by matching decrypted endpoint. Since endpoints are encrypted
        # at rest with a deterministic-per-value but non-comparable ciphertext
        # (Fernet includes a random IV), we cannot query by encrypted_endpoint
        # equality across different encrypt() calls. Instead, match on
        # (roll_number, device_info) as a practical proxy when device_info is
        # provided, otherwise fall back to scanning this student's rows and
        # comparing decrypted endpoints (bounded by MAX_DEVICES_PER_STUDENT+1).
        existing_rows = (
            session.query(PushSubscription)
            .filter(PushSubscription.roll_number == roll_number)
            .order_by(PushSubscription.created_at.asc())
            .all()
        )

        existing_match = None
        for row in existing_rows:
            try:
                if credential_crypto_service.decrypt(row.endpoint) == endpoint:
                    existing_match = row
                    break
            except Exception:
                continue

        if existing_match:
            existing_match.p256dh_key = encrypted_p256dh
            existing_match.auth_key = encrypted_auth
            existing_match.device_info = device_info
            existing_match.consent_at = now
            existing_match.consent_method = consent_method
            subscription = existing_match
        else:
            subscription = PushSubscription(
                roll_number=roll_number,
                endpoint=encrypted_endpoint,
                p256dh_key=encrypted_p256dh,
                auth_key=encrypted_auth,
                device_info=device_info,
                has_timetable=False,
                consent_at=now,
                consent_method=consent_method,
                created_at=now,
            )
            session.add(subscription)

        session.commit()
        session.refresh(subscription)

        # Re-fetch full set (including the new/updated row) ordered oldest-first
        # and evict until at most MAX_DEVICES_PER_STUDENT remain (Req 1.4 / Property 3).
        all_rows = (
            session.query(PushSubscription)
            .filter(PushSubscription.roll_number == roll_number)
            .order_by(PushSubscription.created_at.asc())
            .all()
        )
        overflow = len(all_rows) - MAX_DEVICES_PER_STUDENT
        if overflow > 0:
            for stale in all_rows[:overflow]:
                if stale.id != subscription.id:
                    session.delete(stale)
            session.commit()

        result = {
            "id": subscription.id,
            "device_info": subscription.device_info,
            "created_at": subscription.created_at.isoformat(),
            "consent_at": subscription.consent_at.isoformat(),
            "consent_method": subscription.consent_method,
        }
        return result


def remove_subscription(roll_number: str, endpoint: str) -> bool:
    """
    Remove a subscription by (roll_number, endpoint). Used for explicit
    unsubscribe from the settings page. Returns True if a row was removed.
    """
    with SessionLocal() as session:
        rows = (
            session.query(PushSubscription)
            .filter(PushSubscription.roll_number == roll_number)
            .all()
        )
        for row in rows:
            try:
                if credential_crypto_service.decrypt(row.endpoint) == endpoint:
                    session.delete(row)
                    session.commit()
                    return True
            except Exception:
                continue
        return False


def remove_subscription_by_id(subscription_id: int) -> bool:
    """
    Remove a subscription by its primary key. Used internally by the push
    worker when a delivery attempt returns HTTP 410 (Gone).
    """
    with SessionLocal() as session:
        row = session.query(PushSubscription).filter(PushSubscription.id == subscription_id).one_or_none()
        if row is None:
            return False
        session.delete(row)
        session.commit()
        return True


def list_subscriptions(roll_number: str) -> list[dict]:
    """
    Return subscription metadata for the settings UI. Never exposes the raw
    endpoint or keys — only device_info/created_at/last_used_at/has_timetable.
    """
    with SessionLocal() as session:
        rows = (
            session.query(PushSubscription)
            .filter(PushSubscription.roll_number == roll_number)
            .order_by(PushSubscription.created_at.desc())
            .all()
        )
        return [
            {
                "id": row.id,
                "device_info": row.device_info,
                "has_timetable": row.has_timetable,
                "created_at": row.created_at.isoformat() if row.created_at else None,
                "last_used_at": row.last_used_at.isoformat() if row.last_used_at else None,
            }
            for row in rows
        ]


def get_decrypted_subscription_info(subscription_id: int) -> dict | None:
    """
    Used internally by push_worker to build the pywebpush subscription_info
    dict ({endpoint, keys: {p256dh, auth}}) right before delivery.
    Returns None if the subscription can't be decrypted (e.g. FCM-only row).
    """
    with SessionLocal() as session:
        row = session.query(PushSubscription).filter(PushSubscription.id == subscription_id).one_or_none()
        if row is None:
            return None
        # Skip FCM-only rows that don't have encrypted Web Push data
        if not row.endpoint or not row.p256dh_key or not row.auth_key:
            return None
        try:
            return {
                "id": row.id,
                "roll_number": row.roll_number,
                "endpoint": credential_crypto_service.decrypt(row.endpoint),
                "keys": {
                    "p256dh": credential_crypto_service.decrypt(row.p256dh_key),
                    "auth": credential_crypto_service.decrypt(row.auth_key),
                },
            }
        except Exception:
            return None


def list_all_subscription_ids_for_roll(roll_number: str) -> list[int]:
    """Return all subscription row ids for a student (used by dispatchers to fan out push_send jobs)."""
    with SessionLocal() as session:
        rows = (
            session.query(PushSubscription.id)
            .filter(PushSubscription.roll_number == roll_number)
            .all()
        )
        return [r[0] for r in rows]


def set_has_timetable(roll_number: str, has_timetable: bool) -> None:
    """Update the has_timetable flag on all of a student's subscription rows."""
    with SessionLocal() as session:
        session.query(PushSubscription).filter(
            PushSubscription.roll_number == roll_number
        ).update({"has_timetable": has_timetable})
        session.commit()


def touch_last_used(subscription_id: int) -> None:
    """Update last_used_at after a successful delivery."""
    with SessionLocal() as session:
        row = session.query(PushSubscription).filter(PushSubscription.id == subscription_id).one_or_none()
        if row:
            row.last_used_at = datetime.now(timezone.utc)
            session.commit()
