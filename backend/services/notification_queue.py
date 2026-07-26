"""
Notification Queue — Database-backed job queue for notification dispatch.

Provides enqueue/dequeue/process methods for asynchronous notification delivery.
Workers poll the queue and process jobs with configurable concurrency.

All datetime values are stored and compared as naive UTC (stripped of tzinfo)
to match the DateTime columns in notification_jobs. PostgreSQL stores them as
timestamp without time zone. We use datetime.utcnow() throughout for consistency.
"""

import json
import logging
import threading
import time
from datetime import datetime, timedelta, timezone

from db.models.notification_job import NotificationJob
from db.session import SessionLocal

logger = logging.getLogger(__name__)

# Canonical UTC "now" — returns timezone-aware datetime for use with
# TIMESTAMPTZ columns in PostgreSQL (DateTime(timezone=True)).
def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def enqueue(
    job_type: str,
    payload: dict,
    target_roll: str | None = None,
    priority: int = 0,
    scheduled_at: datetime | None = None,
    max_attempts: int = 3,
) -> int:
    """Add a job to the notification queue. Returns the job ID.

    scheduled_at should be a UTC datetime (naive or timezone-aware).
    Naive datetimes are assumed to be UTC.
    """
    now = _utcnow()
    # Normalise to timezone-aware UTC for TIMESTAMPTZ columns
    if scheduled_at is not None and scheduled_at.tzinfo is None:
        scheduled_at = scheduled_at.replace(tzinfo=timezone.utc)
    with SessionLocal() as session:
        job = NotificationJob(
            job_type=job_type,
            status="pending",
            payload=json.dumps(payload),
            target_roll=target_roll,
            priority=priority,
            max_attempts=max_attempts,
            scheduled_at=scheduled_at if scheduled_at is not None else now,
            created_at=now,
        )
        session.add(job)
        session.commit()
        session.refresh(job)
        return job.id


def enqueue_batch(jobs: list[dict]) -> int:
    """Enqueue multiple jobs at once. Returns count enqueued."""
    if not jobs:
        return 0
    now = _utcnow()
    with SessionLocal() as session:
        for job_data in jobs:
            sa = job_data.get("scheduled_at", now)
            # Normalise to timezone-aware UTC
            if sa is not None and sa.tzinfo is None:
                sa = sa.replace(tzinfo=timezone.utc)
            job = NotificationJob(
                job_type=job_data["job_type"],
                status="pending",
                payload=json.dumps(job_data.get("payload", {})),
                target_roll=job_data.get("target_roll"),
                priority=job_data.get("priority", 0),
                max_attempts=job_data.get("max_attempts", 3),
                scheduled_at=sa if sa is not None else now,
                created_at=now,
            )
            session.add(job)
        session.commit()
    return len(jobs)


def claim_pending_jobs(batch_size: int = 10, job_types: list[str] | None = None) -> list[dict]:
    """
    Claim up to batch_size pending jobs whose scheduled_at has arrived.
    Returns list of job dicts with id, job_type, payload, target_roll.

    Uses SELECT FOR UPDATE SKIP LOCKED for safe concurrent access on PostgreSQL,
    preventing multiple worker threads from claiming the same job.
    """
    now = _utcnow()
    with SessionLocal() as session:
        query = (
            session.query(NotificationJob)
            .filter(NotificationJob.status == "pending")
            .filter(NotificationJob.scheduled_at <= now)
        )
        if job_types:
            query = query.filter(NotificationJob.job_type.in_(job_types))

        query = (
            query
            .order_by(NotificationJob.priority.desc(), NotificationJob.scheduled_at)
            .limit(batch_size)
            .with_for_update(skip_locked=True)
        )

        jobs = query.all()

        claimed = []
        for job in jobs:
            job.status = "processing"
            job.started_at = now
            job.attempts += 1
            claimed.append({
                "id": job.id,
                "job_type": job.job_type,
                "payload": json.loads(job.payload),
                "target_roll": job.target_roll,
                "attempts": job.attempts,
                "max_attempts": job.max_attempts,
            })
        session.commit()

    return claimed


def mark_done(job_id: int) -> None:
    """Mark a job as successfully completed."""
    with SessionLocal() as session:
        job = session.query(NotificationJob).filter(NotificationJob.id == job_id).one_or_none()
        if job:
            job.status = "done"
            job.completed_at = _utcnow()
            session.commit()


