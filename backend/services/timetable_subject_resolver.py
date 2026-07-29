"""
Timetable Subject Resolver — Zero-cost subject caching for push notification reminders.

Resolves each push subscriber's timetable subjects using only data already stored
in the database. Zero portal requests. Called in two situations:

  1. On subscribe (POST /push/subscribe) — uses the session's in-memory attendance
     rows to resolve subjects immediately for the subscribing student.

  2. When a new timetable notice is scraped — parses the timetable once, then
     matches every push subscriber against it using their already-cached
     attendance rows (cached_subjects_json). No portal logins needed at all.

How matching works (all in-DB, no network):
  - Parse the timetable notice's cleaned_text (already in DB) into schedule entries.
  - For students WITH cached_subjects_json: run _match_student_classes directly.
    If we get ≥1 match, their has_timetable = True and subjects stay as-is.
  - For students WITHOUT cached_subjects_json but with cached_attendance_rows
    (stored in-session at login): resolve using the abbr lookup from the notice,
    then match. This handles students who subscribed and logged in but never
    viewed the timetable page.
  - Students with neither (push subscription but no attendance data at all) are
    left for the background_fetcher to resolve on its next 6-hour cycle.
"""

import json
import logging
from typing import TYPE_CHECKING

from db.models.push_subscription import PushSubscription
from db.session import SessionLocal

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def resolve_and_cache_subjects_for_student(
    roll_number: str,
    attendance_rows: list[dict],
) -> bool:
    """
    Resolve timetable subjects from attendance rows and persist to DB.
    Uses only already-scraped timetable notices — zero portal requests.

    Args:
        roll_number: Student roll number.
        attendance_rows: Raw rows from portal scraper, each with at least
            'course_abbr' and 'section'. Same shape as
            scraper.fetch_attendance_for_semester()["attendance"].

    Returns:
        True if subjects were resolved and cached, False otherwise.
    """
    if not attendance_rows:
        return False

    from services.timetable_service import (
        _find_latest_timetable_notice,
        _build_abbr_lookup,
        _extract_subjects,
        _parse_timetable_from_text,
        _match_student_classes,
    )

    # Step 1: find any timetable notice to build the abbr lookup
    bootstrap_notice = _find_latest_timetable_notice(student_subjects=None)
    if not bootstrap_notice or not bootstrap_notice.cleaned_text:
        logger.debug("resolve_and_cache: no timetable notice in DB for %s", roll_number)
        return False

    abbr_lookup = _build_abbr_lookup(bootstrap_notice.cleaned_text)
    subjects = _extract_subjects(attendance_rows, abbr_lookup)
    if not subjects:
        subjects = _extract_subjects(attendance_rows, {})

    if not subjects:
        logger.debug(
            "resolve_and_cache: could not extract subjects from %d rows for %s",
            len(attendance_rows), roll_number,
        )
        return False

    # Step 2: find the timetable notice that MATCHES this student's subjects
    # This is critical — using student_subjects ensures we pick the right notice
    # (e.g. semester 3/5/7 notice, not an induction/deeksharambh notice)
    best_notice = _find_latest_timetable_notice(student_subjects=subjects) or bootstrap_notice

    # Re-build lookup from the best notice (may differ from bootstrap_notice)
    if best_notice.notice_id != bootstrap_notice.notice_id:
        abbr_lookup = _build_abbr_lookup(best_notice.cleaned_text or "")
        resolved = _extract_subjects(attendance_rows, abbr_lookup)
        if resolved:
            subjects = resolved

    schedule = _parse_timetable_from_text(best_notice.cleaned_text or "")
    has_matches = bool(schedule and _match_student_classes(schedule, subjects))

    subjects_json = json.dumps(subjects)
    with SessionLocal() as session:
        if has_matches:
            # Only update has_timetable when we have a confirmed match
            updated = (
                session.query(PushSubscription)
                .filter(PushSubscription.roll_number == roll_number)
                .update(
                    {"cached_subjects_json": subjects_json, "has_timetable": True},
                    synchronize_session=False,
                )
            )
        else:
            # No match found — update subjects but DO NOT flip has_timetable to False
            # if it was already True (a previous run may have matched a different notice)
            updated = (
                session.query(PushSubscription)
                .filter(PushSubscription.roll_number == roll_number)
                .update(
                    {"cached_subjects_json": subjects_json},
                    synchronize_session=False,
                )
            )
        session.commit()

    logger.info(
        "resolve_and_cache: %d subjects cached for %s "
        "(has_timetable=%s, rows_updated=%d)",
        len(subjects), roll_number, has_matches, updated,
    )
    return has_matches


