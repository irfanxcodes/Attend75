from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from db.base import Base


class PushSubscription(Base):
    __tablename__ = "push_subscriptions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    roll_number: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    endpoint: Mapped[str] = mapped_column(Text, nullable=False)  # Encrypted at rest
    p256dh_key: Mapped[str] = mapped_column(Text, nullable=False)
    auth_key: Mapped[str] = mapped_column(Text, nullable=False)
    device_info: Mapped[str | None] = mapped_column(String(255), nullable=True)
    has_timetable: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    consent_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    consent_method: Mapped[str] = mapped_column(String(32), nullable=False, default="browser_prompt")
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
