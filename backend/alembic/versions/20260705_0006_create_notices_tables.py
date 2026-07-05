"""create notices and user_notices tables

Revision ID: 20260705_0006
Revises: a1140adea119
Create Date: 2026-07-05
"""
from alembic import op
import sqlalchemy as sa

revision = "20260705_0006"
down_revision = "a1140adea119"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "notices",
        sa.Column("notice_id", sa.Integer(), primary_key=True),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("portal_date", sa.Date(), nullable=False),
        sa.Column("category", sa.String(32), nullable=False, server_default="General"),
        sa.Column("category_confidence", sa.Float(), server_default="0.0"),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("extracted_text", sa.Text(), nullable=True),
        sa.Column("cleaned_text", sa.Text(), nullable=True),
        sa.Column("keywords", sa.Text(), nullable=True),
        sa.Column("deadline", sa.Date(), nullable=True),
        sa.Column("deadline_raw", sa.String(100), nullable=True),
        sa.Column("priority", sa.Integer(), server_default="0"),
        sa.Column("is_important", sa.Boolean(), server_default="false"),
        sa.Column("target_program", sa.String(255), nullable=True),
        sa.Column("confidence_score", sa.Float(), server_default="0.0"),
        sa.Column("viewed_count", sa.Integer(), server_default="0"),
        sa.Column("pdf_url_path", sa.String(64), nullable=False),
        sa.Column("processing_status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("processing_version", sa.Integer(), server_default="1"),
        sa.Column("source_program", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("idx_notices_portal_date", "notices", ["portal_date"], postgresql_using="btree")
    op.create_index("idx_notices_category", "notices", ["category"])
    op.create_index("idx_notices_priority", "notices", [sa.text("priority DESC")])
    op.create_index("idx_notices_target_program", "notices", ["target_program"])
    op.create_index("idx_notices_processing_status", "notices", ["processing_status"])

    op.create_table(
        "user_notices",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.String(32), nullable=False),
        sa.Column("notice_id", sa.Integer(), sa.ForeignKey("notices.notice_id"), nullable=False),
        sa.Column("bookmarked", sa.Boolean(), server_default="false"),
        sa.Column("dismissed", sa.Boolean(), server_default="false"),
        sa.Column("opened_at", sa.DateTime(), nullable=True),
        sa.Column("last_viewed", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "notice_id", name="uq_user_notice"),
    )
    op.create_index("idx_user_notices_user_id", "user_notices", ["user_id"])
    op.create_index("idx_user_notices_dismissed", "user_notices", ["user_id", "dismissed"])


def downgrade() -> None:
    op.drop_table("user_notices")
    op.drop_table("notices")
