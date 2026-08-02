"""add semester filtering columns

Adds:
- student_registry.current_semester  — persists the semester label each student
  is currently enrolled in (updated on every login). Used by the notice
  dispatcher to send notifications only to students in the matching semester.
- notices.target_semesters           — comma-separated semester labels the notice
  targets (NULL = all semesters). Populated by the notice classifier at scrape time.

Revision ID: 20260802_0013
Revises: 20260801_0012
Create Date: 2026-08-02
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260802_0013"
down_revision = "20260801_0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # SQLite-safe: use IF NOT EXISTS via try/except at the Python level,
    # but for both SQLite and PostgreSQL op.add_column is idempotent when
    # run once. The columns are simply added.
    with op.batch_alter_table("student_registry") as batch_op:
        batch_op.add_column(
            sa.Column("current_semester", sa.String(64), nullable=True)
        )

    with op.batch_alter_table("notices") as batch_op:
        batch_op.add_column(
            sa.Column("target_semesters", sa.String(512), nullable=True)
        )


def downgrade() -> None:
    with op.batch_alter_table("notices") as batch_op:
        batch_op.drop_column("target_semesters")

    with op.batch_alter_table("student_registry") as batch_op:
        batch_op.drop_column("current_semester")
