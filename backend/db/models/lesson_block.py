"""lesson_blocks — individual steps of a Teaching Script."""

import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text

from db.base import Base


def _new_uuid() -> str:
    return str(uuid.uuid4())


class LessonBlock(Base):
    __tablename__ = "lesson_blocks"

    id = Column(String(36), primary_key=True, default=_new_uuid)
    script_id = Column(String(36), ForeignKey("lesson_scripts.id", ondelete="CASCADE"), nullable=False, index=True)
    concept_id = Column(String(36), ForeignKey("ai_concepts.id", ondelete="SET NULL"), nullable=True, index=True)
    sequence_order = Column(Integer, nullable=False)
    block_type = Column(String(32), nullable=False)
    content = Column(Text, nullable=False)
    voice_text = Column(Text, nullable=True)
    expected_answer = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    def __repr__(self) -> str:
        return f"<LessonBlock type={self.block_type!r} order={self.sequence_order}>"
