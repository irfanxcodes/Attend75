import threading
import time
from collections import deque
from datetime import datetime, timezone


class ScraperMetricsStore:
    def __init__(self):
        self._lock = threading.Lock()
        self._total_attempts = 0
        self._success_count = 0
        self._failure_count = 0
        self._total_duration_ms = 0.0
        self._last_failure_timestamp: str | None = None
        self._last_failure_code: str | None = None
        self._last_success_timestamp: str | None = None
        self._consecutive_network_failures = 0
        self._recent_network_failures_epoch = deque(maxlen=20)

    def observe(self, success: bool, duration_ms: float, failure_kind: str | None = None, failure_code: str | None = None) -> None:
        now_epoch = time.time()
        now_iso = datetime.now(timezone.utc).isoformat()

        with self._lock:
            self._total_attempts += 1
            self._total_duration_ms += max(float(duration_ms), 0.0)

            if success:
                self._success_count += 1
                self._last_success_timestamp = now_iso
                self._consecutive_network_failures = 0
                return

            self._failure_count += 1
            self._last_failure_timestamp = now_iso
            self._last_failure_code = failure_code

            if failure_kind == "network":
                self._consecutive_network_failures += 1
                self._recent_network_failures_epoch.append(now_epoch)
            else:
                self._consecutive_network_failures = 0

    def snapshot(self) -> dict[str, float | int | str | bool | None]:
        with self._lock:
            total_attempts = self._total_attempts
            success_count = self._success_count
            failure_count = self._failure_count

            average_scrape_time_ms = round(self._total_duration_ms / total_attempts, 2) if total_attempts else 0.0
            success_rate_percent = round((success_count / total_attempts) * 100, 2) if total_attempts else 0.0
            failure_rate_percent = round((failure_count / total_attempts) * 100, 2) if total_attempts else 0.0

            now_epoch = time.time()
            recent_window_seconds = 600
            recent_network_failures = [
                ts for ts in self._recent_network_failures_epoch
                if (now_epoch - ts) <= recent_window_seconds
            ]

            portal_downtime_detected = (
                self._consecutive_network_failures >= 3 and len(recent_network_failures) >= 3
            )

            return {
                "totalAttempts": total_attempts,
                "successRatePercent": success_rate_percent,
                "failureRatePercent": failure_rate_percent,
                "averageScrapeTimeMs": average_scrape_time_ms,
                "lastFailureTimestamp": self._last_failure_timestamp,
                "lastFailureCode": self._last_failure_code,
                "portalDowntimeDetected": portal_downtime_detected,
                "consecutiveNetworkFailures": self._consecutive_network_failures,
            }


scraper_metrics_store = ScraperMetricsStore()


def observe_scrape(success: bool, duration_ms: float, failure_kind: str | None = None, failure_code: str | None = None) -> None:
    scraper_metrics_store.observe(
        success=success,
        duration_ms=duration_ms,
        failure_kind=failure_kind,
        failure_code=failure_code,
    )


def get_scraper_metrics_snapshot() -> dict[str, float | int | str | bool | None]:
    return scraper_metrics_store.snapshot()
