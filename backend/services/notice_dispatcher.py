"""
Notice Dispatcher — Enqueues push notifications when new notices are scraped.

Called from notice_scheduler after process_batch succeeds. Handles:
- Individual notice notifications (Req 3)
- Batch consolidation when >3 notices arrive together (Req 3.3)
- Timetable-change detection and cache invalidation (Req 13)
- Idempotent dispatch via notification_sent_at field on Notice
"""

import logging
from datetime import datetime, timezone

from sqlalchemy import or_

from db.models.notice import Notice
from db.models.push_subscription import PushSubscription
from db.models.student_registry import StudentRegistry
from db.session import SessionLocal
from services import notification_queue
from services.payload_builder import (
    build_payload,
    highest_priority_category,
    is_high_priority,
    notice_deep_link,
)
from services.preference_filter import get_or_create_preferences, should_send_notice

logger = logging.getLogger(__name__)

BATCH_CONSOLIDATION_THRESHOLD = 5  # >5 new notices in one cycle → single summary


def is_timetable_change_title(title: str) -> bool:
    """
    True iff title contains TIMETABLE or TIME TABLE and does NOT contain
    SPECIAL, SUMMER, REMEDIAL, or EXAM. Mirrors timetable_service filtering.
    """
    upper = (title or "").upper()
    if "TIMETABLE" not in upper and "TIME TABLE" not in upper:
        return False
    for excluded in ("SPECIAL", "SUMMER", "REMEDIAL", "EXAM"):
        if excluded in upper:
            return False
    return True


def dispatch_for_new_notices(notice_ids: list[int]) -> int:
    """
    Enqueue push notifications for newly processed notices.
    Returns count of push_send jobs enqueued.

    Idempotent: only processes notices where notification_sent_at is NULL.
    Stamps notification_sent_at BEFORE enqueuing so that any exception in the
    dispatch logic cannot leave notices unguarded (which would cause re-dispatch
    on the next 30-minute scrape cycle).
    """
    if not notice_ids:
        return 0

    now = datetime.now(timezone.utc)

    with SessionLocal() as session:
        notices = (
            session.query(Notice)
            .filter(
                Notice.notice_id.in_(notice_ids),
                Notice.processing_status == "done",
                Notice.notification_sent_at.is_(None),
            )
            .all()
        )

        if not notices:
            return 0

        # ── STAMP ALL NOTICES FIRST ──────────────────────────────────────────
        # Set notification_sent_at on every qualifying notice immediately, before
        # any enqueue logic runs. This is the critical idempotency gate: even if
        # the enqueue loop raises an exception partway through, no notice can be
        # re-dispatched on the next scrape cycle because the stamp is already
        # committed. A missed push is far less harmful than a spam push.
        for n in notices:
            n.notification_sent_at = now
        session.flush()  # write all stamps to DB in one go

        # Separate timetable-change notices from regular notices
        timetable_notices = [n for n in notices if is_timetable_change_title(n.title)]
        regular_notices = [n for n in notices if not is_timetable_change_title(n.title)]

        enqueued_count = 0

        # Handle timetable-change notifications (Req 13)
        # Collect unique targets across ALL timetable notices in this batch to
        # avoid sending duplicate "Timetable Updated" when multiple timetable
        # notices are processed in the same scrape cycle.
        if timetable_notices:
            all_timetable_targets: set[str] = set()
            best_timetable_title = timetable_notices[-1].title  # most recent
            for notice in timetable_notices:
                targets = _subscribed_students_for_program(notice.source_program, notice.target_semesters)
                all_timetable_targets.update(targets)
                # notification_sent_at already stamped above
            # flush already done above — no second flush needed

            for roll in all_timetable_targets:
                payload = build_payload(
                    category="timetable",
                    title="Timetable Updated",
                    body=best_timetable_title[:100],
                    deep_link="/app/notices",
                    priority="standard",
                )
                notification_queue.enqueue("push_send", {"roll_number": roll, "notification": payload}, target_roll=roll)
                enqueued_count += 1

        # Invalidate timetable cache if any timetable notices were processed
        if timetable_notices:
            try:
                from services.timetable_service import _timetable_cache
                _timetable_cache.clear()
            except ImportError:
                pass

            # When a new timetable is scraped, re-validate cached_subjects_json
            # for all push subscribers against the new schedule.
            # Runs in a daemon thread — zero portal requests, pure DB.
            try:
                import threading
                new_notice_id = timetable_notices[-1].notice_id
                t = threading.Thread(
                    target=_reschedule_todays_reminders_for_new_timetable,
                    args=(new_notice_id,),
                    daemon=True,
                    name="timetable-subject-refresh",
                )
                t.start()
            except Exception as refresh_exc:
                logger.warning("Failed to start timetable reschedule thread: %s", refresh_exc)

        # Handle regular notices — with batch consolidation
        # notification_sent_at already stamped for all notices above.
        if len(regular_notices) > BATCH_CONSOLIDATION_THRESHOLD:
            enqueued_count += _dispatch_consolidated(regular_notices, now, session)
        else:
            for notice in regular_notices:
                enqueued_count += _dispatch_single_notice(notice, now)

        session.commit()

    return enqueued_count


def _dispatch_single_notice(notice: Notice, now: datetime) -> int:
    """Enqueue push_send jobs for a single notice to all matching subscribers."""
    targets = _subscribed_students_for_program(notice.source_program, notice.target_semesters)
    priority = "high" if is_high_priority(notice.category, notice.priority) else "standard"
    count = 0

    for roll in targets:
        prefs = get_or_create_preferences(roll)
        if not should_send_notice(prefs, notice.category):
            continue

        payload = build_payload(
            category="notice",
            title=notice.title[:80],
            body=(notice.summary or notice.title)[:100],
            deep_link=notice_deep_link(notice.notice_id),
            priority=priority,
        )
        notification_queue.enqueue(
            "push_send",
            {"roll_number": roll, "notification": payload},
            target_roll=roll,
            priority=1 if priority == "high" else 0,
        )
        count += 1

    return count


