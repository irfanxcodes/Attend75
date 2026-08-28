"""
CareerProfile DB model

Stores each student's chosen career track and when their roadmap was
last generated. One row per student (PK = roll_number).

Light footprint — no large blobs. The roadmap itself is re-generated
on demand (LLM call) and not persisted to keep the DB lean.
"""

from datetime import datetime

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from db.base import Base


class CareerProfile(Base):
    __tablename__ = "career_profiles"

    roll_number: Mapped[str] = mapped_column(String(32), primary_key=True)
    chosen_track_slug: Mapped[str | None] = mapped_column(String(64), nullable=True)
    chosen_track_label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
