"""
Broadcast Service — Admin sends push notifications to all or program-filtered premium students.
"""

import logging
from datetime import datetime

from db.models.notification_history import NotificationHistory
from db.models.premium_subscription import PremiumSubscription
from db.models.push_subscription import PushSubscription
from db.models.student_registry import StudentRegistry
from db.session import SessionLocal
from services import notification_queue
from services.payload_builder import build_payload

logger = logging.getLogger(__name__)


def send_broadcast(
    title: str,
    body: str,
    audience: str = "all",
    program: str | None = None,
    priority: str = "standard",
    deep_link: str | None = None,
) -> dict:
    """
    Enqueue a broadcast push notification to all matching premium students.
    audience: "all" | "program"
    Returns {queued_count: int}.
    """
    targets = _get_broadcast_targets(audience, program)

    if not targets:
        return {"queued_count": 0}

    payload = build_payload(
        category="broadcast",
        title=title,
        body=body,
        deep_link=deep_link,
        priority=priority if priority in ("standard", "high") else "standard",
    )

    jobs = []
    for roll in targets:
        jobs.append({
            "job_type": "push_send",
            "payload": {"roll_number": roll, "notification": payload},
            "target_roll": roll,
            "priority": 1 if priority == "high" else 0,
        })

    notification_queue.enqueue_batch(jobs)
    return {"queued_count": len(jobs)}


def get_broadcast_stats(title: str, since: datetime | None = None) -> dict:
    """
    Get delivery statistics for a broadcast by matching title + time window.
    Returns {sent_count, opened_count}.
    """
    with SessionLocal() as session:
        query = (
            session.query(NotificationHistory)
            .filter(
                NotificationHistory.category == "broadcast",
                NotificationHistory.title == title,
            )
        )
        if since:
            query = query.filter(NotificationHistory.created_at >= since)

        rows = query.all()
        sent_count = len(rows)
        opened_count = sum(1 for r in rows if r.is_read)

    return {"sent_count": sent_count, "opened_count": opened_count}


def _get_broadcast_targets(audience: str, program: str | None) -> list[str]:
    """Get all premium subscribed students, optionally filtered by program."""
    with SessionLocal() as session:
        query = (
            session.query(PushSubscription.roll_number)
            
            
        )

        if audience == "program" and program:
            query = query.join(
                StudentRegistry, StudentRegistry.roll_number == PushSubscription.roll_number
            ).filter(StudentRegistry.program == program)

        rows = query.distinct().all()
        return [row[0] for row in rows]
