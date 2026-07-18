"""create premium_waitlist table

Revision ID: 20260718_0009
Revises: 20260713_0008
Create Date: 2026-07-18
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20260718_0009"
down_revision = "20260713_0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "premium_waitlist",
        sa.Column("id", sa.Integer(), primary_key=True, index=True, autoincrement=True),
        sa.Column("roll_number", sa.String(32), nullable=False, index=True),
        sa.Column("joined_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("premium_waitlist")
