from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from db.base import Base


class StudentRegistry(Base):
    __tablename__ = "student_registry"

    roll_number: Mapped[str] = mapped_column(String(32), primary_key=True)
    first_seen_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    login_count: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    last_login_method: Mapped[str] = mapped_column(String(16), nullable=False)
    created_via: Mapped[str] = mapped_column(String(16), nullable=False)
    has_google_linked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    linked_google_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
