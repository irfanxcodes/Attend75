"""create_advertisements_table

Revision ID: 20260801_0012
Revises: 20260726_0011
Create Date: 2026-08-01
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = '20260801_0012'
down_revision = '20260726_0011'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'advertisements',
        sa.Column('id', sa.Integer(), primary_key=True, index=True, nullable=False),
        sa.Column('media_type', sa.String(length=10), nullable=False),
        sa.Column('file_path', sa.String(length=512), nullable=False),
        sa.Column('original_filename', sa.String(length=255), nullable=False),
        sa.Column('link_url', sa.Text(), nullable=True),
        sa.Column('advertiser_name', sa.String(length=255), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table('advertisements')
