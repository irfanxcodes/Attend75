from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from db.base import Base


class NotificationHistory(Base):
    __tablename__ = "notification_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    roll_number: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    category: Mapped[str] = mapped_column(String(32), nullable=False, index=True)  # notice, attendance, timetable, digest, nudge, broadcast
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    deep_link: Mapped[str | None] = mapped_column(String(512), nullable=True)
    priority: Mapped[str] = mapped_column(String(16), nullable=False, default="standard")  # standard, high
    delivery_status: Mapped[str] = mapped_column(String(16), nullable=False, default="sent")  # queued, sent, failed, expired
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    read_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, index=True)
