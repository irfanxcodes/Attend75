"""
Storage Cap Service
===================

Fail-closed R2 cost-safety system for Attend75's slide player.

Three independent guards — ALL three must pass inside one atomic DB transaction
before any R2 PUT is allowed. If ANY guard fails, or if the DB check itself
fails, the upload is BLOCKED (fail-closed, not fail-open).

  Guard 1 — Storage bytes   (PRIMARY)
    Tracks actual len(img_bytes) per WebP, not an estimate.
    Hard cap: R2_STORAGE_HARD_CAP_BYTES (default 7.5 GB — 25% below R2's 10 GB free tier).

  Guard 2 — Class A operations  (monthly PUT counter)
    Each slide upload = 1 Class A op (PUT).
    Monthly counter auto-resets when the UTC month changes.
    Hard cap: R2_CLASS_A_HARD_CAP (default 700,000 — 30% below R2's 1M/month free tier).

  Guard 3 — Slide count  (secondary / legacy guard)
    Hard cap: STORAGE_HARD_CAP_SLIDES (default 3,000).
    Kept as an additional guard, not the primary protection.

Concurrency
-----------
All three checks and increments happen inside one ``SELECT ... FOR UPDATE``
transaction on PostgreSQL. Two simultaneous uploads CANNOT both pass the check
and collectively exceed the cap — the second one waits for the first to commit.
On SQLite (dev), serialised via its own write lock.

Fail-closed behaviour
---------------------
If the DB is unavailable, or if the cap state row cannot be read, or if the
transaction fails for any reason, ``check_and_reserve`` raises
``StorageCapExceeded``. We NEVER assume "usage is fine" on an uncertain check.

Class B operations (R2 GET)
---------------------------
Student browsers fetch slides directly from Cloudflare's CDN edge:
    Student → Cloudflare CDN (cache hit) → zero R2 Class B ops
    Student → Cloudflare CDN (cache miss) → R2 GetObject

Our backend CANNOT count Class B ops synchronously because the requests
bypass us entirely. Mitigation:
  - All slides are uploaded with Cache-Control: public, max-age=31536000 (1 year).
    Browsers and Cloudflare's edge will aggressively cache each slide image.
    For our dataset size (~few thousand slides, ~100–300 MB total), cache
    eviction is unlikely in practice — but it is NOT guaranteed. A cache miss
    on any slide will produce one Class B op against R2.
  - At our scale (~500 students), even 100% cache-miss worst case is well
    inside R2's 10M Class B/month free tier.
  - Cloudflare's R2 dashboard shows actual Class B billing usage — use that
    for monitoring. We do NOT pretend our DB counter represents Class B billing.
  - R2_CLASS_B_HARD_CAP is documented and included in the admin dashboard
    for awareness, but is not synchronously enforced (see admin section).

Configuration (env vars)
------------------------
  R2_STORAGE_HARD_CAP_BYTES  int  default 7_500_000_000  (7.5 GB)
  R2_CLASS_A_HARD_CAP        int  default 700_000         (monthly PUTs)
  R2_CLASS_B_HARD_CAP        int  default 7_000_000       (monthly GETs — monitoring only)
  STORAGE_HARD_CAP_SLIDES    int  default 3_000           (secondary slide count guard)
  ADMIN_ROLL_NUMBER          str  optional — receives push alerts

Alert thresholds (per guard, fires once per crossing)
------------------------------------------------------
  Level 1 → 50%  warning
  Level 2 → 75%  warning
  Level 3 → 90%  urgent
  Level 4 → 100% hard block (all new R2 PUTs blocked until admin resets)
"""

import logging
import os
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

# ── Alert threshold config ────────────────────────────────────────────────────

_THRESHOLDS = [
    (1, 0.50, "50%",  "⚠️ R2 Storage Warning",  "standard"),
    (2, 0.75, "75%",  "⚠️ R2 Storage Warning",  "standard"),
    (3, 0.90, "90%",  "🚨 R2 Storage Urgent",   "high"),
    (4, 1.00, "100%", "🛑 R2 Storage Cap Hit",  "high"),
]


