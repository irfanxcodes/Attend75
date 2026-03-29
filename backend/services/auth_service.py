from scrapers.portal_scraper import PortalAuthenticationError, PortalScraper
from services.session_store import session_store


def login_user(roll_number: str, password: str) -> dict:
    scraper = PortalScraper()
    data = scraper.login(roll_number=roll_number, password=password)
    record = session_store.create(roll_number=roll_number, scraper=scraper)

    return {
        "token": record.token,
        "roll_number": roll_number.strip().upper(),
        **data,
    }


def fetch_attendance_for_semester(token: str, semester_id: str | None) -> dict:
    record = session_store.get(token)
    if record is None:
        raise PortalAuthenticationError("Session expired. Please login again.")

    return record.scraper.fetch_attendance_for_semester(semester_id=semester_id)


def fetch_subject_history(token: str, semester_id: str | None, date: str | None) -> dict:
    record = session_store.get(token)
    if record is None:
        raise PortalAuthenticationError("Session expired. Please login again.")

    return record.scraper.fetch_subject_attendance_history(semester_id=semester_id, date=date)


def get_session_status(token: str) -> dict:
    record = session_store.get(token)
    if record is None:
        return {"session_status": "expired"}

    try:
        record.scraper.fetch_attendance_for_semester()
        return {"session_status": "linked"}
    except PortalAuthenticationError:
        return {"session_status": "expired"}
    except Exception:
        return {"session_status": "unknown"}
