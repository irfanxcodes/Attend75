"""add background fetcher tables and portal_credential status column

Revision ID: 20260713_0008
Revises: 20260712_0007
Create Date: 2026-07-13
"""
from alembic import op
import sqlalchemy as sa

revision = "20260713_0008"
down_revision = "20260712_0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add status column to portal_credentials (valid/invalid)
    op.add_column("portal_credentials", sa.Column("status", sa.String(16), server_default="valid", nullable=False))

    # Create background_fetch_state table
    op.create_table(
        "background_fetch_state",
        sa.Column("roll_number", sa.String(32), primary_key=True),
        sa.Column("last_fetch_at", sa.DateTime(), nullable=True),
        sa.Column("last_fetch_status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("consecutive_failures", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("next_eligible_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("background_fetch_state")
    op.drop_column("portal_credentials", "status")
