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

    notice = _find_latest_timetable_notice(student_subjects=None)
    if not notice or not notice.cleaned_text:
        logger.debug("resolve_and_cache: no timetable notice in DB for %s", roll_number)
        return False

    abbr_lookup = _build_abbr_lookup(notice.cleaned_text)
    subjects = _extract_subjects(attendance_rows, abbr_lookup)
    if not subjects:
        subjects = _extract_subjects(attendance_rows, {})

    if not subjects:
        logger.debug(
            "resolve_and_cache: could not extract subjects from %d rows for %s",
            len(attendance_rows), roll_number,
        )
        return False

    schedule = _parse_timetable_from_text(notice.cleaned_text)
    has_matches = bool(schedule and _match_student_classes(schedule, subjects))

    subjects_json = json.dumps(subjects)
    with SessionLocal() as session:
        updated = (
            session.query(PushSubscription)
            .filter(PushSubscription.roll_number == roll_number)
            .update(
                {"cached_subjects_json": subjects_json, "has_timetable": has_matches},
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
    Parse the timetable once and bulk-update every push subscriber's subjects.
    Zero portal requests — operates entirely on data already in the DB.

    Called by notice_dispatcher whenever a new timetable notice is scraped.

    Strategy per subscriber:
      - Has cached_subjects_json → re-validate against the new timetable and
        update has_timetable flag (subjects stay the same; new timetable may
        have different section mappings).
      - Has no cached_subjects_json → cannot resolve without attendance rows.
        These students will be resolved by the background_fetcher on its next
        cycle, or immediately on their next login via the /push/subscribe hook.

    Args:
        notice_id: The specific new timetable notice_id (optional). If not
            provided, the latest timetable notice is used.

    Returns:
        Stats dict: {total, updated_has_match, updated_no_match, skipped_no_subjects}.
    """
    from services.timetable_service import (
        _find_latest_timetable_notice,
        _parse_timetable_from_text,
        _match_student_classes,
    )
    from db.models.notice import Notice

    # 1. Load the timetable notice (already in DB — no network)
    if notice_id is not None:
        with SessionLocal() as session:
            notice = session.query(Notice).filter(Notice.notice_id == notice_id).one_or_none()
    else:
        notice = _find_latest_timetable_notice(student_subjects=None)

    if not notice or not notice.cleaned_text:
        logger.warning("refresh_all_subscribers: no timetable notice available")
        return {"total": 0, "updated_has_match": 0, "updated_no_match": 0, "skipped_no_subjects": 0}

    # 2. Parse the timetable once — O(1) per notice, not per student
    schedule = _parse_timetable_from_text(notice.cleaned_text)
    if not schedule:
        logger.warning("refresh_all_subscribers: could not parse schedule from notice %d", notice.notice_id)
        return {"total": 0, "updated_has_match": 0, "updated_no_match": 0, "skipped_no_subjects": 0}

    logger.info(
        "refresh_all_subscribers: parsed %d schedule entries from notice %d",
        len(schedule), notice.notice_id,
    )

    # 3. Load all distinct push subscribers and their cached subjects
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

    # Build bulk-update lists to do this in two DB round-trips instead of N
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

        # Match this student's subjects against the new timetable schedule
        matches = _match_student_classes(schedule, subjects)
        if matches:
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
        "refresh_all_subscribers: notice=%d total=%d matched=%d no_match=%d skipped=%d",
        notice.notice_id,
        stats["total"],
        stats["updated_has_match"],
        stats["updated_no_match"],
        stats["skipped_no_subjects"],
    )
    return stats
