"""
Student Registry Service

Tracks unique students by roll_number.
Called on every successful login (guest or Google-linked).
"""

from datetime import datetime

from db.models.student_registry import StudentRegistry
from db.session import SessionLocal


def register_student_login(roll_number: str, method: str = "guest", display_name: str | None = None) -> None:
    """
    Register or update a student's login record.

    Args:
        roll_number: The student's unique college roll number.
        method: 'guest' or 'google' — how they logged in this time.
        display_name: The student's name (from portal scraper or Firebase).
    """
    normalized_roll = (roll_number or "").strip().upper()
    if not normalized_roll:
        return

    normalized_method = (method or "guest").strip().lower()
    normalized_name = (display_name or "").strip() or None
    now = datetime.utcnow()

    with SessionLocal() as session:
        record = session.query(StudentRegistry).filter(
            StudentRegistry.roll_number == normalized_roll
        ).one_or_none()

        if record is None:
            # First time this student has ever used Attend75
            record = StudentRegistry(
                roll_number=normalized_roll,
                display_name=normalized_name,
                first_seen_at=now,
                last_seen_at=now,
                login_count=1,
                last_login_method=normalized_method,
                created_via=normalized_method,
                has_google_linked=(normalized_method == "google"),
                linked_google_at=now if normalized_method == "google" else None,
            )
            session.add(record)
        else:
            # Returning student
            record.last_seen_at = now
            record.login_count += 1
            record.last_login_method = normalized_method

            # Update name if we have a better one
            if normalized_name and (not record.display_name or record.display_name == normalized_roll):
                record.display_name = normalized_name

            # Permanently mark Google-linked (never reverts)
            if normalized_method == "google" and not record.has_google_linked:
                record.has_google_linked = True
                record.linked_google_at = now

        session.commit()


def mark_google_linked(roll_number: str) -> None:
    """
    Permanently mark a student as Google-linked.
    Called when a student completes credential linking via Firebase.
    """
    normalized_roll = (roll_number or "").strip().upper()
    if not normalized_roll:
        return

    now = datetime.utcnow()

    with SessionLocal() as session:
        record = session.query(StudentRegistry).filter(
            StudentRegistry.roll_number == normalized_roll
        ).one_or_none()

        if record is None:
            record = StudentRegistry(
                roll_number=normalized_roll,
                first_seen_at=now,
                last_seen_at=now,
                login_count=1,
                last_login_method="google",
                created_via="google",
                has_google_linked=True,
                linked_google_at=now,
            )
            session.add(record)
        else:
            if not record.has_google_linked:
                record.has_google_linked = True
                record.linked_google_at = now
            record.last_seen_at = now
            record.last_login_method = "google"

        session.commit()