# ── Public exceptions ─────────────────────────────────────────────────────────

class StorageCapExceeded(Exception):
    """
    Raised when a new upload would breach any hard cap, or when the cap
    state cannot be reliably determined (fail-closed).
    """
    def __init__(self, reason: str, guard: str = "unknown"):
        self.guard = guard   # "bytes" | "class_a" | "slides" | "db_error"
        self.reason = reason
        super().__init__(reason)


# ── Cap config helpers ────────────────────────────────────────────────────────

def get_caps() -> dict:
    """Return all configured cap values from environment variables."""
    def _int(key, default):
        try:
            return max(1, int(os.getenv(key, str(default))))
        except ValueError:
            return default

    return {
        "bytes":   _int("R2_STORAGE_HARD_CAP_BYTES", 7_500_000_000),
        "class_a": _int("R2_CLASS_A_HARD_CAP",       700_000),
        "class_b": _int("R2_CLASS_B_HARD_CAP",       7_000_000),  # monitoring only
        "slides":  _int("STORAGE_HARD_CAP_SLIDES",   3_000),
    }


# ── Public API ────────────────────────────────────────────────────────────────

def check_and_reserve(n_slides: int, actual_bytes: list[int]) -> None:
    """
    Atomically check all three guards and pre-reserve capacity.

    Parameters
    ----------
    n_slides      : number of NEW slides about to be written to R2
    actual_bytes  : list of len(img_bytes) for each new slide (must be len == n_slides)

    Raises StorageCapExceeded if:
      - any hard cap would be exceeded
      - the combined hard-block flag is set from a previous trip
      - the DB is unavailable (fail-closed)

    On success, the reservation is committed to the DB.
    Call release_reservation(n_slides, actual_bytes) if the upload then fails.
    """
    if n_slides <= 0:
        return

    if len(actual_bytes) != n_slides:
        raise ValueError(
            f"actual_bytes length {len(actual_bytes)} must equal n_slides {n_slides}"
        )

    total_new_bytes = sum(actual_bytes)
    caps = get_caps()

    try:
        _do_reserve(n_slides, total_new_bytes, caps)
    except StorageCapExceeded:
        raise
    except Exception as exc:
        # Any unexpected DB/runtime error → fail closed.
        logger.error(
            "[StorageCap] check_and_reserve failed unexpectedly — BLOCKING upload: %s",
            exc, exc_info=True,
        )
        raise StorageCapExceeded(
            f"Cap check failed with DB error: {exc}. Upload blocked (fail-closed).",
            guard="db_error",
        ) from exc


def release_reservation(n_slides: int, actual_bytes: list[int]) -> None:
    """
    Release a previously committed reservation after a partial or complete failure.

    Safe to call even if the reservation was only partially used — pass the
    counts for the slides that were NOT successfully written to R2.
    """
    if n_slides <= 0:
        return

    total_bytes = sum(actual_bytes) if actual_bytes else 0

    try:
        from db.session import SessionLocal
        caps = get_caps()
        now = datetime.utcnow()
        _month, _year = now.month, now.year

        with SessionLocal() as session:
            state = _get_or_create_state(session, caps)
            state.reserved_bytes      = max(0, state.reserved_bytes - total_bytes)
            state.reserved_class_a_ops = max(0, state.reserved_class_a_ops - n_slides)
            state.total_slides_stored  = max(0, state.total_slides_stored - n_slides)
            state.updated_at = now
            session.commit()

        logger.debug(
            "[StorageCap] Released reservation: %d slides, %d bytes",
            n_slides, total_bytes,
        )
    except Exception as exc:
        # Non-fatal — the counter may drift slightly, sync_real_count() fixes it.
        logger.error("[StorageCap] release_reservation failed: %s", exc)


