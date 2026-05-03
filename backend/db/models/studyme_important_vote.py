from datetime import datetime

from sqlalchemy import DateTime, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from db.base import Base


class StudyMeImportantVote(Base):
    __tablename__ = "studyme_important_votes"
    __table_args__ = (
        UniqueConstraint("user_id", "entity_type", "subject_id", "entity_id", name="uq_studyme_important_vote_user_entity"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    subject_id: Mapped[str] = mapped_column(String(128), index=True, nullable=False)
    subject_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    lesson_id: Mapped[str | None] = mapped_column(String(128), index=True, nullable=True)
    lesson_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    topic_id: Mapped[str | None] = mapped_column(String(128), index=True, nullable=True)
    topic_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    entity_type: Mapped[str] = mapped_column(String(16), index=True, nullable=False)
    entity_id: Mapped[str] = mapped_column(String(128), index=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
