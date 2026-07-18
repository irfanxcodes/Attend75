from datetime import datetime

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from db.base import Base


class PremiumWaitlist(Base):
    __tablename__ = "premium_waitlist"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    roll_number: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    joined_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False, index=True)
