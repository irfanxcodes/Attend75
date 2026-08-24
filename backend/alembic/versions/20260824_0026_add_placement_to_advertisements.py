"""add placement to advertisements

Revision ID: 20260824_0026
Revises: 20260817_0025
Create Date: 2026-08-24
"""
from alembic import op
import sqlalchemy as sa

revision = '20260824_0026'
down_revision = '20260817_0025'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Use bind to detect dialect — SQLite doesn't support IF NOT EXISTS on ALTER TABLE
    bind = op.get_bind()
    if bind.dialect.name == "sqlite":
        # Check if column already exists before adding
        from sqlalchemy import inspect
        inspector = inspect(bind)
        columns = [c["name"] for c in inspector.get_columns("advertisements")]
        if "placement" not in columns:
            op.add_column(
                "advertisements",
                sa.Column("placement", sa.String(32), nullable=False, server_default="dashboard"),
            )
    else:
        op.execute("""
            ALTER TABLE advertisements
            ADD COLUMN IF NOT EXISTS placement VARCHAR(32) NOT NULL DEFAULT 'dashboard'
        """)


def downgrade() -> None:
    op.drop_column('advertisements', 'placement')
