"""
Nudge Service — Re-engagement notifications for inactive students.

Runs daily at 10:00 AM IST. Sends a nudge if:
- Student hasn't logged in for 3+ days
- Student hasn't been nudged in the last 7 days
- Student has been seen within the last 14 days (not churned)
"""

import logging
import threading
from datetime import datetime, timedelta, timezone

from db.models.notification_history import NotificationHistory
from db.models.push_subscription import PushSubscription
from db.models.student_registry import StudentRegistry
from db.session import SessionLocal
from services import notification_queue
from services.payload_builder import build_payload
from services.preference_filter import get_or_create_preferences, should_send

logger = logging.getLogger(__name__)

IST = timezone(timedelta(hours=5, minutes=30))


def should_nudge(days_since_last_seen: int, days_since_last_nudge: int | None) -> bool:
    """
    Eligibility check (Property 36):
    - 3 <= days_since_last_seen <= 14
    - No nudge sent in the last 7 days (or never nudged before)
    """
    if days_since_last_seen < 3:
        return False
    if days_since_last_seen > 14:
        return False
    if days_since_last_nudge is not None and days_since_last_nudge < 7:
        return False
    return True


def run_nudge_evaluation() -> int:
    """
    Evaluate all premium students for nudge eligibility and enqueue notifications.
    Returns count of nudge jobs enqueued.
    """
    now = datetime.now(timezone.utc)
    enqueued = 0

    with SessionLocal() as session:
        # Get all push-subscribed students
        students = (
            session.query(
                PushSubscription.roll_number,
                StudentRegistry.last_seen_at,
            )
            .join(StudentRegistry, StudentRegistry.roll_number == PushSubscription.roll_number)
            .distinct()
            .all()
        )

        for roll_number, last_seen_at in students:
            if not last_seen_at:
                continue

            days_since_last_seen = (now - last_seen_at).days

            # Check last nudge
            last_nudge = (
                session.query(NotificationHistory.created_at)
                .filter(
                    NotificationHistory.roll_number == roll_number,
                    NotificationHistory.category == "nudge",
                )
                .order_by(NotificationHistory.created_at.desc())
                .first()
            )
            days_since_last_nudge = None
            if last_nudge:
                days_since_last_nudge = (now - last_nudge.created_at).days

            if not should_nudge(days_since_last_seen, days_since_last_nudge):
                continue

            # Respect the student's notification preferences — check weekly_summary_enabled
            # as the closest opt-out toggle (nudge is a re-engagement feature).
            # We use daily_digest_enabled as the gate: if a student turned off digests
            # they likely want fewer proactive notifications.
            prefs = get_or_create_preferences(roll_number)
            if not should_send(prefs, "daily_digest_enabled"):
                continue

            # Build contextual nudge message (not generic)
            unread_notices = _count_unread_notices(roll_number, session)
            upcoming_deadlines = _count_upcoming_deadlines(session)

            body_parts = []
            if unread_notices > 0:
                body_parts.append(f"{unread_notices} new notice{'s' if unread_notices > 1 else ''}")
            if upcoming_deadlines > 0:
                body_parts.append(f"{upcoming_deadlines} upcoming deadline{'s' if upcoming_deadlines > 1 else ''}")

            if body_parts:
                body = f"You have {' and '.join(body_parts)}. Tap to check."
            else:
                body = f"You haven't checked attendance in {days_since_last_seen} days. Tap to see if anything changed."

            payload = build_payload(
                category="nudge",
                title="👋 We miss you! Updates waiting",
                body=body,
                deep_link="/app/dashboard",
                priority="standard",
            )
            notification_queue.enqueue(
                "push_send",
                {"roll_number": roll_number, "notification": payload},
                target_roll=roll_number,
            )
            enqueued += 1

    logger.info("Nudge evaluation: %d nudges enqueued", enqueued)
    return enqueued


class NudgeScheduler:
    """Daily 10:00 AM IST scheduler."""

    def __init__(self):
        self._running = False
        self._timer: threading.Timer | None = None

    def start(self) -> None:
        self._running = True
        self._schedule_next()
        logger.info("NudgeScheduler started")

    def stop(self) -> None:
        self._running = False
        if self._timer:
            self._timer.cancel()

    def _schedule_next(self) -> None:
        if not self._running:
            return
        now_ist = datetime.now(IST)
        target = now_ist.replace(hour=10, minute=0, second=0, microsecond=0)
        if now_ist >= target:
            target += timedelta(days=1)
        delay = (target - now_ist).total_seconds()
        self._timer = threading.Timer(delay, self._run_cycle)
        self._timer.daemon = True
        self._timer.start()

    def _run_cycle(self) -> None:
        try:
            run_nudge_evaluation()
        except Exception:
            logger.exception("NudgeScheduler cycle failed")
        finally:
            self._schedule_next()


nudge_scheduler = NudgeScheduler()


def _count_unread_notices(roll_number: str, session) -> int:
    """Count notices not yet opened by this student (recent ones)."""
    from db.models.notice import Notice
    from db.models.user_notice import UserNotice
    from datetime import timedelta

    cutoff = datetime.utcnow() - timedelta(days=7)
    total_recent = (
        session.query(Notice)
        .filter(Notice.processing_status == "done", Notice.created_at >= cutoff)
        .count()
    )
    opened = (
        session.query(UserNotice)
        .filter(UserNotice.user_id == roll_number, UserNotice.opened_at.isnot(None))
        .count()
    )
    return max(0, total_recent - opened)


def _count_upcoming_deadlines(session) -> int:
    """Count notices with deadlines in the next 7 days."""
    from db.models.notice import Notice
    from datetime import timedelta, timezone

    ist = timezone(timedelta(hours=5, minutes=30))
    today = datetime.now(ist).date()
    week_ahead = today + timedelta(days=7)

    return (
        session.query(Notice)
        .filter(
            Notice.processing_status == "done",
            Notice.deadline.isnot(None),
            Notice.deadline >= today,
            Notice.deadline <= week_ahead,
        )
        .count()
    )
