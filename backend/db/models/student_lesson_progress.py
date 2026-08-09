"""student_lesson_progress — per-student progress through an AI lesson."""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, JSON, String, UniqueConstraint

from db.base import Base


def _new_uuid() -> str:
    return str(uuid.uuid4())


class StudentLessonProgress(Base):
    __tablename__ = "student_lesson_progress"

    id = Column(String(36), primary_key=True, default=_new_uuid)
    roll_number = Column(String(64), nullable=False, index=True)
    script_id = Column(String(36), ForeignKey("lesson_scripts.id", ondelete="CASCADE"), nullable=False, index=True)
    last_block_index = Column(Integer, nullable=False, default=0)
    completed = Column(Boolean, nullable=False, default=False)
    concepts_seen = Column(JSON, nullable=False, default=list)
    quiz_results = Column(JSON, nullable=False, default=dict)
    doubts_asked = Column(Integer, nullable=False, default=0)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("roll_number", "script_id", name="uq_student_lesson_progress_roll_script"),
    )

    def __repr__(self) -> str:
        return f"<StudentLessonProgress roll={self.roll_number} block={self.last_block_index}>"
