"""
Marks Notification Service — Notifies premium students when new marks are available.

Triggered after a successful consolidated marks fetch. Detects if the marks
data has changed (new subjects or updated scores) and sends a push notification.
"""

import logging
from datetime import datetime

from db.session import SessionLocal
from services import notification_queue
from services.payload_builder import build_payload
from services.preference_filter import get_or_create_preferences, should_send
from services.premium_service import is_premium

logger = logging.getLogger(__name__)

# Simple in-memory cache of last-known marks hash per student to detect changes
_marks_hash_cache: dict[str, str] = {}


def check_and_notify_marks_update(roll_number: str, marks_data: dict) -> bool:
    """
    Check if marks data has changed since last check. If so, notify the student.
    Returns True if a notification was sent.

    Called from the marks fetch path (auth_service.fetch_consolidated_marks or similar).
    """

    prefs = get_or_create_preferences(roll_number)
    if not should_send(prefs, "notices_enabled"):  # Reuse notices toggle for marks alerts
        return False

    # Compute a simple hash of the marks data to detect changes
    subjects = marks_data.get("subjects", [])
    if not subjects:
        return False

    # Hash: subject codes + their total marks
    hash_parts = []
    for subj in sorted(subjects, key=lambda s: s.get("code", "")):
        code = subj.get("code", "")
        total = subj.get("total", subj.get("totalMarks", ""))
        hash_parts.append(f"{code}:{total}")
    current_hash = "|".join(hash_parts)

    # Check if changed
    previous_hash = _marks_hash_cache.get(roll_number)
    if previous_hash == current_hash:
        return False  # No change

    _marks_hash_cache[roll_number] = current_hash

    # Don't notify on first fetch (no previous data to compare against)
    if previous_hash is None:
        return False

    # Marks have changed — notify
    subject_count = len(subjects)
    payload = build_payload(
        category="notice",
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
    logger.info("Marks update notification sent to %s (%d subjects)", roll_number, subject_count)
    return True
