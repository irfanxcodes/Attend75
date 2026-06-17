from datetime import datetime

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from db.base import Base


class PwaInstall(Base):
    __tablename__ = "pwa_installs"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    device_platform: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    user_agent: Mapped[str | None] = mapped_column(String(512), nullable=True)
    roll_number: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False, index=True)
