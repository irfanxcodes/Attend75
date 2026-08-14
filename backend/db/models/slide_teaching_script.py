"""slide_teaching_scripts — AI-generated action sequence per slide.

Generated once on first student access, reused forever after that.
Bump `version` to trigger regeneration with an improved prompt.
"""

import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.types import JSON
from db.base import Base


def _new_uuid() -> str:
    return str(uuid.uuid4())


def _json_column():
    """Use JSONB on PostgreSQL, JSON on SQLite."""
    try:
        from sqlalchemy.dialects.postgresql import JSONB
        return JSONB
    except ImportError:
        return JSON


class SlideTeachingScript(Base):
    __tablename__ = "slide_teaching_scripts"

    id           = Column(String(36), primary_key=True, default=_new_uuid)
    upload_id    = Column(String(36), ForeignKey("chapter_uploads.id", ondelete="CASCADE"),
                          nullable=False, index=True)
    slide_number = Column(Integer, nullable=False)

    # Ordered list of teaching actions. Each action is one of:
    #   {type: "speech",    text: "..."}
    #   {type: "spotlight", coords: {x, y, w, h}, fallback_region: "title"|"body"|"table", duration: 0.6}
    #   {type: "pause",     duration: 1.2}
    actions      = Column(JSON, nullable=False, default=list)

    model_used   = Column(String(64), nullable=True)
    version      = Column(Integer, nullable=False, default=1)
    created_at   = Column(DateTime, nullable=False, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint(
            "upload_id", "slide_number", "version",
            name="uq_slide_teaching_scripts_upload_slide_version"
        ),
    )

    def __repr__(self) -> str:
        return f"<SlideTeachingScript upload={self.upload_id} slide={self.slide_number} v{self.version}>"
