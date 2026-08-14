"""
Storage Health Scheduler
========================

Runs every Monday at 9:30 AM IST (30 minutes after the weekly attendance summary
so push notifications don't stack on the admin's device).

Sends a weekly R2 storage health summary push to ADMIN_ROLL_NUMBER with:
  - Storage bytes used / cap / % (Guard 1 — authoritative)
  - Class A ops used this month / cap / % (Guard 2 — authoritative)
  - Slide count (Guard 3 — secondary)
  - Whether any guard is currently blocked
  - A reminder to check the Cloudflare dashboard for Class B usage

Also logs the summary to the server log regardless of whether push is configured,
so the health check is always captured even without a push subscription.
"""

import logging
import os
import threading
from datetime import datetime, timedelta, timezone

logger = logging.getLogger(__name__)

# IST = UTC+5:30
IST = timezone(timedelta(hours=5, minutes=30))


def run_storage_health_check() -> dict:
    """
    Fetch current storage cap state and send a summary push to the admin.
    Returns the status dict for logging / testing.
    """
    from services.storage_cap_service import get_status, get_caps
    from services.payload_builder import build_payload
    from services import notification_queue

    admin_roll = os.getenv("ADMIN_ROLL_NUMBER", "").strip()
    status = get_status()

    if "error" in status:
        logger.error("[StorageHealth] Could not fetch status: %s", status["error"])
        return status

    bytes_s  = status.get("storage_bytes", {})
    class_a  = status.get("class_a_ops", {})
    slides_s = status.get("slide_count", {})
    combined = status.get("combined", {})
    caps     = combined.get("all_caps", get_caps())

    blocked = combined.get("hard_cap_hit", False)

    # ── Build human-readable summary ──────────────────────────────────────
    def _pct(p):
        if p is None:
            return "?%"
        return f"{p:.1f}%"

    def _mb(b):
        if b is None:
            return "?"
        return f"{b / 1_048_576:.1f} MB"

    def _ops(n):
        if n is None:
            return "?"
        if n >= 1_000_000:
            return f"{n/1_000_000:.2f}M"
        if n >= 1_000:
            return f"{n/1_000:.1f}K"
        return str(n)

    bytes_used   = bytes_s.get("reserved_bytes", 0)
    bytes_pct    = bytes_s.get("used_percent", 0.0)
    class_a_ops  = class_a.get("reserved_ops", 0)
    class_a_pct  = class_a.get("used_percent", 0.0)
    slide_count  = slides_s.get("slides_real_db", slides_s.get("slides_tracked", 0))
    slide_cap    = slides_s.get("hard_cap_slides", caps.get("slides", 3000))

    # Pick emoji for overall health
    max_pct = max(bytes_pct or 0, class_a_pct or 0)
    if blocked:
        icon = "🛑"
    elif max_pct >= 90:
        icon = "🚨"
    elif max_pct >= 75:
        icon = "⚠️"
    elif max_pct >= 50:
        icon = "📊"
    else:
        icon = "✅"

    title = f"{icon} R2 Weekly Check"

    lines = [
        f"Storage: {_mb(bytes_used)} ({_pct(bytes_pct)})",
        f"Class A ops: {_ops(class_a_ops)}/mo ({_pct(class_a_pct)})",
        f"Slides: {slide_count:,}/{slide_cap:,}",
    ]
    if blocked:
        lines.append("⚠️ UPLOADS BLOCKED — reset required")
    else:
        lines.append("Check CF dash for Class B usage")

    body = " · ".join(lines)

    logger.info(
        "[StorageHealth] Weekly check — %s | bytes=%s (%s) | class_a=%s (%s) | slides=%d/%d | blocked=%s",
        icon,
        _mb(bytes_used), _pct(bytes_pct),
        _ops(class_a_ops), _pct(class_a_pct),
        slide_count, slide_cap,
        blocked,
    )

    # ── Send push to admin ────────────────────────────────────────────────
    if not admin_roll:
        logger.warning(
            "[StorageHealth] ADMIN_ROLL_NUMBER not set — push skipped. "
            "Set it in backend/.env to receive weekly storage health checks."
        )
        return status

    try:
        payload = build_payload(
            category="storage_alert",
            title=title,
            body=body,
            priority="high" if blocked or max_pct >= 90 else "standard",
            deep_link="/admin",
        )
        notification_queue.enqueue(
            job_type="push_send",
            payload={"roll_number": admin_roll, "notification": payload},
            target_roll=admin_roll,
        )
        logger.info("[StorageHealth] Weekly summary push enqueued for admin=%s", admin_roll)
    except Exception as exc:
        logger.error("[StorageHealth] Failed to enqueue push: %s", exc)

    return status


class StorageHealthScheduler:
    """
    Runs run_storage_health_check() every Monday at 9:30 AM IST.

    30-minute offset from WeeklySummaryScheduler (9:00 AM IST) so push
    notifications don't arrive simultaneously on the admin's device.
    """

    def __init__(self):
        self._running = False
        self._timer: threading.Timer | None = None

    def start(self) -> None:
        self._running = True
        self._schedule_next()
        logger.info("[StorageHealth] Scheduler started (fires Monday 9:30 AM IST)")

    def stop(self) -> None:
        self._running = False
        if self._timer:
            self._timer.cancel()

    def _schedule_next(self) -> None:
        if not self._running:
            return
        now_ist = datetime.now(IST)
        # Next Monday 9:30 AM IST
        days_until_monday = (7 - now_ist.weekday()) % 7
        if days_until_monday == 0 and (now_ist.hour > 9 or (now_ist.hour == 9 and now_ist.minute >= 30)):
            days_until_monday = 7
        target = (now_ist + timedelta(days=days_until_monday)).replace(
            hour=9, minute=30, second=0, microsecond=0
        )
        delay = (target - now_ist).total_seconds()
        self._timer = threading.Timer(max(delay, 60), self._run_cycle)
        self._timer.daemon = True
        self._timer.start()
        logger.debug(
            "[StorageHealth] Next check in %.1f hours (Monday 9:30 AM IST)",
            delay / 3600,
        )

    def _run_cycle(self) -> None:
        try:
            run_storage_health_check()
        except Exception:
            logger.exception("[StorageHealth] Weekly check cycle failed")
        finally:
            self._schedule_next()


storage_health_scheduler = StorageHealthScheduler()
