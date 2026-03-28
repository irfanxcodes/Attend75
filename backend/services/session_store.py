import secrets
import threading
from dataclasses import dataclass

from scrapers.portal_scraper import PortalScraper


@dataclass
class SessionRecord:
    token: str
    roll_number: str
    scraper: PortalScraper


class SessionStore:
    def __init__(self):
        self._lock = threading.Lock()
        self._sessions: dict[str, SessionRecord] = {}

    def create(self, roll_number: str, scraper: PortalScraper) -> SessionRecord:
        token = secrets.token_urlsafe(24)
        record = SessionRecord(token=token, roll_number=roll_number, scraper=scraper)
        with self._lock:
            self._sessions[token] = record
        return record

    def get(self, token: str) -> SessionRecord | None:
        with self._lock:
            return self._sessions.get(token)


session_store = SessionStore()
