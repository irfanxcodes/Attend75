"""create career_profiles table

Revision ID: 20260829_0027
Revises: 20260824_0026
Create Date: 2026-08-29
"""

from alembic import op
import sqlalchemy as sa

revision = '20260829_0027'
down_revision = '20260824_0026'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'career_profiles',
        sa.Column('roll_number', sa.String(32), primary_key=True, nullable=False),
        sa.Column('chosen_track_slug', sa.String(64), nullable=True),
        sa.Column('chosen_track_label', sa.String(255), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table('career_profiles')
