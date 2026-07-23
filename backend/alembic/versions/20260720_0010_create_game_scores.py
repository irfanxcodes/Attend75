"""create game_scores table

Revision ID: 20260720_0010
Revises: 20260718_0009
Create Date: 2026-07-20
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20260720_0010"
down_revision = "20260718_0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "game_scores",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("game_name", sa.String(50), nullable=False),
        sa.Column("score", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index(
        "ix_game_scores_leaderboard",
        "game_scores",
        ["game_name", sa.text("score DESC")],
    )
    op.create_index(
        "ix_game_scores_personal",
        "game_scores",
        ["user_id", "game_name"],
    )


def downgrade() -> None:
    op.drop_index("ix_game_scores_personal", table_name="game_scores")
    op.drop_index("ix_game_scores_leaderboard", table_name="game_scores")
    op.drop_table("game_scores")
