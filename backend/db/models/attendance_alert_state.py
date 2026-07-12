from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from db.base import Base


class AttendanceAlertState(Base):
    """Tracks last-alerted attendance state per student per subject for deduplication."""
    __tablename__ = "attendance_alert_states"
    __table_args__ = (
        UniqueConstraint("roll_number", "subject_abbr", name="uq_alert_state_student_subject"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    roll_number: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    subject_abbr: Mapped[str] = mapped_column(String(32), nullable=False)
    last_alerted_bracket: Mapped[str] = mapped_column(String(16), nullable=False)  # "above_80", "75_to_80", "below_75"
    last_alerted_percent: Mapped[float] = mapped_column(Float, nullable=False)
    last_alerted_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
