"""
Datacenter proxy rotation — cycles through HTTP proxies so no single IP
accumulates enough logins to get blocked by the portal.

This is the second fallback tier, sitting between Cloudflare Workers and
GitHub Actions:
  Tier 1: Cloudflare Workers  (worker_rotator.py)
  Tier 2: Datacenter proxies  (this file)
  Tier 3: GitHub Actions      (github_scraper_service.py)

Config via environment:
  PORTAL_PROXIES              comma-separated list of proxy URLs
                              format: http://user:pass@host:port
                              e.g. http://user:pass@31.59.20.176:6754,
                                   http://user:pass@45.38.107.97:6014,...
  PORTAL_PROXY_ROTATE_EVERY   how many logins before switching to next proxy
                              (default 15)
  PORTAL_PROXY_COOLDOWN_SECONDS  how long a blocked proxy is skipped
                              (default 3600 = 1 hour)

The rotator tracks login counts per proxy in memory. When a proxy is marked
blocked it is skipped and the next one is tried. A blocked proxy is retried
after PORTAL_PROXY_COOLDOWN_SECONDS.
"""

import logging
import os
import threading
import time

_logger = logging.getLogger(__name__)


def _load_proxy_urls() -> list[str]:
    raw = os.getenv("PORTAL_PROXIES", "").strip()
    if not raw:
        return []
    return [u.strip() for u in raw.split(",") if u.strip()]


class _ProxyState:
    def __init__(self, url: str):
        self.url = url
        self.login_count: int = 0
        self.blocked_at: float | None = None  # epoch seconds when marked blocked

    def is_blocked(self, cooldown_seconds: float) -> bool:
        if self.blocked_at is None:
            return False
        if time.time() - self.blocked_at >= cooldown_seconds:
            _logger.info("[ProxyRotator] Cooldown expired for %s, retrying", self.url)
            self.blocked_at = None
            self.login_count = 0
            return False
        return True

    def mark_blocked(self) -> None:
        self.blocked_at = time.time()
        _logger.warning("[ProxyRotator] Proxy marked blocked: %s", self._safe_url())

    def increment(self) -> None:
        self.login_count += 1

    def _safe_url(self) -> str:
        """Return URL with password redacted for logging."""
        try:
            if "@" in self.url:
                scheme_creds, rest = self.url.split("@", 1)
                scheme = scheme_creds.split("://")[0]
                return f"{scheme}://***@{rest}"
        except Exception:
            pass
        return self.url


class ProxyRotator:
    """Thread-safe round-robin proxy rotator with block detection."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._proxies: list[_ProxyState] = []
        self._index: int = 0
        self._rotate_every: int = 15
        self._cooldown_seconds: float = 3600.0
        self._reload()

    def _reload(self) -> None:
        urls = _load_proxy_urls()
        self._proxies = [_ProxyState(u) for u in urls]
        try:
            self._rotate_every = max(1, int(os.getenv("PORTAL_PROXY_ROTATE_EVERY", "15")))
        except ValueError:
            self._rotate_every = 15
        try:
            self._cooldown_seconds = max(60.0, float(os.getenv("PORTAL_PROXY_COOLDOWN_SECONDS", "3600")))
        except ValueError:
            self._cooldown_seconds = 3600.0

        if self._proxies:
            _logger.info(
                "[ProxyRotator] Loaded %d proxies, rotate_every=%d, cooldown=%.0fs",
                len(self._proxies),
                self._rotate_every,
                self._cooldown_seconds,
            )
        else:
            _logger.info("[ProxyRotator] No proxy URLs configured — proxy tier disabled")

    def get_proxy_dict(self) -> dict[str, str] | None:
        """
        Return a requests-compatible proxy dict for the current active proxy,
        or None if no proxies are available/all blocked.

        Usage:
            proxies = proxy_rotator.get_proxy_dict()
            if proxies:
                session.proxies.update(proxies)
        """
        with self._lock:
            if not self._proxies:
                return None

            for _ in range(len(self._proxies)):
                proxy = self._proxies[self._index % len(self._proxies)]

                if proxy.is_blocked(self._cooldown_seconds):
                    self._index = (self._index + 1) % len(self._proxies)
                    continue

                # Rotate after threshold
                if proxy.login_count >= self._rotate_every:
                    _logger.info(
                        "[ProxyRotator] Proxy %s hit %d logins, rotating to next",
                        proxy._safe_url(), proxy.login_count,
                    )
                    self._index = (self._index + 1) % len(self._proxies)
                    proxy = self._proxies[self._index % len(self._proxies)]
                    if proxy.is_blocked(self._cooldown_seconds):
                        continue

                proxy.increment()
                return {"http": proxy.url, "https": proxy.url}

            _logger.warning("[ProxyRotator] All proxies are blocked — proxy tier unavailable")
            return None

    def mark_current_blocked(self) -> None:
        """Call when a timeout/block is detected on the current proxy."""
        with self._lock:
            if not self._proxies:
                return
            proxy = self._proxies[self._index % len(self._proxies)]
            proxy.mark_blocked()
            self._index = (self._index + 1) % len(self._proxies)

    def has_proxies(self) -> bool:
        """Return True if any proxies are configured (even if all blocked)."""
        with self._lock:
            return bool(self._proxies)

    def any_available(self) -> bool:
        """Return True if at least one proxy is not currently blocked."""
        with self._lock:
            return any(
                not p.is_blocked(self._cooldown_seconds) for p in self._proxies
            )

    def status(self) -> list[dict]:
        """Return status of all proxies (for admin page)."""
        with self._lock:
            result = []
            for i, p in enumerate(self._proxies):
                blocked = p.is_blocked(self._cooldown_seconds)
                result.append({
                    "url": p._safe_url(),
                    "index": i,
                    "login_count": p.login_count,
                    "blocked": blocked,
                    "blocked_at": p.blocked_at,
                    "active": (i == self._index % len(self._proxies)) and not blocked,
                })
            return result


# Global singleton — shared across all scraper instances
proxy_rotator = ProxyRotator()