def mark_failed(job_id: int, error: str, can_retry: bool = True) -> None:
    """Mark a job as failed. If retries remain and can_retry, requeue with exponential backoff."""
    with SessionLocal() as session:
        job = session.query(NotificationJob).filter(NotificationJob.id == job_id).one_or_none()
        if job:
            job.last_error = error[:1000]
            if can_retry and job.attempts < job.max_attempts:
                # Exponential backoff: 30s, 120s, 480s
                delay_seconds = 30 * (4 ** (job.attempts - 1))
                job.status = "pending"
                job.scheduled_at = _utcnow() + timedelta(seconds=delay_seconds)
            else:
                job.status = "failed"
                job.completed_at = _utcnow()
            session.commit()


def get_queue_stats() -> dict:
    """Get queue health statistics for admin monitoring."""
    with SessionLocal() as session:
        from sqlalchemy import func
        stats = (
            session.query(NotificationJob.status, func.count(NotificationJob.id))
            .group_by(NotificationJob.status)
            .all()
        )
        result = {row[0]: row[1] for row in stats}
        return {
            "pending": result.get("pending", 0),
            "processing": result.get("processing", 0),
            "done": result.get("done", 0),
            "failed": result.get("failed", 0),
            "cancelled": result.get("cancelled", 0),
            "total": sum(result.values()),
        }


def cancel_pending_timetable_jobs_for_today() -> int:
    """
    Cancel all pending push_send jobs for today that were scheduled by the
    timetable reminder engine (category 'timetable' or 'digest') and have not
    yet been claimed by the worker (status='pending', scheduled_at > now).

    Called when a new timetable notice is scraped mid-day so stale reminders
    built from the old schedule are replaced with fresh ones.

    Returns the number of jobs cancelled.
    """
    now = _utcnow()
    # End of today in UTC — jobs scheduled past midnight are tomorrow's and
    # should not be touched.
    end_of_today_utc = now.replace(hour=23, minute=59, second=59, microsecond=999999)

    with SessionLocal() as session:
        # We identify timetable/digest jobs by inspecting the payload's
        # notification.category field. We filter by scheduled_at window
        # (between now and end of today) so we only cancel future jobs.
        jobs = (
            session.query(NotificationJob)
            .filter(
                NotificationJob.job_type == "push_send",
                NotificationJob.status == "pending",
                NotificationJob.scheduled_at > now,
                NotificationJob.scheduled_at <= end_of_today_utc,
            )
            .all()
        )

        cancelled = 0
        for job in jobs:
            try:
                payload = json.loads(job.payload)
                category = (payload.get("notification") or {}).get("category", "")
                if category in ("timetable", "digest"):
                    job.status = "cancelled"
                    job.completed_at = now
                    cancelled += 1
            except (json.JSONDecodeError, TypeError, AttributeError):
                continue

        if cancelled > 0:
            session.commit()

    logger.info(
        "cancel_pending_timetable_jobs_for_today: cancelled %d stale jobs", cancelled
    )
    return cancelled


def cleanup_old_jobs(days: int = 7) -> int:
    """Remove completed/failed/cancelled jobs older than N days."""
    cutoff = _utcnow() - timedelta(days=days)
    with SessionLocal() as session:
        deleted = (
            session.query(NotificationJob)
            .filter(NotificationJob.status.in_(["done", "failed", "cancelled"]))
            .filter(NotificationJob.created_at < cutoff)
            .delete(synchronize_session=False)
        )
        session.commit()
        return deleted


def reclaim_stale_processing_jobs(stale_minutes: int = 10) -> int:
    """
    Reclaim jobs stuck in 'processing' status for longer than stale_minutes.
    These are jobs where the worker thread crashed mid-delivery. Reset them
    to 'pending' so they get retried.
    """
    cutoff = _utcnow() - timedelta(minutes=stale_minutes)
    with SessionLocal() as session:
        stale_jobs = (
            session.query(NotificationJob)
            .filter(
                NotificationJob.status == "processing",
                NotificationJob.started_at < cutoff,
            )
            .all()
        )
        reclaimed = 0
        for job in stale_jobs:
            if job.attempts < job.max_attempts:
                job.status = "pending"
                job.scheduled_at = _utcnow()
                reclaimed += 1
            else:
                job.status = "failed"
                job.last_error = "Reclaimed after stale processing timeout"
                job.completed_at = _utcnow()
                reclaimed += 1
        session.commit()
        return reclaimed
