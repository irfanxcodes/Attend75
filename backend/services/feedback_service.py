import json
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock

_FEEDBACK_FILE = Path(__file__).resolve().parent.parent / "feedback.json"
_FEEDBACK_LOCK = Lock()


def submit_feedback(message: str) -> dict[str, str]:
    cleaned_message = (message or "").strip()
    if not cleaned_message:
        raise ValueError("message must not be empty")

    entry = {
        "message": cleaned_message,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    with _FEEDBACK_LOCK:
        existing_entries: list[dict[str, str]] = []

        if _FEEDBACK_FILE.exists():
            try:
                parsed = json.loads(_FEEDBACK_FILE.read_text(encoding="utf-8"))
                if isinstance(parsed, list):
                    existing_entries = parsed
            except json.JSONDecodeError:
                existing_entries = []

        existing_entries.append(entry)
        _FEEDBACK_FILE.write_text(json.dumps(existing_entries, indent=2), encoding="utf-8")

    return entry
