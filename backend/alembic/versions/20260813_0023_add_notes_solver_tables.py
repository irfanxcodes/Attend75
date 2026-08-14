"""Add notes solver tables and upload_type column.

Adds:
  - upload_type column to chapter_uploads
  - notes_problem_sets table
  - notes_problems table
  - notes_solution_steps table

Revision ID: 20260813_0023
Revises: 20260812_0022
Create Date: 2026-08-13
"""

from alembic import op
import sqlalchemy as sa

revision = "20260813_0023"
down_revision = "20260812_0022"
branch_labels = None
depends_on = None


def _pg() -> bool:
    return op.get_bind().dialect.name == "postgresql"


def _id_type():
    """Use UUID on PostgreSQL, String(36) on SQLite."""
    if _pg():
        from sqlalchemy.dialects.postgresql import UUID
        return UUID(as_uuid=False)
    return sa.String(36)


def upgrade() -> None:
    id_t = _id_type()

    # ── Add upload_type to chapter_uploads ────────────────────────────────
    op.add_column(
        "chapter_uploads",
        sa.Column(
            "upload_type",
            sa.String(16),
            nullable=False,
            server_default="chapter",
        ),
    )

    # ── notes_problem_sets ────────────────────────────────────────────────
    op.create_table(
        "notes_problem_sets",
        sa.Column("id", id_t, primary_key=True),
        sa.Column("upload_id", id_t, sa.ForeignKey("chapter_uploads.id"), nullable=False),
        sa.Column("subject_id", sa.String(64), nullable=False),
        sa.Column("chapter_key", sa.String(128), nullable=True),
        sa.Column("title", sa.String(256), nullable=True),
        sa.Column("problem_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime, nullable=False),
    )
    op.create_index("ix_notes_problem_sets_upload_id", "notes_problem_sets", ["upload_id"])
    op.create_index("ix_notes_problem_sets_subject_id", "notes_problem_sets", ["subject_id"])

    # ── notes_problems ────────────────────────────────────────────────────
    op.create_table(
        "notes_problems",
        sa.Column("id", id_t, primary_key=True),
        sa.Column("problem_set_id", id_t, sa.ForeignKey("notes_problem_sets.id"), nullable=False),
        sa.Column("sequence_order", sa.Integer, nullable=False),
        sa.Column("question_text", sa.Text, nullable=False),
        sa.Column("topic", sa.String(256), nullable=True),
        sa.Column("given_values", sa.Text, nullable=True),   # JSON array of strings
        sa.Column("find", sa.Text, nullable=True),
        sa.Column("method", sa.String(256), nullable=True),
        sa.Column("difficulty", sa.String(16), nullable=True),
        sa.Column("answer", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False),
    )
    op.create_index("ix_notes_problems_problem_set_id", "notes_problems", ["problem_set_id"])

    # ── notes_solution_steps ──────────────────────────────────────────────
    op.create_table(
        "notes_solution_steps",
        sa.Column("id", id_t, primary_key=True),
        sa.Column("problem_id", id_t, sa.ForeignKey("notes_problems.id"), nullable=False),
        sa.Column("sequence_order", sa.Integer, nullable=False),
        sa.Column("step_type", sa.String(32), nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("voice_text", sa.Text, nullable=True),
        sa.Column("annotation", sa.Text, nullable=True),  # JSON {type, target_text, color} or null
        sa.Column("created_at", sa.DateTime, nullable=False),
    )
    op.create_index("ix_notes_solution_steps_problem_id", "notes_solution_steps", ["problem_id"])


def downgrade() -> None:
    op.drop_table("notes_solution_steps")
    op.drop_table("notes_problems")
    op.drop_table("notes_problem_sets")
    op.drop_column("chapter_uploads", "upload_type")
