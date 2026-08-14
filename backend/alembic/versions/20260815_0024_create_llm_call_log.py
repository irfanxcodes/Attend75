"""create llm_call_log table

Revision ID: 20260815_0024
Revises: 20260813_0023_add_notes_solver_tables
Create Date: 2026-08-15
"""
from alembic import op
import sqlalchemy as sa

revision = '20260815_0024'
down_revision = '20260813_0023'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'llm_call_log',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('call_type', sa.String(32), nullable=False),
        sa.Column('model', sa.String(128), nullable=False),
        sa.Column('provider', sa.String(32), nullable=False),
        sa.Column('success', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('fallback_index', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('prompt_tokens', sa.Integer(), nullable=True),
        sa.Column('completion_tokens', sa.Integer(), nullable=True),
        sa.Column('duration_ms', sa.Integer(), nullable=True),
        sa.Column('error_snippet', sa.String(256), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_llm_call_log_call_type', 'llm_call_log', ['call_type'])
    op.create_index('ix_llm_call_log_model', 'llm_call_log', ['model'])
    op.create_index('ix_llm_call_log_provider', 'llm_call_log', ['provider'])
    op.create_index('ix_llm_call_log_created_at', 'llm_call_log', ['created_at'])


def downgrade() -> None:
    op.drop_table('llm_call_log')
