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
        from datetime import timezone as _tz
        day_ago = datetime.now(_tz.utc) - timedelta(hours=24)
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

        # ── Push notification subscribers list ───────────────────────────────
        push_subscriber_rows = (
            session.query(
                PushSubscription.roll_number,
                func.count(PushSubscription.id).label('devices'),
                func.max(PushSubscription.created_at).label('registered_at'),
                func.max(PushSubscription.last_used_at).label('last_used'),
            )
            .filter(
                PushSubscription.p256dh_key.isnot(None),
                PushSubscription.p256dh_key != "",
            )
            .group_by(PushSubscription.roll_number)
            .order_by(func.max(PushSubscription.created_at).desc())
            .limit(100)
            .all()
        )

        # Normalise roll numbers to uppercase for registry lookup
        # (subscriptions may have been stored with mixed-case roll numbers)
        roll_numbers = [r[0] for r in push_subscriber_rows]
        roll_upper_map = {r: r.upper() for r in roll_numbers}  # original → upper
        upper_rolls = list(set(roll_upper_map.values()))

        student_details = {}
        if upper_rolls:
            detail_rows = (
                session.query(StudentRegistry)
                .filter(StudentRegistry.roll_number.in_(upper_rolls))
                .all()
            )
            for r in detail_rows:
                student_details[r.roll_number.upper()] = {
                    "name": r.display_name,
                    "program": r.program,
                    "hasGoogle": r.has_google_linked,
                }

        students_list = []
        for row in push_subscriber_rows:
            roll, devices, registered_at, last_used = row
            upper = roll_upper_map.get(roll, roll.upper())
            details = student_details.get(upper, {})

            # Fallback name: title-case the roll number prefix if no name stored
            # e.g. "24FMUCHH012165" → we at least show the roll, frontend shows "?"
            name = details.get("name") or None
            program = details.get("program") or None

            students_list.append({
                "rollNumber": upper,   # always uppercase for consistency
                "name": name,
                "program": program,
                "hasGoogle": details.get("hasGoogle", False),
                "pushDevices": int(devices),
                "registeredAt": registered_at.isoformat() if registered_at else None,
                "lastUsedAt": last_used.isoformat() if last_used else None,
            })

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
