"""
Notification History Service — read/write access to the notification_history table.

Used by routers/push.py for the history endpoint and by every dispatcher/worker
that needs to log a dispatched notification.
"""

from datetime import datetime, timezone

from db.models.notification_history import NotificationHistory
from db.session import SessionLocal

HISTORY_PAGE_SIZE = 50


def log_notification(
    roll_number: str,
    category: str,
    title: str,
    body: str | None = None,
    deep_link: str | None = None,
    priority: str = "standard",
    delivery_status: str = "sent",
) -> int:
    """Insert a notification_history row. Returns the new row id."""
    now = datetime.now(timezone.utc)
    with SessionLocal() as session:
        row = NotificationHistory(
            roll_number=roll_number,
            category=category,
            title=title,
            body=body,
            deep_link=deep_link,
            priority=priority,
            delivery_status=delivery_status,
            is_read=False,
            created_at=now,
        )
        session.add(row)
        session.commit()
        session.refresh(row)
        return row.id


def list_history(roll_number: str, limit: int = HISTORY_PAGE_SIZE) -> list[dict]:
    """Return the most recent `limit` history rows for a student, newest first (Req 8.2)."""
    with SessionLocal() as session:
        rows = (
            session.query(NotificationHistory)
            .filter(NotificationHistory.roll_number == roll_number)
            .order_by(NotificationHistory.created_at.desc())
            .limit(limit)
            .all()
        )
        return [
            {
                "id": row.id,
                "category": row.category,
                "title": row.title,
                "body": row.body,
                "deepLink": row.deep_link,
                "priority": row.priority,
                "deliveryStatus": row.delivery_status,
                "isRead": row.is_read,
                "createdAt": row.created_at.isoformat() if row.created_at else None,
            }
            for row in rows
        ]


def mark_read(roll_number: str, history_id: int) -> bool:
    """
    Mark a single history row as read (idempotent — calling twice is safe and
    leaves the original read_at unchanged after the first call). Req 8.4 / Property 25.
    """
    with SessionLocal() as session:
        row = (
            session.query(NotificationHistory)
            .filter(NotificationHistory.id == history_id, NotificationHistory.roll_number == roll_number)
            .one_or_none()
        )
        if row is None:
            return False
        if not row.is_read:
            row.is_read = True
            row.read_at = datetime.now(timezone.utc)
            session.commit()
        return True


def unread_count(roll_number: str) -> int:
    """Req 9.5 / Property 27: badge count = number of unread history rows."""
    with SessionLocal() as session:
        return (
            session.query(NotificationHistory)
            .filter(NotificationHistory.roll_number == roll_number, NotificationHistory.is_read.is_(False))
            .count()
        )
