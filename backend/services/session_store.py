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
        # How long to consider a session "active" for dashboard display (default: 10 hours)
        # This is independent of authentication TTL - sessions remain valid for full TTL,
        # but only show in "active sessions" feed if accessed within this threshold.
        self._active_display_threshold_seconds = int(os.getenv("SESSION_ACTIVE_DISPLAY_HOURS", "10")) * 3600

    def _close_scraper(self, record: "SessionRecord") -> None:
        """Close the underlying requests.Session to release socket file descriptors."""
        try:
            record.scraper.session.close()
        except Exception:
            pass

    def _prune_expired_locked(self, now: float) -> None:
        expired_tokens = [
            token
            for token, record in self._sessions.items()
            if (now - record.last_accessed_at) > self._session_ttl_seconds
        ]
        for token in expired_tokens:
            record = self._sessions.pop(token, None)
            if record is not None:
                self._close_scraper(record)

    def _prune_overflow_locked(self) -> None:
        overflow = len(self._sessions) - self._max_sessions
        if overflow <= 0:
            return

        oldest_tokens = sorted(
            self._sessions.items(),
            key=lambda pair: pair[1].last_accessed_at,
        )[:overflow]

        for token, record in oldest_tokens:
            self._sessions.pop(token, None)
            self._close_scraper(record)

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
            
            # Count recently active sessions (within display threshold)
            active_threshold = now - self._active_display_threshold_seconds
            recently_active_count = sum(
                1 for record in self._sessions.values()
                if record.last_accessed_at > active_threshold
            )
            
            return {
                "active_sessions": len(self._sessions),  # All authenticated sessions
                "recently_active_sessions": recently_active_count,  # Active within threshold
                "max_sessions": self._max_sessions,
                "session_ttl_seconds": self._session_ttl_seconds,
                "active_display_threshold_seconds": self._active_display_threshold_seconds,
            }

    def active_sessions_list(self) -> list[dict]:
        """Return all active sessions for admin display, deduplicated by roll number.

        Only shows sessions that have been accessed within the active display threshold
        (default: 10 hours). Sessions remain authenticated for the full TTL (24 hours),
        but only appear as "active" if they were recently used.

        When the same user has multiple active sessions (e.g. multiple browser
        tabs or re-logins), only the most-recently-accessed session is kept so
        the admin live feed does not show the same person multiple times.
        """
        now = time.time()
        with self._lock:
            self._prune_expired_locked(now)
            
            # Filter: only include sessions accessed within the active display threshold
            active_threshold = now - self._active_display_threshold_seconds
            recently_active = [
                record for record in self._sessions.values()
                if record.last_accessed_at > active_threshold
            ]
            
            sorted_sessions = sorted(
                recently_active,
                key=lambda r: r.last_accessed_at,
                reverse=True,
            )

        # Deduplicate: keep only the most-recent session per roll number.
        # Sessions without a roll number (anonymous/guest) are kept as-is.
        seen_rolls: set[str] = set()
        deduped: list[SessionRecord] = []
        for record in sorted_sessions:
            if record.roll_number:
                if record.roll_number in seen_rolls:
                    continue
                seen_rolls.add(record.roll_number)
            deduped.append(record)

        results = []
        for record in deduped:
            started_seconds_ago = int(now - record.created_at)
            last_active_seconds_ago = int(now - record.last_accessed_at)
            results.append({
                "rollNumber": record.roll_number,
                "userName": record.user_name,
                "photoUrl": f"https://api.attend75.xyz/photo/{record.roll_number}" if record.roll_number else None,
                "attendancePercent": record.attendance_percent,
                "userAgent": record.user_agent,
                "startedSecondsAgo": started_seconds_ago,
                "lastActiveSecondsAgo": last_active_seconds_ago,  # NEW: when they last made a request
                "eventCount": record.event_count,
                "email": getattr(record, 'email', None),
                "programSn": record.program_sn,
                "programFull": record.program_full,
                "semesterLabel": record.selected_semester_label,
            })
        return results


session_store = SessionStore()
