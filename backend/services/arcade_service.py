from datetime import datetime, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from db.models.game_score import GameScore
from db.models.user import User


def submit_score(user_id: int, game_name: str, score: int, db_session: Session) -> dict:
    """Persist a new score and return the score, personal best, and rank."""
    new_record = GameScore(
        user_id=user_id,
        game_name=game_name,
        score=score,
        created_at=datetime.now(timezone.utc),
    )
    db_session.add(new_record)
    db_session.flush()

    # Personal best: max score for this user + game
    personal_best = (
        db_session.query(func.max(GameScore.score))
        .filter(GameScore.user_id == user_id, GameScore.game_name == game_name)
        .scalar()
    )

    # Rank: count of distinct users with a higher personal best + 1
    rank = _calculate_rank(user_id, game_name, personal_best, db_session)

    return {"score": score, "personal_best": personal_best, "rank": rank}


def get_leaderboard(game_name: str, db_session: Session, user_id: int | None = None) -> dict:
    """Return the top 50 leaderboard entries plus optional user_entry."""
    # Each user's highest score for the game
    user_best_subquery = (
        db_session.query(
            GameScore.user_id,
            func.max(GameScore.score).label("best_score"),
        )
        .filter(GameScore.game_name == game_name)
        .group_by(GameScore.user_id)
        .subquery()
    )

    # Join with users to get display_name, sort descending, limit 50
    results = (
        db_session.query(
            User.display_name,
            user_best_subquery.c.best_score,
            user_best_subquery.c.user_id,
        )
        .join(User, User.id == user_best_subquery.c.user_id)
        .order_by(user_best_subquery.c.best_score.desc())
        .limit(50)
        .all()
    )

    entries = []
    for idx, row in enumerate(results, start=1):
        entries.append({
            "rank": idx,
            "username": row.display_name or "Anonymous",
            "score": row.best_score,
        })

    # If user_id provided and user has scores, include their entry
    user_entry = None
    if user_id is not None:
        user_best = (
            db_session.query(func.max(GameScore.score))
            .filter(GameScore.user_id == user_id, GameScore.game_name == game_name)
            .scalar()
        )
        if user_best is not None:
            user_rank = _calculate_rank(user_id, game_name, user_best, db_session)
            user_display_name = (
                db_session.query(User.display_name)
                .filter(User.id == user_id)
                .scalar()
            ) or "Anonymous"
            user_entry = {
                "rank": user_rank,
                "username": user_display_name,
                "score": user_best,
            }

    return {"entries": entries, "user_entry": user_entry, "metadata": {}}


def get_personal_best(user_id: int, game_name: str, db_session: Session) -> dict | None:
    """Return the user's personal best and rank, or None if no scores exist."""
    best_score = (
        db_session.query(func.max(GameScore.score))
        .filter(GameScore.user_id == user_id, GameScore.game_name == game_name)
        .scalar()
    )

    if best_score is None:
        return None

    rank = _calculate_rank(user_id, game_name, best_score, db_session)
    return {"score": best_score, "rank": rank}


def _calculate_rank(user_id: int, game_name: str, user_best: int, db_session: Session) -> int:
    """Calculate rank as count of distinct users with a higher personal best + 1."""
    # Subquery: each user's max score for the game
    user_bests = (
        db_session.query(
            GameScore.user_id,
            func.max(GameScore.score).label("best_score"),
        )
        .filter(GameScore.game_name == game_name)
        .group_by(GameScore.user_id)
        .subquery()
    )

    # Count distinct users whose best score is strictly higher
    higher_count = (
        db_session.query(func.count(user_bests.c.user_id))
        .filter(
            user_bests.c.best_score > user_best,
            user_bests.c.user_id != user_id,
        )
        .scalar()
    )

    return (higher_count or 0) + 1
