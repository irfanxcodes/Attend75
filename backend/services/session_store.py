import os
import secrets
import threading
import time
from dataclasses import dataclass

from scrapers.portal_scraper import PortalScraper


@dataclass
class SessionRecord:
    token: str
    roll_number: str
    scraper: PortalScraper
    created_at: float
    last_accessed_at: float


class SessionStore:
    def __init__(self):
        self._lock = threading.Lock()
        self._sessions: dict[str, SessionRecord] = {}
        self._max_sessions = int(os.getenv("SESSION_STORE_MAX_SESSIONS", "5000"))
        self._session_ttl_seconds = int(os.getenv("SESSION_STORE_TTL_SECONDS", "43200"))

    def _prune_expired_locked(self, now: float) -> None:
        expired_tokens = [
            token
            for token, record in self._sessions.items()
            if (now - record.last_accessed_at) > self._session_ttl_seconds
        ]
        for token in expired_tokens:
            self._sessions.pop(token, None)

    def _prune_overflow_locked(self) -> None:
        overflow = len(self._sessions) - self._max_sessions
        if overflow <= 0:
            return

        oldest_tokens = sorted(
            self._sessions.items(),
            key=lambda pair: pair[1].last_accessed_at,
        )[:overflow]

        for token, _ in oldest_tokens:
            self._sessions.pop(token, None)

    def create(self, roll_number: str, scraper: PortalScraper) -> SessionRecord:
        token = secrets.token_urlsafe(24)
        now = time.time()
        record = SessionRecord(
            token=token,
            roll_number=roll_number,
            scraper=scraper,
            created_at=now,
            last_accessed_at=now,
        )
        with self._lock:
            self._prune_expired_locked(now)
            self._prune_overflow_locked()
            self._sessions[token] = record
        return record

    def get(self, token: str) -> SessionRecord | None:
        now = time.time()
        with self._lock:
            self._prune_expired_locked(now)
            record = self._sessions.get(token)
            if record is not None:
                record.last_accessed_at = now
            return record

    def stats(self) -> dict[str, int]:
        now = time.time()
        with self._lock:
            self._prune_expired_locked(now)
            return {
                "active_sessions": len(self._sessions),
                "max_sessions": self._max_sessions,
                "session_ttl_seconds": self._session_ttl_seconds,
            }


session_store = SessionStore()
