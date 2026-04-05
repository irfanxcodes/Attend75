import threading
from datetime import datetime, timezone
from collections import defaultdict
import time


class RequestMetricsStore:
    def __init__(self):
        self._lock = threading.Lock()
        self._started_at_epoch = time.time()
        self._total_requests = 0
        self._failed_requests = 0
        self._total_duration_ms = 0.0
        self._last_error_timestamp: str | None = None
        self._path_stats: dict[str, dict[str, float]] = defaultdict(lambda: {"total": 0, "success": 0})

    def observe(self, path: str, status_code: int, duration_ms: float) -> None:
        normalized_path = (path or "").strip() or "/"
        with self._lock:
            self._total_requests += 1
            self._total_duration_ms += max(float(duration_ms), 0.0)

            is_success = int(status_code) < 400
            if not is_success:
                self._failed_requests += 1
                self._last_error_timestamp = datetime.now(timezone.utc).isoformat()

            stat = self._path_stats[normalized_path]
            stat["total"] += 1
            if is_success:
                stat["success"] += 1

    def snapshot(self) -> dict[str, float | int | None]:
        with self._lock:
            total_requests = self._total_requests
            failed_requests = self._failed_requests
            average_response_time_ms = round(self._total_duration_ms / total_requests, 2) if total_requests else 0.0
            uptime_seconds = int(max(time.time() - self._started_at_epoch, 0))

            scraper_totals = 0
            scraper_successes = 0
            for path, stat in self._path_stats.items():
                if path == "/login" or path.startswith("/attendance") or path.startswith("/auth/firebase"):
                    scraper_totals += int(stat["total"])
                    scraper_successes += int(stat["success"])

            scraper_success_rate = None
            if scraper_totals > 0:
                scraper_success_rate = round((scraper_successes / scraper_totals) * 100, 2)

            return {
                "totalRequests": total_requests,
                "failedRequestCount": failed_requests,
                "averageResponseTimeMs": average_response_time_ms,
                "lastErrorTimestamp": self._last_error_timestamp,
                "uptimeSeconds": uptime_seconds,
                "scraperSuccessRate": scraper_success_rate,
            }


request_metrics_store = RequestMetricsStore()


def observe_request(path: str, status_code: int, duration_ms: float) -> None:
    request_metrics_store.observe(path=path, status_code=status_code, duration_ms=duration_ms)


def get_request_metrics_snapshot() -> dict[str, float | int | None]:
    return request_metrics_store.snapshot()