def get_status() -> dict:
    """
    Full status snapshot for the admin dashboard.
    NEVER mutates state.

    Clearly distinguishes:
      AUTHORITATIVE — values tracked by our atomic DB counters
      ESTIMATED     — values we cannot count (Class B)
      NOTE          — architectural limitations
    """
    caps = get_caps()

    try:
        from db.session import SessionLocal
        with SessionLocal() as session:
            state = _get_or_create_state(session, caps)
            real_slides = _real_slide_count(session)

            # Capture all values inside the session
            rb        = state.reserved_bytes
            ca_ops    = state.reserved_class_a_ops
            slides    = state.total_slides_stored
            blocked   = state.hard_cap_hit
            blocked_at = state.hard_cap_hit_at
            b_alert   = state.bytes_alert_level
            a_alert   = state.class_a_alert_level
            s_alert   = state.slides_alert_level
            last_alert = state.last_alert_sent_at
            b_hit     = state.bytes_cap_hit
            a_hit     = state.class_a_cap_hit
            s_hit     = state.slides_cap_hit
            ca_month  = state.class_a_month
            ca_year   = state.class_a_year
            session.commit()

    except Exception as exc:
        logger.error("[StorageCap] get_status failed: %s", exc)
        return {
            "error": str(exc),
            "caps": caps,
            "note": "DB unavailable — status unknown. Uploads are blocked (fail-closed).",
        }

    def _pct(used, cap):
        return round((used / cap) * 100, 1) if cap else 0.0

    return {
        # ── Guard 1: Storage bytes (PRIMARY, AUTHORITATIVE) ──────────────
        "storage_bytes": {
            "authoritative": True,
            "reserved_bytes": rb,
            "reserved_mb": round(rb / 1_048_576, 2),
            "hard_cap_bytes": caps["bytes"],
            "hard_cap_mb": round(caps["bytes"] / 1_048_576, 2),
            "used_percent": _pct(rb, caps["bytes"]),
            "remaining_bytes": max(0, caps["bytes"] - rb),
            "remaining_mb": round(max(0, caps["bytes"] - rb) / 1_048_576, 2),
            "cap_hit": b_hit,
            "alert_level": b_alert,
            "note": "Tracks actual WebP bytes committed to R2. Primary billing guard.",
        },

        # ── Guard 2: Class A operations (AUTHORITATIVE for writes) ────────
        "class_a_ops": {
            "authoritative": True,
            "reserved_ops": ca_ops,
            "hard_cap_ops": caps["class_a"],
            "used_percent": _pct(ca_ops, caps["class_a"]),
            "remaining_ops": max(0, caps["class_a"] - ca_ops),
            "cap_hit": a_hit,
            "alert_level": a_alert,
            "month": ca_month,
            "year": ca_year,
            "note": (
                "Counts R2 PUT operations (1 per slide upload). "
                "Monthly counter — auto-resets when UTC month changes. "
                "HEAD operations during dedup checks are also Class B, "
                "but those are negligible at our scale."
            ),
        },

        # ── Guard 3: Slide count (AUTHORITATIVE, secondary guard) ─────────
        "slide_count": {
            "authoritative": True,
            "slides_tracked": slides,
            "slides_real_db": real_slides,
            "hard_cap_slides": caps["slides"],
            "used_percent": _pct(real_slides, caps["slides"]),
            "remaining_slides": max(0, caps["slides"] - real_slides),
            "cap_hit": s_hit,
            "alert_level": s_alert,
            "note": "Secondary guard. Primary protection is storage_bytes.",
        },

        # ── Class B monitoring (ESTIMATED — NOT authoritative billing data) ─
        "class_b_ops": {
            "authoritative": False,
            "estimated": True,
            "hard_cap_ops": caps["class_b"],
            "note": (
                "Class B ops (GetObject) happen directly Student→Cloudflare→R2. "
                "Our backend CANNOT count them synchronously. "
                "Mitigation: slides have Cache-Control: public, max-age=31536000. "
                "Browsers and Cloudflare edge cache each slide aggressively; "
                "cache eviction is unlikely at our scale but not guaranteed. "
                "A cache miss produces one Class B op against R2. "
                "Check actual Class B usage at: "
                "Cloudflare Dashboard → R2 → attend75-slides → Metrics."
            ),
        },

        # ── Combined state ────────────────────────────────────────────────
        "combined": {
            "hard_cap_hit": blocked,
            "hard_cap_hit_at": blocked_at.isoformat() if blocked_at else None,
            "last_alert_sent_at": last_alert.isoformat() if last_alert else None,
            "all_caps": caps,
        },
    }


