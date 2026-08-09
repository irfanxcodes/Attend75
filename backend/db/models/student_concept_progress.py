"""student_concept_progress — per-student concept-level mastery state."""

import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, UniqueConstraint

from db.base import Base


def _new_uuid() -> str:
    return str(uuid.uuid4())


# Valid status values
CONCEPT_STATUS = {
    "unseen",       # student has never opened this concept
    "learning",     # student has opened it but not answered a question yet
    "understood",   # student answered correctly
    "struggling",   # student answered incorrectly at least once
    "review_due",   # scheduled for spaced repetition review
    "mastered",     # consistently correct over time
}


class StudentConceptProgress(Base):
    __tablename__ = "student_concept_progress"

    id = Column(String(36), primary_key=True, default=_new_uuid)
    roll_number = Column(String(64), nullable=False, index=True)
    concept_id = Column(
        String(36),
        ForeignKey("ai_concepts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    upload_id = Column(String(36), nullable=False, index=True)  # denormalized for fast queries

    # status: unseen | learning | understood | struggling | review_due | mastered
    status = Column(String(16), nullable=False, default="unseen")
    attempts = Column(Integer, nullable=False, default=0)
    correct_attempts = Column(Integer, nullable=False, default=0)
    confidence = Column(Float, nullable=True)  # 0.0–1.0

    last_seen_at = Column(DateTime, nullable=True)
    next_review_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("roll_number", "concept_id", name="uq_student_concept_progress_roll_concept"),
    )

    def __repr__(self) -> str:
        return f"<StudentConceptProgress roll={self.roll_number} concept={self.concept_id} status={self.status}>"
