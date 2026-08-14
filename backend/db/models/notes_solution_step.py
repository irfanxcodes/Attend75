"""notes_solution_steps — one teaching step per row within a problem."""

import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text

from db.base import Base


def _new_uuid() -> str:
    return str(uuid.uuid4())


class NotesSolutionStep(Base):
    __tablename__ = "notes_solution_steps"

    id = Column(String(36), primary_key=True, default=_new_uuid)
    problem_id = Column(String(36), ForeignKey("notes_problems.id"), nullable=False, index=True)
    sequence_order = Column(Integer, nullable=False)
    # context | given | formula | calculation | result | insight
    step_type = Column(String(32), nullable=False)
    # "text" | "table"
    content_format = Column(String(16), nullable=False, server_default="text", default="text")
    content = Column(Text, nullable=False)
    voice_text = Column(Text, nullable=True)
    # JSON: {"type": "highlight"|"circle"|"arrow", "target_text": "...", "color": "#..."} or null
    annotation = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    def __repr__(self) -> str:
        return f"<NotesSolutionStep {self.id} order={self.sequence_order} type={self.step_type}>"
