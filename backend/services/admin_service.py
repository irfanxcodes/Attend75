import os
import hmac
import hashlib
import secrets
import time
import threading
from datetime import date, timedelta
from typing import Annotated

from fastapi import Header, HTTPException
from sqlalchemy import func, text

from db.models.portal_credential import PortalCredential
from db.models.user import User
from db.session import SessionLocal
from services.feature_usage_event_service import get_mail_faculty_usage_summary
from services.feature_usage_metrics import get_feature_usage_snapshot
from services.feedback_service import feedback_count, list_feedback, update_feedback_status
from services.request_metrics import get_request_metrics_snapshot
from services.scraper_metrics import get_scraper_metrics_snapshot
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


def _build_failed_request_insights(request_metrics: dict) -> list[dict[str, str | int]]:
    insights: list[dict[str, str | int]] = []

    for item in request_metrics.get("topFailedPaths", []) or []:
        path = str(item.get("path") or "")
        failed_count = int(item.get("failedCount") or 0)
        client_errors = int(item.get("clientErrorCount") or 0)
        server_errors = int(item.get("serverErrorCount") or 0)

        if failed_count <= 0:
            continue

        if path in {"/", "/robots.txt", "/favicon.ico", "/apple-touch-icon.png", "/sitemap.xml"}:
            reason = "Bot/crawler or generic internet probe traffic is hitting unsupported routes."
            fix = "Handle these routes explicitly (200/204) or filter them at reverse proxy/firewall to reduce telemetry noise."
        elif path in {"/marks/consolidate", "/marks/consolidated"}:
            if client_errors > 0 and server_errors == 0:
                reason = "Clients are using stale or invalid marks endpoints/payloads, causing non-server failures."
                fix = "Align frontend and backend deployments; stop retrying on 4xx non-retriable marks responses."
            else:
                reason = "Marks endpoint is experiencing server-side failures in the current deployment."
                fix = "Inspect marks router/scraper logs for 5xx/502 failures and add guarded retries only for network errors."
        elif path.startswith("/attendance"):
            if server_errors > 0:
                reason = "Attendance requests are failing server-side (likely portal/network/scraper instability), not only auth expiry."
                fix = "Review backend logs for 5xx/502 causes, tighten scraper error handling, and add short bounded retries for network faults."
            else:
                reason = "Expired or invalid session tokens are causing client-side auth failures on attendance routes."
                fix = "Force re-login on SESSION_EXPIRED and prevent retries with expired tokens."
        elif path.startswith("/auth/firebase"):
            if server_errors > 0:
                reason = "Firebase auth flow is failing due to backend/service-side errors."
                fix = "Check Firebase Admin SDK initialization, credential file availability, and upstream portal dependency health."
            else:
                reason = "Google sign-in token verification or credential-link flow is failing for some requests."
                fix = "Verify Firebase Admin credentials, token audience, and linked portal credentials integrity."
        elif path.startswith("/admin"):
            reason = "Admin calls are being made with missing/expired bearer tokens."
            fix = "Renew admin sessions and avoid background polling after logout/session expiry."
        elif path == "/login":
            if server_errors > 0:
                reason = "Login route has server-side failures (portal/network or internal exceptions)."
                fix = "Inspect backend login logs and upstream portal availability; alert on repeated 5xx/502."
            else:
                reason = "Invalid credentials or malformed login requests are producing expected client-side failures."
                fix = "Throttle repeated invalid attempts and show clear validation to reduce repeated bad requests."
        else:
            if server_errors > 0:
                reason = "Unknown endpoint is generating backend failures that need investigation."
                fix = "Inspect logs for this path and add explicit route handling or proxy rules."
            else:
                reason = "Unknown or unsupported endpoint traffic is inflating failed request counters."
                fix = "Block noisy probes at edge/firewall and enforce valid route rewrites."

        insights.append(
            {
                "path": path,
                "failedCount": failed_count,
                "clientErrorCount": client_errors,
                "serverErrorCount": server_errors,
                "likelyCause": reason,
                "recommendedFix": fix,
            }
        )

    return insights


def _build_page_health(top_failed_paths: list[dict]) -> list[dict[str, str | int]]:
    endpoint_to_page = {
        "/attendance": "Dashboard",
        "/attendance/history": "History",
        "/marks/consolidated": "Marks",
        "/marks/consolidate": "Marks",
        "/auth/firebase/login": "Login",
        "/auth/firebase/link-credentials": "Login",
        "/login": "Login",
    }

    pages: dict[str, dict[str, str | int]] = {}

    for item in top_failed_paths:
        path = str(item.get("path") or "")
        page = endpoint_to_page.get(path)
        if not page:
            continue

        failed_count = int(item.get("failedCount") or 0)
        if failed_count <= 0:
            continue

        server_errors = int(item.get("serverErrorCount") or 0)
        if server_errors <= 0:
            continue

        pages[page] = {
            "page": page,
            "endpoint": path,
            "failedCount": server_errors,
            "reason": "server-side errors",
        }

    return list(pages.values())


