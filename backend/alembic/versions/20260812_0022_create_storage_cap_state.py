"""Create storage_cap_state table (v2 — bytes + Class A + slide count guards).

Three independent R2 cost-safety guards:
  Guard 1 — reserved_bytes     vs hard_cap_bytes   (primary, exact bytes)
  Guard 2 — reserved_class_a   vs hard_cap_class_a (monthly PUT ops)
  Guard 3 — total_slides        vs hard_cap_slides  (secondary/legacy)

All three must pass atomically before any R2 PUT is allowed.

Revision ID: 20260812_0022
Revises: 20260812_0021
Create Date: 2026-08-12
"""

from alembic import op
import sqlalchemy as sa

revision = "20260812_0022"
down_revision = "20260812_0021"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "storage_cap_state",
        sa.Column("id", sa.Integer, primary_key=True),  # singleton — always 1

        # Guard 1: actual storage bytes (BigInteger — can hold up to ~9.2 EB)
        sa.Column("reserved_bytes",     sa.BigInteger, nullable=False, server_default="0"),
        sa.Column("hard_cap_bytes",     sa.BigInteger, nullable=False, server_default="7500000000"),
        sa.Column("bytes_cap_hit",      sa.Boolean,    nullable=False, server_default="false"),
        sa.Column("bytes_cap_hit_at",   sa.DateTime,   nullable=True),

        # Guard 2: Class A monthly ops counter
        sa.Column("reserved_class_a_ops", sa.Integer, nullable=False, server_default="0"),
        sa.Column("hard_cap_class_a",     sa.Integer, nullable=False, server_default="700000"),
        sa.Column("class_a_cap_hit",      sa.Boolean, nullable=False, server_default="false"),
        sa.Column("class_a_cap_hit_at",   sa.DateTime, nullable=True),
        sa.Column("class_a_month",        sa.Integer, nullable=True),
        sa.Column("class_a_year",         sa.Integer, nullable=True),

        # Guard 3: slide count (secondary guard)
        sa.Column("total_slides_stored", sa.Integer, nullable=False, server_default="0"),
        sa.Column("hard_cap_at_slides",  sa.Integer, nullable=False, server_default="3000"),
        sa.Column("slides_cap_hit",      sa.Boolean, nullable=False, server_default="false"),
        sa.Column("slides_cap_hit_at",   sa.DateTime, nullable=True),

        # Combined block flag — True when ANY guard has tripped
        sa.Column("hard_cap_hit",    sa.Boolean,  nullable=False, server_default="false"),
        sa.Column("hard_cap_hit_at", sa.DateTime, nullable=True),

        # Per-guard alert levels (0=none 1=50% 2=75% 3=90% 4=100%)
        sa.Column("bytes_alert_level",   sa.Integer, nullable=False, server_default="0"),
        sa.Column("class_a_alert_level", sa.Integer, nullable=False, server_default="0"),
        sa.Column("slides_alert_level",  sa.Integer, nullable=False, server_default="0"),
        sa.Column("last_alert_sent_at",  sa.DateTime, nullable=True),

        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )

    # Insert singleton row so the service never has to handle a missing row.
    op.execute(
        "INSERT INTO storage_cap_state "
        "(id, reserved_bytes, hard_cap_bytes, bytes_cap_hit, "
        " reserved_class_a_ops, hard_cap_class_a, class_a_cap_hit, "
        " total_slides_stored, hard_cap_at_slides, slides_cap_hit, "
        " hard_cap_hit, bytes_alert_level, class_a_alert_level, slides_alert_level, "
        " created_at, updated_at) "
        "VALUES (1, 0, 7500000000, false, "
        "        0, 700000, false, "
        "        0, 3000, false, "
        "        false, 0, 0, 0, "
        "        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
    )


def downgrade() -> None:
    op.drop_table("storage_cap_state")
