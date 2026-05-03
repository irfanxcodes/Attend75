"""Create StudyMe important votes table

Revision ID: 20260503_0002
Revises: 20260330_0001
Create Date: 2026-05-03
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260503_0002"
down_revision = "20260330_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "studyme_important_votes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("subject_id", sa.String(length=128), nullable=False),
        sa.Column("subject_name", sa.String(length=255), nullable=True),
        sa.Column("lesson_id", sa.String(length=128), nullable=True),
        sa.Column("lesson_name", sa.String(length=255), nullable=True),
        sa.Column("topic_id", sa.String(length=128), nullable=True),
        sa.Column("topic_name", sa.String(length=255), nullable=True),
        sa.Column("entity_type", sa.String(length=16), nullable=False),
        sa.Column("entity_id", sa.String(length=128), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "entity_type", "subject_id", "entity_id", name="uq_studyme_important_vote_user_entity"),
    )
    op.create_index(op.f("ix_studyme_important_votes_id"), "studyme_important_votes", ["id"], unique=False)
    op.create_index(op.f("ix_studyme_important_votes_user_id"), "studyme_important_votes", ["user_id"], unique=False)
    op.create_index(op.f("ix_studyme_important_votes_subject_id"), "studyme_important_votes", ["subject_id"], unique=False)
    op.create_index(op.f("ix_studyme_important_votes_lesson_id"), "studyme_important_votes", ["lesson_id"], unique=False)
    op.create_index(op.f("ix_studyme_important_votes_topic_id"), "studyme_important_votes", ["topic_id"], unique=False)
    op.create_index(op.f("ix_studyme_important_votes_entity_type"), "studyme_important_votes", ["entity_type"], unique=False)
    op.create_index(op.f("ix_studyme_important_votes_entity_id"), "studyme_important_votes", ["entity_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_studyme_important_votes_entity_id"), table_name="studyme_important_votes")
    op.drop_index(op.f("ix_studyme_important_votes_entity_type"), table_name="studyme_important_votes")
    op.drop_index(op.f("ix_studyme_important_votes_topic_id"), table_name="studyme_important_votes")
    op.drop_index(op.f("ix_studyme_important_votes_lesson_id"), table_name="studyme_important_votes")
    op.drop_index(op.f("ix_studyme_important_votes_subject_id"), table_name="studyme_important_votes")
    op.drop_index(op.f("ix_studyme_important_votes_user_id"), table_name="studyme_important_votes")
    op.drop_index(op.f("ix_studyme_important_votes_id"), table_name="studyme_important_votes")
    op.drop_table("studyme_important_votes")
