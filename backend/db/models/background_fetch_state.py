from datetime import datetime

from sqlalchemy import DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from db.base import Base


class BackgroundFetchState(Base):
    """Per-student metrics for the background attendance fetcher."""
    __tablename__ = "background_fetch_state"

    roll_number: Mapped[str] = mapped_column(String(32), primary_key=True)
    last_fetch_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_fetch_status: Mapped[str] = mapped_column(String(16), default="pending")  # success, failed, invalid_credentials
    consecutive_failures: Mapped[int] = mapped_column(Integer, default=0)
    next_eligible_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
