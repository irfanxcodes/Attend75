"""
Push Worker — Dequeues push_send jobs and delivers via Web Push (pywebpush).

Threading-based worker pool (default 10 concurrent threads) that polls
notification_jobs for 'push_send' jobs and calls pywebpush.webpush for
each target subscription.

VAPID keys are read from environment:
  VAPID_PUBLIC_KEY  — base64url-encoded P256 public key
  VAPID_PRIVATE_KEY — base64url-encoded P256 private key
  VAPID_CONTACT_EMAIL — mailto: contact for push service

To generate keys (one-time):
  python -c "from py_vapid import Vapid; v=Vapid(); v.generate_keys(); print('public:', v.public_key); print('private:', v.private_key)"
  Or: vapid --gen
"""

import json
import logging
import os
import threading
import time
from datetime import datetime

from services import notification_queue, subscription_manager
from services.notification_history_service import log_notification
from services.payload_builder import CATEGORY_TTL_SECONDS

logger = logging.getLogger(__name__)

_POLL_INTERVAL_SECONDS = 2
_DEFAULT_CONCURRENCY = 10


def _get_vapid_claims() -> dict:
    return {
        "sub": os.getenv("VAPID_CONTACT_EMAIL", "mailto:admin@attend75.xyz"),
    }


def _get_vapid_private_key() -> str:
    return os.getenv("VAPID_PRIVATE_KEY", "")


def _send_webpush(subscription_info: dict, payload_json: str, ttl: int) -> int:
    """
    Send a single Web Push message. Returns the HTTP status code from the push
    service, or raises on network/config errors.
    """
    from pywebpush import webpush, WebPushException

    try:
        response = webpush(
            subscription_info=subscription_info,
            data=payload_json,
            vapid_private_key=_get_vapid_private_key(),
            vapid_claims=_get_vapid_claims(),
            ttl=ttl,
        )
        return response.status_code
    except WebPushException as e:
        # pywebpush wraps non-2xx responses in WebPushException
        if hasattr(e, "response") and e.response is not None:
            return e.response.status_code
        raise


def _process_job(job: dict) -> None:
    """
    Process a single push_send job:
    - payload contains: {notification: {...}, subscription_id: int | None, roll_number: str}
    - If subscription_id is specified, send to that one subscription.
    - Otherwise, send to ALL subscriptions for the roll_number.
    """
    payload = job["payload"]
    roll_number = payload.get("roll_number") or job.get("target_roll", "")
    notification_data = payload.get("notification", {})
    subscription_id = payload.get("subscription_id")

    if not notification_data or not roll_number:
        notification_queue.mark_failed(job["id"], "Missing notification or roll_number in payload", can_retry=False)
        return

    # Determine TTL from priority
    priority = notification_data.get("priority", "standard")
    ttl = CATEGORY_TTL_SECONDS.get(priority, CATEGORY_TTL_SECONDS["standard"])

    payload_json = json.dumps(notification_data)

    # Get target subscriptions
    if subscription_id:
        sub_info = subscription_manager.get_decrypted_subscription_info(subscription_id)
        targets = [sub_info] if sub_info else []
    else:
        sub_ids = subscription_manager.list_all_subscription_ids_for_roll(roll_number)
        targets = []
        for sid in sub_ids:
            info = subscription_manager.get_decrypted_subscription_info(sid)
            if info:
                targets.append(info)

    if not targets:
        # No active subscriptions — mark done (not a failure, the student unsubscribed)
        notification_queue.mark_done(job["id"])
        return

    all_success = True
    any_transient_failure = False

    for sub in targets:
        sub_info_dict = {
            "endpoint": sub["endpoint"],
            "keys": sub["keys"],
        }

        try:
            status_code = _send_webpush(sub_info_dict, payload_json, ttl)

            if 200 <= status_code < 300:
                # Success — update last_used_at
                subscription_manager.touch_last_used(sub["id"])
            elif status_code == 410:
                # Gone — subscription expired, remove it (Req 1.3)
                subscription_manager.remove_subscription_by_id(sub["id"])
                logger.info("Removed expired subscription %d (410 Gone)", sub["id"])
            elif status_code == 429 or status_code >= 500:
                # Transient — retry the whole job
                any_transient_failure = True
                all_success = False
            else:
                # Client error (400, 403, etc.) — permanent failure for this sub
                logger.warning("Push delivery to sub %d failed with status %d", sub["id"], status_code)
                all_success = False

        except Exception as exc:
            logger.warning("Push delivery to sub %d raised: %s", sub["id"], exc)
            any_transient_failure = True
            all_success = False

    # Log notification in history (regardless of partial failures, as long as we attempted)
    log_notification(
        roll_number=roll_number,
        category=notification_data.get("category", "unknown"),
        title=notification_data.get("title", ""),
        body=notification_data.get("body"),
        deep_link=notification_data.get("deepLink"),
        priority=priority,
        delivery_status="sent" if all_success else "failed",
    )

    if all_success:
        notification_queue.mark_done(job["id"])
    elif any_transient_failure:
        notification_queue.mark_failed(job["id"], "Transient push delivery failure", can_retry=True)
    else:
        notification_queue.mark_failed(job["id"], "Permanent push delivery failure", can_retry=False)


class PushWorker:
    """
    Background worker pool that polls for push_send jobs and delivers them.
    Mirrors NoticeScheduler's threading pattern.
    """

    def __init__(self, concurrency: int = _DEFAULT_CONCURRENCY):
        self._concurrency = concurrency
        self._running = False
        self._threads: list[threading.Thread] = []
        self._reaper_thread: threading.Thread | None = None

    def start(self) -> None:
        self._running = True
        for i in range(self._concurrency):
            t = threading.Thread(target=self._worker_loop, name=f"push-worker-{i}", daemon=True)
            t.start()
            self._threads.append(t)
        # Start the stale job reaper
        self._reaper_thread = threading.Thread(target=self._reaper_loop, name="push-reaper", daemon=True)
        self._reaper_thread.start()
        logger.info("PushWorker started with %d threads + reaper", self._concurrency)

    def stop(self) -> None:
        self._running = False
        logger.info("PushWorker stopping")

    def _reaper_loop(self) -> None:
        """Reclaim stale processing jobs every 5 minutes."""
        while self._running:
            try:
                reclaimed = notification_queue.reclaim_stale_processing_jobs(stale_minutes=10)
                if reclaimed > 0:
                    logger.info("Reclaimed %d stale processing jobs", reclaimed)
            except Exception:
                logger.exception("Reaper loop error")
            # Sleep 5 minutes between reaper runs
            for _ in range(300):
                if not self._running:
                    break
                time.sleep(1)

    def _worker_loop(self) -> None:
        while self._running:
            try:
                jobs = notification_queue.claim_pending_jobs(batch_size=5, job_types=["push_send"])
                if not jobs:
                    time.sleep(_POLL_INTERVAL_SECONDS)
                    continue

                for job in jobs:
                    if not self._running:
                        break
                    try:
                        _process_job(job)
                    except Exception:
                        logger.exception("Unhandled error processing push job %d", job["id"])
                        notification_queue.mark_failed(job["id"], "Unhandled worker exception", can_retry=True)

            except Exception:
                logger.exception("PushWorker poll loop error")
                time.sleep(_POLL_INTERVAL_SECONDS * 2)


# Module-level singleton
push_worker = PushWorker()
