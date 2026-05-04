from sqlalchemy import desc, func

from db.models.feature_usage_event import FeatureUsageEvent
from db.session import SessionLocal


MAIL_FACULTY_FEATURE = "mail_faculty"
ACTION_COMPOSE_OPENED = "compose_opened"
ACTION_SEND_CONFIRMED = "send_confirmed"
SYNC_ATTENDANCE_FEATURE = "sync_attendance"
ATTENDANCE_HISTORY_FEATURE = "attendance_history"
CONSOLIDATED_MARKS_FEATURE = "consolidated_marks"
ACTION_VIEWED = "viewed"


def record_feature_usage_event(
    *,
    feature_name: str,
    action_type: str,
    user_identifier: str | None = None,
    subject_code: str | None = None,
    subject_name: str | None = None,
    semester_id: str | None = None,
    semester_label: str | None = None,
    attendance_date: str | None = None,
) -> None:
    normalized_feature_name = str(feature_name or "").strip().lower()
    normalized_action_type = str(action_type or "").strip().lower()
    if not normalized_feature_name or not normalized_action_type:
        return

    normalized_user_identifier = str(user_identifier or "").strip().upper() or None
    normalized_subject_code = str(subject_code or "").strip().upper() or None
    normalized_subject_name = str(subject_name or "").strip() or None
    normalized_semester_id = str(semester_id or "").strip() or None
    normalized_semester_label = str(semester_label or "").strip() or None
    normalized_attendance_date = str(attendance_date or "").strip() or None

    with SessionLocal() as session:
        event = FeatureUsageEvent(
            feature_name=normalized_feature_name,
            action_type=normalized_action_type,
            user_identifier=normalized_user_identifier,
            subject_code=normalized_subject_code,
            subject_name=normalized_subject_name,
            semester_id=normalized_semester_id,
            semester_label=normalized_semester_label,
            attendance_date=normalized_attendance_date,
        )
        session.add(event)
        session.commit()


def get_core_feature_usage_summary() -> dict[str, int | str | None]:
    with SessionLocal() as session:
        sync_attendance_count = int(
            session.query(func.count(FeatureUsageEvent.id))
            .filter(FeatureUsageEvent.feature_name == SYNC_ATTENDANCE_FEATURE)
            .filter(FeatureUsageEvent.action_type == ACTION_VIEWED)
            .scalar()
            or 0
        )
        history_open_count = int(
            session.query(func.count(FeatureUsageEvent.id))
            .filter(FeatureUsageEvent.feature_name == ATTENDANCE_HISTORY_FEATURE)
            .filter(FeatureUsageEvent.action_type == ACTION_VIEWED)
            .scalar()
            or 0
        )
        marks_open_count = int(
            session.query(func.count(FeatureUsageEvent.id))
            .filter(FeatureUsageEvent.feature_name == CONSOLIDATED_MARKS_FEATURE)
            .filter(FeatureUsageEvent.action_type == ACTION_VIEWED)
            .scalar()
            or 0
        )

        semester_rows = (
            session.query(
                func.nullif(FeatureUsageEvent.semester_id, "").label("semester_id"),
                func.nullif(FeatureUsageEvent.semester_label, "").label("semester_label"),
                func.count(FeatureUsageEvent.id).label("count"),
            )
            .filter(FeatureUsageEvent.feature_name.in_([
                SYNC_ATTENDANCE_FEATURE,
                ATTENDANCE_HISTORY_FEATURE,
                CONSOLIDATED_MARKS_FEATURE,
            ]))
            .filter(FeatureUsageEvent.action_type == ACTION_VIEWED)
            .filter(FeatureUsageEvent.semester_id.isnot(None))
            .group_by("semester_id", "semester_label")
            .order_by(desc("count"), "semester_label", "semester_id")
            .all()
        )

    most_viewed_semester = None
    most_viewed_semester_label = None
    most_viewed_semester_count = 0
    if semester_rows:
        row = semester_rows[0]
        most_viewed_semester = str(row.semester_id or "").strip() or None
        most_viewed_semester_label = str(row.semester_label or "").strip() or None
        most_viewed_semester_count = int(row.count or 0)

    return {
        "syncAttendanceCount": sync_attendance_count,
        "historyOpenCount": history_open_count,
        "marksOpenCount": marks_open_count,
        "mostViewedSemester": most_viewed_semester,
        "mostViewedSemesterLabel": most_viewed_semester_label,
        "mostViewedSemesterCount": most_viewed_semester_count,
        "totalSemesterInteractions": sync_attendance_count + history_open_count + marks_open_count,
    }


def get_mail_faculty_usage_summary(limit_subjects: int = 5) -> dict[str, int | list[dict[str, int | str | None]]]:
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
                func.nullif(FeatureUsageEvent.subject_code, "").label("subject_code"),
                func.nullif(FeatureUsageEvent.subject_name, "").label("subject_name"),
                func.count(FeatureUsageEvent.id).label("count"),
            )
            .filter(FeatureUsageEvent.feature_name == MAIL_FACULTY_FEATURE)
            .filter(FeatureUsageEvent.action_type == ACTION_COMPOSE_OPENED)
            .group_by("subject_code", "subject_name")
            .order_by(desc("count"), "subject_name", "subject_code")
            .all()
        )

    merged_subject_counts: dict[str, dict[str, int | str | None]] = {}
    for row in top_subject_rows:
        subject_code = str(row.subject_code or "").strip().upper() or None
        subject_name = str(row.subject_name or "").strip() or None
        label = subject_name or subject_code or "UNKNOWN"

        existing = merged_subject_counts.get(label)
        if existing is None:
            merged_subject_counts[label] = {
                "subject": label,
                "subjectCode": subject_code,
                "subjectName": subject_name,
                "count": int(row.count or 0),
            }
            continue

        existing["count"] = int(existing.get("count") or 0) + int(row.count or 0)
        if not existing.get("subjectName") and subject_name:
            existing["subjectName"] = subject_name
        if not existing.get("subjectCode") and subject_code:
            existing["subjectCode"] = subject_code

    top_subjects = sorted(
        merged_subject_counts.values(),
        key=lambda item: (-int(item.get("count") or 0), str(item.get("subject") or "")),
    )[: max(int(limit_subjects or 0), 1)]

    return {
        "composeOpenedCount": compose_opened_count,
        "sendConfirmedCount": send_confirmed_count,
        "uniqueUsersCount": unique_users_count,
        "topSubjects": top_subjects,
    }
