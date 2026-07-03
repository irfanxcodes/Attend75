"""add_missing_student_registry_columns

Revision ID: da8c0cc3779d
Revises: 20260617_0004
Create Date: 2026-07-03 13:10:51.675831
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'da8c0cc3779d'
down_revision = '20260617_0004'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('student_registry', sa.Column('display_name', sa.String(255), nullable=True))
    op.add_column('student_registry', sa.Column('last_attendance_percent', sa.Float(), nullable=True))
    op.add_column('student_registry', sa.Column('last_device', sa.String(64), nullable=True))


def downgrade() -> None:
    op.drop_column('student_registry', 'last_device')
    op.drop_column('student_registry', 'last_attendance_percent')
    op.drop_column('student_registry', 'display_name')
