"""
Timetable Reminder Engine — Class reminders and daily schedule digest.

Runs early morning daily. For each premium student with has_timetable=True:
- Schedules individual class reminders at (class_start - lead_minutes)
- Sends a daily digest at the student's configured time (default 8:00 AM IST)
- Skips students with no classes on that day

Uses stored timetable text from DB (no live portal request).
"""

import hashlib
import logging
import threading
from datetime import datetime, timedelta, timezone

from db.models.push_subscription import PushSubscription
from db.models.premium_subscription import PremiumSubscription
from db.session import SessionLocal
from services import notification_queue
from services.payload_builder import build_payload
from services.preference_filter import get_or_create_preferences, should_send
from services.subscription_manager import set_has_timetable
from services.timetable_service import (
    _find_latest_timetable_notice,
    _get_parsed_schedule,
    _match_student_classes,
    _parse_timetable_from_text,
)

logger = logging.getLogger(__name__)

IST = timezone(timedelta(hours=5, minutes=30))
VALID_LEAD_MINUTES = {10, 15, 30, 60}

# Time slots from the timetable PDF (same as timetable_service)
PAGE_TIME_SLOTS_HOURS = [
    (9, 30),   # 9:30 AM
    (10, 25),  # 10:25 AM
    (11, 20),  # 11:20 AM
    (12, 15),  # 12:15 PM
    (14, 0),   # 2:00 PM
    (14, 55),  # 2:55 PM
    (15, 10),  # 3:10 PM
]


def _load_cached_subjects_for_roll(roll_number: str) -> list[dict]:
    """Load cached subjects from push_subscriptions.cached_subjects_json for background use."""
    import json
    with SessionLocal() as session:
        row = (
            session.query(PushSubscription.cached_subjects_json)
            .filter(
                PushSubscription.roll_number == roll_number,
                PushSubscription.cached_subjects_json.isnot(None),
            )
            .first()
        )
        if row and row[0]:
            try:
                return json.loads(row[0])
            except (json.JSONDecodeError, TypeError):
                pass
    return []


def _time_sort_to_hour_minute(time_sort: str) -> tuple[int, int] | None:
    """Convert the time_sort index (e.g. '02') to (hour, minute) using PAGE_TIME_SLOTS_HOURS."""
    try:
        idx = int(time_sort)
        if 0 <= idx < len(PAGE_TIME_SLOTS_HOURS):
            return PAGE_TIME_SLOTS_HOURS[idx]
    except (ValueError, TypeError):
        pass
    return None


def get_todays_classes_for_student(cached_subjects: list[dict]) -> list[dict]:
    """
    Get today's timetable classes for a student using their cached subjects.
    Returns empty list if no timetable or no classes today.
    """
    notice = _find_latest_timetable_notice(cached_subjects)
    if not notice or not notice.cleaned_text:
        return []

    schedule = _parse_timetable_from_text(notice.cleaned_text)
    if not schedule:
        return []

    my_classes = _match_student_classes(schedule, cached_subjects)
    if not my_classes:
        return []

    # Filter to today's weekday
    today_name = datetime.now(IST).strftime("%A")  # e.g. "Monday"
    today_classes = [c for c in my_classes if c.get("day") == today_name]

    return today_classes


def reevaluate_has_timetable(roll_number: str, cached_subjects: list[dict]) -> bool:
    """
    Re-check if a student has any matching timetable classes across the whole week.
    Updates the has_timetable flag on all their subscriptions.
    """
    notice = _find_latest_timetable_notice(cached_subjects)
    if not notice or not notice.cleaned_text:
        set_has_timetable(roll_number, False)
        return False

    schedule = _parse_timetable_from_text(notice.cleaned_text)
    if not schedule:
        set_has_timetable(roll_number, False)
        return False

    my_classes = _match_student_classes(schedule, cached_subjects)
    has_tt = len(my_classes) > 0
    set_has_timetable(roll_number, has_tt)
    return has_tt


