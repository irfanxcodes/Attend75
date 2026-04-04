import os
import hmac
import hashlib
import secrets
import time
import threading
from typing import Annotated

from fastapi import Header, HTTPException
from sqlalchemy import func

from db.models.portal_credential import PortalCredential
from db.models.user import User
from db.session import SessionLocal
from services.feedback_service import list_feedback
from services.session_store import session_store


class AdminSessionStore:
    def __init__(self, ttl_seconds: int, max_sessions: int):
        self._ttl_seconds = ttl_seconds
        self._max_sessions = max_sessions
        self._sessions: dict[str, dict[str, object]] = {}
        self._lock = threading.Lock()

    def _prune_expired_locked(self, now: float) -> None:
        expired = [
            token for token, record in self._sessions.items()
            if now - float(record["created_at"]) > self._ttl_seconds
        ]
        for token in expired:
            self._sessions.pop(token, None)

    def create(self, username: str) -> str:
        now = time.time()
        with self._lock:
            self._prune_expired_locked(now)
            if len(self._sessions) >= self._max_sessions:
                oldest_token = min(self._sessions, key=lambda k: float(self._sessions[k]["created_at"]))
                self._sessions.pop(oldest_token, None)

            token = secrets.token_urlsafe(48)
            self._sessions[token] = {"username": username, "created_at": now}
            return token

    def get(self, token: str) -> dict[str, object] | None:
        now = time.time()
        with self._lock:
            self._prune_expired_locked(now)
            return self._sessions.get(token)

    def revoke(self, token: str) -> None:
        with self._lock:
            self._sessions.pop(token, None)


def _admin_username() -> str:
    return os.getenv("ADMIN_USERNAME", "admin").strip() or "admin"


def _admin_password_hash() -> str:
    return os.getenv("ADMIN_PASSWORD_HASH", "").strip()


def _admin_session_ttl_seconds() -> int:
    raw = os.getenv("ADMIN_SESSION_TTL_SECONDS", "43200").strip()
    try:
        value = int(raw)
    except ValueError:
        return 43200
    return max(900, min(value, 604800))


def _parse_pbkdf2_hash(encoded_hash: str) -> tuple[int, bytes, bytes]:
    try:
        algorithm, iterations_raw, salt_hex, digest_hex = encoded_hash.split("$", 3)
    except ValueError as exc:
        raise HTTPException(status_code=503, detail="Invalid ADMIN_PASSWORD_HASH format") from exc

    if algorithm != "pbkdf2_sha256":
        raise HTTPException(status_code=503, detail="Unsupported ADMIN_PASSWORD_HASH algorithm")

    try:
        iterations = int(iterations_raw)
        salt = bytes.fromhex(salt_hex)
        digest = bytes.fromhex(digest_hex)
    except ValueError as exc:
        raise HTTPException(status_code=503, detail="Invalid ADMIN_PASSWORD_HASH value") from exc

    if iterations < 100000:
        raise HTTPException(status_code=503, detail="ADMIN_PASSWORD_HASH iterations too low")

    return iterations, salt, digest


def _verify_password(password: str, encoded_hash: str) -> bool:
    iterations, salt, expected_digest = _parse_pbkdf2_hash(encoded_hash)
    candidate_digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return hmac.compare_digest(candidate_digest, expected_digest)


def _extract_bearer_token(authorization: str | None) -> str:
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")

    prefix = "Bearer "
    if not authorization.startswith(prefix):
        raise HTTPException(status_code=401, detail="Invalid Authorization header")

    token = authorization[len(prefix):].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Missing bearer token")

    return token


admin_session_store = AdminSessionStore(ttl_seconds=_admin_session_ttl_seconds(), max_sessions=20)


def login_admin_with_password(username: str, password: str) -> dict[str, str | int]:
    configured_hash = _admin_password_hash()
    if not configured_hash:
        raise HTTPException(status_code=503, detail="Admin authentication is not configured")

    expected_username = _admin_username()
    if not hmac.compare_digest(username, expected_username):
        raise HTTPException(status_code=401, detail="Invalid admin credentials")

    if not _verify_password(password, configured_hash):
        raise HTTPException(status_code=401, detail="Invalid admin credentials")

    session_token = admin_session_store.create(username)
    return {
        "session_token": session_token,
        "username": username,
        "session_ttl_seconds": _admin_session_ttl_seconds(),
    }


def logout_admin_session(token: str) -> None:
    admin_session_store.revoke(token)


def require_admin_session(
    authorization: Annotated[str | None, Header()] = None,
) -> dict[str, object]:
    token = _extract_bearer_token(authorization)
    session = admin_session_store.get(token)
    if not session:
        raise HTTPException(status_code=401, detail="Admin session is invalid or expired")

    return {"session_token": token, **session}


def require_admin_user(
    authorization: Annotated[str | None, Header()] = None,
) -> dict:
    return require_admin_session(authorization)


def get_admin_overview() -> dict:
    with SessionLocal() as session:
        total_users = int(session.query(func.count(User.id)).scalar() or 0)
        linked_credentials = int(session.query(func.count(PortalCredential.id)).scalar() or 0)

    feedback_items = list_feedback(limit=100)
    session_stats = session_store.stats()

    return {
        "users": {
            "total": total_users,
            "linkedCredentials": linked_credentials,
            "unlinkedUsers": max(total_users - linked_credentials, 0),
        },
        "sessions": session_stats,
        "feedback": {
            "totalRecent": len(feedback_items),
            "latest": feedback_items[0] if feedback_items else None,
        },
        "health": {
            "api": "healthy",
        },
        "instrumentation": {
            "requestMetrics": "pending",
            "deviceBreakdown": "pending",
            "featureUsage": "pending",
        },
    }


def get_feedback_log(limit: int = 50) -> list[dict[str, str]]:
    return list_feedback(limit=limit)