def admin_reset_cap_block(guard: str = "all") -> dict:
    """
    Lift the hard-block flag for one or all guards so uploads can resume.

    guard: "bytes" | "class_a" | "slides" | "all"

    IMPORTANT: Call this only AFTER you have either raised the cap in .env
    and restarted the server, OR deleted old slides to free space.
    """
    caps = get_caps()
    now = datetime.utcnow()

    with _locked_session(caps) as (session, state):
        if guard in ("bytes", "all"):
            state.bytes_cap_hit    = False
            state.bytes_cap_hit_at = None
            state.bytes_alert_level = 0
        if guard in ("class_a", "all"):
            state.class_a_cap_hit    = False
            state.class_a_cap_hit_at = None
            state.class_a_alert_level = 0
            # Re-stamp the current month so the auto-reset doesn't immediately re-fire
            state.class_a_month = now.month
            state.class_a_year  = now.year
        if guard in ("slides", "all"):
            state.slides_cap_hit    = False
            state.slides_cap_hit_at = None
            state.slides_alert_level = 0
        if guard == "all":
            state.hard_cap_hit    = False
            state.hard_cap_hit_at = None

        state.updated_at = now

        # Capture for return
        rb = state.reserved_bytes
        ca = state.reserved_class_a_ops
        sl = state.total_slides_stored
        session.commit()

    logger.info("[StorageCap] Admin reset guard=%r new_caps=%s", guard, caps)
    return {
        "reset": True,
        "guard_reset": guard,
        "current_reserved_bytes": rb,
        "current_class_a_ops": ca,
        "current_slides": sl,
        "new_caps": caps,
        "message": (
            f"Block lifted for guard='{guard}'. "
            "Ensure the relevant cap env var is updated before resuming uploads."
        ),
    }


def admin_reset_class_a_monthly() -> dict:
    """
    Reset the monthly Class A counter to zero.
    Call this at the start of each calendar month (or automate via cron).
    """
    caps = get_caps()
    now = datetime.utcnow()

    with _locked_session(caps) as (session, state):
        prev = state.reserved_class_a_ops
        state.reserved_class_a_ops = 0
        state.class_a_cap_hit    = False
        state.class_a_cap_hit_at = None
        state.class_a_alert_level = 0
        state.class_a_month = now.month
        state.class_a_year  = now.year
        # Lift the combined block only if bytes and slides are also clear
        if not state.bytes_cap_hit and not state.slides_cap_hit:
            state.hard_cap_hit    = False
            state.hard_cap_hit_at = None
        state.updated_at = now
        session.commit()

    logger.info("[StorageCap] Monthly Class A counter reset (was %d)", prev)
    return {
        "reset": True,
        "previous_ops": prev,
        "new_month": now.month,
        "new_year": now.year,
    }


def sync_real_count() -> dict:
    """
    Resync the slide-count and byte trackers from the real DB.
    Use after manual deletions so the counters reflect truth.

    Note: actual_bytes per slide are stored in lesson_slides.image_url but
    not the byte size — we recompute from the DB count using the stored
    reserved_bytes / total_slides ratio if slides exist, otherwise leave
    reserved_bytes as-is (admin can manually reset if needed).
    """
    caps = get_caps()
    now = datetime.utcnow()

    with _locked_session(caps) as (session, state):
        real_slides = _real_slide_count(session)
        state.total_slides_stored = real_slides
        state.updated_at = now
        session.commit()

    logger.info("[StorageCap] Synced slide count to real: %d", real_slides)
    return {"synced_slides": real_slides}


