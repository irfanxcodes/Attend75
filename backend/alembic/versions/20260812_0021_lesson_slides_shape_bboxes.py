"""Add shape_bboxes to lesson_slides

Revision ID: 20260812_0021
Revises: 20260812_0020
Create Date: 2026-08-12

Adds a shape_bboxes JSONB column to lesson_slides.

Stores the bounding box of every shape on a PPTX slide, extracted once
at ingestion time before the original file is deleted.  Format:

  [
    {
      "shape_id": 3,
      "name":     "Title 1",
      "type":     "title",      # title | body | image | table | other
      "x": 0.05, "y": 0.04,    # normalized 0.0–1.0
      "w": 0.90, "h": 0.18,
      "text_preview": "Working Capital Management"
    },
    ...
  ]

NULL for PDFs and DOCXs (no shape metadata available — fallback regions
used instead).  The teaching_script_service uses these to give the LLM
exact shape coordinates rather than asking it to guess.
"""

from alembic import op
import sqlalchemy as sa

revision = "20260812_0021"
down_revision = "20260812_0020"
branch_labels = None
depends_on = None


def _pg() -> bool:
    return op.get_bind().dialect.name == "postgresql"


def upgrade() -> None:
    if _pg():
        from sqlalchemy.dialects.postgresql import JSONB
        op.add_column("lesson_slides", sa.Column("shape_bboxes", JSONB, nullable=True))
    else:
        op.add_column("lesson_slides", sa.Column("shape_bboxes", sa.JSON, nullable=True))


def downgrade() -> None:
    op.drop_column("lesson_slides", "shape_bboxes")
