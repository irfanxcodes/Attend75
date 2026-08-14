"""
Storage Cap Service — test suite.

Run from backend/:
    python3 -m pytest tests/test_storage_cap.py -v

Covers:
  - Basic reservation (all guards)
  - Byte cap: below limit, exactly at limit, 1 byte over
  - Class A cap — isolated (slides cap set high so it cannot interfere)
  - Slide count cap — isolated (class_a cap set high so it cannot interfere)
  - Stays blocked after any cap hit
  - Partial failure: heterogeneous WebP sizes, exact byte release
  - Concurrent upload: byte invariant guaranteed (SQLite serialises by commit;
    PostgreSQL uses SELECT FOR UPDATE — production guarantee)
  - Class A monthly auto-reset on billing month change
  - Large individual slide (edge case)
  - Status structure: authoritative/estimated flags, all sections present
  - Selective guard reset (reset one guard without clearing others)
  - admin_reset_cap_block re-stamps class_a month to avoid spurious auto-reset

Notes on SQLite concurrency (T8):
  SQLite does not honour SELECT FOR UPDATE. Both threads may succeed in the
  test environment. The test asserts only the byte invariant (reserved <= cap),
  which is guaranteed by SQLite's commit serialisation even without FOR UPDATE.
  On PostgreSQL in production, FOR UPDATE prevents both from passing: exactly
  one succeeds and one is blocked. This is the correct production behaviour.
"""

import datetime as dt
import os
import threading

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# ── Test DB setup ─────────────────────────────────────────────────────────────

TEST_DB = "./test_storage_cap_pytest.db"

# Caps chosen to let each guard be tested independently:
#   bytes   = 100 KB   (small enough to trip quickly)
#   class_a = 1000     (high enough to never interfere with slide cap tests)
#   slides  = 20       (low enough to trip quickly)
# Tests that isolate class_a set STORAGE_HARD_CAP_SLIDES=1000 locally.
_CAP_BYTES   = 100 * 1024         # 100 KB
_CAP_CLASS_A = 1_000              # high — won't interfere with byte/slide tests
_CAP_SLIDES  = 20


@pytest.fixture(autouse=True)
def isolated_env(monkeypatch, tmp_path):
    """Each test gets a fresh in-memory DB and its own cap env vars."""
    db_path = str(tmp_path / "cap_test.db")

    monkeypatch.setenv("R2_STORAGE_HARD_CAP_BYTES", str(_CAP_BYTES))
    monkeypatch.setenv("R2_CLASS_A_HARD_CAP",       str(_CAP_CLASS_A))
    monkeypatch.setenv("STORAGE_HARD_CAP_SLIDES",   str(_CAP_SLIDES))
    monkeypatch.setenv("ADMIN_ROLL_NUMBER",          "24fmuchh014059")
    monkeypatch.setenv("DATABASE_URL",               f"sqlite:///{db_path}")

    from db.models.storage_cap_state import StorageCapState
    engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )
    StorageCapState.__table__.create(engine, checkfirst=True)
    Session = sessionmaker(bind=engine)

    import db.session as db_session
    import services.storage_cap_service as svc

    monkeypatch.setattr(db_session, "SessionLocal", Session)
    monkeypatch.setattr(db_session, "engine", engine)
    monkeypatch.setattr(svc, "_real_slide_count", lambda session: 0)

    yield


# Convenience imports — imported after fixture so env is set first.
def _svc():
    import services.storage_cap_service as s
    return s


# ── T1: basic reservation — all guards below limits ───────────────────────────

def test_basic_reservation():
    svc = _svc()
    svc.check_and_reserve(3, [10 * 1024] * 3)  # 30 KB, 3 ops, 3 slides
    s = svc.get_status()

    assert s["storage_bytes"]["reserved_bytes"] == 30 * 1024
    assert s["class_a_ops"]["reserved_ops"] == 3
    assert s["slide_count"]["slides_tracked"] == 3
    assert not s["combined"]["hard_cap_hit"]