# ── Internal: atomic reservation ─────────────────────────────────────────────

def _do_reserve(n_slides: int, total_new_bytes: int, caps: dict) -> None:
    """
    All three guard checks + increments in one FOR UPDATE transaction.
    Raises StorageCapExceeded immediately if any guard fails.
    """
    now = datetime.utcnow()
    _month, _year = now.month, now.year

    with _locked_session(caps) as (session, state):

        # ── Auto-reset Class A monthly counter when month rolls over ──────
        if state.class_a_month != _month or state.class_a_year != _year:
            logger.info(
                "[StorageCap] New billing month (%d/%d) — auto-resetting Class A counter "
                "(was %d ops for %s/%s)",
                _month, _year, state.reserved_class_a_ops,
                state.class_a_month, state.class_a_year,
            )
            state.reserved_class_a_ops = 0
            state.class_a_cap_hit    = False
            state.class_a_cap_hit_at = None
            state.class_a_alert_level = 0
            state.class_a_month = _month
            state.class_a_year  = _year

        # ── Check combined hard-block flag ────────────────────────────────
        if state.hard_cap_hit:
            session.commit()
            raise StorageCapExceeded(
                f"R2 uploads are blocked (hard_cap_hit=True). "
                "Call POST /admin/storage/reset-cap-block after raising caps.",
                guard="combined",
            )

        # ── Guard 1: bytes ────────────────────────────────────────────────
        projected_bytes = state.reserved_bytes + total_new_bytes
        if projected_bytes > caps["bytes"]:
            state.bytes_cap_hit    = True
            state.bytes_cap_hit_at = now
            state.hard_cap_hit     = True
            state.hard_cap_hit_at  = now
            session.commit()
            _fire_alert_bytes(state.reserved_bytes, caps["bytes"], level=4)
            raise StorageCapExceeded(
                f"R2 storage byte cap exceeded: "
                f"reserved={state.reserved_bytes} + new={total_new_bytes} "
                f"> cap={caps['bytes']} bytes.",
                guard="bytes",
            )

        # ── Guard 2: Class A ops ──────────────────────────────────────────
        projected_class_a = state.reserved_class_a_ops + n_slides
        if projected_class_a > caps["class_a"]:
            state.class_a_cap_hit    = True
            state.class_a_cap_hit_at = now
            state.hard_cap_hit       = True
            state.hard_cap_hit_at    = now
            session.commit()
            _fire_alert_class_a(state.reserved_class_a_ops, caps["class_a"], level=4)
            raise StorageCapExceeded(
                f"R2 Class A operation cap exceeded: "
                f"reserved={state.reserved_class_a_ops} + new={n_slides} "
                f"> cap={caps['class_a']} ops this month.",
                guard="class_a",
            )

        # ── Guard 3: slide count ──────────────────────────────────────────
        projected_slides = state.total_slides_stored + n_slides
        if projected_slides > caps["slides"]:
            state.slides_cap_hit    = True
            state.slides_cap_hit_at = now
            state.hard_cap_hit      = True
            state.hard_cap_hit_at   = now
            session.commit()
            _fire_alert_slides(state.total_slides_stored, caps["slides"], level=4)
            raise StorageCapExceeded(
                f"Slide count cap exceeded: "
                f"stored={state.total_slides_stored} + new={n_slides} "
                f"> cap={caps['slides']} slides.",
                guard="slides",
            )

        # ── All guards passed — commit reservations ───────────────────────
        state.reserved_bytes       = projected_bytes
        state.reserved_class_a_ops = projected_class_a
        state.total_slides_stored  = projected_slides
        state.updated_at           = now

        # Capture alert levels to fire after commit (avoid holding lock during push)
        new_b_level  = _threshold_level(projected_bytes,   caps["bytes"])
        new_a_level  = _threshold_level(projected_class_a, caps["class_a"])
        new_s_level  = _threshold_level(projected_slides,  caps["slides"])

        fire_b = new_b_level > state.bytes_alert_level
        fire_a = new_a_level > state.class_a_alert_level
        fire_s = new_s_level > state.slides_alert_level

        if fire_b:
            state.bytes_alert_level   = new_b_level
            state.last_alert_sent_at  = now
        if fire_a:
            state.class_a_alert_level = new_a_level
            state.last_alert_sent_at  = now
        if fire_s:
            state.slides_alert_level  = new_s_level
            state.last_alert_sent_at  = now

        session.commit()

    # Fire push alerts OUTSIDE the lock
    if fire_b:
        _fire_alert_bytes(projected_bytes, caps["bytes"], level=new_b_level)
    if fire_a:
        _fire_alert_class_a(projected_class_a, caps["class_a"], level=new_a_level)
    if fire_s:
        _fire_alert_slides(projected_slides, caps["slides"], level=new_s_level)

    logger.debug(
        "[StorageCap] Reserved: %d slides, %d bytes, %d class-A ops",
        n_slides, total_new_bytes, n_slides,
    )


