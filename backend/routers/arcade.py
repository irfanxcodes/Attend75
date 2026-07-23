"""Arcade Router — Score submission, leaderboard, and personal-best endpoints."""

import logging

from typing import Optional

from fastapi import APIRouter, Query
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse

from db.session import SessionLocal
from models.schemas import ScoreSubmitRequest
from services.session_store import session_store
from services.score_validator import REGISTERED_GAMES, ScoreValidationError, validate_score
from services.arcade_service import get_leaderboard, get_personal_best, submit_score

router = APIRouter(prefix="/api/arcade", tags=["arcade"])
logger = logging.getLogger(__name__)


def _resolve_user_id(roll_number: str, display_name: str | None, db_session) -> int:
    """Resolve a user_id from the users table given a roll_number.

    Looks up via portal_credentials first. If no linked user exists,
    checks for an existing arcade fallback user. Merges if both exist.
    """
    from db.models.portal_credential import PortalCredential
    from db.models.user import User

    # Try finding via portal_credentials (Google-linked user)
    credential = (
        db_session.query(PortalCredential)
        .filter(PortalCredential.roll_number == roll_number)
        .first()
    )

    # Check for existing arcade fallback user
    fallback_user = (
        db_session.query(User)
        .filter(User.firebase_uid == f"portal:{roll_number}")
        .first()
    )

    if credential is not None:
        # If both exist, migrate arcade scores from fallback to the real user and remove fallback
        if fallback_user is not None and fallback_user.id != credential.user_id:
            from db.models.game_score import GameScore
            db_session.query(GameScore).filter(
                GameScore.user_id == fallback_user.id
            ).update({"user_id": credential.user_id})
            db_session.delete(fallback_user)
            db_session.flush()
        return credential.user_id

    if fallback_user is not None:
        # Update display name if we have a better one now
        if display_name and fallback_user.display_name == roll_number:
            fallback_user.display_name = display_name
            db_session.flush()
        return fallback_user.id

    # Create a minimal user record for this portal session user
    new_user = User(
        firebase_uid=f"portal:{roll_number}",
        display_name=display_name or roll_number,
    )
    db_session.add(new_user)
    db_session.flush()
    return new_user.id


def _submit_score_sync(roll_number: str, display_name: str | None, game_name: str, score: int) -> dict:
    """Synchronous helper that runs the full score submission flow in a DB session."""
    db = SessionLocal()
    try:
        user_id = _resolve_user_id(roll_number, display_name, db)
        validate_score(user_id, game_name, score, db)
        result = submit_score(user_id, game_name, score, db)
        db.commit()
        return result
    except ScoreValidationError:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


@router.post("/{game}/score")
async def post_score(game: str, payload: ScoreSubmitRequest):
    """Submit a game score. Validates session, score rules, then persists."""
    # 1. Validate session token
    record = session_store.get(payload.token)
    if record is None:
        return JSONResponse(
            status_code=401,
            content={
                "status": "error",
                "error_code": "SESSION_EXPIRED",
                "message": "Your session has expired. Please log in again.",
            },
        )

    # 2. Run score validation + submission in threadpool (sync DB ops)
    try:
        result = await run_in_threadpool(
            _submit_score_sync,
            record.roll_number,
            record.user_name,
            game,
            payload.score,
        )
        return {"status": "success", "data": result}
    except ScoreValidationError as exc:
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "status": "error",
                "error_code": exc.error_code,
                "message": exc.message,
            },
        )
    except Exception:
        logger.exception("Unexpected error submitting score for game=%s", game)
        return JSONResponse(
            status_code=500,
            content={
                "status": "error",
                "error_code": "INTERNAL_ERROR",
                "message": "Unable to submit score. Please try again.",
            },
        )


def _get_leaderboard_sync(game_name: str, user_id: int | None) -> dict:
    """Synchronous helper that fetches the leaderboard in a DB session."""
    db = SessionLocal()
    try:
        result = get_leaderboard(game_name, db, user_id=user_id)
        return result
    finally:
        db.close()


