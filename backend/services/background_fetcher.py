"""
Background Fetcher — Queue-based portal login for Firebase-linked premium students.

Runs every 6 hours (6:00 AM, 12:00 PM, 6:00 PM, 12:00 AM IST).
For each eligible student: decrypt credentials → login → fetch attendance →
compare via attendance_monitor → update student_registry → logout.

Rate limiting: 10-second spacing between portal logins. Round-robin ordering
(least-recently-fetched first). Skips students inactive >30 days.
"""

import logging
import threading
import time
from datetime import datetime, timedelta, timezone

from db.models.background_fetch_state import BackgroundFetchState
from db.models.portal_credential import PortalCredential
from db.models.premium_subscription import PremiumSubscription
from db.models.student_registry import StudentRegistry
from db.models.user import User
from db.session import SessionLocal
from services.crypto_service import credential_crypto_service

logger = logging.getLogger(__name__)

IST = timezone(timedelta(hours=5, minutes=30))
FETCH_INTERVAL_SECONDS = 6 * 3600  # 6 hours
LOGIN_SPACING_SECONDS = 10
MAX_RETRIES_PER_JOB = 2
PAUSE_AFTER_CONSECUTIVE_FAILURES = 3
PAUSE_DURATION_HOURS = 24
INACTIVE_THRESHOLD_DAYS = 30


def get_eligible_students() -> list[dict]:
    """
    Get Firebase-linked premium students eligible for background fetch.
    Ordered by last_fetch_at ascending (round-robin, Req 16.7).
    Excludes: inactive >30 days, invalid credentials, paused students.
    """
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=INACTIVE_THRESHOLD_DAYS)

    with SessionLocal() as session:
        # Join: PortalCredential → User → PremiumSubscription → StudentRegistry → BackgroundFetchState
        rows = (
            session.query(
                PortalCredential.roll_number,
                PortalCredential.encrypted_password,
                PortalCredential.status,
            )
            .join(User, User.id == PortalCredential.user_id)
            .join(PremiumSubscription, PremiumSubscription.roll_number == PortalCredential.roll_number)
            .join(StudentRegistry, StudentRegistry.roll_number == PortalCredential.roll_number)
            .filter(
                PremiumSubscription.status.in_(["active", "grace"]),
                PortalCredential.status == "valid",
                StudentRegistry.last_seen_at >= cutoff,
            )
            .all()
        )

        eligible = []
        for roll, encrypted_pw, cred_status in rows:
            # Check BackgroundFetchState for eligibility
            state = session.query(BackgroundFetchState).filter(BackgroundFetchState.roll_number == roll).one_or_none()
            if state and state.next_eligible_at > now:
                continue  # Paused
            eligible.append({
                "roll_number": roll,
                "encrypted_password": encrypted_pw,
                "last_fetch_at": state.last_fetch_at if state else None,
            })

    # Sort by last_fetch_at ascending (least recently fetched first)
    eligible.sort(key=lambda x: x["last_fetch_at"] or datetime.min)
    return eligible


def process_single_fetch(roll_number: str, encrypted_password: str) -> dict:
    """
    Perform a single background attendance fetch for one student.
    Returns {"status": "success"|"invalid_credentials"|"transient_failure", ...}
    """
    from scrapers.portal_scraper import PortalScraper, PortalAuthenticationError, PortalNetworkError

    try:
        password = credential_crypto_service.decrypt(encrypted_password)
        logger.debug("Background fetch: decrypted credentials for %s", roll_number)
    except Exception as exc:
        logger.error("Background fetch: failed to decrypt for %s: %s", roll_number, exc)
        return {"status": "transient_failure", "error": str(exc)}

    scraper = PortalScraper()
    try:
        data = scraper.login(roll_number=roll_number, password=password)
        attendance_rows = data.get("attendance", [])

        # Compute overall percentage
        total_attended = sum(int(r.get("attended") or 0) for r in attendance_rows)
        total_sessions = sum(int(r.get("sessions") or 0) for r in attendance_rows)
        overall = round((total_attended / total_sessions) * 100, 1) if total_sessions > 0 else None

        # Update student_registry.last_attendance_percent
        with SessionLocal() as session:
            student = session.query(StudentRegistry).filter(StudentRegistry.roll_number == roll_number).one_or_none()
            if student and overall is not None:
                student.last_attendance_percent = overall
                session.commit()

        # Evaluate attendance alerts
        try:
            from services.attendance_monitor import evaluate_attendance
            subject_data = [
                {"abbr": r.get("course_abbr", ""), "attended": r.get("attended", 0), "sessions": r.get("sessions", 0), "percentage": r.get("attendance", 0)}
                for r in attendance_rows if r.get("course_abbr")
            ]
            evaluate_attendance(roll_number, overall, subject_data)
        except Exception as eval_exc:
            logger.warning("Background fetch: attendance evaluation failed for %s: %s", roll_number, eval_exc)

        return {"status": "success", "overall": overall, "subjects": len(attendance_rows)}

    except PortalAuthenticationError as exc:
        code = str(getattr(exc, "code", "")).upper()
        if code in ("INCORRECT_PASSWORD", "INVALID_USERNAME"):
            # Mark credential invalid
            _mark_credential_invalid(roll_number)
            _send_relink_notification(roll_number)
            return {"status": "invalid_credentials", "error": str(exc)}
        return {"status": "transient_failure", "error": str(exc)}
    except (PortalNetworkError, Exception) as exc:
        return {"status": "transient_failure", "error": str(exc)}