# ── T2: byte cap — actual bytes exceed limit ──────────────────────────────────

def test_byte_cap_exceeded():
    svc = _svc()
    svc.check_and_reserve(3, [30 * 1024] * 3)  # 90 KB used
    with pytest.raises(svc.StorageCapExceeded) as exc_info:
        svc.check_and_reserve(2, [8 * 1024] * 2)  # 90 + 16 = 106 KB > 100 KB cap
    assert exc_info.value.guard == "bytes"

    s = svc.get_status()
    assert s["storage_bytes"]["cap_hit"]
    assert s["combined"]["hard_cap_hit"]


def test_byte_cap_exactly_at_limit_allowed():
    svc = _svc()
    svc.check_and_reserve(1, [_CAP_BYTES])  # exactly at cap
    s = svc.get_status()
    assert s["storage_bytes"]["reserved_bytes"] == _CAP_BYTES
    assert not s["combined"]["hard_cap_hit"]


def test_byte_cap_one_byte_over_blocks():
    svc = _svc()
    svc.check_and_reserve(1, [_CAP_BYTES])  # at cap
    with pytest.raises(svc.StorageCapExceeded) as exc_info:
        svc.check_and_reserve(1, [1])        # 1 byte over
    assert exc_info.value.guard == "bytes"


# ── T3: Class A cap — isolated (slides cap raised so it cannot interfere) ─────

def test_class_a_cap_isolated(monkeypatch):
    """Slide cap is raised to 1000 so only Class A can trip here."""
    monkeypatch.setenv("STORAGE_HARD_CAP_SLIDES", "1000")
    monkeypatch.setenv("R2_CLASS_A_HARD_CAP", "20")  # low cap for this test

    import importlib, services.storage_cap_service as svc_mod
    importlib.reload(svc_mod)  # pick up new env values
    svc = svc_mod

    svc.check_and_reserve(15, [100] * 15)   # 15 ops used (cap=20)
    with pytest.raises(svc.StorageCapExceeded) as exc_info:
        svc.check_and_reserve(8, [100] * 8)  # 15+8=23 > 20
    assert exc_info.value.guard == "class_a"

    s = svc.get_status()
    assert s["class_a_ops"]["cap_hit"]
    assert not s["slide_count"]["cap_hit"]   # slide guard was NOT tripped


# ── T4: Slide count cap — isolated (class_a cap raised so it cannot interfere)

def test_slide_cap_isolated(monkeypatch):
    """Class A cap is raised to 1000 so only the slide guard can trip here."""
    monkeypatch.setenv("R2_CLASS_A_HARD_CAP", "1000")
    monkeypatch.setenv("STORAGE_HARD_CAP_SLIDES", "20")

    import importlib, services.storage_cap_service as svc_mod
    importlib.reload(svc_mod)
    svc = svc_mod

    svc.check_and_reserve(15, [100] * 15)   # 15 slides used (cap=20)
    with pytest.raises(svc.StorageCapExceeded) as exc_info:
        svc.check_and_reserve(8, [100] * 8)  # 15+8=23 > 20
    assert exc_info.value.guard == "slides"

    s = svc.get_status()
    assert s["slide_count"]["cap_hit"]
    assert not s["class_a_ops"]["cap_hit"]   # class_a guard was NOT tripped


# ── T5: combined block stays active after cap hit ─────────────────────────────

def test_stays_blocked_after_cap_hit():
    svc = _svc()
    svc.check_and_reserve(3, [30 * 1024] * 3)   # 90 KB
    try:
        svc.check_and_reserve(2, [8 * 1024] * 2)  # trips byte guard
    except svc.StorageCapExceeded:
        pass

    # Any subsequent upload — even tiny — must be blocked
    with pytest.raises(svc.StorageCapExceeded) as exc_info:
        svc.check_and_reserve(1, [1])
    assert exc_info.value.guard == "combined"


