"""
Premium Analytics Service — Metrics for the admin Premium & Notifications tab.

Provides:
- Premium subscription counts (active, grace, expired, cancelled)
- Push subscription device counts
- Notification queue health (pending, processing, done, failed)
- Notification history stats (by category, delivery rate)
- Recent broadcasts with open rates
"""

import logging
from datetime import datetime, timedelta, date

from sqlalchemy import func, distinct

from db.models.notification_history import NotificationHistory
from db.models.notification_job import NotificationJob
from db.models.notification_preference import NotificationPreference
from db.models.premium_subscription import PremiumSubscription
from db.models.push_subscription import PushSubscription
from db.models.student_registry import StudentRegistry
from db.session import SessionLocal

logger = logging.getLogger(__name__)


def get_premium_analytics() -> dict:
    """Full premium analytics payload for admin UI."""
    with SessionLocal() as session:
        # ── Premium subscriptions ────────────────────────────────────────────
        total_premium = int(session.query(func.count(PremiumSubscription.id)).scalar() or 0)
        active_count = int(
            session.query(func.count(PremiumSubscription.id))
            .filter(PremiumSubscription.status == "active")
            .scalar() or 0
        )
        grace_count = int(
            session.query(func.count(PremiumSubscription.id))
            .filter(PremiumSubscription.status == "grace")
            .scalar() or 0
        )
        expired_count = int(
            session.query(func.count(PremiumSubscription.id))
            .filter(PremiumSubscription.status == "expired")
            .scalar() or 0
        )
        cancelled_count = int(
            session.query(func.count(PremiumSubscription.id))
            .filter(PremiumSubscription.status == "cancelled")
            .scalar() or 0
        )

        # ── Push subscriptions ───────────────────────────────────────────────
        total_push_subs = int(session.query(func.count(PushSubscription.id)).scalar() or 0)
        unique_push_students = int(
            session.query(func.count(distinct(PushSubscription.roll_number))).scalar() or 0
        )

        # Device info breakdown
        device_rows = (
            session.query(PushSubscription.device_info, func.count(PushSubscription.id))
            .group_by(PushSubscription.device_info)
            .all()
        )
        devices = {(d or "Unknown"): int(c) for d, c in device_rows}

        # ── Notification queue health ────────────────────────────────────────
        job_status_rows = (
            session.query(NotificationJob.status, func.count(NotificationJob.id))
            .group_by(NotificationJob.status)
            .all()
        )
        queue = {row[0]: int(row[1]) for row in job_status_rows}

        # Failed jobs in last 24h
        day_ago = datetime.utcnow() - timedelta(hours=24)
        failed_24h = int(
            session.query(func.count(NotificationJob.id))
            .filter(NotificationJob.status == "failed", NotificationJob.created_at >= day_ago)
            .scalar() or 0
        )

        # ── Notification history stats ───────────────────────────────────────
        total_sent = int(session.query(func.count(NotificationHistory.id)).scalar() or 0)
        total_read = int(
            session.query(func.count(NotificationHistory.id))
            .filter(NotificationHistory.is_read == True)
            .scalar() or 0
        )

        # By category
        category_rows = (
            session.query(
                NotificationHistory.category,
                func.count(NotificationHistory.id),
                func.sum(func.cast(NotificationHistory.is_read, type_=func.count(NotificationHistory.id).type)),
            )
            .group_by(NotificationHistory.category)
            .all()
        )
        by_category = []
        for cat, total, read in category_rows:
            by_category.append({
                "category": cat,
                "sent": int(total),
                "read": int(read or 0),
                "openRate": round((int(read or 0) / int(total)) * 100, 1) if total else 0,
            })

        # Recent 24h stats
        sent_24h = int(
            session.query(func.count(NotificationHistory.id))
            .filter(NotificationHistory.created_at >= day_ago)
            .scalar() or 0
        )

        # ── Preference stats ────────────────────────────────────────────────
        total_prefs = int(session.query(func.count(NotificationPreference.id)).scalar() or 0)
        notices_disabled = int(
            session.query(func.count(NotificationPreference.id))
            .filter(NotificationPreference.notices_enabled == False)
            .scalar() or 0
        )
        attendance_disabled = int(
            session.query(func.count(NotificationPreference.id))
            .filter(NotificationPreference.attendance_enabled == False)
            .scalar() or 0
        )

        # ── Recent broadcasts ───────────────────────────────────────────────
        recent_broadcasts = (
            session.query(
                NotificationHistory.title,
                func.count(NotificationHistory.id).label("sent_count"),
                func.sum(func.cast(NotificationHistory.is_read, type_=func.count(NotificationHistory.id).type)).label("read_count"),
                func.max(NotificationHistory.created_at).label("sent_at"),
            )
            .filter(NotificationHistory.category == "broadcast")
            .group_by(NotificationHistory.title)
            .order_by(func.max(NotificationHistory.created_at).desc())
            .limit(10)
            .all()
        )
        broadcasts = [
            {
                "title": row.title,
                "sentCount": int(row.sent_count),
                "readCount": int(row.read_count or 0),
                "openRate": round((int(row.read_count or 0) / int(row.sent_count)) * 100, 1) if row.sent_count else 0,
                "sentAt": row.sent_at.isoformat() if row.sent_at else None,
            }
            for row in recent_broadcasts
        ]

        # ── Premium students list ───────────────────────────────────────────
        premium_students = (
            session.query(PremiumSubscription)
            .join(StudentRegistry, StudentRegistry.roll_number == PremiumSubscription.roll_number, isouter=True)
            .order_by(PremiumSubscription.created_at.desc())
            .limit(50)
            .all()
        )

        # Get names
        roll_numbers = [s.roll_number for s in premium_students]
        name_map = {}
        if roll_numbers:
            name_rows = (
                session.query(StudentRegistry.roll_number, StudentRegistry.display_name)
                .filter(StudentRegistry.roll_number.in_(roll_numbers))
                .all()
            )
            name_map = {r.roll_number: r.display_name for r in name_rows}

        students_list = [
            {
                "rollNumber": s.roll_number,
                "name": name_map.get(s.roll_number),
                "plan": s.plan,
                "status": s.status,
                "expiryDate": s.expiry_date.isoformat() if s.expiry_date else None,
                "createdAt": s.created_at.isoformat() if s.created_at else None,
            }
            for s in premium_students
        ]

    # Total students for conversion rate
    with SessionLocal() as session:
        total_students = int(session.query(func.count(StudentRegistry.roll_number)).scalar() or 0)

    return {
        "subscriptions": {
            "total": total_premium,
            "active": active_count,
            "grace": grace_count,
            "expired": expired_count,
            "cancelled": cancelled_count,
            "conversionRate": round((active_count / total_students) * 100, 2) if total_students else 0,
        },
        "pushSubscriptions": {
            "totalDevices": total_push_subs,
            "uniqueStudents": unique_push_students,
            "devices": devices,
        },
        "queue": {
            "pending": queue.get("pending", 0),
            "processing": queue.get("processing", 0),
            "done": queue.get("done", 0),
            "failed": queue.get("failed", 0),
            "failedLast24h": failed_24h,
        },
        "history": {
            "totalSent": total_sent,
            "totalRead": total_read,
            "openRate": round((total_read / total_sent) * 100, 1) if total_sent else 0,
            "sentLast24h": sent_24h,
            "byCategory": by_category,
        },
        "preferences": {
            "totalConfigured": total_prefs,
            "noticesDisabled": notices_disabled,
            "attendanceDisabled": attendance_disabled,
        },
        "recentBroadcasts": broadcasts,
        "students": students_list,
        "totalStudents": total_students,
    }