def run_fetch_cycle() -> dict:
    """
    Run one background fetch cycle: get eligible students, fetch sequentially
    with LOGIN_SPACING_SECONDS between each.
    Returns stats dict.
    """
    eligible = get_eligible_students()
    logger.info("Background fetch cycle: %d eligible students", len(eligible))

    stats = {"total": len(eligible), "success": 0, "failed": 0, "invalid": 0}
    now = datetime.now(timezone.utc)

    for i, student in enumerate(eligible):
        roll = student["roll_number"]

        if i > 0:
            time.sleep(LOGIN_SPACING_SECONDS)

        result = process_single_fetch(roll, student["encrypted_password"])
        _update_fetch_state(roll, result["status"], now)

        if result["status"] == "success":
            stats["success"] += 1
        elif result["status"] == "invalid_credentials":
            stats["invalid"] += 1
        else:
            stats["failed"] += 1

    logger.info("Background fetch cycle complete: %s", stats)
    return stats


def _update_fetch_state(roll_number: str, status: str, now: datetime) -> None:
    """Update BackgroundFetchState after a fetch attempt."""
    with SessionLocal() as session:
        state = session.query(BackgroundFetchState).filter(BackgroundFetchState.roll_number == roll_number).one_or_none()

        if state is None:
            state = BackgroundFetchState(roll_number=roll_number)
            session.add(state)

        state.last_fetch_at = now
        state.last_fetch_status = status

        if status == "success":
            state.consecutive_failures = 0
            state.next_eligible_at = now
        elif status == "transient_failure":
            state.consecutive_failures += 1
            if state.consecutive_failures >= PAUSE_AFTER_CONSECUTIVE_FAILURES:
                state.next_eligible_at = now + timedelta(hours=PAUSE_DURATION_HOURS)
            else:
                state.next_eligible_at = now
        elif status == "invalid_credentials":
            # Terminal state — handled via PortalCredential.status
            state.next_eligible_at = now + timedelta(days=365)

        session.commit()


def _mark_credential_invalid(roll_number: str) -> None:
    """Mark a student's portal credential as invalid."""
    with SessionLocal() as session:
        cred = (
            session.query(PortalCredential)
            .filter(PortalCredential.roll_number == roll_number)
            .one_or_none()
        )
        if cred:
            cred.status = "invalid"
            session.commit()
    logger.info("Background fetch: marked credentials invalid for %s", roll_number)


def _send_relink_notification(roll_number: str) -> None:
    """Send a one-time 'please re-link your account' push notification."""
    from services.notification_history_service import log_notification
    from services import notification_queue
    from services.payload_builder import build_payload

    # Check if we already sent one (don't spam)
    from db.models.notification_history import NotificationHistory
    with SessionLocal() as session:
        existing = (
            session.query(NotificationHistory)
            .filter(
                NotificationHistory.roll_number == roll_number,
                NotificationHistory.category == "relink",
            )
            .first()
        )
        if existing:
            return  # Already sent

    payload = build_payload(
        category="relink",
        title="⚠️ Account re-link required",
        body="Your portal password has changed. Please re-link your account to continue receiving attendance alerts.",
        deep_link="/app/profile",
        priority="high",
    )
    notification_queue.enqueue("push_send", {"roll_number": roll_number, "notification": payload}, target_roll=roll_number)


def get_fetcher_health() -> dict:
    """Admin health endpoint data."""
    now = datetime.now(timezone.utc)
    with SessionLocal() as session:
        total_states = session.query(BackgroundFetchState).count()
        success_count = session.query(BackgroundFetchState).filter(BackgroundFetchState.last_fetch_status == "success").count()
        failed_count = session.query(BackgroundFetchState).filter(BackgroundFetchState.last_fetch_status == "transient_failure").count()
        invalid_count = session.query(BackgroundFetchState).filter(BackgroundFetchState.last_fetch_status == "invalid_credentials").count()
        paused_count = session.query(BackgroundFetchState).filter(BackgroundFetchState.next_eligible_at > now).count()

    eligible = get_eligible_students()

    return {
        "eligible_students": len(eligible),
        "total_tracked": total_states,
        "last_cycle_success": success_count,
        "last_cycle_failed": failed_count,
        "invalid_credentials": invalid_count,
        "currently_paused": paused_count,
    }


class BackgroundFetchScheduler:
    """6-hour interval scheduler (6:00, 12:00, 18:00, 00:00 IST)."""

    def __init__(self):
        self._running = False
        self._timer: threading.Timer | None = None

    def start(self) -> None:
        self._running = True
        self._schedule_next()
        logger.info("BackgroundFetchScheduler started")

    def stop(self) -> None:
        self._running = False
        if self._timer:
            self._timer.cancel()

    def _schedule_next(self) -> None:
        if not self._running:
            return
        now_ist = datetime.now(IST)
        # Next 6-hour boundary: 0, 6, 12, 18
        current_slot = (now_ist.hour // 6) * 6
        next_slot_hour = current_slot + 6
        if next_slot_hour >= 24:
            next_slot_hour = 0
            target = (now_ist + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
        else:
            target = now_ist.replace(hour=next_slot_hour, minute=0, second=0, microsecond=0)
        delay = max((target - now_ist).total_seconds(), 60)
        self._timer = threading.Timer(delay, self._run_cycle)
        self._timer.daemon = True
        self._timer.start()

    def _run_cycle(self) -> None:
        try:
            run_fetch_cycle()
        except Exception:
            logger.exception("BackgroundFetchScheduler cycle failed")
        finally:
            self._schedule_next()


background_fetch_scheduler = BackgroundFetchScheduler()
