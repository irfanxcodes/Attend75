from __future__ import annotations

import os
from logging.config import fileConfig

from dotenv import load_dotenv
load_dotenv()

from alembic import context
from sqlalchemy import engine_from_config, pool

from db.base import Base

# Register ALL models so alembic autogenerate sees the full schema
from db.models import attendance_alert_state  # noqa: F401
from db.models import background_fetch_state  # noqa: F401
from db.models import college_interest  # noqa: F401
from db.models import feature_usage_event  # noqa: F401
from db.models import feedback_entry  # noqa: F401
from db.models import game_score  # noqa: F401
from db.models import notice  # noqa: F401
from db.models import notification_history  # noqa: F401
from db.models import notification_job  # noqa: F401
from db.models import notification_preference  # noqa: F401
from db.models import payment_transaction  # noqa: F401
from db.models import portal_credential  # noqa: F401
from db.models import premium_subscription  # noqa: F401
from db.models import premium_waitlist  # noqa: F401
from db.models import push_subscription  # noqa: F401
from db.models import pwa_install  # noqa: F401
from db.models import student_registry  # noqa: F401
from db.models import studyme_event  # noqa: F401
from db.models import studyme_important_vote  # noqa: F401
from db.models import subject_request  # noqa: F401
from db.models import user  # noqa: F401
from db.models import user_notice  # noqa: F401
from db.models import user_rating  # noqa: F401

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def _get_database_url() -> str:
    url = os.getenv("DATABASE_URL", "").strip()
    if not url:
        raise RuntimeError(
            "DATABASE_URL environment variable must be set to run migrations. "
            "Example: export DATABASE_URL=postgresql://user:pass@localhost:5432/attend75\n"
            "For local dev: DATABASE_URL=sqlite:///./attend75.db"
        )
    if not url.startswith("postgresql") and not url.startswith("sqlite"):
        raise RuntimeError(
            f"Only PostgreSQL or SQLite is supported. Got: {url.split('://')[0]!r}"
        )
    return url


def run_migrations_offline() -> None:
    context.configure(
        url=_get_database_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    section = config.get_section(config.config_ini_section) or {}
    section["sqlalchemy.url"] = _get_database_url()

    connectable = engine_from_config(
        section,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
