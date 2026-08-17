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
    op.add_column(
        'notes_solution_steps',
        sa.Column(
            'content_format',
            sa.String(16),
            nullable=False,
            server_default='text',
        ),
    )


def downgrade() -> None:
    op.drop_column('notes_solution_steps', 'content_format')
