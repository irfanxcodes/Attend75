"""add username to face_rater_scores (handled by 0014 upgrade, this is a no-op)

Revision ID: 20260804_0015
Revises: 20260804_0014
Create Date: 2026-08-04
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.engine.reflection import Inspector

revision = '20260804_0015'
down_revision = '20260804_0014'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Column is now included in the 0014 create_table migration.
    # This migration adds it only for databases that ran 0014 before username was added.
    bind = op.get_bind()
    inspector = Inspector.from_engine(bind)
    cols = [col["name"] for col in inspector.get_columns("face_rater_scores")]
    if "username" not in cols:
        op.add_column(
            'face_rater_scores',
            sa.Column('username', sa.String(32), nullable=True),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = Inspector.from_engine(bind)
    cols = [col["name"] for col in inspector.get_columns("face_rater_scores")]
    if "username" in cols:
        op.drop_column('face_rater_scores', 'username')
