from sqlalchemy import desc, func

from db.models.feature_usage_event import FeatureUsageEvent
from db.session import SessionLocal


MAIL_FACULTY_FEATURE = "mail_faculty"
ACTION_COMPOSE_OPENED = "compose_opened"
ACTION_SEND_CONFIRMED = "send_confirmed"


def record_feature_usage_event(
    *,
    feature_name: str,
    action_type: str,
    user_identifier: str | None = None,
    subject_code: str | None = None,
    subject_name: str | None = None,
    attendance_date: str | None = None,
) -> None:
    normalized_feature_name = str(feature_name or "").strip().lower()
    normalized_action_type = str(action_type or "").strip().lower()
    if not normalized_feature_name or not normalized_action_type:
        return

    normalized_user_identifier = str(user_identifier or "").strip().upper() or None
    normalized_subject_code = str(subject_code or "").strip().upper() or None
    normalized_subject_name = str(subject_name or "").strip() or None
    normalized_attendance_date = str(attendance_date or "").strip() or None

    with SessionLocal() as session:
        event = FeatureUsageEvent(
            feature_name=normalized_feature_name,
            action_type=normalized_action_type,
            user_identifier=normalized_user_identifier,
            subject_code=normalized_subject_code,
            subject_name=normalized_subject_name,
            attendance_date=normalized_attendance_date,
        )
        session.add(event)
        session.commit()


def get_mail_faculty_usage_summary(limit_subjects: int = 5) -> dict[str, int | list[dict[str, int | str]]]:
    with SessionLocal() as session:
        base_query = session.query(FeatureUsageEvent).filter(FeatureUsageEvent.feature_name == MAIL_FACULTY_FEATURE)

        compose_opened_count = int(
            base_query.filter(FeatureUsageEvent.action_type == ACTION_COMPOSE_OPENED).count()
        )
        send_confirmed_count = int(
            base_query.filter(FeatureUsageEvent.action_type == ACTION_SEND_CONFIRMED).count()
        )

        unique_users_count = int(
            session.query(func.count(func.distinct(FeatureUsageEvent.user_identifier)))
            .filter(FeatureUsageEvent.feature_name == MAIL_FACULTY_FEATURE)
            .filter(FeatureUsageEvent.user_identifier.isnot(None))
            .scalar()
            or 0
        )

        top_subject_rows = (
            session.query(
                func.coalesce(
                    func.nullif(FeatureUsageEvent.subject_code, ""),
                    func.nullif(FeatureUsageEvent.subject_name, ""),
                    "UNKNOWN",
                ).label("subject"),
                func.count(FeatureUsageEvent.id).label("count"),
            )
            .filter(FeatureUsageEvent.feature_name == MAIL_FACULTY_FEATURE)
            .filter(FeatureUsageEvent.action_type == ACTION_COMPOSE_OPENED)
            .group_by("subject")
            .order_by(desc("count"), "subject")
            .limit(max(int(limit_subjects or 0), 1))
            .all()
        )

    return {
        "composeOpenedCount": compose_opened_count,
        "sendConfirmedCount": send_confirmed_count,
        "uniqueUsersCount": unique_users_count,
        "topSubjects": [
            {
                "subject": str(row.subject or "UNKNOWN"),
                "count": int(row.count or 0),
            }
            for row in top_subject_rows
        ],
    }
