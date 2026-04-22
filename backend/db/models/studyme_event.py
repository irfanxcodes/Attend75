from datetime import date, datetime

from sqlalchemy import Date, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from db.base import Base


class StudyMeEvent(Base):
    __tablename__ = "studyme_events"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    event_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    user_name: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    subject_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    lesson_name: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    topic_name: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    event_date: Mapped[date] = mapped_column(Date, nullable=False, index=True, default=date.today)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, index=True)
