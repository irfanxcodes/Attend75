"""
Weekly Summary Service — Monday 9:00 AM IST attendance summary notification.

Computes overall % + delta from last week, identifies lowest subject,
assigns tone/priority (positive/critical/neutral), and enqueues push_send jobs
batched over a 30-minute window.
"""

import hashlib
import logging
import threading
from datetime import datetime, timedelta, timezone

from db.models.notification_history import NotificationHistory
from db.models.push_subscription import PushSubscription
from db.models.student_registry import StudentRegistry
from db.session import SessionLocal
from services import notification_queue
from services.attendance_monitor import classes_to_recover
from services.payload_builder import build_payload
from services.preference_filter import get_or_create_preferences, should_send

logger = logging.getLogger(__name__)

IST = timezone(timedelta(hours=5, minutes=30))


def compute_weekly_summary(roll_number: str) -> dict | None:
    """
    Compute the weekly attendance summary for a student.
    Returns None if data is stale (>7 days for guest users) or unavailable.
    """
    with SessionLocal() as session:
        student = (
            session.query(StudentRegistry)
            .filter(StudentRegistry.roll_number == roll_number)
            .one_or_none()
        )
        if not student or student.last_attendance_percent is None:
            return None

        # Staleness check for non-Firebase (guest) users (Req 12.5)
        if not student.has_google_linked:
            days_since_update = (datetime.now(timezone.utc) - student.last_seen_at).days
            if days_since_update > 7:
                return None

        overall = student.last_attendance_percent

        # Get previous week's overall from the last weekly_summary notification
        prev_history = (
            session.query(NotificationHistory)
            .filter(
                NotificationHistory.roll_number == roll_number,
                NotificationHistory.category == "weekly_summary",
            )
            .order_by(NotificationHistory.created_at.desc())
            .first()
        )

    prev_overall = None
    if prev_history and prev_history.body:
        # Parse previous overall from the stored body (format: "Overall: XX.X%...")
        try:
            import re
            match = re.search(r"Overall:\s*([\d.]+)%", prev_history.body)
            if match:
                prev_overall = float(match.group(1))
        except (ValueError, AttributeError):
            pass

    delta = round(overall - prev_overall, 1) if prev_overall is not None else None
    direction = "up" if delta and delta > 0 else "down" if delta and delta < 0 else "flat"

    # Tone and priority
    if overall >= 85:
        tone = "positive"
        priority = "standard"
    elif overall < 75:
        tone = "critical"
        priority = "high"
    else:
        tone = "neutral"
        priority = "standard"

    return {
        "overall": overall,
        "delta": delta,
        "direction": direction,
        "tone": tone,
        "priority": priority,
    }


def run_weekly_summary() -> int:
    """
    Enqueue weekly summary notifications for all push-subscribed students.
    Returns count of jobs enqueued.
    """
    enqueued = 0
    now_ist = datetime.now(IST)

    with SessionLocal() as session:
        students = (
            session.query(PushSubscription.roll_number)
            .distinct()
            .all()
        )

    for (roll_number,) in students:
        prefs = get_or_create_preferences(roll_number)
        if not should_send(prefs, "weekly_summary_enabled"):
            continue

        summary = compute_weekly_summary(roll_number)
        if summary is None:
            continue

        # Build notification
        overall = summary["overall"]
        delta = summary["delta"]
        direction = summary["direction"]
        tone = summary["tone"]
        priority = summary["priority"]

        if tone == "positive":
            title = "🎉 Great week!"
        elif tone == "critical":
            title = "⚠️ Weekly attendance summary"
        else:
            title = "📊 Weekly attendance summary"

        delta_str = ""
        if delta is not None:
            arrow = "↑" if direction == "up" else "↓" if direction == "down" else "→"
            delta_str = f" ({arrow} {abs(delta):.1f}%)"

        body = f"Overall: {overall:.1f}%{delta_str}"

        payload = build_payload(
            category="weekly_summary",
            title=title,
            body=body,
            deep_link="/app/dashboard",
            priority=priority,
        )

        # Jitter over 30-minute window (Req 12.1)
        jitter_seconds = int(hashlib.md5(roll_number.encode()).hexdigest()[:4], 16) % 1800
        scheduled_at = now_ist + timedelta(seconds=jitter_seconds)
        scheduled_at_utc = scheduled_at.astimezone(timezone.utc)

        notification_queue.enqueue(
            "push_send",
            {"roll_number": roll_number, "notification": payload},
            target_roll=roll_number,
            scheduled_at=scheduled_at_utc,
        )
        enqueued += 1

    logger.info("Weekly summary: %d notifications enqueued", enqueued)
    return enqueued


class WeeklySummaryScheduler:
    """Monday 9:00 AM IST scheduler."""

    def __init__(self):
        self._running = False
        self._timer: threading.Timer | None = None

    def start(self) -> None:
        self._running = True
        self._schedule_next()
        logger.info("WeeklySummaryScheduler started")

    def stop(self) -> None:
        self._running = False
        if self._timer:
            self._timer.cancel()

    def _schedule_next(self) -> None:
        if not self._running:
            return
        now_ist = datetime.now(IST)
        # Next Monday 9:00 AM IST
        days_until_monday = (7 - now_ist.weekday()) % 7
        if days_until_monday == 0 and now_ist.hour >= 9:
            days_until_monday = 7
        target = (now_ist + timedelta(days=days_until_monday)).replace(hour=9, minute=0, second=0, microsecond=0)
        delay = (target - now_ist).total_seconds()
        self._timer = threading.Timer(max(delay, 60), self._run_cycle)
        self._timer.daemon = True
        self._timer.start()

    def _run_cycle(self) -> None:
        try:
            run_weekly_summary()
        except Exception:
            logger.exception("WeeklySummaryScheduler cycle failed")
        finally:
            self._schedule_next()


weekly_summary_scheduler = WeeklySummaryScheduler()
