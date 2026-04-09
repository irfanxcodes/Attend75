import threading
from collections import Counter


class FeatureUsageMetricsStore:
    def __init__(self):
        self._lock = threading.Lock()
        self._sync_attendance_count = 0
        self._history_open_count = 0
        self._marks_open_count = 0
        self._semester_views: Counter[str] = Counter()
        self._semester_labels: dict[str, str] = {}

    def observe_sync_attendance(self, semester_id: str | None, semester_label: str | None = None) -> None:
        normalized_semester = (semester_id or "").strip() or "default"
        with self._lock:
            self._sync_attendance_count += 1
            self._semester_views[normalized_semester] += 1
            normalized_label = (semester_label or "").strip()
            if normalized_label and normalized_semester != "default":
                self._semester_labels[normalized_semester] = normalized_label

    def observe_history_open(self, semester_id: str | None, semester_label: str | None = None) -> None:
        normalized_semester = (semester_id or "").strip() or "default"
        with self._lock:
            self._history_open_count += 1
            self._semester_views[normalized_semester] += 1
            normalized_label = (semester_label or "").strip()
            if normalized_label and normalized_semester != "default":
                self._semester_labels[normalized_semester] = normalized_label

    def observe_marks_open(self, semester_id: str | None, semester_label: str | None = None) -> None:
        normalized_semester = (semester_id or "").strip() or "default"
        with self._lock:
            self._marks_open_count += 1
            self._semester_views[normalized_semester] += 1
            normalized_label = (semester_label or "").strip()
            if normalized_label and normalized_semester != "default":
                self._semester_labels[normalized_semester] = normalized_label

    def snapshot(self) -> dict[str, int | str | None]:
        with self._lock:
            most_viewed_semester: str | None = None
            most_viewed_count = 0
            if self._semester_views:
                most_viewed_semester, most_viewed_count = self._semester_views.most_common(1)[0]
            most_viewed_label = self._semester_labels.get(most_viewed_semester or "") if most_viewed_semester else None

            return {
                "syncAttendanceCount": self._sync_attendance_count,
                "historyOpenCount": self._history_open_count,
                "marksOpenCount": self._marks_open_count,
                "mostViewedSemester": most_viewed_semester,
                "mostViewedSemesterLabel": most_viewed_label,
                "mostViewedSemesterCount": most_viewed_count,
                "totalSemesterInteractions": int(sum(self._semester_views.values())),
            }


feature_usage_metrics_store = FeatureUsageMetricsStore()


def observe_sync_attendance(semester_id: str | None, semester_label: str | None = None) -> None:
    feature_usage_metrics_store.observe_sync_attendance(
        semester_id=semester_id,
        semester_label=semester_label,
    )


def observe_history_open(semester_id: str | None, semester_label: str | None = None) -> None:
    feature_usage_metrics_store.observe_history_open(
        semester_id=semester_id,
        semester_label=semester_label,
    )


def observe_marks_open(semester_id: str | None, semester_label: str | None = None) -> None:
    feature_usage_metrics_store.observe_marks_open(
        semester_id=semester_id,
        semester_label=semester_label,
    )


def get_feature_usage_snapshot() -> dict[str, int | str | None]:
    return feature_usage_metrics_store.snapshot()