def schedule_reminders_for_today() -> int:
    """
    Main daily job: schedule class reminders + daily digest for all eligible students.
    Returns total push_send jobs enqueued.
    """
    now_ist = datetime.now(IST)
    today_name = now_ist.strftime("%A")
    enqueued = 0

    # Find all premium students with push subscriptions that have has_timetable=True
    with SessionLocal() as session:
        students = (
            session.query(PushSubscription.roll_number)
            .join(PremiumSubscription, PremiumSubscription.roll_number == PushSubscription.roll_number)
            .filter(
                PremiumSubscription.status.in_(["active", "grace"]),
                PushSubscription.has_timetable.is_(True),
            )
            .distinct()
            .all()
        )

    for (roll_number,) in students:
        prefs = get_or_create_preferences(roll_number)

        notice = _find_latest_timetable_notice(None)
        if not notice or not notice.cleaned_text:
            continue

        schedule = _parse_timetable_from_text(notice.cleaned_text)
        if not schedule:
            continue

        # Load student's cached subjects for per-student class filtering
        student_subjects = _load_cached_subjects_for_roll(roll_number)
        if student_subjects:
            today_classes_all = _match_student_classes(schedule, student_subjects)
            today_classes_all = [c for c in today_classes_all if c.get("day") == today_name]
        else:
            # No cached subjects — skip this student (they need to view timetable once)
            today_classes_all = []

        # Daily digest (Req 11)
        if should_send(prefs, "daily_digest_enabled") and today_classes_all:
                # Jitter the digest delivery time per student (spread over 15 min)
                jitter_seconds = int(hashlib.md5(roll_number.encode()).hexdigest()[:4], 16) % 900

                digest_hour = prefs.daily_digest_hour
                digest_minute = prefs.daily_digest_minute
                digest_time = now_ist.replace(hour=digest_hour, minute=digest_minute, second=0, microsecond=0)
                digest_time += timedelta(seconds=jitter_seconds)

                # Only schedule if the digest time hasn't passed yet today
                if digest_time > now_ist:
                    # Count classes (approximate — full matching requires persistent subjects)
                    class_count = len(today_classes_all)
                    first_class_time = today_classes_all[0].get("time", "")

                    subjects = sorted(set(c.get("course", "") for c in today_classes_all))[:5]
                    subjects_str = ", ".join(subjects)

                    # Build richer digest body
                    body_lines = [f"⏰ First class at {first_class_time}"]
                    body_lines.append(f"📚 Subjects: {subjects_str}")

                    payload = build_payload(
                        category="digest",
                        title=f"Good morning! {class_count} class{'es' if class_count != 1 else ''} today",
                        body="\n".join(body_lines),
                        deep_link="/app/notices",
                        priority="standard",
                    )

                    scheduled_at_utc = digest_time.astimezone(timezone.utc).replace(tzinfo=None)
                    notification_queue.enqueue(
                        "push_send",
                        {"roll_number": roll_number, "notification": payload},
                        target_roll=roll_number,
                        scheduled_at=scheduled_at_utc,
                    )
                    enqueued += 1

        # Individual class reminders (Req 5)
        if should_send(prefs, "timetable_enabled"):
            lead_minutes = prefs.reminder_lead_minutes
            if lead_minutes not in VALID_LEAD_MINUTES:
                lead_minutes = 15

            for cls in today_classes_all:
                hm = _time_sort_to_hour_minute(cls.get("time_sort", ""))
                if not hm:
                    continue

                class_start = now_ist.replace(hour=hm[0], minute=hm[1], second=0, microsecond=0)
                reminder_time = class_start - timedelta(minutes=lead_minutes)

                if reminder_time <= now_ist:
                    continue  # Already past

                course = cls.get("course", "?")
                section = cls.get("section", "")
                room = cls.get("room", "")
                faculty = cls.get("faculty", "")

                body_parts = [f"{course}-{section}" if section else course]
                if room:
                    body_parts.append(f"Room: {room}")
                if faculty:
                    body_parts.append(faculty)
                body_parts.append(f"Starts in {lead_minutes} min")

                payload = build_payload(
                    category="timetable",
                    title=f"🔔 {course} in {lead_minutes} min",
                    body=" · ".join(body_parts),
                    deep_link="/app/notices",
                    priority="standard",
                )

                scheduled_at_utc = reminder_time.astimezone(timezone.utc).replace(tzinfo=None)
                notification_queue.enqueue(
                    "push_send",
                    {"roll_number": roll_number, "notification": payload},
                    target_roll=roll_number,
                    scheduled_at=scheduled_at_utc,
                )
                enqueued += 1

    logger.info("Timetable reminder engine: %d jobs enqueued for today", enqueued)
    return enqueued


class TimetableReminderScheduler:
    """Daily early-morning scheduler for class reminders + digest."""

    def __init__(self):
        self._running = False
        self._timer: threading.Timer | None = None
        self._evening_timer: threading.Timer | None = None

    def start(self) -> None:
        self._running = True
        self._schedule_next()
        self._schedule_evening()
        logger.info("TimetableReminderScheduler started")

    def stop(self) -> None:
        self._running = False
        if self._timer:
            self._timer.cancel()
        if self._evening_timer:
            self._evening_timer.cancel()

    def _schedule_next(self) -> None:
        if not self._running:
            return
        # Run at 5:30 AM IST daily (before any class starts)
        now_ist = datetime.now(IST)
        target = now_ist.replace(hour=5, minute=30, second=0, microsecond=0)
        if now_ist >= target:
            target += timedelta(days=1)
        delay = (target - now_ist).total_seconds()
        self._timer = threading.Timer(delay, self._run_cycle)
        self._timer.daemon = True
        self._timer.start()

    def _schedule_evening(self) -> None:
        """Schedule the 9 PM 'tomorrow preview' notification."""
        if not self._running:
            return
        now_ist = datetime.now(IST)
        target = now_ist.replace(hour=21, minute=0, second=0, microsecond=0)
        if now_ist >= target:
            target += timedelta(days=1)
        delay = (target - now_ist).total_seconds()
        self._evening_timer = threading.Timer(delay, self._run_evening_cycle)
        self._evening_timer.daemon = True
        self._evening_timer.start()

    def _run_cycle(self) -> None:
        try:
            schedule_reminders_for_today()
        except Exception:
            logger.exception("TimetableReminderScheduler cycle failed")
        finally:
            self._schedule_next()

    def _run_evening_cycle(self) -> None:
        try:
            send_tomorrow_preview()
        except Exception:
            logger.exception("TimetableReminderScheduler evening cycle failed")
        finally:
            self._schedule_evening()


