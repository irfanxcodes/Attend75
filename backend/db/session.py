import os
import sys
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from db.base import Base

DATABASE_URL = os.getenv("DATABASE_URL", "").strip()

if not DATABASE_URL:
    print(
        "FATAL: DATABASE_URL environment variable is not set.\n"
        "Set it to your PostgreSQL connection string, e.g.:\n"
        "  DATABASE_URL=postgresql://user:password@host:5432/dbname\n"
        "SQLite is not supported in production.",
        file=sys.stderr,
    )
    sys.exit(1)

if not DATABASE_URL.startswith("postgresql"):
    print(
        f"FATAL: DATABASE_URL must be a PostgreSQL connection string "
        f"(got: {DATABASE_URL[:40]}...).\n"
        "SQLite is not supported.",
        file=sys.stderr,
    )
    sys.exit(1)

IS_POSTGRES = True

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)

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

    # Schema is managed exclusively by Alembic migrations.
    # create_all is intentionally NOT called here — run `alembic upgrade head`
    # before starting the server.
