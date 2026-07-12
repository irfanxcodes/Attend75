from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from db.base import Base


class PaymentTransaction(Base):
    __tablename__ = "payment_transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    roll_number: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    transaction_id: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    phonepe_reference: Mapped[str | None] = mapped_column(String(128), nullable=True)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False)  # success, failed, pending, refunded
    payment_method: Mapped[str] = mapped_column(String(32), nullable=False, default="upi_autopay")
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, index=True)
