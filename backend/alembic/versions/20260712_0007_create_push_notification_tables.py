"""create push notification premium tables

Revision ID: 20260712_0007
Revises: 20260705_0006
Create Date: 2026-07-12
"""
from alembic import op
import sqlalchemy as sa

revision = "20260712_0007"
down_revision = "20260705_0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Premium subscriptions
    op.create_table(
        "premium_subscriptions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("roll_number", sa.String(32), unique=True, nullable=False),
        sa.Column("plan", sa.String(32), nullable=False, server_default="monthly_19"),
        sa.Column("status", sa.String(16), nullable=False, server_default="active"),
        sa.Column("start_date", sa.DateTime(), nullable=False),
        sa.Column("expiry_date", sa.DateTime(), nullable=False),
        sa.Column("grace_ends_at", sa.DateTime(), nullable=True),
        sa.Column("phonepe_subscription_id", sa.String(128), nullable=True),
        sa.Column("payment_status", sa.String(32), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("idx_premium_sub_roll", "premium_subscriptions", ["roll_number"])
    op.create_index("idx_premium_sub_status", "premium_subscriptions", ["status"])

    # Push subscriptions (Web Push endpoints)
    op.create_table(
        "push_subscriptions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("roll_number", sa.String(32), nullable=False),
        sa.Column("endpoint", sa.Text(), nullable=False),
        sa.Column("p256dh_key", sa.Text(), nullable=False),
        sa.Column("auth_key", sa.Text(), nullable=False),
        sa.Column("device_info", sa.String(255), nullable=True),
        sa.Column("has_timetable", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("consent_at", sa.DateTime(), nullable=False),
        sa.Column("consent_method", sa.String(32), nullable=False, server_default="browser_prompt"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("last_used_at", sa.DateTime(), nullable=True),
    )
    op.create_index("idx_push_sub_roll", "push_subscriptions", ["roll_number"])

    # Notification preferences
    op.create_table(
        "notification_preferences",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("roll_number", sa.String(32), unique=True, nullable=False),
        sa.Column("notices_enabled", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("attendance_enabled", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("timetable_enabled", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("daily_digest_enabled", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("weekly_summary_enabled", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("notice_exam", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("notice_fee", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("notice_academic", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("notice_internship", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("notice_event", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("notice_guest_lecture", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("notice_general", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("reminder_lead_minutes", sa.Integer(), server_default="15", nullable=False),
        sa.Column("daily_digest_hour", sa.Integer(), server_default="8", nullable=False),
        sa.Column("daily_digest_minute", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("idx_notif_pref_roll", "notification_preferences", ["roll_number"])

    # Notification history
    op.create_table(
        "notification_history",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("roll_number", sa.String(32), nullable=False),
        sa.Column("category", sa.String(32), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("deep_link", sa.String(512), nullable=True),
        sa.Column("priority", sa.String(16), nullable=False, server_default="standard"),
        sa.Column("delivery_status", sa.String(16), nullable=False, server_default="sent"),
        sa.Column("is_read", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("read_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("idx_notif_hist_roll_created", "notification_history", ["roll_number", sa.text("created_at DESC")])
    op.create_index("idx_notif_hist_category", "notification_history", ["category"])

    # Notification job queue
    op.create_table(
        "notification_jobs",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("job_type", sa.String(32), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("payload", sa.Text(), nullable=False),
        sa.Column("target_roll", sa.String(32), nullable=True),
        sa.Column("priority", sa.Integer(), server_default="0", nullable=False),
        sa.Column("attempts", sa.Integer(), server_default="0", nullable=False),
        sa.Column("max_attempts", sa.Integer(), server_default="3", nullable=False),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("scheduled_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("idx_notif_jobs_status_sched", "notification_jobs", ["status", "scheduled_at"])
    op.create_index("idx_notif_jobs_type", "notification_jobs", ["job_type"])
    op.create_index("idx_notif_jobs_target", "notification_jobs", ["target_roll"])

    # Attendance alert state (deduplication)
    op.create_table(
        "attendance_alert_states",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("roll_number", sa.String(32), nullable=False),
        sa.Column("subject_abbr", sa.String(32), nullable=False),
        sa.Column("last_alerted_bracket", sa.String(16), nullable=False),
        sa.Column("last_alerted_percent", sa.Float(), nullable=False),
        sa.Column("last_alerted_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("roll_number", "subject_abbr", name="uq_alert_state_student_subject"),
    )
    op.create_index("idx_alert_state_roll", "attendance_alert_states", ["roll_number"])

    # Payment transactions
    op.create_table(
        "payment_transactions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("roll_number", sa.String(32), nullable=False),
        sa.Column("transaction_id", sa.String(128), unique=True, nullable=False),
        sa.Column("phonepe_reference", sa.String(128), nullable=True),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("payment_method", sa.String(32), nullable=False, server_default="upi_autopay"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("idx_payment_tx_roll", "payment_transactions", ["roll_number"])
    op.create_index("idx_payment_tx_created", "payment_transactions", ["created_at"])

    # Add notification_sent_at to notices table (tracks if notification was dispatched)
    op.add_column("notices", sa.Column("notification_sent_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("notices", "notification_sent_at")
    op.drop_table("payment_transactions")
    op.drop_table("attendance_alert_states")
    op.drop_table("notification_jobs")
    op.drop_table("notification_history")
    op.drop_table("notification_preferences")
    op.drop_table("push_subscriptions")
    op.drop_table("premium_subscriptions")
