from datetime import datetime

from sqlalchemy import DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from db.base import Base


class FeedbackEntry(Base):
    __tablename__ = "feedback_entries"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, index=True)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    user_name: Mapped[str] = mapped_column(String(255), nullable=False, default="Anonymous")
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="new", index=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, index=True)
