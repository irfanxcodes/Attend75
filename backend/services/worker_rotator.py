"""
Cloudflare Worker rotation — cycles through multiple Worker URLs so no single
Worker accumulates enough logins to get its IP range blocked by the portal.

Config via environment:
  PORTAL_WORKER_URLS   comma-separated list of worker base URLs
                       e.g. https://attend75-proxy.kiro-one-mail.workers.dev,
                            https://attend75-proxy-2.kiro-one-mail.workers.dev,...
  PORTAL_WORKER_URL    single worker URL (fallback if PORTAL_WORKER_URLS not set)
  PORTAL_WORKER_ROTATE_EVERY  how many logins before switching to next worker (default 30)

The rotator tracks login counts per worker in memory. When a worker is marked
blocked it is skipped and the next one is tried. A blocked worker is retried
after PORTAL_WORKER_COOLDOWN_SECONDS (default 3600 = 1 hour).
"""

import logging
import os
import threading
import time

_logger = logging.getLogger(__name__)


def _load_worker_urls() -> list[str]:
    multi = os.getenv("PORTAL_WORKER_URLS", "").strip()
    if multi:
        urls = [u.strip().rstrip("/") for u in multi.split(",") if u.strip()]
        if urls:
            return urls
    single = os.getenv("PORTAL_WORKER_URL", "").strip().rstrip("/")
    if single:
        return [single]
    return []


class _WorkerState:
    def __init__(self, url: str):
        self.url = url
        self.login_count: int = 0
        self.blocked_at: float | None = None  # epoch seconds when marked blocked

    def is_blocked(self, cooldown_seconds: float) -> bool:
        if self.blocked_at is None:
            return False
        if time.time() - self.blocked_at >= cooldown_seconds:
            # Cooldown expired — give it another chance
            _logger.info("[WorkerRotator] Cooldown expired for %s, retrying", self.url)
            self.blocked_at = None
            self.login_count = 0
            return False
        return True

    def mark_blocked(self) -> None:
        self.blocked_at = time.time()
        _logger.warning("[WorkerRotator] Worker marked blocked: %s", self.url)

    def increment(self) -> None:
        self.login_count += 1


class WorkerRotator:
    """Thread-safe round-robin worker rotator with block detection."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._workers: list[_WorkerState] = []
        self._index: int = 0
        self._rotate_every: int = 30
        self._cooldown_seconds: float = 3600.0
        self._reload()

    def _reload(self) -> None:
        urls = _load_worker_urls()
        self._workers = [_WorkerState(u) for u in urls]
        try:
            self._rotate_every = max(1, int(os.getenv("PORTAL_WORKER_ROTATE_EVERY", "30")))
        except ValueError:
            self._rotate_every = 30
        try:
            self._cooldown_seconds = max(60.0, float(os.getenv("PORTAL_WORKER_COOLDOWN_SECONDS", "3600")))
        except ValueError:
            self._cooldown_seconds = 3600.0

        if self._workers:
            _logger.info(
                "[WorkerRotator] Loaded %d workers, rotate_every=%d, cooldown=%.0fs",
                len(self._workers),
                self._rotate_every,
                self._cooldown_seconds,
            )
        else:
            _logger.warning("[WorkerRotator] No worker URLs configured — direct portal access will be used")

    def get_worker_url(self) -> str | None:
        """Return the current active worker base URL, or None if none available."""
        with self._lock:
            if not self._workers:
                return None

            # Try each worker starting from current index
            for _ in range(len(self._workers)):
                worker = self._workers[self._index % len(self._workers)]

                if worker.is_blocked(self._cooldown_seconds):
                    self._index = (self._index + 1) % len(self._workers)
                    continue

                # Rotate to next worker after threshold
                if worker.login_count >= self._rotate_every:
                    _logger.info(
                        "[WorkerRotator] Worker %s hit %d logins, rotating to next",
                        worker.url, worker.login_count,
                    )
                    self._index = (self._index + 1) % len(self._workers)
                    worker = self._workers[self._index % len(self._workers)]
                    if worker.is_blocked(self._cooldown_seconds):
                        continue

                worker.increment()
                return worker.url

            # All workers blocked
            _logger.error("[WorkerRotator] All workers are blocked — no worker available")
            return None

    def mark_current_blocked(self) -> None:
        """Call this when a timeout/block is detected on the current worker."""
        with self._lock:
            if not self._workers:
                return
            worker = self._workers[self._index % len(self._workers)]
            worker.mark_blocked()
            # Immediately advance to next
            self._index = (self._index + 1) % len(self._workers)

    def status(self) -> list[dict]:
        """Return status of all workers (for admin page)."""
        with self._lock:
            result = []
            for i, w in enumerate(self._workers):
                blocked = w.is_blocked(self._cooldown_seconds)
                result.append({
                    "url": w.url,
                    "index": i,
                    "login_count": w.login_count,
                    "blocked": blocked,
                    "blocked_at": w.blocked_at,
                    "active": (i == self._index % len(self._workers)) and not blocked,
                })
            return result


# Global singleton — shared across all scraper instances
worker_rotator = WorkerRotator()
