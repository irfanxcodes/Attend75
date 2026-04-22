import time
import os
import threading

from scrapers.portal_scraper import PortalAuthenticationError, PortalNetworkError, PortalScraper
from services.feature_usage_event_service import record_feature_usage_event
from services.feature_usage_metrics import observe_history_open, observe_marks_open, observe_sync_attendance
from services.scraper_metrics import observe_scrape
from services.session_store import session_store


def _portal_operation_retry_attempts() -> int:
    raw = os.getenv("PORTAL_OPERATION_RETRY_ATTEMPTS", "2").strip()
    try:
        return max(int(raw), 1)
    except ValueError:
        return 2


def _portal_operation_retry_backoff_seconds() -> float:
    raw = os.getenv("PORTAL_OPERATION_RETRY_BACKOFF_SECONDS", "0.6").strip()
    try:
        return max(float(raw), 0.0)
    except ValueError:
        return 0.6


def _prefetch_marks_after_login_enabled() -> bool:
    raw = str(os.getenv("PORTAL_PREFETCH_MARKS_AFTER_LOGIN", "false")).strip().lower()
    return raw not in {"0", "false", "no", "off"}


def _prefetch_marks_after_login_delay_seconds() -> float:
    raw = str(os.getenv("PORTAL_PREFETCH_MARKS_AFTER_LOGIN_DELAY_SECONDS", "1.5")).strip()
    try:
        return max(float(raw), 0.0)
    except ValueError:
        return 1.5


def _run_with_session_lock(record, operation):
    with record.scraper_lock:
        return operation()


def _prefetch_marks_after_login(record, semester_id: str | None) -> None:
    delay = _prefetch_marks_after_login_delay_seconds()
    try:
        if delay > 0:
            time.sleep(delay)
        _run_with_session_lock(
            record,
            lambda: record.scraper.fetch_consolidated_marks(semester_id=semester_id, force_refresh=True),
        )
    except Exception:
        # Prefetch is best-effort and must never block or fail login.
        return


def _run_with_network_retry(operation):
    attempts = _portal_operation_retry_attempts()
    backoff = _portal_operation_retry_backoff_seconds()
    last_error = None

    for attempt in range(1, attempts + 1):
        try:
            return operation()
        except PortalNetworkError as exc:
            last_error = exc
            if not getattr(exc, "retriable", True):
                raise
            if attempt >= attempts:
                raise
            if backoff > 0:
                time.sleep(backoff * attempt)

    if last_error is not None:
        raise last_error


def _resolve_semester_usage_context(payload: dict | None, fallback_semester_id: str | None = None) -> tuple[str | None, str | None]:
    payload = payload or {}
    resolved_id = str(payload.get("selected_semester") or fallback_semester_id or "").strip() or None

    resolved_label = None
    semesters = payload.get("semesters")
    if resolved_id and isinstance(semesters, list):
        for item in semesters:
            item_id = str((item or {}).get("id") or "").strip()
            if item_id == resolved_id:
                label = str((item or {}).get("label") or "").strip()
                if label:
                    resolved_label = label
                break

    return resolved_id, resolved_label


def login_user(roll_number: str, password: str) -> dict:
    started = time.perf_counter()
    scraper = PortalScraper()
    try:
        data = _run_with_network_retry(lambda: scraper.login(roll_number=roll_number, password=password))
        resolved_user_name = str(data.get("student_name") or roll_number).strip() or roll_number.strip().upper()
        record = session_store.create(roll_number=roll_number, scraper=scraper, user_name=resolved_user_name)
        if _prefetch_marks_after_login_enabled():
            threading.Thread(
                target=_prefetch_marks_after_login,
                args=(record, data.get("selected_semester")),
                daemon=True,
            ).start()
        observe_scrape(success=True, duration_ms=(time.perf_counter() - started) * 1000)
        return {
            "token": record.token,
            "roll_number": roll_number.strip().upper(),
            **data,
        }
    except PortalNetworkError as exc:
        observe_scrape(
            success=False,
            duration_ms=(time.perf_counter() - started) * 1000,
            failure_kind="network",
            failure_code=getattr(exc, "code", None),
            failure_stage=getattr(exc, "stage", None),
            retriable=getattr(exc, "retriable", None),
        )
        raise
    except PortalAuthenticationError as exc:
        observe_scrape(
            success=False,
            duration_ms=(time.perf_counter() - started) * 1000,
            failure_kind="auth",
            failure_code=getattr(exc, "code", None),
        )
        raise
    except Exception:
        observe_scrape(success=False, duration_ms=(time.perf_counter() - started) * 1000, failure_kind="unknown")
        raise


def fetch_attendance_for_semester(token: str, semester_id: str | None, force_refresh: bool = False) -> dict:
    record = session_store.get(token)
    if record is None:
        raise PortalAuthenticationError("Session token not found while fetching attendance", code="SESSION_EXPIRED")

    started = time.perf_counter()
    try:
        payload = _run_with_session_lock(
            record,
            lambda: _run_with_network_retry(
                lambda: record.scraper.fetch_attendance_for_semester(
                    semester_id=semester_id,
                    force_refresh=force_refresh,
                )
            )
        )
        observe_scrape(success=True, duration_ms=(time.perf_counter() - started) * 1000)
        resolved_id, resolved_label = _resolve_semester_usage_context(payload, semester_id)
        observe_sync_attendance(semester_id=resolved_id, semester_label=resolved_label)
        return payload
    except PortalNetworkError as exc:
        observe_scrape(
            success=False,
            duration_ms=(time.perf_counter() - started) * 1000,
            failure_kind="network",
            failure_code=getattr(exc, "code", None),
            failure_stage=getattr(exc, "stage", None),
            retriable=getattr(exc, "retriable", None),
        )
        raise
    except PortalAuthenticationError as exc:
        observe_scrape(
            success=False,
            duration_ms=(time.perf_counter() - started) * 1000,
            failure_kind="auth",
            failure_code=getattr(exc, "code", None),
        )
        raise
    except Exception:
        observe_scrape(success=False, duration_ms=(time.perf_counter() - started) * 1000, failure_kind="unknown")
        raise


def fetch_subject_history(token: str, semester_id: str | None, date: str | None) -> dict:
    record = session_store.get(token)
    if record is None:
        raise PortalAuthenticationError("Session token not found while fetching attendance history", code="SESSION_EXPIRED")

    started = time.perf_counter()
    try:
        payload = _run_with_session_lock(
            record,
            lambda: _run_with_network_retry(
                lambda: record.scraper.fetch_subject_attendance_history(semester_id=semester_id, date=date)
            ),
        )
        observe_scrape(success=True, duration_ms=(time.perf_counter() - started) * 1000)
        resolved_id, _ = _resolve_semester_usage_context(payload, semester_id)
        observe_history_open(semester_id=resolved_id)
        return payload
    except PortalNetworkError as exc:
        observe_scrape(
            success=False,
            duration_ms=(time.perf_counter() - started) * 1000,
            failure_kind="network",
            failure_code=getattr(exc, "code", None),
            failure_stage=getattr(exc, "stage", None),
            retriable=getattr(exc, "retriable", None),
        )
        raise
    except PortalAuthenticationError as exc:
        observe_scrape(
            success=False,
            duration_ms=(time.perf_counter() - started) * 1000,
            failure_kind="auth",
            failure_code=getattr(exc, "code", None),
        )
        raise
    except Exception:
        observe_scrape(success=False, duration_ms=(time.perf_counter() - started) * 1000, failure_kind="unknown")
        raise


def fetch_consolidated_marks(token: str, semester_id: str | None, force_refresh: bool = False) -> dict:
    record = session_store.get(token)
    if record is None:
        raise PortalAuthenticationError("Session token not found while fetching consolidated marks", code="SESSION_EXPIRED")

    started = time.perf_counter()
    try:
        payload = _run_with_session_lock(
            record,
            lambda: _run_with_network_retry(
                lambda: record.scraper.fetch_consolidated_marks(
                    semester_id=semester_id,
                    force_refresh=force_refresh,
                )
            )
        )
        observe_scrape(success=True, duration_ms=(time.perf_counter() - started) * 1000)
        resolved_id, resolved_label = _resolve_semester_usage_context(payload, semester_id)
        observe_marks_open(semester_id=resolved_id, semester_label=resolved_label)
        return payload
    except PortalNetworkError as exc:
        observe_scrape(
            success=False,
            duration_ms=(time.perf_counter() - started) * 1000,
            failure_kind="network",
            failure_code=getattr(exc, "code", None),
            failure_stage=getattr(exc, "stage", None),
            retriable=getattr(exc, "retriable", None),
        )
        raise
    except PortalAuthenticationError as exc:
        observe_scrape(
            success=False,
            duration_ms=(time.perf_counter() - started) * 1000,
            failure_kind="auth",
            failure_code=getattr(exc, "code", None),
        )
        raise
    except Exception:
        observe_scrape(success=False, duration_ms=(time.perf_counter() - started) * 1000, failure_kind="unknown")
        raise


def fetch_faculty_contacts(token: str, semester_id: str | None, force_refresh: bool = False) -> dict:
    record = session_store.get(token)
    if record is None:
        raise PortalAuthenticationError("Session token not found while fetching faculty contacts", code="SESSION_EXPIRED")

    started = time.perf_counter()
    try:
        payload = _run_with_session_lock(
            record,
            lambda: _run_with_network_retry(
                lambda: record.scraper.fetch_faculty_contacts(
                    semester_id=semester_id,
                    force_refresh=force_refresh,
                )
            )
        )
        observe_scrape(success=True, duration_ms=(time.perf_counter() - started) * 1000)
        return payload
    except PortalNetworkError as exc:
        observe_scrape(
            success=False,
            duration_ms=(time.perf_counter() - started) * 1000,
            failure_kind="network",
            failure_code=getattr(exc, "code", None),
            failure_stage=getattr(exc, "stage", None),
            retriable=getattr(exc, "retriable", None),
        )
        raise
    except PortalAuthenticationError as exc:
        observe_scrape(
            success=False,
            duration_ms=(time.perf_counter() - started) * 1000,
            failure_kind="auth",
            failure_code=getattr(exc, "code", None),
        )
        raise
    except Exception:
        observe_scrape(success=False, duration_ms=(time.perf_counter() - started) * 1000, failure_kind="unknown")
        raise


def get_session_status(token: str) -> dict:
    record = session_store.get(token)
    if record is None:
        return {"session_status": "expired"}

    started = time.perf_counter()
    try:
        _run_with_session_lock(
            record,
            lambda: _run_with_network_retry(lambda: record.scraper.fetch_attendance_for_semester(force_refresh=True)),
        )
        observe_scrape(success=True, duration_ms=(time.perf_counter() - started) * 1000)
        return {"session_status": "linked"}
    except PortalNetworkError as exc:
        observe_scrape(
            success=False,
            duration_ms=(time.perf_counter() - started) * 1000,
            failure_kind="network",
            failure_code=getattr(exc, "code", None),
            failure_stage=getattr(exc, "stage", None),
            retriable=getattr(exc, "retriable", None),
        )
        return {"session_status": "unknown"}
    except PortalAuthenticationError as exc:
        observe_scrape(
            success=False,
            duration_ms=(time.perf_counter() - started) * 1000,
            failure_kind="auth",
            failure_code=getattr(exc, "code", None),
        )
        return {"session_status": "expired"}
    except Exception:
        observe_scrape(success=False, duration_ms=(time.perf_counter() - started) * 1000, failure_kind="unknown")
        return {"session_status": "unknown"}


def track_feature_usage_event(
    token: str,
    feature_name: str,
    action_type: str,
    subject_code: str | None = None,
    subject_name: str | None = None,
    attendance_date: str | None = None,
) -> dict:
    record = session_store.get(token)
    if record is None:
        raise PortalAuthenticationError("Session token not found while tracking feature usage", code="SESSION_EXPIRED")

    record_feature_usage_event(
        feature_name=feature_name,
        action_type=action_type,
        user_identifier=record.roll_number,
        subject_code=subject_code,
        subject_name=subject_name,
        attendance_date=attendance_date,
    )

    return {"tracked": True}
