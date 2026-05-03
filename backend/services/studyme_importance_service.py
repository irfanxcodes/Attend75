from collections import defaultdict

from sqlalchemy import func

from db.models.studyme_important_vote import StudyMeImportantVote
from db.session import SessionLocal
from services.session_store import session_store

HOT_IMPORTANCE_THRESHOLD = 12


def _normalize_text(value: str | None) -> str | None:
    cleaned = str(value or "").strip()
    return cleaned or None


def _normalize_required(value: str | None, field_name: str) -> str:
    cleaned = str(value or "").strip()
    if not cleaned:
        raise ValueError(f"{field_name} must not be empty")
    return cleaned


def _resolve_user_id(token: str | None) -> str:
    cleaned_token = _normalize_required(token, "token")
    record = session_store.get(cleaned_token)
    if record is None:
        raise PermissionError("StudyMe session is invalid or expired.")

    return _normalize_text(record.roll_number) or _normalize_text(record.user_name) or cleaned_token


def _build_importance_payload(*, count: int, marked: bool) -> dict[str, int | bool | str | None]:
    normalized_count = max(int(count or 0), 0)
    return {
        "important": bool(marked),
        "importantCount": normalized_count,
        "importantBadge": "hot" if normalized_count >= HOT_IMPORTANCE_THRESHOLD else None,
    }


def fetch_subject_importance(
    *,
    token: str,
    subject_id: str,
    lesson_ids: list[str] | None = None,
    topic_ids: list[str] | None = None,
) -> dict[str, object]:
    resolved_user_id = _resolve_user_id(token)
    normalized_subject_id = _normalize_required(subject_id, "subject_id")
    normalized_lesson_ids = [_normalize_required(item, "lesson_id") for item in (lesson_ids or [])]
    normalized_topic_ids = [_normalize_required(item, "topic_id") for item in (topic_ids or [])]

    with SessionLocal() as session:
        count_rows = (
            session.query(
                StudyMeImportantVote.entity_type,
                StudyMeImportantVote.entity_id,
                func.count(StudyMeImportantVote.id),
            )
            .filter(StudyMeImportantVote.subject_id == normalized_subject_id)
            .group_by(StudyMeImportantVote.entity_type, StudyMeImportantVote.entity_id)
            .all()
        )

        marked_rows = (
            session.query(StudyMeImportantVote.entity_type, StudyMeImportantVote.entity_id)
            .filter(StudyMeImportantVote.subject_id == normalized_subject_id)
            .filter(StudyMeImportantVote.user_id == resolved_user_id)
            .all()
        )

    counts_by_type: dict[str, dict[str, int]] = defaultdict(dict)
    for entity_type, entity_id, count in count_rows:
        counts_by_type[str(entity_type)][str(entity_id)] = int(count or 0)

    marked_by_type: dict[str, set[str]] = defaultdict(set)
    for entity_type, entity_id in marked_rows:
        marked_by_type[str(entity_type)].add(str(entity_id))

    lessons_payload = {
        lesson_id: _build_importance_payload(
            count=counts_by_type["lesson"].get(lesson_id, 0),
            marked=lesson_id in marked_by_type["lesson"],
        )
        for lesson_id in normalized_lesson_ids
    }
    topics_payload = {
        topic_id: _build_importance_payload(
            count=counts_by_type["topic"].get(topic_id, 0),
            marked=topic_id in marked_by_type["topic"],
        )
        for topic_id in normalized_topic_ids
    }

    return {
        "subjectId": normalized_subject_id,
        "lessons": lessons_payload,
        "topics": topics_payload,
    }


def toggle_lesson_importance(
    *,
    token: str,
    subject_id: str,
    subject_name: str | None,
    lesson_id: str,
    lesson_name: str | None,
) -> dict[str, object]:
    resolved_user_id = _resolve_user_id(token)
    normalized_subject_id = _normalize_required(subject_id, "subject_id")
    normalized_lesson_id = _normalize_required(lesson_id, "lesson_id")

    with SessionLocal() as session:
        existing_vote = (
            session.query(StudyMeImportantVote)
            .filter(StudyMeImportantVote.user_id == resolved_user_id)
            .filter(StudyMeImportantVote.subject_id == normalized_subject_id)
            .filter(StudyMeImportantVote.entity_type == "lesson")
            .filter(StudyMeImportantVote.entity_id == normalized_lesson_id)
            .one_or_none()
        )

        if existing_vote is None:
            session.add(
                StudyMeImportantVote(
                    user_id=resolved_user_id,
                    subject_id=normalized_subject_id,
                    subject_name=_normalize_text(subject_name),
                    lesson_id=normalized_lesson_id,
                    lesson_name=_normalize_text(lesson_name),
                    topic_id=None,
                    topic_name=None,
                    entity_type="lesson",
                    entity_id=normalized_lesson_id,
                )
            )
            marked = True
        else:
            session.delete(existing_vote)
            marked = False

        session.commit()

        important_count = int(
            session.query(func.count(StudyMeImportantVote.id))
            .filter(StudyMeImportantVote.subject_id == normalized_subject_id)
            .filter(StudyMeImportantVote.entity_type == "lesson")
            .filter(StudyMeImportantVote.entity_id == normalized_lesson_id)
            .scalar()
            or 0
        )

    return {
        "entityType": "lesson",
        "subjectId": normalized_subject_id,
        "lessonId": normalized_lesson_id,
        **_build_importance_payload(count=important_count, marked=marked),
    }


def toggle_topic_importance(
    *,
    token: str,
    subject_id: str,
    subject_name: str | None,
    lesson_id: str,
    lesson_name: str | None,
    topic_id: str,
    topic_name: str | None,
) -> dict[str, object]:
    resolved_user_id = _resolve_user_id(token)
    normalized_subject_id = _normalize_required(subject_id, "subject_id")
    normalized_lesson_id = _normalize_required(lesson_id, "lesson_id")
    normalized_topic_id = _normalize_required(topic_id, "topic_id")

    with SessionLocal() as session:
        existing_vote = (
            session.query(StudyMeImportantVote)
            .filter(StudyMeImportantVote.user_id == resolved_user_id)
            .filter(StudyMeImportantVote.subject_id == normalized_subject_id)
            .filter(StudyMeImportantVote.entity_type == "topic")
            .filter(StudyMeImportantVote.entity_id == normalized_topic_id)
            .one_or_none()
        )

        if existing_vote is None:
            session.add(
                StudyMeImportantVote(
                    user_id=resolved_user_id,
                    subject_id=normalized_subject_id,
                    subject_name=_normalize_text(subject_name),
                    lesson_id=normalized_lesson_id,
                    lesson_name=_normalize_text(lesson_name),
                    topic_id=normalized_topic_id,
                    topic_name=_normalize_text(topic_name),
                    entity_type="topic",
                    entity_id=normalized_topic_id,
                )
            )
            marked = True
        else:
            session.delete(existing_vote)
            marked = False

        session.commit()

        important_count = int(
            session.query(func.count(StudyMeImportantVote.id))
            .filter(StudyMeImportantVote.subject_id == normalized_subject_id)
            .filter(StudyMeImportantVote.entity_type == "topic")
            .filter(StudyMeImportantVote.entity_id == normalized_topic_id)
            .scalar()
            or 0
        )

    return {
        "entityType": "topic",
        "subjectId": normalized_subject_id,
        "lessonId": normalized_lesson_id,
        "topicId": normalized_topic_id,
        **_build_importance_payload(count=important_count, marked=marked),
    }
