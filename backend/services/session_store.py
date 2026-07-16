import os
import secrets
import threading
import time
from dataclasses import dataclass
from dataclasses import field

from scrapers.portal_scraper import PortalScraper


@dataclass
class SessionRecord:
    token: str
    roll_number: str
    user_name: str | None
    photo_url: str | None
    scraper: PortalScraper
    created_at: float
    last_accessed_at: float
    attendance_percent: float | None = None
    user_agent: str | None = None
    event_count: int = 0
    program_sn: str | None = None
    program_full: str | None = None
    selected_semester_label: str | None = None
    scraper_lock: threading.RLock = field(default_factory=threading.RLock)
    # Cached subjects for timetable (populated on first attendance fetch)
    cached_subjects: list[dict] = field(default_factory=list)
    # Raw attendance rows kept so the timetable service can re-resolve abbrs
    # using the timetable notice's subject lookup table (course code/name → abbr)
    cached_attendance_rows: list[dict] = field(default_factory=list)


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

    def create(self, roll_number: str, scraper: PortalScraper, user_name: str | None = None, photo_url: str | None = None, attendance_percent: float | None = None, user_agent: str | None = None, program_sn: str | None = None, program_full: str | None = None, selected_semester_label: str | None = None) -> SessionRecord:
        token = secrets.token_urlsafe(24)
        now = time.time()
        record = SessionRecord(
            token=token,
            roll_number=roll_number,
            user_name=(user_name or "").strip() or None,
            photo_url=(photo_url or "").strip() or None,
            scraper=scraper,
            created_at=now,
            last_accessed_at=now,
            attendance_percent=attendance_percent,
            user_agent=(user_agent or "").strip() or None,
            event_count=0,
            program_sn=(program_sn or "").strip() or None,
            program_full=(program_full or "").strip() or None,
            selected_semester_label=(selected_semester_label or "").strip() or None,
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
                record.event_count += 1
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

    def active_sessions_list(self) -> list[dict]:
        """Return all active sessions for admin display."""
        now = time.time()
        with self._lock:
            self._prune_expired_locked(now)
            sorted_sessions = sorted(
                self._sessions.values(),
                key=lambda r: r.last_accessed_at,
                reverse=True,
            )

        results = []
        for record in sorted_sessions:
            started_seconds_ago = int(now - record.created_at)
            results.append({
                "rollNumber": record.roll_number,
                "userName": record.user_name,
                "photoUrl": f"/api/photo/{record.roll_number}" if record.roll_number else None,
                "attendancePercent": record.attendance_percent,
                "userAgent": record.user_agent,
                "startedSecondsAgo": started_seconds_ago,
                "eventCount": record.event_count,
                "email": getattr(record, 'email', None),
                "programSn": record.program_sn,
                "programFull": record.program_full,
                "semesterLabel": record.selected_semester_label,
            })
        return results


session_store = SessionStore()
