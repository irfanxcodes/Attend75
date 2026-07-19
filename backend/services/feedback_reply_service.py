"""
Feedback Reply Service — Sends a push notification reply to a student who submitted feedback.

Matches the feedback entry's user_name to a roll_number via student_registry,
then enqueues a push_send notification job for that student.
"""

import logging
from datetime import datetime

from db.models.feedback_entry import FeedbackEntry
from db.models.student_registry import StudentRegistry
from db.session import SessionLocal
from services import notification_queue
from services.feedback_service import update_feedback_status
from services.payload_builder import build_payload

logger = logging.getLogger(__name__)


def reply_to_feedback(feedback_id: str, reply_message: str) -> dict | None:
    """
    Send a push notification reply to the student who submitted feedback.
    Also marks the feedback as 'reviewed'.

    Returns {sent: bool, roll_number: str|None, message: str} or None if feedback not found.
    """
    with SessionLocal() as session:
        entry = session.query(FeedbackEntry).filter(FeedbackEntry.id == feedback_id).one_or_none()
        if entry is None:
            return None

        user_name = entry.user_name or ""
        feedback_message = entry.message or ""

    # Try to find the student's roll number by matching display_name in student_registry
    roll_number = _resolve_roll_number(user_name)

    if not roll_number:
        # Mark as reviewed but can't deliver notification
        update_feedback_status(feedback_id, "reviewed")
        return {
            "sent": False,
            "roll_number": None,
            "message": f"Could not find student '{user_name}' — feedback marked reviewed but no notification sent.",
        }

    # Build and enqueue the push notification
    payload = build_payload(
        category="broadcast",
        title="💬 Reply to your feedback",
        body=reply_message[:200],
        deep_link="/app/profile",
        priority="standard",
    )

    notification_queue.enqueue(
        "push_send",
        {"roll_number": roll_number, "notification": payload},
        target_roll=roll_number,
    )

    # Mark feedback as reviewed
    update_feedback_status(feedback_id, "reviewed")

    logger.info("Feedback reply sent to %s (roll=%s) for feedback_id=%s", user_name, roll_number, feedback_id)
    return {
        "sent": True,
        "roll_number": roll_number,
        "message": f"Reply notification queued for {user_name} ({roll_number})",
    }


def _resolve_roll_number(user_name: str) -> str | None:
    """
    Resolve a display_name to a roll_number using student_registry.
    Falls back to checking if user_name itself IS a roll number.
    """
    if not user_name or user_name.lower() == "anonymous":
        return None

    normalized = user_name.strip().upper()

    with SessionLocal() as session:
        # First: check if user_name is literally a roll number
        direct = session.query(StudentRegistry).filter(
            StudentRegistry.roll_number == normalized
        ).one_or_none()
        if direct:
            return direct.roll_number

        # Second: match by display_name (case-insensitive)
        by_name = session.query(StudentRegistry).filter(
            StudentRegistry.display_name.ilike(user_name.strip())
        ).order_by(StudentRegistry.last_seen_at.desc()).first()
        if by_name:
            return by_name.roll_number

    return None
