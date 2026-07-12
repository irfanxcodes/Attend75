from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from db.base import Base


class NotificationPreference(Base):
    __tablename__ = "notification_preferences"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    roll_number: Mapped[str] = mapped_column(String(32), unique=True, nullable=False, index=True)

    # Master toggles
    notices_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    attendance_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    timetable_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    daily_digest_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    weekly_summary_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Notice category filters (all enabled by default)
    notice_exam: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    notice_fee: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    notice_academic: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    notice_internship: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    notice_event: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    notice_guest_lecture: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    notice_general: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Timetable settings
    reminder_lead_minutes: Mapped[int] = mapped_column(Integer, default=15, nullable=False)  # 10, 15, 30, 60
    daily_digest_hour: Mapped[int] = mapped_column(Integer, default=8, nullable=False)  # 6-10 IST (hour)
    daily_digest_minute: Mapped[int] = mapped_column(Integer, default=0, nullable=False)  # 0 or 30

    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
