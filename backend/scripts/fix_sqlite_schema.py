"""
Fix SQLite schema — adds missing columns to push_subscriptions for local dev.

The ORM model (push_subscription.py) defines cached_subjects_json and fcm_token
columns that were added to PostgreSQL via Alembic migration 20260726_0011.
This script backfills those columns in the local SQLite database so the app
can work correctly in development without requiring PostgreSQL.

Usage:
    python scripts/fix_sqlite_schema.py
"""

import sqlite3
import sys
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "attend75.db"

COLUMNS_TO_ADD = {
    "cached_subjects_json": "TEXT",
    "fcm_token": "TEXT",
}


def fix_sqlite_schema(db_path: str | Path) -> bool:
    """Add missing columns to push_subscriptions. Returns True if any column was added."""
    if not Path(db_path).exists():
        print(f"Database not found: {db_path}")
        return False

    conn = sqlite3.connect(str(db_path))
    cursor = conn.cursor()

    # Get existing columns
    cursor.execute("PRAGMA table_info(push_subscriptions)")
    existing = {row[1] for row in cursor.fetchall()}

    added = False
    for col_name, col_type in COLUMNS_TO_ADD.items():
        if col_name not in existing:
            print(f"Adding column: {col_name} ({col_type})")
            cursor.execute(f"ALTER TABLE push_subscriptions ADD COLUMN {col_name} {col_type}")
            added = True
        else:
            print(f"Column already exists: {col_name}")

    conn.commit()
    conn.close()
    return added


if __name__ == "__main__":
    db_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DB_PATH
    if fix_sqlite_schema(db_path):
        print("Schema updated successfully.")
    else:
        print("No changes needed or database not found.")
