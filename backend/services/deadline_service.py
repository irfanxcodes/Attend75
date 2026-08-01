"""
Deadline Service — Daily evaluation of notice deadlines for push reminders.

Runs daily at 7:00 AM IST (scheduling handled by a threading.Timer loop).
Checks all notices with non-null deadline fields and sends reminders:
- 3 days before: "deadline approaching" (standard priority)
- 1 day before: "final reminder" (high priority)

Skips notices the student has dismissed or whose category they've disabled.
"""

import logging
import threading
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import and_

from db.models.notice import Notice
from db.models.user_notice import UserNotice
from db.session import SessionLocal
from services import notification_queue
from services.notice_dispatcher import _subscribed_students_for_program
from services.payload_builder import build_payload, notice_deep_link
from services.preference_filter import get_or_create_preferences, should_send_notice

logger = logging.getLogger(__name__)

IST = timezone(timedelta(hours=5, minutes=30))


def run_deadline_evaluation() -> int:
    """
    Check all notices with upcoming deadlines and enqueue reminders.
    Groups multiple same-day deadlines into a single notification per user
    to avoid sending N separate notifications when N deadlines fall on the same day.
    Returns total push_send jobs enqueued.
    """
    today_ist = datetime.now(IST).date()
    three_days = today_ist + timedelta(days=3)
    one_day = today_ist + timedelta(days=1)

    enqueued = 0

    with SessionLocal() as session:
        notices = (
            session.query(Notice)
            .filter(
                Notice.processing_status == "done",
                Notice.deadline.isnot(None),
                Notice.deadline.in_([three_days, one_day]),
            )
            .all()
        )

        if not notices:
            return 0

        # Group by days_left so we can consolidate per-user per-urgency-bucket
        notices_by_days: dict[int, list] = {}
        for notice in notices:
            days_left = (notice.deadline - today_ist).days
            if days_left in (1, 3):
                notices_by_days.setdefault(days_left, []).append(notice)

        for days_left, day_notices in notices_by_days.items():
            reminder_type = "final" if days_left == 1 else "approaching"
            priority = "high" if days_left == 1 else "standard"

            # Collect all targets across all notices for this urgency bucket
            # Map: roll → set of notice_ids they should receive
            targets_notices: dict[str, list] = {}
            for notice in day_notices:
                targets = _subscribed_students_for_program(notice.source_program)

                dismissed_rows = (
                    session.query(UserNotice.user_id, UserNotice.notice_id)
                    .filter(
                        UserNotice.user_id.in_(targets),
                        UserNotice.notice_id == notice.notice_id,
                        UserNotice.dismissed.is_(True),
                    )
                    .all()
                )
                dismissed_set = {row.user_id for row in dismissed_rows}

                for roll in targets:
                    if roll in dismissed_set:
                        continue
                    prefs = get_or_create_preferences(roll)
                    if not should_send_notice(prefs, notice.category):
                        continue
                    targets_notices.setdefault(roll, []).append(notice)

            # Send ONE notification per user for this urgency bucket
            for roll, user_notices in targets_notices.items():
                if len(user_notices) == 1:
                    # Single deadline — specific notification
                    notice = user_notices[0]
                    title = f"{'⚠️ Final: ' if reminder_type == 'final' else ''}Deadline in {days_left} day{'s' if days_left > 1 else ''}"
                    deadline_str = "Tomorrow" if days_left == 1 else f"Due {notice.deadline.strftime('%d/%m/%Y')}"
                    body = f"{notice.title[:80]} — {deadline_str}"
                else:
                    # Multiple deadlines — consolidated notification
                    title = f"{'⚠️ ' if reminder_type == 'final' else ''}{len(user_notices)} deadlines {'tomorrow' if days_left == 1 else 'in 3 days'}"
                    body = ", ".join(n.title[:40] for n in user_notices[:3])
                    if len(user_notices) > 3:
                        body += f" and {len(user_notices) - 3} more"

                payload = build_payload(
                    category="notice",
                    title=title,
                    body=body,
                    deep_link=notice_deep_link(user_notices[0].notice_id) if len(user_notices) == 1 else "/app/notices",
                    priority=priority,
                )
                notification_queue.enqueue(
                    "push_send",
                    {"roll_number": roll, "notification": payload},
                    target_roll=roll,
                    priority=1 if priority == "high" else 0,
                )
                enqueued += 1

    logger.info("Deadline evaluation: %d reminders enqueued", enqueued)
    return enqueued


class DeadlineScheduler:
    """Daily 7:00 AM IST timer that runs run_deadline_evaluation."""

    def __init__(self):
        self._running = False
        self._timer: threading.Timer | None = None

    def start(self) -> None:
        self._running = True
        self._schedule_next()
        logger.info("DeadlineScheduler started")

    def stop(self) -> None:
        self._running = False
        if self._timer:
            self._timer.cancel()

    def _schedule_next(self) -> None:
        if not self._running:
            return
        # Calculate seconds until next 7:00 AM IST
        now_ist = datetime.now(IST)
        target = now_ist.replace(hour=7, minute=0, second=0, microsecond=0)
        if now_ist >= target:
            target += timedelta(days=1)
        delay = (target - now_ist).total_seconds()
        self._timer = threading.Timer(delay, self._run_cycle)
        self._timer.daemon = True
        self._timer.start()

    def _run_cycle(self) -> None:
        try:
            run_deadline_evaluation()
        except Exception:
            logger.exception("DeadlineScheduler cycle failed")
        finally:
            self._schedule_next()


deadline_scheduler = DeadlineScheduler()
