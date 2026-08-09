from datetime import datetime

from sqlalchemy import DateTime, Float, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from db.base import Base


class FaceRaterScore(Base):
    __tablename__ = "face_rater_scores"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    anonymous_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    username: Mapped[str] = mapped_column(String(32), nullable=True)   # friendly display name
    score: Mapped[float] = mapped_column(Float, nullable=False)
    tier: Mapped[str] = mapped_column(String(32), nullable=False)
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )

    __table_args__ = (
        Index("ix_face_rater_scores_leaderboard", "score"),
    )
