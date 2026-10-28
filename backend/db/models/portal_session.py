"""
Portal Session model for storing user portal cookies.

This enables Lambda/Worker-based requests where Python manages cookies
instead of storing them in worker memory.
"""
from datetime import datetime
from sqlalchemy import Column, String, Text, DateTime, Index
from sqlalchemy.dialects.postgresql import JSONB
from db.base import Base
from db.session import IS_SQLITE


class PortalSession(Base):
    __tablename__ = "portal_sessions"
    
    roll_number = Column(String(20), primary_key=True)
    
    # Store cookies as JSON (TEXT for SQLite, JSONB for PostgreSQL)
    if IS_SQLITE:
        cookies = Column(Text, nullable=False)
    else:
        cookies = Column(JSONB, nullable=False)
    
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=False)
    last_used = Column(DateTime, nullable=False, default=datetime.utcnow)
    
    # Index for cleanup queries
    __table_args__ = (
        Index('idx_portal_sessions_expires', 'expires_at'),
    )
    
    def __repr__(self):
        return f"<PortalSession(roll_number='{self.roll_number}', expires_at='{self.expires_at}')>"
