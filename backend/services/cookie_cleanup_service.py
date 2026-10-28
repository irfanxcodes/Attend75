"""
Cookie Cleanup Service

Periodically cleans up expired portal sessions from database.
"""
import logging
from db.session import SessionLocal
from services.cookie_manager import CookieManager

_logger = logging.getLogger(__name__)


def cleanup_expired_sessions() -> int:
    """
    Clean up expired portal sessions from database.
    Should be called periodically (e.g., hourly via cron or scheduler).
    
    Returns:
        Number of sessions deleted
    """
    try:
        with SessionLocal() as db:
            manager = CookieManager(db)
            deleted = manager.cleanup_expired_sessions()
            
            if deleted > 0:
                _logger.info(f"[CookieCleanup] Cleaned up {deleted} expired portal sessions")
            
            return deleted
    except Exception as e:
        _logger.error(f"[CookieCleanup] Failed to cleanup expired sessions: {e}")
        return 0


if __name__ == "__main__":
    # Can be run standalone for manual cleanup
    print("Cleaning up expired portal sessions...")
    deleted = cleanup_expired_sessions()
    print(f"Deleted {deleted} expired sessions")