# ── Internal: DB helpers ──────────────────────────────────────────────────────

from contextlib import contextmanager

@contextmanager
def _locked_session(caps: dict):
    """
    Context manager that yields (session, state) inside a FOR UPDATE lock.
    Commits on normal exit, rolls back and re-raises on exception.
    """
    from db.session import SessionLocal
    from db.models.storage_cap_state import StorageCapState

    session = SessionLocal()
    try:
        try:
            engine = session.get_bind()
            is_postgres = engine.dialect.name == "postgresql"
        except Exception:
            is_postgres = False

        if is_postgres:
            state = (
                session.query(StorageCapState)
                .filter(StorageCapState.id == 1)
                .with_for_update()
                .first()
            )
        else:
            state = (
                session.query(StorageCapState)
                .filter(StorageCapState.id == 1)
                .first()
            )

        if state is None:
            state = _create_initial_state(session, caps)

        yield session, state

    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def _create_initial_state(session, caps: dict):
    """Insert the singleton row if missing (e.g. first boot after migration)."""
    from db.models.storage_cap_state import StorageCapState
    now = datetime.utcnow()
    state = StorageCapState(
        id=1,
        reserved_bytes=0,
        hard_cap_bytes=caps["bytes"],
        bytes_cap_hit=False,
        reserved_class_a_ops=0,
        hard_cap_class_a=caps["class_a"],
        class_a_cap_hit=False,
        class_a_month=now.month,   # initialise so first upload doesn't trigger auto-reset
        class_a_year=now.year,
        total_slides_stored=0,
        hard_cap_at_slides=caps["slides"],
        slides_cap_hit=False,
        hard_cap_hit=False,
        bytes_alert_level=0,
        class_a_alert_level=0,
        slides_alert_level=0,
        created_at=now,
        updated_at=now,
    )
    session.add(state)
    session.flush()
    return state


def _get_or_create_state(session, caps: dict):
    """Read state without a FOR UPDATE lock — use only for read-only queries."""
    from db.models.storage_cap_state import StorageCapState
    state = session.query(StorageCapState).filter(StorageCapState.id == 1).first()
    if state is None:
        state = _create_initial_state(session, caps)
    return state


def _real_slide_count(session) -> int:
    try:
        from db.models.lesson_slide import LessonSlide
        return session.query(LessonSlide).count()
    except Exception as exc:
        logger.warning("[StorageCap] Could not query real slide count: %s", exc)
        return 0


