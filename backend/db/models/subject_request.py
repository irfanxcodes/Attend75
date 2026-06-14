from datetime import datetime

from sqlalchemy import DateTime, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from db.base import Base


class SubjectRequest(Base):
    __tablename__ = "subject_requests"
    __table_args__ = (
        UniqueConstraint("user_identifier", "subject_code", name="uq_subject_request_user_subject"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_identifier: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    subject_code: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    subject_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    subject_abbreviation: Mapped[str | None] = mapped_column(String(32), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False, index=True)
