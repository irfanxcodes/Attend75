"""Create slide player tables — lesson_slides + slide_teaching_scripts

Revision ID: 20260810_0019
Revises: 20260809_0018
Create Date: 2026-08-10

Changes:
  1. lesson_slides          — one row per slide image, stores R2 URL
  2. slide_teaching_scripts — AI-generated action sequence per slide,
                              generated once and shared across all students

These two tables are intentionally separate:
  - Slide images (lesson_slides) survive prompt changes
  - Teaching scripts (slide_teaching_scripts) can be regenerated
    by bumping the version without re-rendering the PPT
"""

from alembic import op
import sqlalchemy as sa

revision = "20260810_0019"
down_revision = "20260809_0018"
branch_labels = None
depends_on = None


def _pg() -> bool:
    return op.get_bind().dialect.name == "postgresql"


def _json_type():
    if _pg():
        from sqlalchemy.dialects.postgresql import JSONB
        return JSONB
    return sa.JSON


def upgrade() -> None:
    json_t = _json_type()

    # ── 1. lesson_slides ─────────────────────────────────────────────────
    # One row per rendered slide image.
    # image_url points to Cloudflare R2 (or local path in dev).
    op.create_table(
        "lesson_slides",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "upload_id", sa.String(36),
            sa.ForeignKey("chapter_uploads.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("slide_number", sa.Integer, nullable=False),
        sa.Column("image_url", sa.Text, nullable=False),       # R2 public/presigned URL
        sa.Column("width_px", sa.Integer, nullable=True),
        sa.Column("height_px", sa.Integer, nullable=True),
        sa.Column("title", sa.String(256), nullable=True),     # extracted from PPT for display
        sa.Column("body_preview", sa.Text, nullable=True),     # first 300 chars of text content
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.UniqueConstraint("upload_id", "slide_number", name="uq_lesson_slides_upload_slide"),
    )
    op.create_index("ix_lesson_slides_upload_id", "lesson_slides", ["upload_id"])

    # ── 2. slide_teaching_scripts ────────────────────────────────────────
    # AI-generated teaching action sequence for a slide.
    # Generated once on first student access, then reused forever.
    # version column: bump to trigger regeneration with new prompts.
    op.create_table(
        "slide_teaching_scripts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "upload_id", sa.String(36),
            sa.ForeignKey("chapter_uploads.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("slide_number", sa.Integer, nullable=False),
        # actions: ordered list of {type, text, coords, duration, ...}
        # See services/teaching_script_service.py for full schema
        sa.Column("actions", json_t, nullable=False, server_default="[]"),
        sa.Column("model_used", sa.String(64), nullable=True),
        sa.Column("version", sa.Integer, nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.UniqueConstraint(
            "upload_id", "slide_number", "version",
            name="uq_slide_teaching_scripts_upload_slide_version"
        ),
    )
    op.create_index("ix_slide_teaching_scripts_upload_id", "slide_teaching_scripts", ["upload_id"])


def downgrade() -> None:
    op.drop_table("slide_teaching_scripts")
    op.drop_table("lesson_slides")
