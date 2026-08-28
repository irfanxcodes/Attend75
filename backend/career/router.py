"""
Career Compass Router

Endpoints:
  POST /career/roadmap          — personalised skill roadmap (LLM-powered)
  POST /career/explore          — list all career tracks for a degree
  POST /career/companies        — company directory (filtered by track)
  POST /career/profile/track    — save chosen career track
  POST /career/profile          — get student's saved career profile

All endpoints require a valid session token.
"""

import logging

from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool

from career.schemas import (
    CareerCompaniesRequest,
    CareerExploreRequest,
    CareerRoadmapRequest,
    CompaniesResponse,
    CompanyCard,
    SaveCareerTrackRequest,
)
from services.session_store import session_store

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/career", tags=["career"])


def _require_token(token: str) -> str:
    """Validate session token and return roll_number or raise 401."""
    record = session_store.get(token)
    if not record:
        raise HTTPException(status_code=401, detail="Invalid or expired session token")
    return record.roll_number


# ── POST /career/roadmap ──────────────────────────────────────────────────────

@router.post("/roadmap")
async def get_career_roadmap(body: CareerRoadmapRequest):
    """
    Generate a personalised career roadmap for the authenticated student.

    Uses the student's degree programme + current semester (resolved from
    StudentRegistry) plus any subjects passed by the frontend.

    LLM call: DOUBT_FALLBACK_CHAIN (fast models first).
    One call per request — no streaming.
    """
    _require_token(body.token)

    try:
        from career.service import generate_roadmap
        result = await run_in_threadpool(
            generate_roadmap,
            body.token,
            body.program,
            body.semester,
            body.subjects,
        )
        return {"status": "success", "data": result}
    except Exception as exc:
        logger.exception("[CareerRouter] Roadmap generation failed")
        raise HTTPException(status_code=500, detail="Failed to generate career roadmap") from exc


# ── POST /career/explore ──────────────────────────────────────────────────────

@router.post("/explore")
async def explore_career_tracks(body: CareerExploreRequest):
    """
    Return all career tracks scored for the student's degree profile.
    Does NOT make an LLM call — pure knowledge base lookup.
    Fast and cheap; safe to call on page load.
    """
    _require_token(body.token)

    from career.knowledge_base import score_tracks_for_profile
    from career.service import _resolve_student_profile

    try:
        profile = await run_in_threadpool(
            _resolve_student_profile, body.token, body.program, body.semester
        )
        ranked = await run_in_threadpool(
            score_tracks_for_profile, profile["program"], []
        )

        # Return lightweight track cards — no full skill/cert detail
        tracks_out = [
            {
                "slug": t["slug"],
                "label": t["label"],
                "description": t["description"],
                "entry_role": t["entry_role"],
                "salary_range_inr": t["salary_range_inr"],
                "demand_trend": t["demand_trend"],
                "timeline_months": t["timeline_months"],
                "fit_score": t["fit_score"],
                "top_skills_preview": t.get("top_skills", [])[:3],
                "hiring_companies_preview": t.get("hiring_companies", [])[:4],
            }
            for t in ranked
        ]

        return {
            "status": "success",
            "data": {
                "program": profile["program"],
                "semester": profile["semester"],
                "tracks": tracks_out,
            },
        }
    except Exception as exc:
        logger.exception("[CareerRouter] Explore tracks failed")
        raise HTTPException(status_code=500, detail="Failed to load career tracks") from exc


# ── POST /career/companies ────────────────────────────────────────────────────

@router.post("/companies")
async def get_companies(body: CareerCompaniesRequest):
    """
    Return company directory filtered by career track.
    Pure knowledge base — no LLM call.
    """
    _require_token(body.token)

    from career.knowledge_base import get_companies_for_track

    try:
        companies_raw = await run_in_threadpool(
            get_companies_for_track, body.track
        )

        companies_out = [
            CompanyCard(
                name=c["name"],
                sector=c["sector"],
                roles=c["roles"],
                selection_process=c["process"],
                package_range_inr=c["package"],
                tier=c["tier"],
                website=c.get("website"),
            )
            for c in companies_raw
        ]

        return CompaniesResponse(
            track=body.track,
            companies=companies_out,
            total=len(companies_out),
        )
    except Exception as exc:
        logger.exception("[CareerRouter] Companies lookup failed")
        raise HTTPException(status_code=500, detail="Failed to load company directory") from exc


# ── POST /career/profile/track ────────────────────────────────────────────────

@router.post("/profile/track")
async def save_track(body: SaveCareerTrackRequest):
    """Save the student's chosen career track."""
    _require_token(body.token)

    from career.service import save_chosen_track

    success = await run_in_threadpool(
        save_chosen_track, body.token, body.track_slug, body.track_label
    )
    if not success:
        raise HTTPException(status_code=500, detail="Failed to save career track")

    return {"status": "success", "message": "Track saved", "data": {"track_slug": body.track_slug}}


# ── POST /career/profile ──────────────────────────────────────────────────────

@router.post("/profile")
async def get_profile(token: str):
    """
    Retrieve the student's saved career profile.
    Returns null data if no profile saved yet — never 404.
    """
    _require_token(token)

    from career.service import get_career_profile

    profile = await run_in_threadpool(get_career_profile, token)
    return {
        "status": "success",
        "data": profile or {
            "roll_number": None,
            "chosen_track_slug": None,
            "chosen_track_label": None,
            "roadmap_generated_at": None,
        },
    }
