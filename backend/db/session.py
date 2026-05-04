import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from db.base import Base

_BASE_DIR = Path(__file__).resolve().parent.parent
_DEFAULT_SQLITE_PATH = _BASE_DIR / "attend75.db"
_DEFAULT_DATABASE_URL = f"sqlite:///{_DEFAULT_SQLITE_PATH}"
DATABASE_URL = os.getenv("DATABASE_URL", _DEFAULT_DATABASE_URL)

_engine_kwargs = {
    "pool_pre_ping": True,
}
if DATABASE_URL.startswith("sqlite"):
    _engine_kwargs["connect_args"] = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, **_engine_kwargs)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def init_database() -> None:
    # Import model modules so SQLAlchemy registers table metadata.
    from db.models import feature_usage_event  # noqa: F401
    from db.models import feedback_entry  # noqa: F401
    from db.models import portal_credential  # noqa: F401
    from db.models import studyme_event  # noqa: F401
    from db.models import studyme_important_vote  # noqa: F401
    from db.models import user  # noqa: F401

    Base.metadata.create_all(bind=engine)
