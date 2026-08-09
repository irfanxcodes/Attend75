"""Face Rater Router — Anonymous leaderboard score submission and retrieval."""

import logging
import re
import uuid

from fastapi import APIRouter
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse
from pydantic import BaseModel, field_validator

from db.session import SessionLocal

router = APIRouter(prefix="/api/face-rater", tags=["face-rater"])
logger = logging.getLogger(__name__)

VALID_TIERS = {
    "Gigachad",
    "Halo Tier",
    "Looksmaxxed",
    "Above Average",
    "High Tier Normie",
    "Normie",
    "Lookspilled",
    "Needs the Grind",
}

UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)


class ScoreSubmitRequest(BaseModel):
    anonymous_id: str
    score: float
    tier: str
    username: str | None = None   # friendly display name, optional

    @field_validator("anonymous_id")
    @classmethod
    def validate_uuid(cls, v: str) -> str:
        if not UUID_RE.match(v):
            raise ValueError("anonymous_id must be a valid UUID v4")
        return v

    @field_validator("score")
    @classmethod
    def validate_score(cls, v: float) -> float:
        if not (0.0 <= v <= 10.0):
            raise ValueError("score must be in [0.0, 10.0]")
        return round(v, 1)

    @field_validator("tier")
    @classmethod
    def validate_tier(cls, v: str) -> str:
        if v not in VALID_TIERS:
            raise ValueError(f"tier must be one of: {', '.join(sorted(VALID_TIERS))}")
        return v

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str | None) -> str | None:
        if v is None:
            return v
        # Only allow alphanumeric + digits, max 32 chars
        cleaned = re.sub(r"[^A-Za-z0-9]", "", v)[:32]
        return cleaned or None


def _submit_score_sync(anonymous_id: str, score: float, tier: str, username: str | None) -> dict:
    from db.models.face_rater_score import FaceRaterScore

    db = SessionLocal()
    try:
        # Upsert: update existing row for this anonymous_id, or insert new one.
        # This prevents duplicate entries when the same user scans multiple times.
        existing = (
            db.query(FaceRaterScore)
            .filter(FaceRaterScore.anonymous_id == anonymous_id)
            .first()
        )
        if existing:
            existing.score = score
            existing.tier = tier
            if username:
                existing.username = username
            db.commit()
            db.refresh(existing)
            entry = existing
        else:
            entry = FaceRaterScore(
                anonymous_id=anonymous_id,
                score=score,
                tier=tier,
                username=username,
            )
            db.add(entry)
            db.commit()
            db.refresh(entry)
        return {"id": entry.id, "score": entry.score, "tier": entry.tier, "username": entry.username}
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def _get_leaderboard_sync() -> list[dict]:
    from db.models.face_rater_score import FaceRaterScore
    from sqlalchemy import func

    db = SessionLocal()
    try:
        # Get the best (max) score per anonymous_id to handle any legacy duplicates
        subq = (
            db.query(
                FaceRaterScore.anonymous_id,
                func.max(FaceRaterScore.score).label("best_score"),
            )
            .group_by(FaceRaterScore.anonymous_id)
            .subquery()
        )
        rows = (
            db.query(FaceRaterScore)
            .join(
                subq,
                (FaceRaterScore.anonymous_id == subq.c.anonymous_id)
                & (FaceRaterScore.score == subq.c.best_score),
            )
            .order_by(FaceRaterScore.score.desc())
            .limit(10)
            .all()
        )
        return [
            {
                "rank": idx + 1,
                "anonymous_id_short": row.anonymous_id[:8],
                "username": row.username,
                "score": row.score,
                "tier": row.tier,
            }
            for idx, row in enumerate(rows)
        ]
    finally:
        db.close()


@router.post("/score")
async def submit_score(payload: ScoreSubmitRequest):
    """Submit an anonymous face rater score to the leaderboard."""
    try:
        result = await run_in_threadpool(
            _submit_score_sync,
            payload.anonymous_id,
            payload.score,
            payload.tier,
            payload.username,
        )
        return {"status": "success", "data": result}
    except Exception:
        logger.exception("Unexpected error submitting face rater score")
        return JSONResponse(
            status_code=500,
            content={
                "status": "error",
                "error_code": "INTERNAL_ERROR",
                "message": "Unable to submit score. Please try again.",
            },
        )


@router.get("/leaderboard")
async def get_leaderboard():
    """Get the top 10 anonymous face rater leaderboard entries."""
    try:
        entries = await run_in_threadpool(_get_leaderboard_sync)
        return {"status": "success", "data": entries}
    except Exception:
        logger.exception("Unexpected error fetching face rater leaderboard")
        return JSONResponse(
            status_code=500,
            content={
                "status": "error",
                "error_code": "INTERNAL_ERROR",
                "message": "Unable to load leaderboard. Please try again.",
            },
        )