def _dispatch_consolidated(notices: list, now: datetime, session) -> int:
    """
    Batch consolidation: >3 notices in one dispatch → single summary notification.
    Uses the highest-priority category from the batch (Req 3.3).
    """
    categories = [n.category for n in notices]
    top_category = highest_priority_category(categories)
    has_high = any(is_high_priority(n.category, n.priority) for n in notices)
    priority = "high" if has_high else "standard"

    # Get the union of all targeted programs, keyed by (program, target_semesters) pair
    # so semester-specific notices don't bleed into other semesters.
    all_targets: set[str] = set()
    for notice in notices:
        all_targets.update(_subscribed_students_for_program(notice.source_program, notice.target_semesters))

    count = 0
    for roll in all_targets:
        prefs = get_or_create_preferences(roll)
        if not prefs.notices_enabled:
            continue

        payload = build_payload(
            category="notice",
            title=f"{len(notices)} new notices",
            body=f"Including {top_category} and {len(notices) - 1} more",
            deep_link="/app/notices",
            priority=priority,
        )
        notification_queue.enqueue(
            "push_send",
            {"roll_number": roll, "notification": payload},
            target_roll=roll,
            priority=1 if priority == "high" else 0,
        )
        count += 1

    return count


def _subscribed_students_for_program(program: str | None, target_semesters: str | None = None) -> list[str]:
    """
    Get all push-subscribed students whose program and semester match the notice.

    - program: the source/target program of the notice (e.g. "BCA").
      If None, all subscribers are considered.
    - target_semesters: comma-separated semester labels from the notice
      (e.g. "Semester I,Semester III"). If None, all semesters receive it.

    Students whose current_semester is NULL in student_registry are always
    included as a safe fallback (they haven't logged in since the semester
    column was added, so we don't know their semester yet).
    """
    with SessionLocal() as session:
        query = session.query(PushSubscription.roll_number)

        if program:
            # Also include students whose program is NULL (they see all notices)
            query = query.join(
                StudentRegistry, StudentRegistry.roll_number == PushSubscription.roll_number, isouter=True
            ).filter(
                or_(
                    StudentRegistry.program == program,
                    StudentRegistry.program.is_(None),
                )
            )

        # Apply semester filter when the notice targets specific semesters
        if target_semesters:
            semester_list = [s.strip() for s in target_semesters.split(",") if s.strip()]
            if semester_list:
                # Ensure the join is in place even if program filter wasn't applied
                if not program:
                    query = query.join(
                        StudentRegistry, StudentRegistry.roll_number == PushSubscription.roll_number, isouter=True
                    )
                query = query.filter(
                    or_(
                        # Student's semester matches one of the notice's target semesters
                        StudentRegistry.current_semester.in_(semester_list),
                        # NULL = semester not yet recorded → include as safe fallback
                        StudentRegistry.current_semester.is_(None),
                    )
                )

        rows = query.distinct().all()
        return [row[0] for row in rows]


def _reschedule_todays_reminders_for_new_timetable(notice_id: int) -> None:
    """
    Called in a daemon thread whenever a new timetable notice is scraped.

    Does three things, all without any portal requests:

    1. Cancel today's still-pending timetable/digest reminder jobs that were
       built from the old timetable schedule. Jobs that have already fired
       (scheduled_at <= now) are left alone.

    2. Re-validate every push subscriber's has_timetable flag against the new
       timetable (their cached_subjects_json subjects may map to different
       classes/sections in the new schedule).

    3. Re-run schedule_reminders_for_today() so new jobs are created from the
       new timetable. This only enqueues reminders for classes that haven't
       started yet (reminder_time > now), so already-delivered reminders are
       not duplicated.
    """
    try:
        # Step 1: cancel stale jobs from old timetable
        from services.notification_queue import cancel_pending_timetable_jobs_for_today
        cancelled = cancel_pending_timetable_jobs_for_today()
        logger.info(
            "_reschedule_todays_reminders: cancelled %d stale jobs for notice %d",
            cancelled, notice_id,
        )

        # Step 2: re-validate has_timetable for all subscribers against new schedule
        from services.timetable_subject_resolver import refresh_all_subscribers_from_timetable
        stats = refresh_all_subscribers_from_timetable(notice_id=notice_id)
        logger.info("_reschedule_todays_reminders: subject refresh stats=%s", stats)

        # Step 3: re-enqueue today's reminders from the new timetable
        from services.timetable_reminder_engine import schedule_reminders_for_today
        enqueued = schedule_reminders_for_today()
        logger.info(
            "_reschedule_todays_reminders: re-enqueued %d jobs from new timetable notice %d",
            enqueued, notice_id,
        )
    except Exception as exc:
        logger.exception(
            "_reschedule_todays_reminders_for_new_timetable failed (notice %d): %s",
            notice_id, exc,
        )


def _refresh_subjects_from_new_timetable(notice_id: int | None = None) -> None:
    """Kept for backwards compatibility — delegates to the full reschedule flow."""
    if notice_id is not None:
        _reschedule_todays_reminders_for_new_timetable(notice_id)
    else:
        try:
            from services.timetable_subject_resolver import refresh_all_subscribers_from_timetable
            stats = refresh_all_subscribers_from_timetable(notice_id=None)
            logger.info("_refresh_subjects_from_new_timetable (no notice_id): %s", stats)
        except Exception as exc:
            logger.exception("_refresh_subjects_from_new_timetable failed: %s", exc)
