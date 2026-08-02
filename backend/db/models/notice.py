from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from db.base import Base


class Notice(Base):
    __tablename__ = "notices"

    notice_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    portal_date: Mapped[date] = mapped_column(Date, nullable=False)
    category: Mapped[str] = mapped_column(String(32), nullable=False, default="General")
    category_confidence: Mapped[float] = mapped_column(Float, default=0.0)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    extracted_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    cleaned_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    keywords: Mapped[str | None] = mapped_column(Text, nullable=True)
    deadline: Mapped[date | None] = mapped_column(Date, nullable=True)
    deadline_raw: Mapped[str | None] = mapped_column(String(100), nullable=True)
    priority: Mapped[int] = mapped_column(Integer, default=0)
    is_important: Mapped[bool] = mapped_column(Boolean, default=False)
    target_program: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Comma-separated semester labels this notice targets (e.g. "Semester I,Semester III").
    # NULL means the notice is for all semesters.
    target_semesters: Mapped[str | None] = mapped_column(String(512), nullable=True)
    confidence_score: Mapped[float] = mapped_column(Float, default=0.0)
    viewed_count: Mapped[int] = mapped_column(Integer, default=0)
    pdf_url_path: Mapped[str] = mapped_column(String(64), nullable=False)
    processing_status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    processing_version: Mapped[int] = mapped_column(Integer, default=1)
    source_program: Mapped[str | None] = mapped_column(String(255), nullable=True)
    notification_sent_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
