"""lesson_slides — one row per rendered slide image for a chapter upload."""

import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.types import JSON
from db.base import Base


def _json_column():
    """Use JSONB on PostgreSQL, JSON on SQLite."""
    try:
        from sqlalchemy.dialects.postgresql import JSONB
        return JSONB
    except ImportError:
        return JSON


def _new_uuid() -> str:
    return str(uuid.uuid4())


class LessonSlide(Base):
    __tablename__ = "lesson_slides"

    id           = Column(String(36), primary_key=True, default=_new_uuid)
    upload_id    = Column(String(36), ForeignKey("chapter_uploads.id", ondelete="CASCADE"),
                          nullable=False, index=True)
    slide_number = Column(Integer, nullable=False)
    image_url    = Column(Text, nullable=False)   # Cloudflare R2 URL (or local /slides/... in dev)
    width_px     = Column(Integer, nullable=True)
    height_px    = Column(Integer, nullable=True)
    title        = Column(String(256), nullable=True)
    body_preview = Column(Text, nullable=True)
    # shape_bboxes: per-shape bounding boxes from PPTX extraction.
    # List of {shape_id, name, type, x, y, w, h, text_preview} — all coords normalised 0–1.
    # NULL for PDFs and DOCXs. Used by teaching_script_service for precise spotlighting.
    shape_bboxes = Column(_json_column()(), nullable=True)
    created_at   = Column(DateTime, nullable=False, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("upload_id", "slide_number", name="uq_lesson_slides_upload_slide"),
    )

    def __repr__(self) -> str:
        return f"<LessonSlide upload={self.upload_id} slide={self.slide_number}>"
