"""Slide script feedback + upload privacy flag

Revision ID: 20260812_0020
Revises: 20260810_0019
Create Date: 2026-08-12

Changes:
  1. slide_script_feedback  — per-slide thumbs up/down + optional reason.
                              Feedback is collected passively; no auto-regen logic.
  2. chapter_uploads        — add is_public column (default False).
                              True = admin-approved, shared with all classmates.
                              Removes the chapter_key-based fuzzy dedup that
                              was a privacy risk (two students could upload different
                              files for the same chapter_key and see each other's slides).
"""

from alembic import op
import sqlalchemy as sa

revision = "20260812_0020"
down_revision = "20260810_0019"
branch_labels = None
depends_on = None


def _pg() -> bool:
    return op.get_bind().dialect.name == "postgresql"


def upgrade() -> None:
    # ── 1. chapter_uploads: add is_public ─────────────────────────────────
    # Default False — upload is private to the uploader until admin approves.
    # Only file_hash dedup (exact same bytes) is done automatically; chapter_key
    # dedup now requires is_public=True on the existing upload.
    op.add_column(
        "chapter_uploads",
        sa.Column("is_public", sa.Boolean, nullable=False, server_default="false"),
    )

    # ── 2. slide_script_feedback ──────────────────────────────────────────
    # Stores raw per-student feedback on AI teaching scripts.
    # rating: 1 = thumbs up, -1 = thumbs down.
    # No aggregation or regeneration here — that logic lives in admin tooling.
    op.create_table(
        "slide_script_feedback",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "upload_id", sa.String(36),
            sa.ForeignKey("chapter_uploads.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("slide_number", sa.Integer, nullable=False),
        sa.Column("roll_number", sa.String(64), nullable=False),
        sa.Column("rating", sa.SmallInteger, nullable=False),        # 1 or -1
        sa.Column("script_version", sa.Integer, nullable=False, server_default="1"),
        sa.Column(
            "reason", sa.String(64), nullable=True,
            # "too_fast" | "wrong_content" | "unclear" | "off_topic" | "other"
        ),
        sa.Column("created_at", sa.DateTime, nullable=False),
        # One vote per student per slide per version — upsert target
        sa.UniqueConstraint(
            "upload_id", "slide_number", "roll_number", "script_version",
            name="uq_slide_feedback_student_slide_version",
        ),
    )
    op.create_index("ix_slide_script_feedback_upload_id", "slide_script_feedback", ["upload_id"])
    op.create_index("ix_slide_script_feedback_roll_number", "slide_script_feedback", ["roll_number"])


def downgrade() -> None:
    op.drop_table("slide_script_feedback")
    op.drop_column("chapter_uploads", "is_public")
