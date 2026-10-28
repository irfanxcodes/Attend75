"""
Cookie Manager Service

Handles storing and retrieving portal cookies for Lambda/Worker requests.
Python backend manages cookies instead of storing them in worker memory.
"""
import json
import logging
from datetime import datetime, timedelta
from typing import Dict, Optional

from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError

from db.models.portal_session import PortalSession
from db.session import IS_SQLITE

_logger = logging.getLogger(__name__)

# Session timeout (matches portal ASP.NET session timeout)
SESSION_TIMEOUT_MINUTES = 30


class CookieManager:
    """Manages portal session cookies in database"""
    
    def __init__(self, db_session: Session):
        self.db = db_session
    
    def save_cookies(self, roll_number: str, cookies: Dict[str, str]) -> None:
        """
        Save portal cookies for a user session.
        
        Args:
            roll_number: Student roll number
            cookies: Dictionary of cookie name -> value
        """
        if not cookies:
            _logger.warning(f"[CookieManager] No cookies to save for {roll_number}")
            return
        
        try:
            # Serialize cookies
            if IS_SQLITE:
                cookies_data = json.dumps(cookies)
            else:
                cookies_data = cookies  # PostgreSQL JSONB handles dict directly
            
            # Calculate expiration (30 minutes from now)
            expires_at = datetime.utcnow() + timedelta(minutes=SESSION_TIMEOUT_MINUTES)
            
            # Check if session exists
            existing = self.db.query(PortalSession).filter(
                PortalSession.roll_number == roll_number
            ).first()
            
            if existing:
                # Update existing session
                existing.cookies = cookies_data
                existing.expires_at = expires_at
                existing.last_used = datetime.utcnow()
                _logger.info(
                    f"[CookieManager] Updated session for {roll_number} "
                    f"({len(cookies)} cookies, expires {expires_at.strftime('%H:%M:%S')})"
                )
            else:
                # Create new session
                new_session = PortalSession(
                    roll_number=roll_number,
                    cookies=cookies_data,
                    expires_at=expires_at,
                    last_used=datetime.utcnow()
                )
                self.db.add(new_session)
                _logger.info(
                    f"[CookieManager] Created session for {roll_number} "
                    f"({len(cookies)} cookies, expires {expires_at.strftime('%H:%M:%S')})"
                )
            
            self.db.commit()
            
        except SQLAlchemyError as e:
            self.db.rollback()
            _logger.error(f"[CookieManager] Failed to save cookies for {roll_number}: {e}")
            raise
    
    def load_cookies(self, roll_number: str) -> Optional[Dict[str, str]]:
        """
        Load portal cookies for a user session.
        
        Args:
            roll_number: Student roll number
            
        Returns:
            Dictionary of cookies, or None if session expired/not found
        """
        try:
            session = self.db.query(PortalSession).filter(
                PortalSession.roll_number == roll_number
            ).first()
            
            if not session:
                _logger.debug(f"[CookieManager] No session found for {roll_number}")
                return None
            
            # Check if session expired
            if session.expires_at < datetime.utcnow():
                _logger.info(
                    f"[CookieManager] Session expired for {roll_number} "
                    f"(expired at {session.expires_at.strftime('%H:%M:%S')})"
                )
                # Delete expired session
                self.db.delete(session)
                self.db.commit()
                return None
            
            # Deserialize cookies
            if IS_SQLITE:
                cookies = json.loads(session.cookies)
            else:
                cookies = session.cookies  # PostgreSQL JSONB returns dict
            
            # Update last_used timestamp
            session.last_used = datetime.utcnow()
            self.db.commit()
            
            time_left = session.expires_at - datetime.utcnow()
            _logger.info(
                f"[CookieManager] Loaded session for {roll_number} "
                f"({len(cookies)} cookies, {int(time_left.total_seconds() / 60)} min left)"
            )
            
            return cookies
            
        except SQLAlchemyError as e:
            _logger.error(f"[CookieManager] Failed to load cookies for {roll_number}: {e}")
            return None
    
    def delete_session(self, roll_number: str) -> None:
        """
        Delete a user's portal session (e.g., on logout).
        
        Args:
            roll_number: Student roll number
        """
        try:
            deleted = self.db.query(PortalSession).filter(
                PortalSession.roll_number == roll_number
            ).delete()
            
            if deleted:
                self.db.commit()
                _logger.info(f"[CookieManager] Deleted session for {roll_number}")
            
        except SQLAlchemyError as e:
            self.db.rollback()
            _logger.error(f"[CookieManager] Failed to delete session for {roll_number}: {e}")
    
    def cleanup_expired_sessions(self) -> int:
        """
        Clean up all expired sessions (maintenance task).
        
        Returns:
            Number of sessions deleted
        """
        try:
            deleted = self.db.query(PortalSession).filter(
                PortalSession.expires_at < datetime.utcnow()
            ).delete()
            
            if deleted:
                self.db.commit()
                _logger.info(f"[CookieManager] Cleaned up {deleted} expired sessions")
            
            return deleted
            
        except SQLAlchemyError as e:
            self.db.rollback()
            _logger.error(f"[CookieManager] Failed to cleanup expired sessions: {e}")
            return 0
    
    @staticmethod
    def is_session_expired(expires_at: datetime) -> bool:
        """Check if a session timestamp is expired"""
        return expires_at < datetime.utcnow()
