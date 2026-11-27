"""
Support Contribution Model — Track contribution attempts and confirmations.
"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.sql import func
from db.base import Base


class SupportContribution(Base):
    __tablename__ = "support_contributions"

    id = Column(Integer, primary_key=True, index=True)
    roll_number = Column(String(50), nullable=False, index=True)
    amount = Column(Integer, nullable=True)  # nullable — user might not specify
    utr_reference = Column(String(100), nullable=True)  # user can submit later
    card_style = Column(String(50), nullable=False)  # pulse, aurora, ticket, etc.
    action_type = Column(String(50), nullable=False)  # view, click_amount, open_custom, submit
    status = Column(String(20), nullable=False, default="pending", server_default="pending")  # pending/thanked/confirmed
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=True, onupdate=func.now())

    def __repr__(self):
        return f"<SupportContribution(id={self.id}, roll={self.roll_number}, amount={self.amount}, status={self.status})>"