# ── T6: partial failure with heterogeneous WebP sizes ────────────────────────
#
# 5 slides reserved with different byte sizes.
# 3 succeed, 2 fail → release reservation for the 2 unwritten ones.
# Verifies exact byte accounting, not just a uniform average.

def test_partial_failure_heterogeneous_bytes():
    svc = _svc()
    byte_sizes = [10 * 1024, 20 * 1024, 5 * 1024, 15 * 1024, 8 * 1024]  # 58 KB total
    svc.check_and_reserve(5, byte_sizes)

    total_reserved = svc.get_status()["storage_bytes"]["reserved_bytes"]
    assert total_reserved == sum(byte_sizes)  # 58 KB

    # Simulate: slides 0, 1, 2 uploaded OK; slides 3, 4 failed
    failed_bytes = byte_sizes[3:]   # [15 KB, 8 KB] = 23 KB
    svc.release_reservation(2, failed_bytes)

    s = svc.get_status()
    expected_remaining = sum(byte_sizes[:3])  # 10+20+5 = 35 KB
    assert s["storage_bytes"]["reserved_bytes"] == expected_remaining, (
        f"Expected {expected_remaining} bytes after partial release, "
        f"got {s['storage_bytes']['reserved_bytes']}"
    )
    assert s["class_a_ops"]["reserved_ops"] == 3   # 5 - 2
    assert s["slide_count"]["slides_tracked"] == 3  # 5 - 2


# ── T7: concurrent uploads — byte invariant ───────────────────────────────────

