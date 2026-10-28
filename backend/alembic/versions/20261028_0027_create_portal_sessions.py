"""create portal_sessions table

Revision ID: 20261028_0027
Revises: 20260824_0026
Create Date: 2026-10-28
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '20261028_0027'
down_revision = '20260824_0026'
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    
    if bind.dialect.name == "sqlite":
        # SQLite version - use TEXT for JSON storage
        op.create_table(
            'portal_sessions',
            sa.Column('roll_number', sa.String(20), primary_key=True),
            sa.Column('cookies', sa.Text(), nullable=False),
            sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
            sa.Column('expires_at', sa.DateTime(), nullable=False),
            sa.Column('last_used', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        )
        
        # Create index for cleanup queries
        op.create_index('idx_portal_sessions_expires', 'portal_sessions', ['expires_at'])
        
    else:
        # PostgreSQL version - use JSONB for efficient storage
        op.create_table(
            'portal_sessions',
            sa.Column('roll_number', sa.String(20), primary_key=True),
            sa.Column('cookies', postgresql.JSONB(), nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()'), nullable=False),
            sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
            sa.Column('last_used', sa.DateTime(timezone=True), server_default=sa.text('NOW()'), nullable=False),
        )
        
        # Create index for cleanup queries
        op.create_index('idx_portal_sessions_expires', 'portal_sessions', ['expires_at'])
        
        # Add comment to table
        op.execute("""
            COMMENT ON TABLE portal_sessions IS 
            'Stores portal cookies for Lambda/Worker requests. Sessions expire after 30 minutes.'
        """)


def downgrade() -> None:
    op.drop_index('idx_portal_sessions_expires', table_name='portal_sessions')
    op.drop_table('portal_sessions')
