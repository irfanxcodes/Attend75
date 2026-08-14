"""slide_script_feedback — per-student rating on an AI teaching script.

Collected passively after a speech action completes in SlidePlayer.
Feedback data is for analysis only — no automatic script regeneration.
Admin tooling reads this table to decide when to manually trigger regen.

rating: 1 = thumbs up, -1 = thumbs down.
reason: optional short label — "too_fast" | "wrong_content" | "unclear" | "off_topic" | "other"
"""

import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, SmallInteger, String, UniqueConstraint

from db.base import Base


def _new_uuid() -> str:
    return str(uuid.uuid4())


class SlideScriptFeedback(Base):
    __tablename__ = "slide_script_feedback"

    id            = Column(String(36), primary_key=True, default=_new_uuid)
    upload_id     = Column(String(36), ForeignKey("chapter_uploads.id", ondelete="CASCADE"),
                           nullable=False, index=True)
    slide_number  = Column(Integer, nullable=False)
    roll_number   = Column(String(64), nullable=False, index=True)
    rating        = Column(SmallInteger, nullable=False)           # 1 or -1
    script_version = Column(Integer, nullable=False, default=1)
    reason        = Column(String(64), nullable=True)              # optional label

    created_at    = Column(DateTime, nullable=False, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint(
            "upload_id", "slide_number", "roll_number", "script_version",
            name="uq_slide_feedback_student_slide_version",
        ),
    )

    def __repr__(self) -> str:
        return (
            f"<SlideScriptFeedback upload={self.upload_id} "
            f"slide={self.slide_number} rating={self.rating}>"
        )
