from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, UniqueConstraint, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from db.base import Base


class UserNotice(Base):
    __tablename__ = "user_notices"
    __table_args__ = (
        UniqueConstraint("user_id", "notice_id", name="uq_user_notice"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    notice_id: Mapped[int] = mapped_column(Integer, ForeignKey("notices.notice_id"), nullable=False)
    bookmarked: Mapped[bool] = mapped_column(Boolean, default=False)
    dismissed: Mapped[bool] = mapped_column(Boolean, default=False)
    opened_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_viewed: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
