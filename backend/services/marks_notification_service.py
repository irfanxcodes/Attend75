"""
Marks Notification Service — Notifies students when new internal marks are available.

Triggered after a successful consolidated marks fetch. Detects if the marks
data has changed (new subjects or updated scores) and sends a push notification.

State is persisted to notification_history (by querying the last marks notification
body) rather than an in-memory dict, so server restarts don't cause missed updates.
"""

import logging
import re

from db.session import SessionLocal
from services import notification_queue
from services.payload_builder import build_payload
from services.preference_filter import get_or_create_preferences, should_send

logger = logging.getLogger(__name__)


def _compute_marks_hash(marks_data: dict) -> str:
    """Stable hash of subject codes + total marks to detect changes."""
    subjects = marks_data.get("subjects", [])
    parts = []
    for subj in sorted(subjects, key=lambda s: s.get("code", "")):
        code = subj.get("code", "")
        total = subj.get("total", subj.get("totalMarks", ""))
        parts.append(f"{code}:{total}")
    return "|".join(parts)


def _get_previous_marks_hash(roll_number: str) -> str | None:
    """
    Load the previous marks hash from the last marks notification stored in
    notification_history. Returns None if no previous notification exists.
    Persisting to DB means server restarts don't lose state.
    """
    from db.models.notification_history import NotificationHistory
    with SessionLocal() as session:
        row = (
            session.query(NotificationHistory.body)
            .filter(
                NotificationHistory.roll_number == roll_number,
                NotificationHistory.category == "marks",
            )
            .order_by(NotificationHistory.created_at.desc())
            .first()
        )
        if row and row[0]:
            # The hash is stored in the body as "hash:<value>"
            m = re.match(r"hash:([^\s]+)", row[0])
            if m:
                return m.group(1)
    return None


def check_and_notify_marks_update(roll_number: str, marks_data: dict) -> bool:
    """
    Check if marks data has changed since the last stored notification. If so,
    send a push notification and record the new hash in notification_history.
    Returns True if a notification was sent.
    """
    subjects = marks_data.get("subjects", [])
    if not subjects:
        return False

    prefs = get_or_create_preferences(roll_number)
    # Use notices_enabled as the gate — marks updates are a sub-category of notice
    if not should_send(prefs, "notices_enabled"):
        return False

    current_hash = _compute_marks_hash(marks_data)
    previous_hash = _get_previous_marks_hash(roll_number)

    if previous_hash == current_hash:
        return False  # No change

    # First fetch (no previous record) — persist hash but don't notify.
    # We need a baseline before we can detect a change.
    if previous_hash is None:
        _store_marks_hash(roll_number, current_hash)
        return False

    # Marks have changed — notify and update stored hash
    subject_count = len(subjects)
    payload = build_payload(
        category="marks",
        title="📊 Internal marks updated",
        body=f"Marks for {subject_count} subject{'s' if subject_count != 1 else ''} have been updated. Tap to view.",
        deep_link="/app/marks",
        priority="standard",
    )

    notification_queue.enqueue(
        "push_send",
        {"roll_number": roll_number, "notification": payload},
        target_roll=roll_number,
    )

    # Persist the new hash so we can compare on next check
    _store_marks_hash(roll_number, current_hash)

    logger.info("Marks update notification sent to %s (%d subjects)", roll_number, subject_count)
    return True


def _store_marks_hash(roll_number: str, hash_value: str) -> None:
    """Store the current marks hash in notification_history for persistence across restarts."""
    from services.notification_history_service import log_notification
    log_notification(
        roll_number=roll_number,
        category="marks",
        title="[internal] marks hash checkpoint",
        body=f"hash:{hash_value}",
        delivery_status="internal",
    )