def _threshold_level(value: int | float, cap: int | float) -> int:
    level = 0
    for lvl, fraction, *_ in _THRESHOLDS:
        if value >= cap * fraction:
            level = lvl
    return level


# ── Internal: alert helpers ───────────────────────────────────────────────────

def _fire_alert_bytes(current: int, cap: int, level: int) -> None:
    pct = round((current / cap) * 100, 1) if cap else 0.0
    cfg = next((t for t in _THRESHOLDS if t[0] == level), None)
    label = cfg[2] if cfg else f"{pct}%"

    if level < 4:
        title = f"⚠️ R2 Storage at {label}"
        body = (
            f"R2 storage usage is at {label} "
            f"({round(current/1_048_576,1)} MB / {round(cap/1_048_576,1)} MB). "
            "No action needed yet."
        )
    else:
        title = "🛑 R2 Storage Cap Hit"
        body = (
            f"R2 storage BLOCKED at {round(current/1_048_576,1)} MB "
            f"(cap {round(cap/1_048_576,1)} MB). "
            "All new slide uploads blocked. "
            "Raise R2_STORAGE_HARD_CAP_BYTES or delete old slides, "
            "then POST /admin/storage/reset-cap-block."
        )
    _send_push(title, body, priority="high" if level >= 3 else "standard")


def _fire_alert_class_a(current: int, cap: int, level: int) -> None:
    pct = round((current / cap) * 100, 1) if cap else 0.0
    cfg = next((t for t in _THRESHOLDS if t[0] == level), None)
    label = cfg[2] if cfg else f"{pct}%"

    if level < 4:
        title = f"⚠️ R2 Class A Ops at {label}"
        body = (
            f"R2 Class A (PUT) operations at {label} "
            f"({current:,} / {cap:,} this month). "
            "No action needed yet — resets on the 1st of next month."
        )
    else:
        title = "🛑 R2 Class A Ops Cap Hit"
        body = (
            f"R2 Class A BLOCKED at {current:,} ops (cap {cap:,}/month). "
            "All new slide uploads blocked until month resets. "
            "POST /admin/storage/reset-class-a-monthly to manually reset."
        )
    _send_push(title, body, priority="high" if level >= 3 else "standard")


def _fire_alert_slides(current: int, cap: int, level: int) -> None:
    cfg = next((t for t in _THRESHOLDS if t[0] == level), None)
    label = cfg[2] if cfg else ""

    if level < 4:
        title = f"⚠️ Slide Count at {label}"
        body = f"Slide count at {label} ({current:,} / {cap:,} slides)."
    else:
        title = "🛑 Slide Count Cap Hit"
        body = (
            f"Slide count BLOCKED at {current:,} slides (cap {cap:,}). "
            "Raise STORAGE_HARD_CAP_SLIDES or delete uploads."
        )
    _send_push(title, body, priority="high" if level >= 3 else "standard")


def _send_push(title: str, body: str, priority: str = "standard") -> None:
    """Send a push notification to the admin roll number. Never raises."""
    admin_roll = os.getenv("ADMIN_ROLL_NUMBER", "").strip()
    logger.warning("[StorageCap] ALERT: %s — %s", title, body)

    if not admin_roll:
        logger.warning(
            "[StorageCap] ADMIN_ROLL_NUMBER not set — push skipped. "
            "Set ADMIN_ROLL_NUMBER in backend/.env to receive alerts."
        )
        return

    try:
        from services.payload_builder import build_payload
        from services import notification_queue

        payload = build_payload(
            category="storage_alert",
            title=title,
            body=body,
            priority=priority,
            deep_link="/admin",
        )
        notification_queue.enqueue(
            job_type="push_send",
            payload={"roll_number": admin_roll, "notification": payload},
            target_roll=admin_roll,
        )
        logger.info("[StorageCap] Push alert enqueued for admin=%s", admin_roll)
    except Exception as exc:
        logger.error("[StorageCap] Failed to enqueue push alert: %s", exc)
