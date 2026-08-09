"""StudyMe 2.0 Phase 1 — richer content model

Revision ID: 20260809_0018
Revises: 20260808_0017_create_course_handouts
Create Date: 2026-08-09

Changes:
  1. Add new columns to ai_concepts:
       - content_type       VARCHAR(16)  DEFAULT 'theory'
       - worked_examples    JSON/JSONB   DEFAULT '[]'
       - source_elements    JSON/JSONB   DEFAULT '[]'

  2. Create concept_sections table
     (new hierarchical teaching section model for StudyMe 2.0 Canvas)

  3. Create concept_progress table
     (per-student concept-level mastery state)

All changes are additive — no existing data is destroyed.
Existing lesson_blocks continue to work unchanged.
"""

from alembic import op
import sqlalchemy as sa

revision = "20260809_0018"
down_revision = "20260808_0017"
branch_labels = None
depends_on = None


def _pg() -> bool:
    return op.get_bind().dialect.name == "postgresql"


def _uuid_type():
    if _pg():
        from sqlalchemy.dialects.postgresql import UUID
        return UUID(as_uuid=True)
    return sa.String(36)


def _json_type():
    if _pg():
        from sqlalchemy.dialects.postgresql import JSONB
        return JSONB
    return sa.JSON


def upgrade() -> None:
    pg = _pg()
    json_t = _json_type()

    # ── 1. Add new columns to ai_concepts ─────────────────────────────────
    # content_type: 'theory' | 'numerical' | 'mixed'
    op.add_column("ai_concepts", sa.Column(
        "content_type", sa.String(16), nullable=False, server_default="theory"
    ))
    # worked_examples: list of {steps: [...], question: str, answer: str, source_page: int}
    op.add_column("ai_concepts", sa.Column(
        "worked_examples", json_t, nullable=False, server_default="[]"
    ))
    # source_elements: list of {slide_or_page: int, element_type: str, text: str}
    # Used later for PPT mode — tracks where each concept appears in source
    op.add_column("ai_concepts", sa.Column(
        "source_elements", json_t, nullable=False, server_default="[]"
    ))

    # ── 2. Create concept_sections table ──────────────────────────────────
    # Replaces the flat lesson_blocks model for new uploads.
    # Each concept has multiple sections (explanation, formula, worked_example, etc.)
    # rendered as a continuous scrollable Canvas document.
    op.create_table(
        "concept_sections",
        sa.Column("id", _uuid_type(), primary_key=True),
        sa.Column(
            "concept_id",
            _uuid_type(),
            sa.ForeignKey("ai_concepts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("upload_id", sa.String(36), nullable=False),   # denormalized for fast queries
        sa.Column("section_type", sa.String(32), nullable=False),
        # section_type values:
        #   explanation, definition, visual, formula, formula_explanation,
        #   worked_example, common_mistake, takeaway, theory_example, practice
        sa.Column("sequence_order", sa.Integer, nullable=False, server_default="0"),
        # content: JSON with section-specific fields
        # For 'formula':        {name, text, latex, variables: [{symbol, meaning}]}
        # For 'worked_example': {question, steps: [{step, calculation, note}], answer, source_page}
        # For 'explanation':    {text, summary}
        # For 'definition':     {text}
        # For 'common_mistake': {mistake, correction}
        # For 'takeaway':       {text}
        # For 'visual':         {spec_type: 'mermaid'|'svg'|'table', spec: str, caption: str}
        sa.Column("content", json_t, nullable=False, server_default="{}"),
        # source_references: list of {slide_or_page: int, heading: str}
        sa.Column("source_references", json_t, nullable=False, server_default="[]"),
        # voice_text: optional narration text for this section
        sa.Column("voice_text", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False),
    )
    op.create_index("ix_concept_sections_concept_id", "concept_sections", ["concept_id"])
    op.create_index("ix_concept_sections_upload_id", "concept_sections", ["upload_id"])

    # ── 3. Create concept_progress table ──────────────────────────────────
    # Per-student concept-level mastery state.
    # Separate from student_lesson_progress (which is block/script level).
    op.create_table(
        "student_concept_progress",
        sa.Column("id", _uuid_type(), primary_key=True),
        sa.Column("roll_number", sa.String(64), nullable=False),
        sa.Column(
            "concept_id",
            _uuid_type(),
            sa.ForeignKey("ai_concepts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("upload_id", sa.String(36), nullable=False),   # denormalized
        # status: unseen | learning | understood | struggling | review_due | mastered
        sa.Column("status", sa.String(16), nullable=False, server_default="unseen"),
        sa.Column("attempts", sa.Integer, nullable=False, server_default="0"),
        sa.Column("correct_attempts", sa.Integer, nullable=False, server_default="0"),
        # confidence: 0.0–1.0, updated after quiz attempts
        sa.Column("confidence", sa.Float, nullable=True),
        sa.Column("last_seen_at", sa.DateTime, nullable=True),
        sa.Column("next_review_at", sa.DateTime, nullable=True),
        sa.Column("updated_at", sa.DateTime, nullable=False),
        sa.UniqueConstraint(
            "roll_number", "concept_id",
            name="uq_student_concept_progress_roll_concept"
        ),
    )
    op.create_index(
        "ix_student_concept_progress_roll_number",
        "student_concept_progress", ["roll_number"]
    )
    op.create_index(
        "ix_student_concept_progress_concept_id",
        "student_concept_progress", ["concept_id"]
    )
    op.create_index(
        "ix_student_concept_progress_upload_id",
        "student_concept_progress", ["upload_id"]
    )


def downgrade() -> None:
    op.drop_table("student_concept_progress")
    op.drop_table("concept_sections")
    op.drop_column("ai_concepts", "source_elements")
    op.drop_column("ai_concepts", "worked_examples")
    op.drop_column("ai_concepts", "content_type")
