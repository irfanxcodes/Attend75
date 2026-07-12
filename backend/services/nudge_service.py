"""
Nudge Service — Re-engagement notifications for inactive premium students.

Runs daily at 10:00 AM IST. Sends a nudge if:
- Student hasn't logged in for 3+ days
- Student hasn't been nudged in the last 7 days
- Student has been seen within the last 14 days (not churned)
"""

import logging
import threading
from datetime import datetime, timedelta, timezone

from db.models.notification_history import NotificationHistory
from db.models.premium_subscription import PremiumSubscription
from db.models.push_subscription import PushSubscription
from db.models.student_registry import StudentRegistry
from db.session import SessionLocal
from services import notification_queue
from services.payload_builder import build_payload
from services.premium_service import is_premium

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
    now = datetime.utcnow()
    enqueued = 0

    with SessionLocal() as session:
        # Get all premium subscribed students
        students = (
            session.query(
                PushSubscription.roll_number,
                StudentRegistry.last_seen_at,
            )
            .join(PremiumSubscription, PremiumSubscription.roll_number == PushSubscription.roll_number)
            .join(StudentRegistry, StudentRegistry.roll_number == PushSubscription.roll_number)
            .filter(PremiumSubscription.status.in_(["active", "grace"]))
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

            payload = build_payload(
                category="nudge",
                title="👋 We miss you!",
                body=f"You haven't checked attendance in {days_since_last_seen} days. Tap to see if anything changed.",
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
