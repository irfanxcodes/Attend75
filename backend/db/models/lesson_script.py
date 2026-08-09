"""lesson_scripts — one compiled Teaching Script per chapter upload."""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String

from db.base import Base


def _new_uuid() -> str:
    return str(uuid.uuid4())


class LessonScript(Base):
    __tablename__ = "lesson_scripts"

    id = Column(String(36), primary_key=True, default=_new_uuid)
    upload_id = Column(String(36), ForeignKey("chapter_uploads.id", ondelete="CASCADE"), nullable=False, index=True)
    subject_id = Column(String(64), nullable=False, index=True)
    chapter_key = Column(String(128), nullable=False, index=True)
    title = Column(String(256), nullable=False)
    total_blocks = Column(Integer, nullable=False, default=0)
    estimated_duration_seconds = Column(Integer, nullable=True)
    concept_count = Column(Integer, nullable=False, default=0)
    version = Column(Integer, nullable=False, default=1)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    def __repr__(self) -> str:
        return f"<LessonScript {self.title!r} v{self.version} active={self.is_active}>"
