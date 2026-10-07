"""
GitHub Actions scraper bridge.

Flow:
  1. trigger_and_wait() triggers a GitHub Actions workflow with student credentials
  2. The workflow runs on a fresh Azure IP, scrapes the portal, POSTs result back
  3. receive_result() stores the result keyed by job_id
  4. trigger_and_wait() polls until result arrives, retrying on blocked IPs

Config (.env):
  GITHUB_SCRAPER_ENABLED=true
  GITHUB_SCRAPER_OWNER=irfanxcodes
  GITHUB_SCRAPER_REPO=attend75-scraper
  GITHUB_SCRAPER_TOKEN=<PAT with actions:write scope>
  GITHUB_SCRAPER_WEBHOOK_SECRET=<random secret string>
  GITHUB_SCRAPER_TIMEOUT_SECONDS=60   (per-attempt timeout)
  GITHUB_SCRAPER_MAX_ATTEMPTS=4       (retries on blocked runner IPs)
  GITHUB_SCRAPER_POLL_INTERVAL=2      (seconds between polls)
"""

import hmac
import logging
import os
import threading
import time
import uuid

import requests

_logger = logging.getLogger(__name__)

_results: dict[str, dict] = {}
_results_lock = threading.Lock()
_RESULT_TTL_SECONDS = 300


def _cleanup_old_results() -> None:
    now = time.time()
    with _results_lock:
        expired = [k for k, v in _results.items() if now - v.get("arrived_at", now) > _RESULT_TTL_SECONDS]
        for k in expired:
            del _results[k]


def _is_enabled() -> bool:
    return os.getenv("GITHUB_SCRAPER_ENABLED", "false").strip().lower() in {"1", "true", "yes", "on"}


def _get_config() -> dict:
    return {
        "owner": os.getenv("GITHUB_SCRAPER_OWNER", "irfanxcodes").strip(),
        "repo": os.getenv("GITHUB_SCRAPER_REPO", "attend75-scraper").strip(),
        "token": os.getenv("GITHUB_SCRAPER_TOKEN", "").strip(),
        "webhook_secret": os.getenv("GITHUB_SCRAPER_WEBHOOK_SECRET", "").strip(),
        "timeout": float(os.getenv("GITHUB_SCRAPER_TIMEOUT_SECONDS", "60")),
        "poll_interval": float(os.getenv("GITHUB_SCRAPER_POLL_INTERVAL", "2")),
        "webhook_base": os.getenv("GITHUB_SCRAPER_WEBHOOK_BASE", "https://api.attend75.xyz").strip().rstrip("/"),
        "max_attempts": max(1, int(os.getenv("GITHUB_SCRAPER_MAX_ATTEMPTS", "4"))),
    }


def is_enabled() -> bool:
    return _is_enabled()


def trigger_workflow(roll_number: str, password: str) -> str:
    """Trigger GitHub Actions workflow and return job_id."""
    config = _get_config()
    job_id = str(uuid.uuid4())
    webhook_url = f"{config['webhook_base']}/internal/scrape-result"

    url = f"https://api.github.com/repos/{config['owner']}/{config['repo']}/actions/workflows/scrape.yml/dispatches"
    headers = {
        "Authorization": f"Bearer {config['token']}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    payload = {
        "ref": "main",
        "inputs": {
            "roll_number": roll_number.strip().upper(),
            "password": password,
            "job_id": job_id,
            "webhook_url": webhook_url,
        },
    }

    resp = requests.post(url, json=payload, headers=headers, timeout=15)
    if resp.status_code == 404:
        raise RuntimeError(f"GitHub repo or workflow not found: {config['owner']}/{config['repo']}")
    if resp.status_code == 401:
        raise RuntimeError("GitHub token invalid or missing actions:write permission")
    resp.raise_for_status()

    with _results_lock:
        _results[job_id] = {"status": "pending", "arrived_at": time.time()}

    _logger.info("[GitHubScraper] Triggered workflow job_id=%s for roll=%s", job_id, roll_number)
    return job_id


def wait_for_result(job_id: str, timeout_seconds: float | None = None) -> dict:
    """Block until the scrape result arrives or timeout expires."""
    config = _get_config()
    deadline = time.time() + (timeout_seconds or config["timeout"])
    poll = config["poll_interval"]

    while time.time() < deadline:
        with _results_lock:
            entry = _results.get(job_id)
        if entry and entry["status"] != "pending":
            _logger.info("[GitHubScraper] Result received job_id=%s status=%s", job_id, entry["status"])
            return entry.get("result") or {}
        time.sleep(poll)

    raise TimeoutError(f"GitHub scraper timed out after {timeout_seconds or config['timeout']}s for job_id={job_id}")


def trigger_and_wait(roll_number: str, password: str, max_attempts: int | None = None) -> dict:
    """
    Trigger GitHub Actions and wait for result, retrying if runner IP is blocked.
    Each retry gets a fresh runner with a different Azure IP.
    """
    config = _get_config()
    if max_attempts is None:
        max_attempts = config["max_attempts"]

    last_error = None

    for attempt in range(1, max_attempts + 1):
        job_id = trigger_workflow(roll_number, password)
        _logger.info("[GitHubScraper] Attempt %d/%d job_id=%s", attempt, max_attempts, job_id)

        try:
            result = wait_for_result(job_id, timeout_seconds=config["timeout"])
        except TimeoutError as e:
            last_error = e
            _logger.warning("[GitHubScraper] Attempt %d timed out, retrying...", attempt)
            continue

        if result.get("status") == "error":
            err = result.get("error", "")
            # Portal blocked this runner's IP — retry gets a fresh IP
            is_ip_blocked = (
                "Login POST returned 200" in err
                or "captcha" in err.lower()
                or "authentication cookies missing" in err.lower()
                or "timed out" in err.lower()
            )
            if is_ip_blocked:
                _logger.warning("[GitHubScraper] Attempt %d IP blocked, retrying with fresh runner...", attempt)
                last_error = RuntimeError(err)
                continue
            # Definitive error (wrong password etc.) — don't retry
            return result

        _logger.info("[GitHubScraper] Succeeded on attempt %d/%d", attempt, max_attempts)
        return result

    if last_error:
        raise last_error
    raise TimeoutError("All GitHub scraper attempts failed")


def receive_result(job_id: str, result: dict) -> None:
    """Called by the webhook endpoint when GitHub runner POSTs back."""
    _cleanup_old_results()
    with _results_lock:
        _results[job_id] = {
            "status": result.get("status", "success"),
            "result": result,
            "arrived_at": time.time(),
        }
    _logger.info("[GitHubScraper] Result stored job_id=%s status=%s", job_id, result.get("status"))


def verify_webhook_signature(body: bytes, signature_header: str) -> bool:
    """Verify shared secret from scraper webhook request."""
    config = _get_config()
    secret = config["webhook_secret"]
    if not secret:
        _logger.warning("[GitHubScraper] No webhook secret configured — skipping verification")
        return True
    if not signature_header:
        return False
    return hmac.compare_digest(secret, signature_header)
