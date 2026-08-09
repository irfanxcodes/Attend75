"""create face_rater_scores table

Adds:
- face_rater_scores — stores anonymous face rater leaderboard submissions.
  No user identity is stored; only a sessionStorage-generated UUID, score,
  tier label, and submission timestamp.

Revision ID: 20260804_0014
Revises: 20260802_0013
Create Date: 2026-08-04
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260804_0014"
down_revision = "20260802_0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Use checkfirst=True so re-running is safe on dev DBs that already have the table
    op.create_table(
        "face_rater_scores",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("anonymous_id", sa.String(36), nullable=False, index=True),
        sa.Column("score", sa.Float(), nullable=False),
        sa.Column("tier", sa.String(32), nullable=False),
        sa.Column("username", sa.String(32), nullable=True),
        sa.Column(
            "submitted_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
        if_not_exists=True,
    )
    # Create index only if it doesn't exist (SQLite-safe)
    from alembic import op as _op
    from sqlalchemy.engine.reflection import Inspector
    bind = _op.get_bind()
    inspector = Inspector.from_engine(bind)
    existing = [idx["name"] for idx in inspector.get_indexes("face_rater_scores")]
    if "ix_face_rater_scores_leaderboard" not in existing:
        op.create_index(
            "ix_face_rater_scores_leaderboard",
            "face_rater_scores",
            ["score"],
        )
    # Add username column if table already existed without it
    cols = [col["name"] for col in inspector.get_columns("face_rater_scores")]
    if "username" not in cols:
        op.add_column("face_rater_scores", sa.Column("username", sa.String(32), nullable=True))


def downgrade() -> None:
    op.drop_index("ix_face_rater_scores_leaderboard", table_name="face_rater_scores")
    op.drop_table("face_rater_scores")
