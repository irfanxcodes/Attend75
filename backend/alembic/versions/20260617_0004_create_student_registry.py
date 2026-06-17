"""create student_registry table

Revision ID: 0004
Revises: 0003
Create Date: 2026-06-17
"""
from alembic import op
import sqlalchemy as sa

revision = "20260617_0004"
down_revision = "20260504_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "student_registry",
        sa.Column("roll_number", sa.String(32), primary_key=True),
        sa.Column("first_seen_at", sa.DateTime, nullable=False),
        sa.Column("last_seen_at", sa.DateTime, nullable=False),
        sa.Column("login_count", sa.Integer, nullable=False, server_default="1"),
        sa.Column("last_login_method", sa.String(16), nullable=False),
        sa.Column("created_via", sa.String(16), nullable=False),
        sa.Column("has_google_linked", sa.Boolean, nullable=False, server_default="0"),
        sa.Column("linked_google_at", sa.DateTime, nullable=True),
    )


def downgrade() -> None:
    op.drop_table("student_registry")
