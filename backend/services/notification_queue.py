"""
Notification Queue — Database-backed job queue for notification dispatch.

Provides enqueue/dequeue/process methods for asynchronous notification delivery.
Workers poll the queue and process jobs with configurable concurrency.
"""

import json
import logging
import threading
import time
from datetime import datetime, timedelta

from db.models.notification_job import NotificationJob
from db.session import SessionLocal

logger = logging.getLogger(__name__)


def enqueue(
    job_type: str,
    payload: dict,
    target_roll: str | None = None,
    priority: int = 0,
    scheduled_at: datetime | None = None,
    max_attempts: int = 3,
) -> int:
    """Add a job to the notification queue. Returns the job ID."""
    now = datetime.utcnow()
    with SessionLocal() as session:
        job = NotificationJob(
            job_type=job_type,
            status="pending",
            payload=json.dumps(payload),
            target_roll=target_roll,
            priority=priority,
            max_attempts=max_attempts,
            scheduled_at=scheduled_at or now,
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
    now = datetime.utcnow()
    with SessionLocal() as session:
        for job_data in jobs:
            job = NotificationJob(
                job_type=job_data["job_type"],
                status="pending",
                payload=json.dumps(job_data.get("payload", {})),
                target_roll=job_data.get("target_roll"),
                priority=job_data.get("priority", 0),
                max_attempts=job_data.get("max_attempts", 3),
                scheduled_at=job_data.get("scheduled_at", now),
                created_at=now,
            )
            session.add(job)
        session.commit()
    return len(jobs)


def claim_pending_jobs(batch_size: int = 10, job_types: list[str] | None = None) -> list[dict]:
    """
    Claim up to batch_size pending jobs for processing.
    Returns list of job dicts with id, job_type, payload, target_roll.
    Uses SELECT FOR UPDATE SKIP LOCKED for safe concurrent access.
    """
    now = datetime.utcnow()
    with SessionLocal() as session:
        query = (
            session.query(NotificationJob)
            .filter(NotificationJob.status == "pending")
            .filter(NotificationJob.scheduled_at <= now)
        )
        if job_types:
            query = query.filter(NotificationJob.job_type.in_(job_types))

        jobs = (
            query.order_by(NotificationJob.priority.desc(), NotificationJob.scheduled_at)
            .limit(batch_size)
            .with_for_update(skip_locked=True)
            .all()
        )

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
            job.completed_at = datetime.utcnow()
            session.commit()


def mark_failed(job_id: int, error: str, can_retry: bool = True) -> None:
    """Mark a job as failed. If retries remain and can_retry, set to retry status."""
    with SessionLocal() as session:
        job = session.query(NotificationJob).filter(NotificationJob.id == job_id).one_or_none()
        if job:
            job.last_error = error[:1000]
            if can_retry and job.attempts < job.max_attempts:
                # Exponential backoff: 30s, 120s, 480s
                delay_seconds = 30 * (4 ** (job.attempts - 1))
                job.status = "pending"
                job.scheduled_at = datetime.utcnow() + timedelta(seconds=delay_seconds)
            else:
                job.status = "failed"
                job.completed_at = datetime.utcnow()
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
            "total": sum(result.values()),
        }


def cleanup_old_jobs(days: int = 7) -> int:
    """Remove completed/failed jobs older than N days."""
    cutoff = datetime.utcnow() - timedelta(days=days)
    with SessionLocal() as session:
        deleted = (
            session.query(NotificationJob)
            .filter(NotificationJob.status.in_(["done", "failed"]))
            .filter(NotificationJob.created_at < cutoff)
            .delete(synchronize_session=False)
        )
        session.commit()
        return deleted