def _build_client_side_issues(top_failed_paths: list[dict]) -> list[dict[str, str | int]]:
    endpoint_to_page = {
        "/attendance": "Dashboard",
        "/attendance/history": "History",
        "/marks/consolidated": "Marks",
        "/marks/consolidate": "Marks",
        "/auth/firebase/login": "Login",
        "/auth/firebase/link-credentials": "Login",
        "/login": "Login",
    }

    issues: list[dict[str, str | int]] = []

    for item in top_failed_paths:
        path = str(item.get("path") or "")
        page = endpoint_to_page.get(path)
        if not page:
            continue

        client_errors = int(item.get("clientErrorCount") or 0)
        if client_errors <= 0:
            continue

        reason = "expired or invalid client requests"
        if path in {"/marks/consolidate", "/marks/consolidated"}:
            reason = "stale endpoint usage or expired session token"
        elif path == "/login":
            reason = "invalid credentials or malformed login request"

        issues.append(
            {
                "page": page,
                "endpoint": path,
                "failedCount": client_errors,
                "reason": reason,
            }
        )

    return issues


def get_admin_overview() -> dict:
    db_connected = False

    with SessionLocal() as session:
        try:
            db_connected = bool(session.execute(text("SELECT 1")).scalar())
        except Exception:
            db_connected = False

        total_users = int(session.query(func.count(User.id)).scalar() or 0)
        linked_credentials = int(session.query(func.count(PortalCredential.id)).scalar() or 0)
        active_users_today = int(
            session.query(func.count(User.id))
            .filter(func.date(User.updated_at) == date.today().isoformat())
            .scalar()
            or 0
        )

        user_rows = (
            session.query(User.id, User.display_name, User.email, PortalCredential.roll_number)
            .outerjoin(PortalCredential, PortalCredential.user_id == User.id)
            .order_by(User.id.asc())
            .all()
        )

        growth_window_days = 14
        growth_start_date = date.today() - timedelta(days=growth_window_days - 1)

        daily_new_user_rows = (
            session.query(func.date(User.created_at).label("created_day"), func.count(User.id))
            .filter(func.date(User.created_at) >= growth_start_date.isoformat())
            .group_by(func.date(User.created_at))
            .all()
        )

        daily_new_user_map: dict[str, int] = {
            str(created_day): int(count)
            for created_day, count in daily_new_user_rows
        }

        users_before_window = int(
            session.query(func.count(User.id))
            .filter(func.date(User.created_at) < growth_start_date.isoformat())
            .scalar()
            or 0
        )

    feedback_items = list_feedback(limit=100)
    total_feedback_count = feedback_count()
    session_stats = session_store.stats()
    request_metrics = get_request_metrics_snapshot()
    scraper_metrics = get_scraper_metrics_snapshot()
    feature_usage = get_feature_usage_snapshot()
    mail_faculty_usage = get_mail_faculty_usage_summary(limit_subjects=5)
    request_failure_rate_percent = float(request_metrics.get("requestFailureRatePercent", 0.0))
    app_error_rate_percent = float(request_metrics.get("appErrorRatePercent", 0.0))
    failed_request_insights = _build_failed_request_insights(request_metrics)
    non_working_pages = _build_page_health(request_metrics.get("topFailedPaths", []) or [])
    client_side_issues = _build_client_side_issues(request_metrics.get("topFailedPaths", []) or [])

    health_status = {
        "backendStatus": "up",
        "apiLatencyMs": float(request_metrics.get("averageResponseTimeMs", 0.0)),
        "p50ResponseTimeMs": float(request_metrics.get("p50ResponseTimeMs", 0.0)),
        "p95ResponseTimeMs": float(request_metrics.get("p95ResponseTimeMs", 0.0)),
        "errorRatePercent": app_error_rate_percent,
        "requestFailureRatePercent": request_failure_rate_percent,
        "lastErrorTimestamp": request_metrics.get("lastErrorTimestamp"),
        "uptimeSeconds": int(request_metrics.get("uptimeSeconds", 0)),
        "databaseConnectivity": "connected" if db_connected else "disconnected",
    }

    growth_series: list[dict[str, int | str]] = []
    cumulative_users = users_before_window
    for offset in range(growth_window_days):
        current_day = growth_start_date + timedelta(days=offset)
        day_key = current_day.isoformat()
        new_users = int(daily_new_user_map.get(day_key, 0))
        cumulative_users += new_users
        growth_series.append(
            {
                "date": day_key,
                "newUsers": new_users,
                "cumulativeUsers": cumulative_users,
            }
        )

    linked_roll_by_email: dict[str, str] = {}
    for row in user_rows:
        email_key = str(row.email or "").strip().lower()
        roll_value = str(row.roll_number or "").strip().upper()
        if email_key and roll_value and email_key not in linked_roll_by_email:
            linked_roll_by_email[email_key] = roll_value

    users_table = [
        {
            "serialNo": index + 1,
            "name": row.display_name,
            "emailId": row.email,
            "rollNumber": (
                str(row.roll_number or "").strip().upper()
                or linked_roll_by_email.get(str(row.email or "").strip().lower())
            ),
        }
        for index, row in enumerate(user_rows)
    ]

    user_analytics = {
        "totalUsers": total_users,
        "activeSessions": int(session_stats.get("active_sessions", 0)),
        "userGrowth": {
            "windowDays": growth_window_days,
            "series": growth_series,
        },
        "usersTable": users_table,
        "unavailableMetrics": [
            {
                "name": "Daily Active Users (DAU)",
                "reason": "No persistent per-user daily activity event tracking is currently stored.",
            },
            {
                "name": "Weekly Active Users (WAU)",
                "reason": "No persistent per-user weekly activity event tracking is currently stored.",
            },
            {
                "name": "Login Count (Guest vs Google)",
                "reason": "Login attempts are not persisted with auth-type counters in the database.",
            },
            {
                "name": "Most Active User",
                "reason": "No per-user activity frequency timeline is currently persisted.",
            },
        ],
    }

    return {
        "homepage": {
            "totalUsers": total_users,
            "activeUsersToday": active_users_today,
            "activeSessions": int(session_stats.get("active_sessions", 0)),
            "feedbackCount": total_feedback_count,
            "failedRequestCount": int(request_metrics.get("failedRequestCount", 0)),
            "failedRequestInsights": failed_request_insights,
            "averageResponseTimeMs": float(request_metrics.get("averageResponseTimeMs", 0.0)),
            "scraperSuccessRate": request_metrics.get("scraperSuccessRate"),
        },
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
        "healthStatus": health_status,
        "userAnalytics": user_analytics,
        "instrumentation": {
            "requestMetrics": request_metrics,
            "deviceBreakdown": "pending",
            "featureUsage": feature_usage,
        },
        "scraperPerformance": {
            "totalAttempts": int(scraper_metrics.get("totalAttempts", 0)),
            "successRatePercent": float(scraper_metrics.get("successRatePercent", 0.0)),
            "failureRatePercent": float(scraper_metrics.get("failureRatePercent", 0.0)),
            "averageScrapeTimeMs": float(scraper_metrics.get("averageScrapeTimeMs", 0.0)),
            "lastFailureTimestamp": scraper_metrics.get("lastFailureTimestamp"),
            "lastFailureCode": scraper_metrics.get("lastFailureCode"),
            "portalDowntimeDetected": bool(scraper_metrics.get("portalDowntimeDetected", False)),
            "consecutiveNetworkFailures": int(scraper_metrics.get("consecutiveNetworkFailures", 0)),
            "downtimeHeuristic": "Portal downtime is flagged when 3 or more consecutive network failures occur within a 10-minute window.",
            "topFailureCodes": scraper_metrics.get("topFailureCodes", []),
        },
        "featureUsage": {
            "syncAttendanceCount": int(feature_usage.get("syncAttendanceCount", 0)),
            "historyOpenCount": int(feature_usage.get("historyOpenCount", 0)),
            "marksOpenCount": int(feature_usage.get("marksOpenCount", 0)),
            "mostViewedSemester": feature_usage.get("mostViewedSemester"),
            "mostViewedSemesterLabel": feature_usage.get("mostViewedSemesterLabel"),
            "mostViewedSemesterCount": int(feature_usage.get("mostViewedSemesterCount", 0)),
            "totalSemesterInteractions": int(feature_usage.get("totalSemesterInteractions", 0)),
            "mailFacultyComposeOpenedCount": int(mail_faculty_usage.get("composeOpenedCount", 0)),
            "mailFacultySendConfirmedCount": int(mail_faculty_usage.get("sendConfirmedCount", 0)),
            "mailFacultyUniqueUsersCount": int(mail_faculty_usage.get("uniqueUsersCount", 0)),
            "mailFacultyTopSubjects": mail_faculty_usage.get("topSubjects", []),
            "nonWorkingPages": non_working_pages,
            "clientSideIssues": client_side_issues,
        },
    }


def get_feedback_log(
    limit: int = 50,
    query: str | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    status: str | None = None,
    sort: str = "latest",
) -> list[dict[str, str]]:
    return list_feedback(
        limit=limit,
        query=query,
        start_date=start_date,
        end_date=end_date,
        status=status,
        sort=sort,
    )


def set_feedback_status(feedback_id: str, status: str) -> dict[str, str] | None:
    return update_feedback_status(feedback_id=feedback_id, status=status)
