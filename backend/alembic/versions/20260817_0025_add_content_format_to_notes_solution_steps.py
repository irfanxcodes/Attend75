"""add content_format to notes_solution_steps

Revision ID: 20260817_0025
Revises: 20260815_0024
Create Date: 2026-08-17
"""
from alembic import op
import sqlalchemy as sa

revision = '20260817_0025'
down_revision = '20260815_0024'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Use IF NOT EXISTS so this is safe to run even if the column was
    # added directly to the DB before the migration was created.
    op.execute("""
        ALTER TABLE notes_solution_steps
        ADD COLUMN IF NOT EXISTS content_format VARCHAR(16) NOT NULL DEFAULT 'text'
    """)


def downgrade() -> None:
    op.drop_column('notes_solution_steps', 'content_format')
