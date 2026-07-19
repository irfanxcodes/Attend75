"""
Preference Filter — Shared logic for checking a student's notification preferences.

Used by every dispatcher (notice, deadline, attendance, timetable, digest,
weekly summary) to decide whether a given notification should be sent.
"""

from datetime import datetime, timezone

from db.models.notification_preference import NotificationPreference
from db.session import SessionLocal

# Maps a notice category name to its corresponding NotificationPreference boolean column
CATEGORY_FLAG_MAP = {
    "Exam": "notice_exam",
    "Fee": "notice_fee",
    "Academic": "notice_academic",
    "Internship": "notice_internship",
    "Event": "notice_event",
    "Guest Lecture": "notice_guest_lecture",
    "General": "notice_general",
}


def should_send_notice(prefs: NotificationPreference, notice_category: str | None) -> bool:
    """
    True iff the master 'notices_enabled' toggle is on AND the specific category
    flag (defaulting to notice_general for unknown categories) is enabled.
    """
    if prefs is None:
        return True  # no stored prefs yet => defaults (all enabled)
    if not prefs.notices_enabled:
        return False
    flag_name = CATEGORY_FLAG_MAP.get(notice_category or "General", "notice_general")
    return bool(getattr(prefs, flag_name, True))


def should_send(prefs: NotificationPreference | None, master_flag: str) -> bool:
    """
    Generic master-toggle check, e.g. should_send(prefs, 'attendance_enabled').
    """
    if prefs is None:
        return True
    return bool(getattr(prefs, master_flag, True))


_UPDATABLE_FIELDS = {
    "notices_enabled",
    "attendance_enabled",
    "timetable_enabled",
    "daily_digest_enabled",
    "weekly_summary_enabled",
    "notice_exam",
    "notice_fee",
    "notice_academic",
    "notice_internship",
    "notice_event",
    "notice_guest_lecture",
    "notice_general",
    "reminder_lead_minutes",
    "daily_digest_hour",
    "daily_digest_minute",
}

VALID_LEAD_MINUTES = {10, 15, 30, 60}


def update_preferences(roll_number: str, updates: dict) -> NotificationPreference:
    """
    Apply a partial update to a student's NotificationPreference row (creating
    it with defaults first if needed). Only known, non-None fields in
    `updates` are applied; reminder_lead_minutes is validated against
    VALID_LEAD_MINUTES and falls back to 15 if invalid (Req 5.4 / Property 15).
    """
    get_or_create_preferences(roll_number)  # ensure a row exists

    with SessionLocal() as session:
        prefs = (
            session.query(NotificationPreference)
            .filter(NotificationPreference.roll_number == roll_number)
            .one()
        )
        for field, value in updates.items():
            if field not in _UPDATABLE_FIELDS or value is None:
                continue
            if field == "reminder_lead_minutes" and value not in VALID_LEAD_MINUTES:
                value = 15
            setattr(prefs, field, value)
        prefs.updated_at = datetime.now(timezone.utc)
        session.commit()
        session.refresh(prefs)
        session.expunge(prefs)
        return prefs


def get_or_create_preferences(roll_number: str) -> NotificationPreference:
    """
    Fetch a student's NotificationPreference row, creating one with model
    defaults (all categories enabled, reminder_lead_minutes=15,
    daily_digest_hour=8, daily_digest_minute=0) if it doesn't exist yet.

    Req 6.5 / Property 18.
    """
    now = datetime.now(timezone.utc)
    with SessionLocal() as session:
        prefs = (
            session.query(NotificationPreference)
            .filter(NotificationPreference.roll_number == roll_number)
            .one_or_none()
        )
        if prefs is None:
            prefs = NotificationPreference(
                roll_number=roll_number,
                created_at=now,
                updated_at=now,
            )
            session.add(prefs)
            session.commit()
            session.refresh(prefs)
        # Detach values into a plain object-like snapshot isn't necessary here;
        # returning the ORM instance is fine since callers use it read-only
        # within the same process (no cross-session lazy-load issues for scalar cols).
        session.expunge(prefs)
        return prefs
