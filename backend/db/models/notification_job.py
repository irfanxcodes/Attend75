from datetime import datetime, timezone

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from db.base import Base


class NotificationJob(Base):
    """Database-backed job queue for notification dispatch."""
    __tablename__ = "notification_jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    job_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)  # push_send, attendance_fetch, deadline_check, digest, nudge
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending", index=True)  # pending, processing, done, failed, cancelled
    payload: Mapped[str] = mapped_column(Text, nullable=False)  # JSON blob with job-specific data
    target_roll: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    priority: Mapped[int] = mapped_column(Integer, default=0, nullable=False)  # Higher = process first
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    max_attempts: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    scheduled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
