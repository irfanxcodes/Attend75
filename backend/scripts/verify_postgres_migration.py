#!/usr/bin/env python3
"""Verify SQLite -> PostgreSQL row-level migration parity for core tables."""

from __future__ import annotations

import argparse
import os
from pathlib import Path

from sqlalchemy import create_engine, text


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Verify migrated PostgreSQL data parity")
    parser.add_argument(
        "--sqlite-path",
        default=os.getenv("MIGRATION_SQLITE_PATH", "./attend75.db"),
        help="Path to source SQLite DB",
    )
    parser.add_argument(
        "--postgres-url",
        default=os.getenv("MIGRATION_POSTGRES_URL", ""),
        help="Target PostgreSQL SQLAlchemy URL",
    )
    return parser.parse_args()


def fetch_pairs(engine, query: str):
    with engine.connect() as conn:
        return list(conn.execute(text(query)).mappings())


def main() -> None:
    args = parse_args()

    sqlite_path = Path(args.sqlite_path).expanduser().resolve()
    postgres_url = (args.postgres_url or "").strip()

    if not sqlite_path.exists():
        raise FileNotFoundError(f"SQLite DB not found at: {sqlite_path}")
    if not postgres_url:
        raise ValueError("--postgres-url (or MIGRATION_POSTGRES_URL) is required")

    src = create_engine(f"sqlite:///{sqlite_path}")
    tgt = create_engine(postgres_url)

    checks = [
        (
            "users",
            "SELECT id, firebase_uid, email, display_name, created_at, updated_at FROM users ORDER BY id",
        ),
        (
            "portal_credentials",
            "SELECT id, user_id, roll_number, encrypted_password, created_at, updated_at FROM portal_credentials ORDER BY id",
        ),
    ]

    for table, query in checks:
        src_rows = fetch_pairs(src, query)
        tgt_rows = fetch_pairs(tgt, query)
        if src_rows != tgt_rows:
            raise RuntimeError(
                f"Parity check failed for {table}: src_rows={len(src_rows)} tgt_rows={len(tgt_rows)}"
            )
        print(f"{table}: OK ({len(src_rows)} rows)")

    print("PostgreSQL migration verification passed")


if __name__ == "__main__":
    main()
