#!/usr/bin/env python3
"""Safely migrate Attend75 core tables from SQLite to PostgreSQL.

Usage:
  python scripts/migrate_sqlite_to_postgres.py \
    --sqlite-path ./attend75.db \
    --postgres-url postgresql+psycopg2://user:pass@localhost:5432/attend75

Notes:
- Run Alembic migrations on PostgreSQL before running this script.
- This script preserves primary keys and updates PostgreSQL sequences.
- By default, script aborts if target tables are non-empty.
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path

from sqlalchemy import create_engine, text

TABLES = ("users", "portal_credentials")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Migrate SQLite data into PostgreSQL")
    parser.add_argument(
        "--sqlite-path",
        default=os.getenv("MIGRATION_SQLITE_PATH", "./attend75.db"),
        help="Path to source SQLite DB (default: ./attend75.db)",
    )
    parser.add_argument(
        "--postgres-url",
        default=os.getenv("MIGRATION_POSTGRES_URL", ""),
        help="Target PostgreSQL SQLAlchemy URL",
    )
    parser.add_argument(
        "--allow-nonempty-target",
        action="store_true",
        help="Allow migration into non-empty target tables",
    )
    return parser.parse_args()


def fetch_all(source_engine, table_name: str) -> list[dict]:
    with source_engine.connect() as conn:
        result = conn.execute(text(f"SELECT * FROM {table_name} ORDER BY id ASC"))
        return [dict(row._mapping) for row in result]


def table_count(engine, table_name: str) -> int:
    with engine.connect() as conn:
        return int(conn.execute(text(f"SELECT COUNT(*) FROM {table_name}")).scalar_one())


def ensure_target_is_empty(target_engine, allow_nonempty: bool) -> None:
    for table in TABLES:
        count = table_count(target_engine, table)
        if count > 0 and not allow_nonempty:
            raise RuntimeError(
                f"Target table '{table}' has {count} rows. "
                "Refusing to continue without --allow-nonempty-target."
            )


def insert_rows(target_engine, table_name: str, rows: list[dict]) -> None:
    if not rows:
        return

    columns = list(rows[0].keys())
    col_csv = ", ".join(columns)
    bind_csv = ", ".join(f":{c}" for c in columns)
    stmt = text(f"INSERT INTO {table_name} ({col_csv}) VALUES ({bind_csv})")

    with target_engine.begin() as conn:
        conn.execute(stmt, rows)


def reset_sequence(target_engine, table_name: str) -> None:
    seq_stmt = text(
        "SELECT pg_get_serial_sequence(:table_name, 'id')"
    )
    with target_engine.begin() as conn:
        seq_name = conn.execute(seq_stmt, {"table_name": table_name}).scalar_one_or_none()
        if not seq_name:
            return

        conn.execute(
            text(
                "SELECT setval(:seq_name, COALESCE((SELECT MAX(id) FROM "
                + table_name
                + "), 1), true)"
            ),
            {"seq_name": seq_name},
        )


def main() -> None:
    args = parse_args()

    sqlite_path = Path(args.sqlite_path).expanduser().resolve()
    if not sqlite_path.exists():
        raise FileNotFoundError(f"SQLite DB not found at: {sqlite_path}")

    postgres_url = (args.postgres_url or "").strip()
    if not postgres_url:
        raise ValueError("--postgres-url (or MIGRATION_POSTGRES_URL) is required")
    if not postgres_url.startswith("postgresql"):
        raise ValueError("Target URL must be a PostgreSQL URL")

    source_engine = create_engine(f"sqlite:///{sqlite_path}")
    target_engine = create_engine(postgres_url)

    ensure_target_is_empty(target_engine, args.allow_nonempty_target)

    users = fetch_all(source_engine, "users")
    creds = fetch_all(source_engine, "portal_credentials")

    insert_rows(target_engine, "users", users)
    insert_rows(target_engine, "portal_credentials", creds)

    reset_sequence(target_engine, "users")
    reset_sequence(target_engine, "portal_credentials")

    users_count_src = len(users)
    creds_count_src = len(creds)
    users_count_tgt = table_count(target_engine, "users")
    creds_count_tgt = table_count(target_engine, "portal_credentials")

    if users_count_src != users_count_tgt or creds_count_src != creds_count_tgt:
        raise RuntimeError(
            "Count mismatch after migration. "
            f"users: src={users_count_src}, tgt={users_count_tgt}; "
            f"portal_credentials: src={creds_count_src}, tgt={creds_count_tgt}"
        )

    print(
        "Migration complete. "
        f"users={users_count_tgt}, portal_credentials={creds_count_tgt}"
    )


if __name__ == "__main__":
    main()
