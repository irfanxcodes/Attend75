"""create course_handouts table

Revision ID: 20260808_0017
Revises: 20260807_0016
Create Date: 2026-08-08
"""
from alembic import op
import sqlalchemy as sa

revision = "20260808_0017"
down_revision = "20260807_0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "course_handouts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("subject_id", sa.String(64), nullable=False),
        sa.Column("subject_code", sa.String(32), nullable=True),
        sa.Column("subject_name", sa.String(256), nullable=False),
        sa.Column("program", sa.String(64), nullable=True),
        sa.Column("semester", sa.String(16), nullable=True),
        sa.Column("credits", sa.Integer, nullable=True),
        sa.Column("instructor_name", sa.String(256), nullable=True),
        sa.Column("instructor_email", sa.String(256), nullable=True),
        sa.Column("uploaded_by", sa.String(64), nullable=False),
        sa.Column("structured_syllabus", sa.JSON, nullable=False, server_default="{}"),
        sa.Column("raw_text", sa.Text, nullable=True),
        sa.Column("parse_status", sa.String(32), nullable=False, server_default="pending"),
        sa.Column("is_active", sa.String(1), nullable=False, server_default="1"),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.Column("updated_at", sa.DateTime, nullable=False),
    )
    op.create_index("ix_course_handouts_subject_id", "course_handouts", ["subject_id"])
    op.create_index("ix_course_handouts_uploaded_by", "course_handouts", ["uploaded_by"])


def downgrade() -> None:
    op.drop_table("course_handouts")
