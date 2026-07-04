"""add_program_to_student_registry

Revision ID: a1140adea119
Revises: da8c0cc3779d
Create Date: 2026-07-04
"""
from __future__ import annotations
from alembic import op
import sqlalchemy as sa

revision = 'a1140adea119'
down_revision = 'da8c0cc3779d'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('student_registry', sa.Column('program', sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column('student_registry', 'program')
