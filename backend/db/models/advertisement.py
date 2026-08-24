from datetime import datetime

from sqlalchemy import DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from db.base import Base


class Advertisement(Base):
    __tablename__ = "advertisements"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    # 'image' or 'video'
    media_type: Mapped[str] = mapped_column(String(10), nullable=False)
    # Where this ad appears: 'dashboard' | 'arcade_game_over'
    placement: Mapped[str] = mapped_column(String(32), nullable=False, default="dashboard")
    # Path relative to uploads dir, e.g. "ads/abc123.jpg"
    file_path: Mapped[str] = mapped_column(String(512), nullable=False)
    # Original filename for display in admin
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    # Optional click-through URL for the ad
    link_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Advertiser / shop name shown in admin
    advertiser_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Whether this ad is currently live
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )
