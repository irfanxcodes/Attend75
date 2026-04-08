import time

from scrapers.portal_scraper import PortalAuthenticationError, PortalNetworkError, PortalScraper
from services.feature_usage_metrics import observe_history_open, observe_sync_attendance
from services.scraper_metrics import observe_scrape
from services.session_store import session_store


def login_user(roll_number: str, password: str) -> dict:
    started = time.perf_counter()
    scraper = PortalScraper()
    try:
        data = scraper.login(roll_number=roll_number, password=password)
        record = session_store.create(roll_number=roll_number, scraper=scraper)
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


def fetch_attendance_for_semester(token: str, semester_id: str | None) -> dict:
    record = session_store.get(token)
    if record is None:
        raise PortalAuthenticationError("Session token not found while fetching attendance", code="SESSION_EXPIRED")

    started = time.perf_counter()
    try:
        payload = record.scraper.fetch_attendance_for_semester(semester_id=semester_id)
        observe_scrape(success=True, duration_ms=(time.perf_counter() - started) * 1000)
        observe_sync_attendance(semester_id=semester_id)
        return payload
    except PortalNetworkError as exc:
        observe_scrape(
            success=False,
            duration_ms=(time.perf_counter() - started) * 1000,
            failure_kind="network",
            failure_code=getattr(exc, "code", None),
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
        payload = record.scraper.fetch_subject_attendance_history(semester_id=semester_id, date=date)
        observe_scrape(success=True, duration_ms=(time.perf_counter() - started) * 1000)
        observe_history_open(semester_id=semester_id)
        return payload
    except PortalNetworkError as exc:
        observe_scrape(
            success=False,
            duration_ms=(time.perf_counter() - started) * 1000,
            failure_kind="network",
            failure_code=getattr(exc, "code", None),
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


def fetch_consolidated_marks(token: str, semester_id: str | None) -> dict:
    record = session_store.get(token)
    if record is None:
        raise PortalAuthenticationError("Session token not found while fetching consolidated marks", code="SESSION_EXPIRED")

    started = time.perf_counter()
    try:
        payload = record.scraper.fetch_consolidated_marks(semester_id=semester_id)
        observe_scrape(success=True, duration_ms=(time.perf_counter() - started) * 1000)
        return payload
    except PortalNetworkError as exc:
        observe_scrape(
            success=False,
            duration_ms=(time.perf_counter() - started) * 1000,
            failure_kind="network",
            failure_code=getattr(exc, "code", None),
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
        record.scraper.fetch_attendance_for_semester()
        observe_scrape(success=True, duration_ms=(time.perf_counter() - started) * 1000)
        return {"session_status": "linked"}
    except PortalNetworkError as exc:
        observe_scrape(
            success=False,
            duration_ms=(time.perf_counter() - started) * 1000,
            failure_kind="network",
            failure_code=getattr(exc, "code", None),
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
