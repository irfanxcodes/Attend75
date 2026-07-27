"""
Notification Health Service — Aggregates push notification system health data
for the admin health-check panel.

Provides:
- VAPID key configuration status
- FCM / Firebase service account status
- Push worker thread status
- Queue depth and health stats
- Recent failed jobs with error details
- Push subscription counts and timetable eligibility
- Daily delivery trends
"""

import logging
import os
from datetime import datetime, timedelta, timezone

from db.models.notification_history import NotificationHistory
from db.models.notification_job import NotificationJob
from db.models.push_subscription import PushSubscription
from db.session import SessionLocal
from services.notification_queue import get_queue_stats

logger = logging.getLogger(__name__)

IST = timezone(timedelta(hours=5, minutes=30))


def get_push_notification_health() -> dict:
    """Aggregate all push notification system health metrics."""
    queue_stats = get_queue_stats()

    # VAPID config
    vapid_public_key = os.getenv("VAPID_PUBLIC_KEY", "")
    vapid_private_key = os.getenv("VAPID_PRIVATE_KEY", "")
    vapid_contact_email = os.getenv("VAPID_CONTACT_EMAIL", "")

    vapid_status = "configured" if vapid_public_key and vapid_private_key else "missing"
    vapid_warnings = []
    if not vapid_public_key:
        vapid_warnings.append("VAPID_PUBLIC_KEY is not set — Web Push delivery will fail")
    if not vapid_private_key:
        vapid_warnings.append("VAPID_PRIVATE_KEY is not set — Web Push delivery will fail")
    if not vapid_contact_email:
        vapid_warnings.append("VAPID_CONTACT_EMAIL is not set — use mailto:admin@attend75.xyz default")

    # FCM config
    fcm_service_account = os.getenv("FIREBASE_SERVICE_ACCOUNT_FILE", "")
    fcm_status = "configured" if fcm_service_account else "missing"
    fcm_warnings = []
    if not fcm_service_account:
        fcm_warnings.append("FIREBASE_SERVICE_ACCOUNT_FILE is not set — FCM delivery will fail (Web Push fallback still works)")

    # Push worker status (infer from recent job activity)
    with SessionLocal() as session:
        # Last successful delivery
        last_success = (
            session.query(NotificationJob.completed_at)
            .filter(
                NotificationJob.status == "done",
                NotificationJob.job_type == "push_send",
            )
            .order_by(NotificationJob.completed_at.desc())
            .first()
        )
        last_delivery_at = last_success[0].isoformat() if last_success and last_success[0] else None

        # Jobs actually delivered (completed) in the last hour — measures worker
        # throughput, not just enqueue rate.
        one_hour_ago = datetime.now(timezone.utc) - timedelta(hours=1)
        jobs_last_hour = int(
            session.query(NotificationJob.id)
            .filter(
                NotificationJob.job_type == "push_send",
                NotificationJob.status == "done",
                NotificationJob.completed_at >= one_hour_ago,
            )
            .count()
        )

        # Jobs processed in last 24 hours
        one_day_ago = datetime.now(timezone.utc) - timedelta(hours=24)
        done_last_24h = int(
            session.query(NotificationJob.id)
            .filter(
                NotificationJob.job_type == "push_send",
                NotificationJob.status == "done",
                NotificationJob.completed_at >= one_day_ago,
            )
            .count()
        )
        failed_last_24h = int(
            session.query(NotificationJob.id)
            .filter(
                NotificationJob.job_type == "push_send",
                NotificationJob.status == "failed",
                NotificationJob.created_at >= one_day_ago,
            )
            .count()
        )

        # Recent failed jobs with error details
        recent_failures = (
            session.query(NotificationJob)
            .filter(
                NotificationJob.status == "failed",
                NotificationJob.job_type == "push_send",
                NotificationJob.created_at >= (datetime.now(timezone.utc) - timedelta(hours=48)),
            )
            .order_by(NotificationJob.created_at.desc())
            .limit(20)
            .all()
        )
        failed_jobs = [
            {
                "id": j.id,
                "target_roll": j.target_roll,
                "last_error": j.last_error,
                "attempts": j.attempts,
                "max_attempts": j.max_attempts,
                "created_at": j.created_at.astimezone(IST).strftime("%Y-%m-%d %H:%M IST") if j.created_at else None,
            }
            for j in recent_failures
        ]

        # Upcoming pending jobs (next 10)
        upcoming = (
            session.query(NotificationJob)
            .filter(
                NotificationJob.status == "pending",
                NotificationJob.job_type == "push_send",
                NotificationJob.scheduled_at > datetime.now(timezone.utc),
            )
            .order_by(NotificationJob.scheduled_at)
            .limit(10)
            .all()
        )
        pending_jobs = [
            {
                "id": j.id,
                "target_roll": j.target_roll,
                "scheduled_at_ist": j.scheduled_at.astimezone(IST).strftime("%H:%M IST") if j.scheduled_at else None,
                "created_at": j.created_at.astimezone(IST).strftime("%Y-%m-%d %H:%M") if j.created_at else None,
            }
            for j in upcoming
        ]

        # Notification history summary (last 7 days by category)
        seven_days_ago = datetime.now(timezone.utc) - timedelta(days=7)
        history_rows = (
            session.query(
                NotificationHistory.category,
                NotificationHistory.delivery_status,
                NotificationHistory.priority,
            )
            .filter(NotificationHistory.created_at >= seven_days_ago)
            .all()
        )
        history_by_category = {}
        for row in history_rows:
            cat = row.category or "unknown"
            if cat not in history_by_category:
                history_by_category[cat] = {"sent": 0, "failed": 0, "high_priority": 0}
            history_by_category[cat]["sent"] += 1
            if row.delivery_status == "failed":
                history_by_category[cat]["failed"] += 1
            if row.priority == "high":
                history_by_category[cat]["high_priority"] += 1

        total_history_sent = sum(v["sent"] for v in history_by_category.values())
        total_history_failed = sum(v["failed"] for v in history_by_category.values())

        # Push subscriptions overview (merged into same session to avoid extra round-trips)
        total_subscriptions = int(session.query(PushSubscription).count())
        unique_students = int(
            session.query(PushSubscription.roll_number).distinct().count()
        )
        has_timetable_count = int(
            session.query(PushSubscription)
            .filter(PushSubscription.has_timetable.is_(True))
            .count()
        )
        has_subjects_count = int(
            session.query(PushSubscription)
            .filter(
                PushSubscription.has_timetable.is_(True),
                PushSubscription.cached_subjects_json.isnot(None),
            )
            .count()
        )
        distinct_eligible = int(
            session.query(PushSubscription.roll_number)
            .filter(
                PushSubscription.has_timetable.is_(True),
                PushSubscription.cached_subjects_json.isnot(None),
            )
            .distinct()
            .count()
        )

        # Device breakdown
        device_rows = (
            session.query(
                PushSubscription.device_info,
                PushSubscription.fcm_token,
            )
            .all()
        )
        android_count = sum(1 for r in device_rows if r.device_info and "android" in r.device_info.lower())
        ios_count = sum(1 for r in device_rows if r.device_info and "ios" in r.device_info.lower())
        web_count = sum(1 for r in device_rows if r.device_info and r.device_info.lower() not in ("android", "ios"))
        unknown_count = sum(1 for r in device_rows if not r.device_info)
        fcm_enabled = sum(1 for r in device_rows if r.fcm_token)

    # Worker health: check if the worker is alive by looking at recent activity
    # If there are pending jobs but zero jobs processed in the last hour, the worker
    # may be stuck. Flag as warning.
    has_recent_activity = jobs_last_hour > 0 or (total_history_sent + total_history_failed) > 0
    worker_alive = has_recent_activity
    worker_warning = ""
    if not has_recent_activity and queue_stats["pending"] > 0:
        worker_warning = f"{queue_stats['pending']} jobs pending but none processed in the last hour — worker may be stuck"

    failure_rate_24h = round(
        (failed_last_24h / max(done_last_24h + failed_last_24h, 1)) * 100, 2
    )

    return {
        "config": {
            "vapid": {
                "status": vapid_status,
                "public_key_present": bool(vapid_public_key),
                "private_key_present": bool(vapid_private_key),
                "contact_email": vapid_contact_email or "default (mailto:admin@attend75.xyz)",
                "warnings": vapid_warnings,
            },
            "fcm": {
                "status": fcm_status,
                "service_account_path": fcm_service_account or None,
                "warnings": fcm_warnings,
            },
        },
        "worker": {
            "alive": worker_alive,
            "warning": worker_warning,
            "jobs_processed_last_hour": jobs_last_hour,
            "last_successful_delivery": last_delivery_at,
            "thread_pool_size": 10,  # From push_worker.py _DEFAULT_CONCURRENCY
        },
        "queue": {
            "pending": queue_stats.get("pending", 0),
            "processing": queue_stats.get("processing", 0),
            "done": queue_stats.get("done", 0),
            "failed": queue_stats.get("failed", 0),
            "cancelled": queue_stats.get("cancelled", 0),
            "total": queue_stats.get("total", 0),
        },
        "delivery": {
            "done_last_24h": done_last_24h,
            "failed_last_24h": failed_last_24h,
            "failure_rate_24h": failure_rate_24h,
            "recent_failures_48h": failed_jobs,
            "upcoming_pending_jobs": pending_jobs,
        },
        "history": {
            "total_sent_7d": total_history_sent,
            "total_failed_7d": total_history_failed,
            "by_category": [
                {
                    "category": cat,
                    "sent": stats["sent"],
                    "failed": stats["failed"],
                    "high_priority": stats["high_priority"],
                    "open_rate": None,  # Would need read tracking per category
                }
                for cat, stats in sorted(history_by_category.items())
            ],
        },
        "subscriptions": {
            "total_subscriptions": total_subscriptions,
            "unique_students": unique_students,
            "with_timetable": has_timetable_count,
            "with_cached_subjects": has_subjects_count,
            "eligible_for_reminders": distinct_eligible,
            "device_breakdown": {
                "android": android_count,
                "ios": ios_count,
                "web": web_count,
                "unknown": unknown_count,
                "fcm_enabled": fcm_enabled,
            },
        },
    }
