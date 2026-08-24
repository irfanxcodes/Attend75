"""pg_only: add missing push_subscription columns and migrate DateTime to TIMESTAMPTZ

Adds columns that exist in ORM models but were missing from migrations:
- push_subscriptions.cached_subjects_json  (TEXT, nullable)
- push_subscriptions.fcm_token             (TEXT, nullable)

Also migrates all DateTime columns that store UTC timestamps to
TIMESTAMP WITH TIME ZONE (timestamptz) so PostgreSQL stores and compares
them as proper timezone-aware values. This eliminates the naive/aware
mismatch that caused scheduled jobs to never be claimed.

Revision ID: 20260726_0011
Revises: 20260720_0010
Create Date: 2026-07-26
"""
from alembic import op
import sqlalchemy as sa

revision = "20260726_0011"
down_revision = "20260720_0010"
branch_labels = None
depends_on = None

# Tables and their DateTime columns to convert to TIMESTAMPTZ.
# Format: {table_name: [column_name, ...]}
_TIMESTAMPTZ_COLUMNS: dict[str, list[str]] = {
    "users": ["created_at", "updated_at"],
    "portal_credentials": ["created_at", "updated_at"],
    "notices": ["portal_date", "notification_sent_at"],
    "student_registry": ["first_seen_at", "last_seen_at", "linked_google_at"],
    "push_subscriptions": ["consent_at", "created_at", "last_used_at"],
    "premium_subscriptions": ["start_date", "expiry_date", "grace_ends_at", "cancelled_at", "created_at", "updated_at"],
    "notification_preferences": ["created_at", "updated_at"],
    "notification_history": ["read_at", "created_at"],
    "notification_jobs": ["scheduled_at", "started_at", "completed_at", "created_at"],
    "payment_transactions": ["created_at"],
    "attendance_alert_states": ["last_alerted_at"],
    "background_fetch_state": ["last_fetch_at", "next_eligible_at"],
    "premium_waitlist": ["joined_at"],
    "game_scores": ["created_at"],
    "feedback_entries": ["created_at", "updated_at"],
    "feature_usage_events": ["created_at"],
    "studyme_events": ["starts_at", "ends_at", "created_at"],
    "studyme_important_votes": ["created_at"],
    "user_notices": ["created_at"],
    "pwa_installs": ["created_at"],
    "college_interests": ["created_at"],
    "subject_requests": ["created_at"],
    "user_ratings": ["created_at"],
}


def upgrade() -> None:
    bind = op.get_bind()

    if bind.dialect.name == "sqlite":
        # SQLite does not support IF NOT EXISTS on ALTER TABLE or PL/pgSQL blocks.
        # Add the two columns manually only if they're missing.
        from sqlalchemy import inspect as sa_inspect
        inspector = sa_inspect(bind)
        existing = {c["name"] for c in inspector.get_columns("push_subscriptions")}
        if "cached_subjects_json" not in existing:
            op.add_column("push_subscriptions", sa.Column("cached_subjects_json", sa.Text(), nullable=True))
        if "fcm_token" not in existing:
            op.add_column("push_subscriptions", sa.Column("fcm_token", sa.Text(), nullable=True))
        # TIMESTAMPTZ conversion is a no-op on SQLite (it stores everything as text/numeric).
        return

    # 1. Add missing push_subscriptions columns (IF NOT EXISTS — safe to re-run)
    op.execute("""
        ALTER TABLE push_subscriptions
        ADD COLUMN IF NOT EXISTS cached_subjects_json TEXT,
        ADD COLUMN IF NOT EXISTS fcm_token TEXT
    """)

    # 2. Convert DateTime → TIMESTAMPTZ for all known UTC timestamp columns.
    #    Using AT TIME ZONE 'UTC' so existing naive-UTC values are reinterpreted
    #    correctly rather than shifted. Wrapped in DO blocks to skip columns
    #    that are already TIMESTAMPTZ (safe to re-run).
    for table, columns in _TIMESTAMPTZ_COLUMNS.items():
        for col in columns:
            op.execute(f"""
                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = '{table}'
                          AND column_name = '{col}'
                          AND data_type = 'timestamp without time zone'
                    ) THEN
                        ALTER TABLE {table}
                        ALTER COLUMN {col} TYPE TIMESTAMPTZ
                        USING {col} AT TIME ZONE 'UTC';
                    END IF;
                END$$;
            """)


def downgrade() -> None:
    # Convert TIMESTAMPTZ back to plain TIMESTAMP (naive UTC)
    for table, columns in _TIMESTAMPTZ_COLUMNS.items():
        for col in columns:
            op.execute(
                f"ALTER TABLE {table} "
                f"ALTER COLUMN {col} TYPE TIMESTAMP "
                f"USING {col} AT TIME ZONE 'UTC'"
            )

    op.drop_column("push_subscriptions", "fcm_token")
    op.drop_column("push_subscriptions", "cached_subjects_json")
