"""create support contributions table

Revision ID: 20250129_0028
Revises: da8c0cc3779d
Create Date: 2025-01-29 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '20250129_0028'
down_revision = '20261028_0027'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'support_contributions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('roll_number', sa.String(50), nullable=False),
        sa.Column('amount', sa.Integer(), nullable=True),  # nullable — they might not tell us
        sa.Column('utr_reference', sa.String(100), nullable=True),
        sa.Column('card_style', sa.String(50), nullable=False),  # which card design they saw
        sa.Column('action_type', sa.String(50), nullable=False),  # 'view', 'click_amount', 'open_custom', 'submit'
        sa.Column('status', sa.String(20), nullable=False, server_default='pending'),  # pending/thanked/confirmed
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_support_contrib_roll', 'support_contributions', ['roll_number'])
    op.create_index('idx_support_contrib_status', 'support_contributions', ['status'])
    op.create_index('idx_support_contrib_created', 'support_contributions', ['created_at'])


def downgrade() -> None:
    op.drop_table('support_contributions')
