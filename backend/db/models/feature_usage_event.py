from datetime import datetime

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from db.base import Base


class FeatureUsageEvent(Base):
    __tablename__ = "feature_usage_events"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    feature_name: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    action_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    user_identifier: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    subject_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    subject_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    semester_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    semester_label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    attendance_date: Mapped[str | None] = mapped_column(String(16), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False, index=True)
