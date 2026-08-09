"""ai_concepts — each extracted teachable concept from a chapter."""

import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, JSON

from db.base import Base


def _new_uuid() -> str:
    return str(uuid.uuid4())


class AIConcept(Base):
    __tablename__ = "ai_concepts"

    id = Column(String(36), primary_key=True, default=_new_uuid)
    upload_id = Column(String(36), ForeignKey("chapter_uploads.id", ondelete="CASCADE"), nullable=False, index=True)
    subject_id = Column(String(64), nullable=False, index=True)
    chapter_key = Column(String(128), nullable=False, index=True)
    sequence_order = Column(Integer, nullable=False, default=0)
    title = Column(String(256), nullable=False)
    explanation = Column(Text, nullable=False)
    definition = Column(Text, nullable=True)
    keywords = Column(JSON, nullable=False, default=list)
    formulas = Column(JSON, nullable=False, default=list)
    examples = Column(JSON, nullable=False, default=list)
    misconceptions = Column(JSON, nullable=False, default=list)
    exam_questions = Column(JSON, nullable=False, default=list)
    source_page = Column(Integer, nullable=True)
    source_heading = Column(String(256), nullable=True)
    prerequisites = Column(JSON, nullable=False, default=list)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    # ── StudyMe 2.0 additions (migration 0018) ────────────────────────────
    # content_type: 'theory' | 'numerical' | 'mixed'
    # Drives rendering strategy in the Canvas (numerical → step-by-step focus)
    content_type = Column(String(16), nullable=False, default="theory")

    # worked_examples: list of {question, steps: [{step, calculation, note}], answer, source_page}
    worked_examples = Column(JSON, nullable=False, default=list)

    # source_elements: list of {slide_or_page, element_type, text}
    # Maps concept back to original document elements for PPT mode
    source_elements = Column(JSON, nullable=False, default=list)

    def __repr__(self) -> str:
        return f"<AIConcept {self.title!r} order={self.sequence_order} type={self.content_type}>"