def refresh_all_subscribers_from_timetable(notice_id: int | None = None) -> dict:
    """
    Re-validate every push subscriber's has_timetable flag against timetable notices.
    Zero portal requests — operates entirely on data already in the DB.

    When notice_id is given, validates against that specific notice first, then
    falls back to per-student best-match notice for those who don't match.
    When no notice_id given, uses per-student best-match notice for everyone.

    Returns:
        Stats dict: {total, updated_has_match, updated_no_match, skipped_no_subjects}.
    """
    from services.timetable_service import (
        _find_latest_timetable_notice,
        _parse_timetable_from_text,
        _match_student_classes,
    )
    from db.models.notice import Notice

    # Pre-load specific notice if given
    specific_notice = None
    specific_schedule = None
    if notice_id is not None:
        with SessionLocal() as session:
            specific_notice = session.query(Notice).filter(Notice.notice_id == notice_id).one_or_none()
        if specific_notice and specific_notice.cleaned_text:
            specific_schedule = _parse_timetable_from_text(specific_notice.cleaned_text)
            if specific_schedule:
                logger.info(
                    "refresh_all_subscribers: parsed %d entries from notice %d",
                    len(specific_schedule), specific_notice.notice_id,
                )

    # Load all distinct push subscribers and their cached subjects
    with SessionLocal() as session:
        rows = (
            session.query(
                PushSubscription.roll_number,
                PushSubscription.cached_subjects_json,
            )
            .distinct(PushSubscription.roll_number)
            .all()
        )

    stats = {
        "total": len(rows),
        "updated_has_match": 0,
        "updated_no_match": 0,
        "skipped_no_subjects": 0,
    }

    rolls_with_match: list[str] = []
    rolls_without_match: list[str] = []

    for roll_number, cached_json in rows:
        if not cached_json:
            stats["skipped_no_subjects"] += 1
            continue

        try:
            subjects = json.loads(cached_json)
        except (json.JSONDecodeError, TypeError):
            stats["skipped_no_subjects"] += 1
            continue

        if not subjects:
            stats["skipped_no_subjects"] += 1
            continue

        # Try the specific notice first (fast path for timetable-change dispatch)
        matched = False
        if specific_schedule:
            matched = bool(_match_student_classes(specific_schedule, subjects))

        # If specific notice didn't match, find the best notice for this student
        if not matched:
            best_notice = _find_latest_timetable_notice(student_subjects=subjects)
            if best_notice and best_notice.cleaned_text:
                best_schedule = _parse_timetable_from_text(best_notice.cleaned_text)
                if best_schedule:
                    matched = bool(_match_student_classes(best_schedule, subjects))

        if matched:
            rolls_with_match.append(roll_number)
        else:
            rolls_without_match.append(roll_number)

    # 4. Bulk-update has_timetable in two queries (not N queries)
    _CHUNK = 500  # keep IN clauses manageable
    with SessionLocal() as session:
        for i in range(0, len(rolls_with_match), _CHUNK):
            chunk = rolls_with_match[i : i + _CHUNK]
            session.query(PushSubscription).filter(
                PushSubscription.roll_number.in_(chunk)
            ).update({"has_timetable": True}, synchronize_session=False)

        for i in range(0, len(rolls_without_match), _CHUNK):
            chunk = rolls_without_match[i : i + _CHUNK]
            session.query(PushSubscription).filter(
                PushSubscription.roll_number.in_(chunk)
            ).update({"has_timetable": False}, synchronize_session=False)

        session.commit()

    stats["updated_has_match"] = len(rolls_with_match)
    stats["updated_no_match"] = len(rolls_without_match)

    logger.info(
        "refresh_all_subscribers: notice_id=%s total=%d matched=%d no_match=%d skipped=%d",
        notice_id,
        stats["total"],
        stats["updated_has_match"],
        stats["updated_no_match"],
        stats["skipped_no_subjects"],
    )
    return stats
