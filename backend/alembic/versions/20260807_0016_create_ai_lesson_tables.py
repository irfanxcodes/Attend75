"""create ai lesson tables

Revision ID: 20260807_0016
Revises: 20260804_0015_add_username_to_face_rater_scores
Create Date: 2026-08-07

Creates all tables for the AI Lesson Player feature.
Dialect-aware: uses JSONB + UUID + vector on PostgreSQL, JSON + String on SQLite.
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = "20260807_0016"
down_revision = "20260804_0015_add_username_to_face_rater_scores"
branch_labels = None
depends_on = None


def _pg() -> bool:
    """True if running against PostgreSQL."""
    return op.get_bind().dialect.name == "postgresql"


def _uuid():
    """UUID on PG, String(36) on SQLite."""
    if _pg():
        from sqlalchemy.dialects.postgresql import UUID
        return UUID(as_uuid=True)
    return sa.String(36)


def _json():
    """JSONB on PG, JSON on SQLite."""
    if _pg():
        from sqlalchemy.dialects.postgresql import JSONB
        return JSONB
    return sa.JSON


def upgrade() -> None:
    pg = _pg()
    uuid_t = _uuid()
    json_t = _json()

    # ── Enable pgvector (PostgreSQL only) ─────────────────────────────────
    if pg:
        op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    # ── chapter_uploads ───────────────────────────────────────────────────
    op.create_table(
        "chapter_uploads",
        sa.Column("id", uuid_t, primary_key=True),
        sa.Column("subject_id", sa.String(64), nullable=False),
        sa.Column("chapter_key", sa.String(128), nullable=False),
        sa.Column("chapter_title", sa.String(256), nullable=True),
        sa.Column("uploaded_by", sa.String(64), nullable=False),
        sa.Column("upload_status", sa.String(32), nullable=False, server_default="pending"),
        sa.Column("coverage_score", sa.Float, nullable=True),
        sa.Column("concept_count", sa.Integer, nullable=True),
        sa.Column("block_count", sa.Integer, nullable=True),
        sa.Column("retry_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("file_path", sa.String(512), nullable=True),
        sa.Column("original_filename", sa.String(256), nullable=True),
        sa.Column("file_size_bytes", sa.Integer, nullable=True),
        sa.Column("file_hash", sa.String(64), nullable=True),
        sa.Column("file_deleted_at", sa.DateTime, nullable=True),
        sa.Column("processed_at", sa.DateTime, nullable=True),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.Column("updated_at", sa.DateTime, nullable=False),
    )
    op.create_index("ix_chapter_uploads_subject_id", "chapter_uploads", ["subject_id"])
    op.create_index("ix_chapter_uploads_chapter_key", "chapter_uploads", ["chapter_key"])
    op.create_index("ix_chapter_uploads_uploaded_by", "chapter_uploads", ["uploaded_by"])
    op.create_index("ix_chapter_uploads_upload_status", "chapter_uploads", ["upload_status"])
    op.create_index("ix_chapter_uploads_file_hash", "chapter_uploads", ["file_hash"])

    # ── ai_concepts ───────────────────────────────────────────────────────
    op.create_table(
        "ai_concepts",
        sa.Column("id", uuid_t, primary_key=True),
        sa.Column("upload_id", uuid_t, sa.ForeignKey("chapter_uploads.id", ondelete="CASCADE"), nullable=False),
        sa.Column("subject_id", sa.String(64), nullable=False),
        sa.Column("chapter_key", sa.String(128), nullable=False),
        sa.Column("sequence_order", sa.Integer, nullable=False, server_default="0"),
        sa.Column("title", sa.String(256), nullable=False),
        sa.Column("explanation", sa.Text, nullable=False),
        sa.Column("definition", sa.Text, nullable=True),
        sa.Column("keywords", json_t, nullable=False, server_default="[]"),
        sa.Column("formulas", json_t, nullable=False, server_default="[]"),
        sa.Column("examples", json_t, nullable=False, server_default="[]"),
        sa.Column("misconceptions", json_t, nullable=False, server_default="[]"),
        sa.Column("exam_questions", json_t, nullable=False, server_default="[]"),
        sa.Column("source_page", sa.Integer, nullable=True),
        sa.Column("source_heading", sa.String(256), nullable=True),
        sa.Column("prerequisites", json_t, nullable=False, server_default="[]"),
        sa.Column("created_at", sa.DateTime, nullable=False),
    )
    op.create_index("ix_ai_concepts_upload_id", "ai_concepts", ["upload_id"])
    op.create_index("ix_ai_concepts_subject_id", "ai_concepts", ["subject_id"])
    op.create_index("ix_ai_concepts_chapter_key", "ai_concepts", ["chapter_key"])

    # ── lesson_scripts ────────────────────────────────────────────────────
    op.create_table(
        "lesson_scripts",
        sa.Column("id", uuid_t, primary_key=True),
        sa.Column("upload_id", uuid_t, sa.ForeignKey("chapter_uploads.id", ondelete="CASCADE"), nullable=False),
        sa.Column("subject_id", sa.String(64), nullable=False),
        sa.Column("chapter_key", sa.String(128), nullable=False),
        sa.Column("title", sa.String(256), nullable=False),
        sa.Column("total_blocks", sa.Integer, nullable=False, server_default="0"),
        sa.Column("estimated_duration_seconds", sa.Integer, nullable=True),
        sa.Column("concept_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("version", sa.Integer, nullable=False, server_default="1"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime, nullable=False),
    )
    op.create_index("ix_lesson_scripts_upload_id", "lesson_scripts", ["upload_id"])
    op.create_index("ix_lesson_scripts_subject_id", "lesson_scripts", ["subject_id"])
    op.create_index("ix_lesson_scripts_chapter_key", "lesson_scripts", ["chapter_key"])

    # ── lesson_blocks ─────────────────────────────────────────────────────
    op.create_table(
        "lesson_blocks",
        sa.Column("id", uuid_t, primary_key=True),
        sa.Column("script_id", uuid_t, sa.ForeignKey("lesson_scripts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("concept_id", uuid_t, sa.ForeignKey("ai_concepts.id", ondelete="SET NULL"), nullable=True),
        sa.Column("sequence_order", sa.Integer, nullable=False),
        sa.Column("block_type", sa.String(32), nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("voice_text", sa.Text, nullable=True),
        sa.Column("expected_answer", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False),
    )
    op.create_index("ix_lesson_blocks_script_id", "lesson_blocks", ["script_id"])
    op.create_index("ix_lesson_blocks_concept_id", "lesson_blocks", ["concept_id"])

    # ── chapter_chunks ────────────────────────────────────────────────────
    op.create_table(
        "chapter_chunks",
        sa.Column("id", uuid_t, primary_key=True),
        sa.Column("upload_id", uuid_t, sa.ForeignKey("chapter_uploads.id", ondelete="CASCADE"), nullable=False),
        sa.Column("subject_id", sa.String(64), nullable=False),
        sa.Column("chapter_key", sa.String(128), nullable=False),
        sa.Column("chunk_index", sa.Integer, nullable=False),
        sa.Column("chunk_text", sa.Text, nullable=False),
        sa.Column("source_page", sa.Integer, nullable=True),
        sa.Column("source_heading", sa.String(256), nullable=True),
        sa.Column("embedding_model", sa.String(128), nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False),
    )
    op.create_index("ix_chapter_chunks_upload_id", "chapter_chunks", ["upload_id"])
    op.create_index("ix_chapter_chunks_subject_id", "chapter_chunks", ["subject_id"])

    # vector column + HNSW index — PostgreSQL only
    if pg:
        op.execute("ALTER TABLE chapter_chunks ADD COLUMN embedding vector(1024)")
        op.execute(
            "CREATE INDEX ix_chapter_chunks_embedding_hnsw "
            "ON chapter_chunks USING hnsw (embedding vector_cosine_ops) "
            "WITH (m = 16, ef_construction = 64)"
        )

    # ── student_lesson_progress ───────────────────────────────────────────
    op.create_table(
        "student_lesson_progress",
        sa.Column("id", uuid_t, primary_key=True),
        sa.Column("roll_number", sa.String(64), nullable=False),
        sa.Column("script_id", uuid_t, sa.ForeignKey("lesson_scripts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("last_block_index", sa.Integer, nullable=False, server_default="0"),
        sa.Column("completed", sa.Boolean, nullable=False, server_default="0"),
        sa.Column("concepts_seen", json_t, nullable=False, server_default="[]"),
        sa.Column("quiz_results", json_t, nullable=False, server_default="{}"),
        sa.Column("doubts_asked", sa.Integer, nullable=False, server_default="0"),
        sa.Column("started_at", sa.DateTime, nullable=True),
        sa.Column("completed_at", sa.DateTime, nullable=True),
        sa.Column("updated_at", sa.DateTime, nullable=False),
        # Unique constraint inline — SQLite doesn't support ALTER TABLE ADD CONSTRAINT
        sa.UniqueConstraint("roll_number", "script_id", name="uq_student_lesson_progress_roll_script"),
    )
    op.create_index("ix_student_lesson_progress_roll_number", "student_lesson_progress", ["roll_number"])
    op.create_index("ix_student_lesson_progress_script_id", "student_lesson_progress", ["script_id"])


def downgrade() -> None:
    op.drop_table("student_lesson_progress")
    if _pg():
        op.execute("DROP INDEX IF EXISTS ix_chapter_chunks_embedding_hnsw")
    op.drop_table("chapter_chunks")
    op.drop_table("lesson_blocks")
    op.drop_table("lesson_scripts")
    op.drop_table("ai_concepts")
    op.drop_table("chapter_uploads")
