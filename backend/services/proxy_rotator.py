"""
Proxy rotation for portal scraping.

Picks a random proxy from the pool every PORTAL_PROXY_ROTATE_EVERY logins.
The next proxy is always different from the current one, so no two consecutive
login bursts share the same IP — no predictable pattern in the portal's logs.

Configuration (backend/.env):
    PORTAL_PROXIES=http://user:pass@ip1:port,...
    PORTAL_PROXY_ROTATE_EVERY=15   (switch after this many logins, default 15)

If PORTAL_PROXIES is not set, no proxy is used (direct connection).
"""

import logging
import os
import random
import threading

logger = logging.getLogger(__name__)


class ProxyRotator:
    """Thread-safe random proxy rotator — switches to a different random IP every N logins."""

    def __init__(self, proxies: list[str] | None = None, rotate_every: int | None = None):
        raw = proxies or self._load_from_env()
        self._proxies = [p.strip() for p in raw if p.strip()]
        self._lock = threading.Lock()
        self._rotate_every = rotate_every or int(os.getenv("PORTAL_PROXY_ROTATE_EVERY", "15"))
        self._use_count = 0
        self._current_proxy: str | None = (
            random.choice(self._proxies) if self._proxies else None
        )

        if self._proxies:
            logger.info(
                "ProxyRotator initialized with %d proxies, randomizing every %d logins",
                len(self._proxies), self._rotate_every,
            )
        else:
            logger.info("ProxyRotator: no proxies configured, using direct connection")

    @staticmethod
    def _load_from_env() -> list[str]:
        raw = os.getenv("PORTAL_PROXIES", "").strip()
        if not raw:
            return []
        return [p.strip() for p in raw.split(",") if p.strip()]

    @property
    def enabled(self) -> bool:
        return bool(self._proxies)

    def next_proxy_dict(self) -> dict | None:
        """
        Return the current proxy as a requests-compatible dict.
        After every PORTAL_PROXY_ROTATE_EVERY calls, picks a new random proxy
        that is guaranteed to be different from the current one.
        Returns None if no proxies are configured.
        """
        if not self._proxies:
            return None

        with self._lock:
            self._use_count += 1
            if self._use_count > self._rotate_every:
                self._current_proxy = self._pick_different(self._current_proxy)
                self._use_count = 1
                logger.info("Proxy switched (random) → %s", self._redact(self._current_proxy))
            proxy_url = self._current_proxy

        return {"http": proxy_url, "https": proxy_url}

    def _pick_different(self, current: str | None) -> str:
        """Pick a random proxy that isn't the current one (if pool > 1)."""
        if len(self._proxies) == 1:
            return self._proxies[0]
        candidates = [p for p in self._proxies if p != current]
        return random.choice(candidates)

    @staticmethod
    def _redact(proxy_url: str) -> str:
        try:
            from urllib.parse import urlparse, urlunparse
            parsed = urlparse(proxy_url)
            if parsed.password:
                redacted = parsed._replace(
                    netloc=f"{parsed.username}:***@{parsed.hostname}:{parsed.port}"
                )
                return urlunparse(redacted)
        except Exception:
            pass
        return proxy_url


# Module-level singleton — shared across all scraper instances
_rotator: ProxyRotator | None = None
_rotator_lock = threading.Lock()


def get_rotator() -> ProxyRotator:
    global _rotator
    if _rotator is None:
        with _rotator_lock:
            if _rotator is None:
                _rotator = ProxyRotator()
    return _rotator
