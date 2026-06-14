from sqlalchemy import func

from db.models.subject_request import SubjectRequest
from db.session import SessionLocal


def request_subject(user_identifier: str, subject_code: str, subject_name: str | None = None, subject_abbreviation: str | None = None) -> dict:
    """Record a subject request. Returns whether it was newly created or already existed."""
    normalized_user = str(user_identifier or "").strip().upper()
    normalized_code = str(subject_code or "").strip().upper()
    if not normalized_user or not normalized_code:
        raise ValueError("user_identifier and subject_code are required")

    with SessionLocal() as session:
        existing = (
            session.query(SubjectRequest)
            .filter(SubjectRequest.user_identifier == normalized_user)
            .filter(SubjectRequest.subject_code == normalized_code)
            .first()
        )

        if existing:
            return {"requested": True, "new": False, "subject_code": normalized_code}

        new_request = SubjectRequest(
            user_identifier=normalized_user,
            subject_code=normalized_code,
            subject_name=(subject_name or "").strip() or None,
            subject_abbreviation=(subject_abbreviation or "").strip().upper() or None,
        )
        session.add(new_request)
        session.commit()

        return {"requested": True, "new": True, "subject_code": normalized_code}


def get_subject_request_counts() -> dict[str, int]:
    """Returns a map of subject_code → request count."""
    with SessionLocal() as session:
        rows = (
            session.query(
                SubjectRequest.subject_code,
                func.count(SubjectRequest.id).label("count"),
            )
            .group_by(SubjectRequest.subject_code)
            .all()
        )

    return {str(row.subject_code).strip().upper(): int(row.count) for row in rows}


def has_user_requested(user_identifier: str, subject_code: str) -> bool:
    """Check if a user already requested a subject."""
    normalized_user = str(user_identifier or "").strip().upper()
    normalized_code = str(subject_code or "").strip().upper()
    if not normalized_user or not normalized_code:
        return False

    with SessionLocal() as session:
        return (
            session.query(SubjectRequest)
            .filter(SubjectRequest.user_identifier == normalized_user)
            .filter(SubjectRequest.subject_code == normalized_code)
            .first()
        ) is not None
