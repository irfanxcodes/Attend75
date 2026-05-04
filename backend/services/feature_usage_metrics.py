from services.feature_usage_event_service import (
    ACTION_VIEWED,
    ATTENDANCE_HISTORY_FEATURE,
    CONSOLIDATED_MARKS_FEATURE,
    SYNC_ATTENDANCE_FEATURE,
    get_core_feature_usage_summary,
    record_feature_usage_event,
)


def observe_sync_attendance(semester_id: str | None, semester_label: str | None = None) -> None:
    record_feature_usage_event(
        feature_name=SYNC_ATTENDANCE_FEATURE,
        action_type=ACTION_VIEWED,
        semester_id=semester_id,
        semester_label=semester_label,
    )


def observe_history_open(semester_id: str | None, semester_label: str | None = None) -> None:
    record_feature_usage_event(
        feature_name=ATTENDANCE_HISTORY_FEATURE,
        action_type=ACTION_VIEWED,
        semester_id=semester_id,
        semester_label=semester_label,
    )


def observe_marks_open(semester_id: str | None, semester_label: str | None = None) -> None:
    record_feature_usage_event(
        feature_name=CONSOLIDATED_MARKS_FEATURE,
        action_type=ACTION_VIEWED,
        semester_id=semester_id,
        semester_label=semester_label,
    )


def get_feature_usage_snapshot() -> dict[str, int | str | None]:
    return get_core_feature_usage_summary()
