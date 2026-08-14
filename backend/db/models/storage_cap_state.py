"""storage_cap_state — persists all R2 cost-safety counters.

Singleton table: one row ever, id=1.
Updated atomically inside a DB transaction (SELECT FOR UPDATE on PG).
Survives server restarts.

Three independent guards — all three must pass before any R2 PUT:

  1. Storage bytes  — actual bytes reserved so far vs R2_STORAGE_HARD_CAP_BYTES
  2. Class A ops    — PUT operations reserved so far vs R2_CLASS_A_HARD_CAP
  3. Slide count    — secondary slide-count guard vs STORAGE_HARD_CAP_SLIDES

Reservations are pre-committed before R2 is touched.
Failed uploads release their reservation via release_reservation().
"""

from datetime import datetime
from sqlalchemy import BigInteger, Boolean, Column, DateTime, Float, Integer
from db.base import Base


class StorageCapState(Base):
    __tablename__ = "storage_cap_state"

    id = Column(Integer, primary_key=True, default=1)  # singleton — always 1

    # ── Guard 1: Storage bytes ────────────────────────────────────────────
    # Sum of actual len(img_bytes) for every WebP committed to R2.
    # This is the PRIMARY storage measure — not an estimate.
    reserved_bytes = Column(BigInteger, nullable=False, default=0)
    # Hard cap in bytes (from R2_STORAGE_HARD_CAP_BYTES env var, default 7.5 GB).
    hard_cap_bytes = Column(BigInteger, nullable=False, default=7_500_000_000)
    bytes_cap_hit  = Column(Boolean, nullable=False, default=False)
    bytes_cap_hit_at = Column(DateTime, nullable=True)

    # ── Guard 2: Class A operations (R2 PUT = 1 op per slide) ────────────
    # Monthly counter — reset by admin at the start of each month (or auto
    # reset when month changes).
    reserved_class_a_ops = Column(Integer, nullable=False, default=0)
    hard_cap_class_a     = Column(Integer, nullable=False, default=700_000)
    class_a_cap_hit      = Column(Boolean, nullable=False, default=False)
    class_a_cap_hit_at   = Column(DateTime, nullable=True)
    class_a_month        = Column(Integer, nullable=True)   # UTC month (1-12)
    class_a_year         = Column(Integer, nullable=True)   # UTC year

    # ── Guard 3: Slide count (secondary / legacy guard) ───────────────────
    total_slides_stored  = Column(Integer, nullable=False, default=0)
    hard_cap_at_slides   = Column(Integer, nullable=False, default=3000)
    slides_cap_hit       = Column(Boolean, nullable=False, default=False)
    slides_cap_hit_at    = Column(DateTime, nullable=True)

    # ── Combined hard block ───────────────────────────────────────────────
    # True when ANY guard has tripped. Checked first on every upload attempt.
    hard_cap_hit    = Column(Boolean, nullable=False, default=False)
    hard_cap_hit_at = Column(DateTime, nullable=True)

    # ── Alert state ───────────────────────────────────────────────────────
    # Per-guard alert levels: 0=none, 1=50%, 2=75%, 3=90%, 4=100%
    bytes_alert_level   = Column(Integer, nullable=False, default=0)
    class_a_alert_level = Column(Integer, nullable=False, default=0)
    slides_alert_level  = Column(Integer, nullable=False, default=0)
    last_alert_sent_at  = Column(DateTime, nullable=True)

    # ── Metadata ──────────────────────────────────────────────────────────
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow,
                        onupdate=datetime.utcnow)

    def __repr__(self) -> str:
        return (
            f"<StorageCapState "
            f"bytes={self.reserved_bytes} "
            f"class_a={self.reserved_class_a_ops} "
            f"slides={self.total_slides_stored} "
            f"blocked={self.hard_cap_hit}>"
        )
