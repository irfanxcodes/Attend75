import json
import logging
import os
from datetime import date, datetime, timezone
from pathlib import Path
from threading import Lock
from uuid import uuid4

logger = logging.getLogger(__name__)


def _resolve_feedback_file() -> Path:
    configured_path = os.getenv("FEEDBACK_FILE_PATH", "").strip()
    if configured_path:
        return Path(configured_path).expanduser().resolve()
    return Path(__file__).resolve().parent.parent / "feedback.json"


_FEEDBACK_LOCK = Lock()
_ALLOWED_FEEDBACK_STATUSES = {"new", "reviewed", "resolved"}


def _parse_iso_timestamp(timestamp_value: str | None) -> datetime | None:
    raw = (timestamp_value or "").strip()
    if not raw:
        return None

    try:
        if raw.endswith("Z"):
            raw = f"{raw[:-1]}+00:00"
        parsed = datetime.fromisoformat(raw)
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except ValueError:
        return None


def _normalize_feedback_entry(entry: dict) -> dict[str, str]:
    message = str(entry.get("message") or "").strip()
    user_name = str(entry.get("user_name") or entry.get("userName") or "").strip() or "Anonymous"

    timestamp = _parse_iso_timestamp(str(entry.get("timestamp") or ""))
    normalized_timestamp = (timestamp or datetime.now(timezone.utc)).isoformat()

    status_raw = str(entry.get("status") or "new").strip().lower()
    status = status_raw if status_raw in _ALLOWED_FEEDBACK_STATUSES else "new"

    return {
        "id": str(entry.get("id") or uuid4()),
        "message": message,
        "timestamp": normalized_timestamp,
        "user_name": user_name,
        "status": status,
    }


def _write_feedback_entries(entries: list[dict[str, str]]) -> None:
    feedback_file = _resolve_feedback_file()
    feedback_file.parent.mkdir(parents=True, exist_ok=True)

    temp_path = feedback_file.with_suffix(f"{feedback_file.suffix}.tmp")
    temp_path.write_text(json.dumps(entries, indent=2), encoding="utf-8")
    temp_path.replace(feedback_file)


def _read_feedback_entries() -> list[dict[str, str]]:
    feedback_file = _resolve_feedback_file()
    if not feedback_file.exists():
        return []

    try:
        parsed = json.loads(feedback_file.read_text(encoding="utf-8"))
        if isinstance(parsed, list):
            normalized = []
            for item in parsed:
                if not isinstance(item, dict):
                    continue
                normalized_item = _normalize_feedback_entry(item)
                if normalized_item["message"]:
                    normalized.append(normalized_item)
            return normalized
    except json.JSONDecodeError:
        return []

    return []


def submit_feedback(message: str, user_name: str | None = None) -> dict[str, str]:
    cleaned_message = (message or "").strip()
    if not cleaned_message:
        raise ValueError("message must not be empty")

    normalized_user_name = (user_name or "").strip() or "Anonymous"

    entry = {
        "id": str(uuid4()),
        "message": cleaned_message,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "user_name": normalized_user_name,
        "status": "new",
    }

    with _FEEDBACK_LOCK:
        existing_entries = _read_feedback_entries()

        existing_entries.append(entry)
        _write_feedback_entries(existing_entries)

    logger.info("Feedback saved [id=%s, user_name=%s, path=%s]", entry["id"], entry["user_name"], _resolve_feedback_file())

    return entry


def list_feedback(
    limit: int = 50,
    query: str | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    status: str | None = None,
    sort: str = "latest",
) -> list[dict[str, str]]:
    capped_limit = max(1, min(limit, 200))
    with _FEEDBACK_LOCK:
        items = _read_feedback_entries()

    normalized_query = (query or "").strip().lower()
    normalized_status = (status or "").strip().lower()
    if normalized_status and normalized_status not in _ALLOWED_FEEDBACK_STATUSES:
        normalized_status = ""

    filtered: list[dict[str, str]] = []
    for item in items:
        item_timestamp = _parse_iso_timestamp(item.get("timestamp"))
        item_date = item_timestamp.date() if item_timestamp else None

        if start_date and item_date and item_date < start_date:
            continue
        if end_date and item_date and item_date > end_date:
            continue
        if normalized_status and item.get("status") != normalized_status:
            continue

        if normalized_query:
            haystack = " ".join([
                str(item.get("message") or ""),
                str(item.get("user_name") or ""),
                str(item.get("status") or ""),
            ]).lower()
            if normalized_query not in haystack:
                continue

        filtered.append(item)

    filtered.sort(key=lambda record: record.get("timestamp") or "", reverse=(sort != "oldest"))
    return filtered[:capped_limit]


def update_feedback_status(feedback_id: str, status: str) -> dict[str, str] | None:
    normalized_id = (feedback_id or "").strip()
    normalized_status = (status or "").strip().lower()

    if not normalized_id:
        raise ValueError("feedback id must not be empty")
    if normalized_status not in _ALLOWED_FEEDBACK_STATUSES:
        raise ValueError("status must be one of: new, reviewed, resolved")

    with _FEEDBACK_LOCK:
        items = _read_feedback_entries()
        updated_item: dict[str, str] | None = None

        for item in items:
            if item.get("id") == normalized_id:
                item["status"] = normalized_status
                updated_item = item
                break

        if updated_item is None:
            return None

        _write_feedback_entries(items)
        return updated_item


def feedback_count() -> int:
    with _FEEDBACK_LOCK:
        return len(_read_feedback_entries())
