# Backend Setup (FastAPI)

## 1. Create and activate virtual environment

macOS/Linux:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
```

Windows (PowerShell):

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
```

## 2. Install dependencies

```bash
pip install -r requirements.txt
```

## 2.1 Database configuration (Phase 1)

Optional environment variables:

```bash
# Defaults to SQLite file backend/attend75.db
export DATABASE_URL="sqlite:///./attend75.db"

# Replace in production with your own Fernet key
export CREDENTIAL_ENCRYPTION_KEY="<fernet-base64-key>"
```

PostgreSQL example:

```bash
export DATABASE_URL="postgresql+psycopg2://user:password@localhost:5432/attend75"
```

### SQLite to PostgreSQL migration runbook

This project supports a safe migration path from SQLite (`backend/attend75.db`) to PostgreSQL.

1. Keep SQLite backup first (already required before cutover)

```bash
cp backend/attend75.db backend/backups/attend75_pre_cutover.db
```

2. Set PostgreSQL URL only for migration commands

```bash
export DATABASE_URL="postgresql+psycopg2://user:password@localhost:5432/attend75"
```

3. Create schema in PostgreSQL using Alembic

```bash
alembic upgrade head
```

4. Copy data from SQLite to PostgreSQL

```bash
python scripts/migrate_sqlite_to_postgres.py \
  --sqlite-path ./attend75.db \
  --postgres-url "$DATABASE_URL"
```

5. Verify parity

```bash
python scripts/verify_postgres_migration.py \
  --sqlite-path ./attend75.db \
  --postgres-url "$DATABASE_URL"
```

6. Run backend smoke tests against PostgreSQL

```bash
uvicorn app:app --reload
```

### Rollback

If any issue appears after switching to PostgreSQL:

1. Stop backend.
2. Unset/replace `DATABASE_URL` back to SQLite default.
3. Restart backend.

SQLite file data remains intact because migration scripts are read-only on source SQLite.

Note: on startup, the backend initializes required tables (`users`, `portal_credentials`) automatically.

## 2.2 Firebase configuration (Phase 2)

Set one of the following to allow Firebase ID token verification:

```bash
export FIREBASE_SERVICE_ACCOUNT_FILE="/absolute/path/to/service-account.json"
# or
export GOOGLE_APPLICATION_CREDENTIALS="/absolute/path/to/service-account.json"
```

## 2.3 Alembic migrations

Migrations are scaffolded in `alembic/`.

Run migration commands from the backend directory:

```bash
alembic upgrade head
```

Create a new migration revision:

```bash
alembic revision -m "describe change"
```

Autogenerate from SQLAlchemy models:

```bash
alembic revision --autogenerate -m "describe change"
```

## 3. Run server

```bash
uvicorn app:app --reload
```

Server starts at `http://127.0.0.1:8000`.

## API

### `POST /login`

Request body:

```json
{
  "roll_number": "string",
  "password": "string"
}
```

Success response:

```json
{
  "status": "success",
  "message": "Login successful",
  "data": {}
}
```

Error response:

```json
{
  "status": "error",
  "message": "Invalid credentials"
}
```