def _get_personal_best_sync(user_id: int, game_name: str) -> dict | None:
    """Synchronous helper that fetches the personal best in a DB session."""
    db = SessionLocal()
    try:
        result = get_personal_best(user_id, game_name, db)
        return result
    finally:
        db.close()


def _resolve_user_id_readonly(roll_number: str, db_session) -> int | None:
    """Resolve a user_id without creating a new user. Returns None if not found."""
    from db.models.portal_credential import PortalCredential
    from db.models.user import User

    # Try finding via portal_credentials
    credential = (
        db_session.query(PortalCredential)
        .filter(PortalCredential.roll_number == roll_number)
        .first()
    )
    if credential is not None:
        return credential.user_id

    # Check if a user already exists with roll_number as firebase_uid (arcade fallback)
    existing_user = (
        db_session.query(User)
        .filter(User.firebase_uid == f"portal:{roll_number}")
        .first()
    )
    if existing_user is not None:
        return existing_user.id

    return None


def _resolve_user_id_for_leaderboard(roll_number: str) -> int | None:
    """Resolve user_id in a read-only DB session for leaderboard requests."""
    db = SessionLocal()
    try:
        return _resolve_user_id_readonly(roll_number, db)
    finally:
        db.close()


def _resolve_user_id_for_personal_best(roll_number: str) -> int | None:
    """Resolve user_id in a read-only DB session for personal-best requests."""
    db = SessionLocal()
    try:
        return _resolve_user_id_readonly(roll_number, db)
    finally:
        db.close()


@router.get("/{game}/leaderboard")
async def get_game_leaderboard(game: str, token: Optional[str] = Query(None)):
    """Get the leaderboard for a game. Optionally include user's entry if token provided."""
    # 1. Check if game is registered
    if game not in REGISTERED_GAMES:
        return JSONResponse(
            status_code=404,
            content={
                "status": "error",
                "error_code": "GAME_NOT_FOUND",
                "message": f"Game '{game}' is not registered.",
            },
        )

    # 2. If token provided, validate and resolve user_id
    user_id = None
    if token is not None:
        record = session_store.get(token)
        if record is not None:
            # Resolve user_id in threadpool (sync DB operation)
            user_id = await run_in_threadpool(
                _resolve_user_id_for_leaderboard, record.roll_number
            )

    # 3. Fetch leaderboard in threadpool
    try:
        result = await run_in_threadpool(_get_leaderboard_sync, game, user_id)
        return {"status": "success", "data": result}
    except Exception:
        logger.exception("Unexpected error fetching leaderboard for game=%s", game)
        return JSONResponse(
            status_code=500,
            content={
                "status": "error",
                "error_code": "INTERNAL_ERROR",
                "message": "Unable to load leaderboard. Please try again.",
            },
        )


@router.get("/{game}/personal-best")
async def get_game_personal_best(game: str, token: str = Query(...)):
    """Get the user's personal best for a game. Requires valid session token."""
    # 1. Validate token
    record = session_store.get(token)
    if record is None:
        return JSONResponse(
            status_code=401,
            content={
                "status": "error",
                "error_code": "SESSION_EXPIRED",
                "message": "Your session has expired. Please log in again.",
            },
        )

    # 2. Check if game is registered
    if game not in REGISTERED_GAMES:
        return JSONResponse(
            status_code=404,
            content={
                "status": "error",
                "error_code": "GAME_NOT_FOUND",
                "message": f"Game '{game}' is not registered.",
            },
        )

    # 3. Resolve user_id
    user_id = await run_in_threadpool(
        _resolve_user_id_for_personal_best, record.roll_number
    )

    if user_id is None:
        # User has never submitted a score, so no personal best exists
        return {"status": "success", "data": None}

    # 4. Fetch personal best in threadpool
    try:
        result = await run_in_threadpool(_get_personal_best_sync, user_id, game)
        return {"status": "success", "data": result}
    except Exception:
        logger.exception("Unexpected error fetching personal best for game=%s", game)
        return JSONResponse(
            status_code=500,
            content={
                "status": "error",
                "error_code": "INTERNAL_ERROR",
                "message": "Unable to load personal best. Please try again.",
            },
        )