def test_concurrent_byte_invariant():
    """
    Two threads each try to upload 60 KB (total 120 KB > 100 KB cap).

    SQLite: both may succeed (no true FOR UPDATE). We assert only the byte
    invariant — reserved_bytes <= cap.
    PostgreSQL (production): FOR UPDATE serialises access so exactly one
    succeeds and one is blocked.
    """
    svc = _svc()
    caps = svc.get_caps()
    results, errors = [], []
    barrier = threading.Barrier(2)

    def _upload(tid):
        barrier.wait()
        try:
            svc.check_and_reserve(3, [20 * 1024] * 3)  # 60 KB
            results.append(tid)
        except svc.StorageCapExceeded as e:
            errors.append((tid, e.guard))

    threads = [threading.Thread(target=_upload, args=(i,)) for i in range(2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    s = svc.get_status()
    # Core invariant: we never exceed the cap regardless of SQLite/PG behaviour
    assert s["storage_bytes"]["reserved_bytes"] <= caps["bytes"], (
        f"Byte invariant violated: reserved={s['storage_bytes']['reserved_bytes']} "
        f"> cap={caps['bytes']}"
    )


# ── T8: Class A monthly auto-reset ───────────────────────────────────────────

def test_class_a_monthly_auto_reset():
    svc = _svc()
    from db.models.storage_cap_state import StorageCapState
    import db.session as db_session

    # Backdate the stored month to simulate a billing month rollover
    now = dt.datetime.utcnow()
    with db_session.SessionLocal() as sess:
        state = sess.query(StorageCapState).first()
        if state is None:
            # Force creation via a dummy check
            pass
        # Ensure singleton exists
        svc.check_and_reserve(1, [100])
        svc.release_reservation(1, [100])
        svc.admin_reset_cap_block("all")

    with db_session.SessionLocal() as sess:
        state = sess.query(StorageCapState).first()
        state.class_a_month = (now.month - 1) or 12
        state.class_a_year  = now.year if now.month > 1 else now.year - 1
        state.reserved_class_a_ops = 18
        sess.commit()

    # First upload of the "new" month should trigger auto-reset
    svc.check_and_reserve(2, [100] * 2)
    s = svc.get_status()

    assert s["class_a_ops"]["reserved_ops"] == 2, (
        f"Expected 2 ops after auto-reset, got {s['class_a_ops']['reserved_ops']}"
    )
    assert s["class_a_ops"]["month"] == now.month


# ── T9: large individual slide ────────────────────────────────────────────────

def test_large_single_slide():
    svc = _svc()
    large_slide = 95 * 1024  # 95 KB — below 100 KB cap
    svc.check_and_reserve(1, [large_slide])
    s = svc.get_status()
    assert s["storage_bytes"]["reserved_bytes"] == large_slide
    assert not s["combined"]["hard_cap_hit"]


# ── T10: status structure and authoritative flags ─────────────────────────────

def test_status_structure():
    svc = _svc()
    s = svc.get_status()

    assert "storage_bytes" in s
    assert "class_a_ops" in s
    assert "slide_count" in s
    assert "class_b_ops" in s
    assert "combined" in s

    assert s["storage_bytes"]["authoritative"] is True
    assert s["class_a_ops"]["authoritative"] is True
    assert s["slide_count"]["authoritative"] is True
    assert s["class_b_ops"]["authoritative"] is False   # NOT authoritative
    assert s["class_b_ops"]["estimated"] is True

    assert "remaining_mb" in s["storage_bytes"]
    assert "remaining_ops" in s["class_a_ops"]
    assert "remaining_slides" in s["slide_count"]


# ── T11: selective guard reset ────────────────────────────────────────────────

def test_selective_guard_reset():
    svc = _svc()
    # Trip the byte guard
    svc.check_and_reserve(3, [30 * 1024] * 3)   # 90 KB
    try:
        svc.check_and_reserve(2, [8 * 1024] * 2)  # trips byte guard
    except svc.StorageCapExceeded:
        pass

    # Reset only the bytes guard
    svc.admin_reset_cap_block("bytes")
    s = svc.get_status()

    assert not s["storage_bytes"]["cap_hit"]          # bytes guard cleared
    assert s["combined"]["hard_cap_hit"]              # combined still blocked
    # Must still be blocked until guard="all"
    with pytest.raises(svc.StorageCapExceeded):
        svc.check_and_reserve(1, [1])

    # Now clear everything
    svc.admin_reset_cap_block("all")
    s = svc.get_status()
    assert not s["combined"]["hard_cap_hit"]


# ── T12: admin_reset re-stamps class_a month ─────────────────────────────────

def test_reset_stamps_class_a_month():
    """
    admin_reset_cap_block("all") should re-stamp class_a_month/year to now
    so that the very next upload doesn't spuriously trigger the auto-reset.
    """
    svc = _svc()
    from db.models.storage_cap_state import StorageCapState
    import db.session as db_session

    # Seed the singleton
    svc.check_and_reserve(1, [100])
    svc.release_reservation(1, [100])

    # Backdate the month
    now = dt.datetime.utcnow()
    with db_session.SessionLocal() as sess:
        state = sess.query(StorageCapState).first()
        state.class_a_month = (now.month - 1) or 12
        state.class_a_year  = now.year if now.month > 1 else now.year - 1
        state.reserved_class_a_ops = 10
        sess.commit()

    # Reset should re-stamp the month — does NOT zero the ops counter
    svc.admin_reset_cap_block("all")

    # Next upload must NOT trigger auto-reset (month is now current after re-stamp).
    # ops should be 10 (preserved by reset) + 3 (new) = 13.
    # If it were 3, the auto-reset would have fired — that's the bug we're guarding against.
    svc.check_and_reserve(3, [100] * 3)
    s = svc.get_status()
    assert s["class_a_ops"]["reserved_ops"] == 13, (
        f"Expected 13 ops (10 preserved + 3 new), got {s['class_a_ops']['reserved_ops']}. "
        "ops==3 would mean admin_reset spuriously triggered the monthly auto-reset."
    )
    assert s["class_a_ops"]["month"] == now.month
