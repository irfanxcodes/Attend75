import os
from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from db.base import Base

_BASE_DIR = Path(__file__).resolve().parent.parent
_DEFAULT_SQLITE_PATH = _BASE_DIR / "attend75.db"
_DEFAULT_DATABASE_URL = f"sqlite:///{_DEFAULT_SQLITE_PATH}"
DATABASE_URL = os.getenv("DATABASE_URL", _DEFAULT_DATABASE_URL)

# Detect database engine for feature gating (e.g., SKIP LOCKED is PostgreSQL-only)
IS_POSTGRES = DATABASE_URL.startswith("postgresql")

_engine_kwargs = {
    "pool_pre_ping": True,
}

if IS_POSTGRES:
    _engine_kwargs["pool_size"] = 10
    _engine_kwargs["max_overflow"] = 20
else:
    # SQLite needs this for multi-threaded access
    _engine_kwargs["connect_args"] = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, **_engine_kwargs)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def init_database() -> None:
    # Import model modules so SQLAlchemy registers table metadata.
    from db.models import feature_usage_event  # noqa: F401
    from db.models import feedback_entry  # noqa: F401
    from db.models import game_score  # noqa: F401
    from db.models import college_interest  # noqa: F401
    from db.models import portal_credential  # noqa: F401
    from db.models import studyme_event  # noqa: F401
    from db.models import studyme_important_vote  # noqa: F401
    from db.models import subject_request  # noqa: F401
    from db.models import user  # noqa: F401
    from db.models import user_rating  # noqa: F401
    from db.models import notice  # noqa: F401
    from db.models import user_notice  # noqa: F401
    from db.models import student_registry  # noqa: F401
    from db.models import attendance_alert_state  # noqa: F401
    from db.models import background_fetch_state  # noqa: F401
    from db.models import notification_history  # noqa: F401
    from db.models import notification_job  # noqa: F401
    from db.models import notification_preference  # noqa: F401
    from db.models import payment_transaction  # noqa: F401
    from db.models import premium_subscription  # noqa: F401
    from db.models import premium_waitlist  # noqa: F401
    from db.models import push_subscription  # noqa: F401
    from db.models import pwa_install  # noqa: F401

    Base.metadata.create_all(bind=engine)

    # SQLite-specific schema patches for columns added after initial migration
    if not IS_POSTGRES:
        _ensure_feature_usage_schema()
        _ensure_push_tables_exist()


def _ensure_feature_usage_schema() -> None:
    with engine.begin() as connection:
        result = connection.execute(text("PRAGMA table_info(feature_usage_events)"))
        columns = {row[1] for row in result.fetchall()}

        if "semester_id" not in columns:
            connection.execute(text("ALTER TABLE feature_usage_events ADD COLUMN semester_id VARCHAR(64)"))

        if "semester_label" not in columns:
            connection.execute(text("ALTER TABLE feature_usage_events ADD COLUMN semester_label VARCHAR(255)"))

        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_feature_usage_events_semester_id ON feature_usage_events (semester_id)")
        )


def _ensure_push_tables_exist() -> None:
    """Ensure push notification tables exist in SQLite (in case migrations haven't been run)."""
    with engine.begin() as connection:
        # Check if notification_jobs table exists
        result = connection.execute(
            text("SELECT name FROM sqlite_master WHERE type='table' AND name='notification_jobs'")
        )
        if not result.fetchone():
            # Tables will be created by Base.metadata.create_all above
            pass
