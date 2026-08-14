"""notes_problem_sets — one per processed notes upload."""

import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String

from db.base import Base


def _new_uuid() -> str:
    return str(uuid.uuid4())


class NotesProblemSet(Base):
    __tablename__ = "notes_problem_sets"

    id = Column(String(36), primary_key=True, default=_new_uuid)
    upload_id = Column(String(36), ForeignKey("chapter_uploads.id"), nullable=False, index=True)
    subject_id = Column(String(64), nullable=False, index=True)
    chapter_key = Column(String(128), nullable=True)
    title = Column(String(256), nullable=True)
    problem_count = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    def __repr__(self) -> str:
        return f"<NotesProblemSet {self.subject_id}/{self.chapter_key} problems={self.problem_count}>"
