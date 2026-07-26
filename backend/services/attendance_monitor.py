"""
Attendance Monitor — Evaluates attendance data and triggers push alerts on threshold crossings.

Uses state-based deduplication: an alert fires only when the attendance bracket
changes (Req 4.5 / Property 12). Brackets:
  - above_80: safe zone (no alert)
  - 75_to_80: warning zone (Req 4.1)
  - below_75: critical zone (Req 4.2, 4.3)

Recovery alerts fire when crossing from below_75 back to a higher bracket (Req 4.4).
"""

import logging
import math
from datetime import datetime, timezone

from db.models.attendance_alert_state import AttendanceAlertState
from db.session import SessionLocal
from services import notification_queue
from services.payload_builder import build_payload
from services.preference_filter import get_or_create_preferences, should_send

logger = logging.getLogger(__name__)

OVERALL_SUBJECT_KEY = "__overall__"


def bracket_for(percent: float) -> str:
    """Classify a percentage into an alerting bracket."""
    if percent < 75:
        return "below_75"
    elif percent < 80:
        return "75_to_80"
    else:
        return "above_80"


def classes_to_recover(attended: int, total: int) -> int:
    """
    Smallest integer n such that (attended + n) / (total + n) >= 0.75.
    Algebraically: n = ceil((0.75*total - attended) / 0.25), clamped to >= 0.
    Property 13 guarantees correctness.
    """
    if total == 0:
        return 0
    current_percent = (attended / total) * 100
    if current_percent >= 75:
        return 0
    # (attended + n) / (total + n) >= 0.75
    # attended + n >= 0.75 * total + 0.75 * n
    # 0.25 * n >= 0.75 * total - attended
    # n >= (0.75 * total - attended) / 0.25
    n = math.ceil((0.75 * total - attended) / 0.25)
    return max(n, 0)


def evaluate_attendance(
    roll_number: str,
    overall_percent: float | None,
    subject_data: list[dict] | None = None,
) -> int:
    """
    Evaluate attendance for a student and enqueue alerts on bracket changes.

    Args:
        roll_number: Student identifier
        overall_percent: Overall attendance percentage (or None to skip overall check)
        subject_data: List of dicts with keys {abbr, attended, sessions, percentage}
                      (from the scraper's attendance response)

    Returns:
        Number of push_send jobs enqueued.
    """

    prefs = get_or_create_preferences(roll_number)
    if not should_send(prefs, "attendance_enabled"):
        return 0

    enqueued = 0

    # Overall attendance check
    if overall_percent is not None:
        enqueued += _evaluate_single(roll_number, OVERALL_SUBJECT_KEY, overall_percent, attended=0, total=0)

    # Per-subject checks
    if subject_data:
        for subj in subject_data:
            abbr = str(subj.get("abbr") or subj.get("course_abbr") or "").strip().upper()
            if not abbr:
                continue
            try:
                pct = float(subj.get("percentage") or subj.get("attendance") or 0)
                attended = int(subj.get("attended") or 0)
                total = int(subj.get("sessions") or subj.get("total") or 0)
            except (ValueError, TypeError):
                continue
            enqueued += _evaluate_single(roll_number, abbr, pct, attended, total)

    return enqueued


def _evaluate_single(roll_number: str, subject_abbr: str, percent: float, attended: int, total: int) -> int:
    """Evaluate one subject/overall bracket transition. Returns 0 or 1 (jobs enqueued)."""
    new_bracket = bracket_for(percent)

    with SessionLocal() as session:
        state = (
            session.query(AttendanceAlertState)
            .filter(
                AttendanceAlertState.roll_number == roll_number,
                AttendanceAlertState.subject_abbr == subject_abbr,
            )
            .one_or_none()
        )

        old_bracket = state.last_alerted_bracket if state else "above_80"

        # No state change → no alert (dedup, Req 4.5)
        if new_bracket == old_bracket:
            return 0

        # Determine alert type
        payload = None

        if new_bracket == "below_75":
            # Critical alert (Req 4.2 overall, Req 4.3 per-subject)
            if subject_abbr == OVERALL_SUBJECT_KEY:
                payload = build_payload(
                    category="attendance",
                    title="⚠️ Attendance below 75%",
                    body=f"Your overall attendance has dropped to {percent:.1f}%. You're below the mandatory threshold.",
                    deep_link="/app/dashboard",
                    priority="high",
                )
            else:
                recovery = classes_to_recover(attended, total)
                payload = build_payload(
                    category="attendance",
                    title=f"⚠️ {subject_abbr} below 75%",
                    body=f"{subject_abbr} attendance is {percent:.1f}%. Attend {recovery} more class{'es' if recovery != 1 else ''} to recover.",
                    deep_link="/app/dashboard",
                    priority="high",
                )

        elif new_bracket == "75_to_80" and old_bracket == "above_80":
            # Warning alert (Req 4.1) — include recovery info
            if subject_abbr == OVERALL_SUBJECT_KEY:
                # How many classes to get back to 80%? Approximate: similar formula but target 80%
                payload = build_payload(
                    category="attendance",
                    title="📉 Attendance dropped to {:.1f}%".format(percent),
                    body="Attend the next few classes consistently to stay above 80%. One more absence could put you below 75%.",
                    deep_link="/app/dashboard",
                    priority="standard",
                )
            else:
                payload = build_payload(
                    category="attendance",
                    title=f"📉 {subject_abbr} at {percent:.1f}%",
                    body=f"{subject_abbr} is near the danger zone. Attend the next few classes to stay safe.",
                    deep_link="/app/dashboard",
                    priority="standard",
                )

        elif old_bracket == "below_75" and new_bracket in ("75_to_80", "above_80"):
            # Recovery alert (Req 4.4) — fires for both subjects and overall
            if subject_abbr == OVERALL_SUBJECT_KEY:
                payload = build_payload(
                    category="attendance",
                    title="✅ Attendance recovered!",
                    body=f"Overall attendance is back to {percent:.1f}%. Keep attending to stay above 75%.",
                    deep_link="/app/dashboard",
                    priority="standard",
                )
            else:
                payload = build_payload(
                    category="attendance",
                    title=f"🎉 {subject_abbr} recovered!",
                    body=f"Back above 75%! Current attendance: {percent:.1f}%. Keep it up!",
                    deep_link="/app/dashboard",
                    priority="standard",
                )

        # Update stored state
        now = datetime.now(timezone.utc)
        if state:
            state.last_alerted_bracket = new_bracket
            state.last_alerted_percent = percent
            state.last_alerted_at = now
        else:
            state = AttendanceAlertState(
                roll_number=roll_number,
                subject_abbr=subject_abbr,
                last_alerted_bracket=new_bracket,
                last_alerted_percent=percent,
                last_alerted_at=now,
            )
            session.add(state)
        session.commit()

    # Enqueue notification if we built one
    if payload:
        notification_queue.enqueue(
            "push_send",
            {"roll_number": roll_number, "notification": payload},
            target_roll=roll_number,
            priority=1 if payload.get("priority") == "high" else 0,
        )
        return 1

    return 0
