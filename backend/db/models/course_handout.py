"""course_handouts — stores parsed syllabus from uploaded course handouts."""

import uuid
from datetime import datetime
from sqlalchemy import Column, DateTime, ForeignKey, Integer, JSON, String, Text
from db.base import Base


def _new_uuid() -> str:
    return str(uuid.uuid4())


class CourseHandout(Base):
    __tablename__ = "course_handouts"

    id = Column(String(36), primary_key=True, default=_new_uuid)
    subject_id = Column(String(64), nullable=False, index=True)  # e.g. "shac441" or "ma"
    subject_code = Column(String(32), nullable=True)             # e.g. "SHAC441"
    subject_name = Column(String(256), nullable=False)
    program = Column(String(64), nullable=True)                  # e.g. "BBA"
    semester = Column(String(16), nullable=True)                 # e.g. "V"
    credits = Column(Integer, nullable=True)
    instructor_name = Column(String(256), nullable=True)
    instructor_email = Column(String(256), nullable=True)
    uploaded_by = Column(String(64), nullable=False)             # roll number
    # Full structured syllabus as JSON
    # { modules: [{number, title, session_range, topics[], chapters[{title,sessions,topics[]}]}] }
    structured_syllabus = Column(JSON, nullable=False, default=dict)
    raw_text = Column(Text, nullable=True)                       # for debugging
    parse_status = Column(String(32), nullable=False, default="pending")
    # pending | processing | ready | failed
    error_message = Column(Text, nullable=True)
    is_active = Column(String(1), nullable=False, default="1")   # "1" = active version
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self) -> str:
        return f"<CourseHandout {self.subject_code} by={self.uploaded_by}>"
