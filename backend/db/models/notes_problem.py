"""notes_problems — one extracted question per row."""

import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text

from db.base import Base


def _new_uuid() -> str:
    return str(uuid.uuid4())


class NotesProblem(Base):
    __tablename__ = "notes_problems"

    id = Column(String(36), primary_key=True, default=_new_uuid)
    problem_set_id = Column(String(36), ForeignKey("notes_problem_sets.id"), nullable=False, index=True)
    sequence_order = Column(Integer, nullable=False)
    question_text = Column(Text, nullable=False)
    topic = Column(String(256), nullable=True)
    given_values = Column(Text, nullable=True)   # JSON-encoded list[str]
    find = Column(Text, nullable=True)
    method = Column(String(256), nullable=True)
    difficulty = Column(String(16), nullable=True)  # easy | medium | hard
    answer = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    def __repr__(self) -> str:
        return f"<NotesProblem {self.id} order={self.sequence_order} difficulty={self.difficulty}>"