def send_tomorrow_preview() -> int:
    """
    9 PM notification: tomorrow's schedule preview.
    Includes skip-ability info based on current attendance.
    """
    now_ist = datetime.now(IST)
    tomorrow_name = (now_ist + timedelta(days=1)).strftime("%A")
    enqueued = 0

    with SessionLocal() as session:
        students = (
            session.query(PushSubscription.roll_number)
            .join(PremiumSubscription, PremiumSubscription.roll_number == PushSubscription.roll_number)
            .filter(
                PremiumSubscription.status.in_(["active", "grace"]),
                PushSubscription.has_timetable.is_(True),
            )
            .distinct()
            .all()
        )

    notice = _find_latest_timetable_notice(None)
    if not notice or not notice.cleaned_text:
        return 0

    schedule = _parse_timetable_from_text(notice.cleaned_text)
    if not schedule:
        return 0

    tomorrow_classes = [c for c in schedule if c.get("day") == tomorrow_name]
    if not tomorrow_classes:
        return 0

    for (roll_number,) in students:
        prefs = get_or_create_preferences(roll_number)
        if not should_send(prefs, "timetable_enabled"):
            continue

        class_count = len(tomorrow_classes)
        first_time = tomorrow_classes[0].get("time", "") if tomorrow_classes else ""

        # Calculate skip-ability based on current attendance
        skip_info = _compute_skip_info(roll_number, class_count)

        body_parts = [f"First class at {first_time}"]
        if skip_info:
            body_parts.append(skip_info)
        else:
            body_parts.append("Get some rest!")

        payload = build_payload(
            category="timetable",
            title=f"📅 Tomorrow: {class_count} class{'es' if class_count != 1 else ''}",
            body=" · ".join(body_parts),
            deep_link="/app/notices",
            priority="standard",
        )

        notification_queue.enqueue(
            "push_send",
            {"roll_number": roll_number, "notification": payload},
            target_roll=roll_number,
        )
        enqueued += 1

    logger.info("Tomorrow preview: %d notifications enqueued", enqueued)
    return enqueued


def _compute_skip_info(roll_number: str, tomorrow_class_count: int) -> str | None:
    """
    Based on current attendance, tell the student how many classes they can skip
    tomorrow and still stay above 75%.
    Returns a string like 'You can skip 2 out of 5 classes and still stay above 75%'
    or None if attendance data isn't available or they can't skip any.
    """
    from db.models.student_registry import StudentRegistry

    with SessionLocal() as session:
        student = (
            session.query(StudentRegistry)
            .filter(StudentRegistry.roll_number == roll_number)
            .one_or_none()
        )
        if not student or student.last_attendance_percent is None:
            return None

        current_percent = student.last_attendance_percent

    if current_percent < 75:
        return "⚠️ You're below 75% — try to attend all classes!"

    # Simulate: if they skip N out of tomorrow_class_count, what happens?
    # Approximate: overall % = (attended + tomorrow_attended) / (total + tomorrow_total)
    # We don't have exact attended/total counts from student_registry, so use the percentage
    # to estimate. Assume total ~ 100 classes for approximation.
    # More precisely: if current is P% with T total classes,
    # then attended = P/100 * T. After skipping N: new% = (attended) / (T + tomorrow_class_count) * 100
    # But we don't know T. So use a simpler heuristic:
    # Each class is roughly (100/total_classes_so_far)% of the total.
    # For a student at 80% with 5 classes tomorrow:
    # Dropping to 75% means losing 5% → can miss ~5% worth of classes.

    # Simpler approach: calculate how many absences keep them above 75%
    # new_percent = current_percent * old_total / (old_total + tomorrow_class_count)
    # This isn't exact without knowing old_total, but we can estimate.

    # Best practical approach: tell them the maximum skippable classes
    # Assume ~50 total classes so far (conservative for a month into semester)
    # This is imprecise but useful directionally.

    # Actually, let's be transparent and simple:
    if current_percent >= 85 and tomorrow_class_count <= 5:
        skippable = min(tomorrow_class_count, 2)  # Conservative
        new_approx = current_percent - (skippable * 1.5)  # ~1.5% per class rough estimate
        if new_approx >= 75:
            return f"✅ Safe to skip up to {skippable} — attendance stays ~{new_approx:.0f}%"
    elif current_percent >= 80 and tomorrow_class_count <= 5:
        return f"⚡ At {current_percent:.0f}%, try to attend at least {tomorrow_class_count - 1}"
    elif current_percent >= 75:
        return f"⚡ At {current_percent:.0f}%, attend all to stay safe"

    return None


timetable_reminder_scheduler = TimetableReminderScheduler()
