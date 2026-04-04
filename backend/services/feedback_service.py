import json
import logging
import os
from datetime import datetime, timezone
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


def submit_feedback(message: str) -> dict[str, str]:
    cleaned_message = (message or "").strip()
    if not cleaned_message:
        raise ValueError("message must not be empty")

    feedback_file = _resolve_feedback_file()
    feedback_file.parent.mkdir(parents=True, exist_ok=True)

    entry = {
        "id": str(uuid4()),
        "message": cleaned_message,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    with _FEEDBACK_LOCK:
        existing_entries: list[dict[str, str]] = []

        if feedback_file.exists():
            try:
                parsed = json.loads(feedback_file.read_text(encoding="utf-8"))
                if isinstance(parsed, list):
                    existing_entries = parsed
            except json.JSONDecodeError:
                existing_entries = []

        existing_entries.append(entry)
        temp_path = feedback_file.with_suffix(f"{feedback_file.suffix}.tmp")
        temp_path.write_text(json.dumps(existing_entries, indent=2), encoding="utf-8")
        temp_path.replace(feedback_file)

    logger.info("Feedback saved [id=%s, path=%s]", entry["id"], feedback_file)

    return entry


def list_feedback(limit: int = 50) -> list[dict[str, str]]:
    capped_limit = max(1, min(limit, 200))
    feedback_file = _resolve_feedback_file()

    if not feedback_file.exists():
        return []

    try:
        parsed = json.loads(feedback_file.read_text(encoding="utf-8"))
        if not isinstance(parsed, list):
            return []
    except json.JSONDecodeError:
        return []

    return list(reversed(parsed[-capped_limit:]))
