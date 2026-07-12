from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from db.base import Base


class PremiumSubscription(Base):
    __tablename__ = "premium_subscriptions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    roll_number: Mapped[str] = mapped_column(String(32), unique=True, nullable=False, index=True)
    plan: Mapped[str] = mapped_column(String(32), nullable=False, default="monthly_19")
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="active")  # active, grace, expired, cancelled
    start_date: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    expiry_date: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    grace_ends_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    phonepe_subscription_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    payment_status: Mapped[str | None] = mapped_column(String(32), nullable=True)  # success, failed, pending
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
