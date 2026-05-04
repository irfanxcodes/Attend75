"""Add feedback entries table and feature usage semester fields

Revision ID: 20260504_0003
Revises: 20260503_0002
Create Date: 2026-05-04
"""

from alembic import op
import sqlalchemy as sa


revision = "20260504_0003"
down_revision = "20260503_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "feedback_entries",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("user_name", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("timestamp", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_feedback_entries_id"), "feedback_entries", ["id"], unique=False)
    op.create_index(op.f("ix_feedback_entries_status"), "feedback_entries", ["status"], unique=False)
    op.create_index(op.f("ix_feedback_entries_timestamp"), "feedback_entries", ["timestamp"], unique=False)

    op.add_column("feature_usage_events", sa.Column("semester_id", sa.String(length=64), nullable=True))
    op.add_column("feature_usage_events", sa.Column("semester_label", sa.String(length=255), nullable=True))
    op.create_index(op.f("ix_feature_usage_events_semester_id"), "feature_usage_events", ["semester_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_feature_usage_events_semester_id"), table_name="feature_usage_events")
    op.drop_column("feature_usage_events", "semester_label")
    op.drop_column("feature_usage_events", "semester_id")

    op.drop_index(op.f("ix_feedback_entries_timestamp"), table_name="feedback_entries")
    op.drop_index(op.f("ix_feedback_entries_status"), table_name="feedback_entries")
    op.drop_index(op.f("ix_feedback_entries_id"), table_name="feedback_entries")
    op.drop_table("feedback_entries")
