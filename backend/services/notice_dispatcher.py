"""
Notice Dispatcher — Enqueues push notifications when new notices are scraped.

Called from notice_scheduler after process_batch succeeds. Handles:
- Individual notice notifications (Req 3)
- Batch consolidation when >3 notices arrive together (Req 3.3)
- Timetable-change detection and cache invalidation (Req 13)
- Idempotent dispatch via notification_sent_at field on Notice
"""

import logging
from datetime import datetime

from sqlalchemy import or_

from db.models.notice import Notice
from db.models.push_subscription import PushSubscription
from db.models.premium_subscription import PremiumSubscription
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

BATCH_CONSOLIDATION_THRESHOLD = 3


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
    """
    if not notice_ids:
        return 0

    now = datetime.utcnow()

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

        # Separate timetable-change notices from regular notices
        timetable_notices = [n for n in notices if is_timetable_change_title(n.title)]
        regular_notices = [n for n in notices if not is_timetable_change_title(n.title)]

        enqueued_count = 0

        # Handle timetable-change notifications (Req 13)
        for notice in timetable_notices:
            targets = _subscribed_students_for_program(notice.source_program)
            for roll in targets:
                payload = build_payload(
                    category="timetable",
                    title="Timetable Updated",
                    body=notice.title[:100],
                    deep_link="/app/notices",
                    priority="standard",
                )
                notification_queue.enqueue("push_send", {"roll_number": roll, "notification": payload}, target_roll=roll)
                enqueued_count += 1

            notice.notification_sent_at = now

        # Invalidate timetable cache if any timetable notices were processed
        if timetable_notices:
            try:
                from services.timetable_service import _timetable_cache
                _timetable_cache.clear()
            except ImportError:
                pass

        # Handle regular notices — with batch consolidation
        if len(regular_notices) > BATCH_CONSOLIDATION_THRESHOLD:
            enqueued_count += _dispatch_consolidated(regular_notices, now, session)
        else:
            for notice in regular_notices:
                enqueued_count += _dispatch_single_notice(notice, now)

        # Mark all as sent
        for notice in regular_notices:
            notice.notification_sent_at = now

        session.commit()

    return enqueued_count


def _dispatch_single_notice(notice: Notice, now: datetime) -> int:
    """Enqueue push_send jobs for a single notice to all matching subscribers."""
    targets = _subscribed_students_for_program(notice.source_program)
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

    # Get the union of all targeted programs
    programs = set(n.source_program for n in notices)
    all_targets: set[str] = set()
    for prog in programs:
        all_targets.update(_subscribed_students_for_program(prog))

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


def _subscribed_students_for_program(program: str | None) -> list[str]:
    """
    Get all premium, subscribed students whose program matches the given program.
    If program is None, return all subscribed premium students.
    """
    with SessionLocal() as session:
        query = (
            session.query(PushSubscription.roll_number)
            .join(PremiumSubscription, PremiumSubscription.roll_number == PushSubscription.roll_number)
            .filter(PremiumSubscription.status.in_(["active", "grace"]))
        )

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

        rows = query.distinct().all()
        return [row[0] for row in rows]
