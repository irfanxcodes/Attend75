"""Score validation logic for the Arcade feature.

Validates score submissions against game existence, value thresholds,
duplicate timing windows, and hourly rate limits.
"""

from datetime import datetime, timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

from db.models.game_score import GameScore


# --- Configuration ---

REGISTERED_GAMES: set[str] = {"flappy", "pacman", "stack", "helix"}

GAME_MAX_SCORES: dict[str, int] = {
    "flappy": 999,
    "pacman": 5000,
    "stack": 200,
    "helix": 200,
}

DUPLICATE_WINDOW_SECONDS: int = 5
HOURLY_RATE_LIMIT: int = 60


# --- Exception ---


class ScoreValidationError(Exception):
    """Raised when a score submission fails validation."""

    def __init__(self, status_code: int, error_code: str, message: str) -> None:
        self.status_code = status_code
        self.error_code = error_code
        self.message = message
        super().__init__(message)


# --- Validator ---


def validate_score(user_id: int, game_name: str, score: int, db_session: Session) -> None:
    """Validate a score submission. Raises ScoreValidationError on failure.

    Validation priority:
      1. Game existence → 404 GAME_NOT_FOUND
      2. Score threshold / non-positive → 422 INVALID_SCORE or SCORE_TOO_HIGH
      3. Duplicate timing (same user+game within 5s) → 429 DUPLICATE_SUBMISSION
      4. Hourly rate limit (60 per user per game per hour) → 429 RATE_LIMIT_EXCEEDED
    """
    # 1. Game existence
    if game_name not in REGISTERED_GAMES:
        raise ScoreValidationError(
            status_code=404,
            error_code="GAME_NOT_FOUND",
            message=f"Game '{game_name}' is not registered.",
        )

    # 2. Score threshold / non-positive
    if score <= 0:
        raise ScoreValidationError(
            status_code=422,
            error_code="INVALID_SCORE",
            message="Score must be a positive integer.",
        )

    max_score = GAME_MAX_SCORES.get(game_name)
    if max_score is not None and score > max_score:
        raise ScoreValidationError(
            status_code=422,
            error_code="SCORE_TOO_HIGH",
            message=f"Score {score} exceeds the maximum allowed ({max_score}) for '{game_name}'.",
        )

    # 3. Duplicate timing check
    duplicate_cutoff = datetime.utcnow() - timedelta(seconds=DUPLICATE_WINDOW_SECONDS)
    duplicate_count = (
        db_session.query(func.count(GameScore.id))
        .filter(
            GameScore.user_id == user_id,
            GameScore.game_name == game_name,
            GameScore.created_at >= duplicate_cutoff,
        )
        .scalar()
    )
    if duplicate_count and duplicate_count > 0:
        raise ScoreValidationError(
            status_code=429,
            error_code="DUPLICATE_SUBMISSION",
            message="A score was already submitted within the last 5 seconds. Please wait.",
        )

    # 4. Hourly rate limit check
    hourly_cutoff = datetime.utcnow() - timedelta(hours=1)
    hourly_count = (
        db_session.query(func.count(GameScore.id))
        .filter(
            GameScore.user_id == user_id,
            GameScore.game_name == game_name,
            GameScore.created_at >= hourly_cutoff,
        )
        .scalar()
    )
    if hourly_count and hourly_count >= HOURLY_RATE_LIMIT:
        raise ScoreValidationError(
            status_code=429,
            error_code="RATE_LIMIT_EXCEEDED",
            message=f"Rate limit exceeded. Maximum {HOURLY_RATE_LIMIT} submissions per hour.",
        )
