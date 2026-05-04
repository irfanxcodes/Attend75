import logging
from datetime import date, datetime, timezone
from threading import Lock
from uuid import uuid4

from db.models.feedback_entry import FeedbackEntry
from db.session import SessionLocal

logger = logging.getLogger(__name__)


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


def _serialize_feedback_entry(entry: FeedbackEntry) -> dict[str, str]:
    timestamp = entry.timestamp
    if timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=timezone.utc)
    else:
        timestamp = timestamp.astimezone(timezone.utc)

    return {
        "id": entry.id,
        "message": entry.message,
        "timestamp": timestamp.isoformat(),
        "user_name": entry.user_name,
        "status": entry.status,
    }


def submit_feedback(message: str, user_name: str | None = None) -> dict[str, str]:
    cleaned_message = (message or "").strip()
    if not cleaned_message:
        raise ValueError("message must not be empty")

    normalized_user_name = (user_name or "").strip() or "Anonymous"
    current_timestamp = datetime.now(timezone.utc)

    entry = FeedbackEntry(
        id=str(uuid4()),
        message=cleaned_message,
        timestamp=current_timestamp.replace(tzinfo=None),
        user_name=normalized_user_name,
        status="new",
    )

    with _FEEDBACK_LOCK:
        with SessionLocal() as session:
            session.add(entry)
            session.commit()
            session.refresh(entry)
            serialized = _serialize_feedback_entry(entry)

    logger.info("Feedback saved [id=%s, user_name=%s]", entry.id, entry.user_name)
    return serialized


def list_feedback(
    limit: int = 50,
    query: str | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    status: str | None = None,
    sort: str = "latest",
) -> list[dict[str, str]]:
    capped_limit = max(1, min(limit, 200))
    normalized_query = (query or "").strip().lower()
    normalized_status = (status or "").strip().lower()
    if normalized_status and normalized_status not in _ALLOWED_FEEDBACK_STATUSES:
        normalized_status = ""

    with _FEEDBACK_LOCK:
        with SessionLocal() as session:
            query_builder = session.query(FeedbackEntry)

            if normalized_status:
                query_builder = query_builder.filter(FeedbackEntry.status == normalized_status)

            if normalized_query:
                like_value = f"%{normalized_query}%"
                query_builder = query_builder.filter(
                    FeedbackEntry.message.ilike(like_value)
                    | FeedbackEntry.user_name.ilike(like_value)
                    | FeedbackEntry.status.ilike(like_value)
                )

            if start_date:
                query_builder = query_builder.filter(
                    FeedbackEntry.timestamp >= datetime.combine(start_date, datetime.min.time())
                )
            if end_date:
                query_builder = query_builder.filter(
                    FeedbackEntry.timestamp < datetime.combine(end_date, datetime.max.time())
                )

            order_by = FeedbackEntry.timestamp.asc() if sort == "oldest" else FeedbackEntry.timestamp.desc()
            rows = query_builder.order_by(order_by).limit(capped_limit).all()

    return [_serialize_feedback_entry(row) for row in rows]


def list_all_feedback() -> list[dict[str, str]]:
    with _FEEDBACK_LOCK:
        with SessionLocal() as session:
            rows = session.query(FeedbackEntry).order_by(FeedbackEntry.timestamp.desc()).all()

    return [_serialize_feedback_entry(row) for row in rows]


def update_feedback_status(feedback_id: str, status: str) -> dict[str, str] | None:
    normalized_id = (feedback_id or "").strip()
    normalized_status = (status or "").strip().lower()

    if not normalized_id:
        raise ValueError("feedback id must not be empty")
    if normalized_status not in _ALLOWED_FEEDBACK_STATUSES:
        raise ValueError("status must be one of: new, reviewed, resolved")

    with _FEEDBACK_LOCK:
        with SessionLocal() as session:
            row = session.query(FeedbackEntry).filter(FeedbackEntry.id == normalized_id).one_or_none()
            if row is None:
                return None

            row.status = normalized_status
            session.commit()
            session.refresh(row)
            return _serialize_feedback_entry(row)


def feedback_count() -> int:
    with _FEEDBACK_LOCK:
        with SessionLocal() as session:
            return int(session.query(FeedbackEntry).count() or 0)
