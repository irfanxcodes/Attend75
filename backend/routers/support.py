"""
Support Router — Track contribution events and display stats.
"""
import logging
from fastapi import APIRouter, Query
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse
from models.schemas import ApiResponse
from services.session_store import session_store
from services import support_service

router = APIRouter(prefix="/support", tags=["support"])
logger = logging.getLogger(__name__)


# GET /support/stats
@router.get("/stats", response_model=ApiResponse)
async def get_stats():
    """Get contribution stats for display on support cards (no auth required)."""
    try:
        stats = await run_in_threadpool(support_service.get_contribution_stats)
        return ApiResponse(status="success", message="Stats fetched", data=stats)
    except Exception:
        logger.exception("Failed to fetch support stats")
        return JSONResponse(status_code=500, content={"status": "error", "message": "Unable to fetch stats"})


# POST /support/track
@router.post("/track", response_model=ApiResponse)
async def track_event(payload: dict):
    """
    Track a contribution-related event (view, click_amount, submit).
    Payload: { token, card_style, action_type, amount?, utr_reference? }
    """
    token = (payload.get("token") or "").strip()
    record = session_store.get(token)
    if record is None:
        return JSONResponse(status_code=401, content={"status": "error", "message": "Session expired"})
    
    card_style = (payload.get("card_style") or "").strip()
    action_type = (payload.get("action_type") or "").strip()
    amount = payload.get("amount")
    utr_reference = (payload.get("utr_reference") or "").strip() or None
    
    if not card_style or not action_type:
        return JSONResponse(status_code=422, content={"status": "error", "message": "card_style and action_type required"})
    
    try:
        result = await run_in_threadpool(
            support_service.track_contribution_event,
            record.roll_number,
            card_style,
            action_type,
            amount,
            utr_reference
        )
        return ApiResponse(status="success", message="Event tracked", data=result)
    except Exception:
        logger.exception("Failed to track support event")
        return JSONResponse(status_code=500, content={"status": "error", "message": "Unable to track event"})


# POST /support/thanked
@router.post("/thanked", response_model=ApiResponse)
async def mark_thanked(payload: dict):
    """
    Mark the user as having seen the thank you modal.
    Payload: { token }
    """
    token = (payload.get("token") or "").strip()
    record = session_store.get(token)
    if record is None:
        return JSONResponse(status_code=401, content={"status": "error", "message": "Session expired"})
    
    try:
        updated = await run_in_threadpool(support_service.mark_as_thanked, record.roll_number)
        return ApiResponse(
            status="success",
            message="Marked as thanked" if updated else "No pending contribution found",
            data={"updated": updated}
        )
    except Exception:
        logger.exception("Failed to mark as thanked")
        return JSONResponse(status_code=500, content={"status": "error", "message": "Unable to mark as thanked"})


# GET /support/check-thanked?token=...
@router.get("/check-thanked", response_model=ApiResponse)
async def check_thanked(token: str = Query(..., description="Session token")):
    """Check if the user has already been thanked (to avoid showing modal again)."""
    record = session_store.get(token)
    if record is None:
        return JSONResponse(status_code=401, content={"status": "error", "message": "Session expired"})
    
    try:
        seen = await run_in_threadpool(support_service.has_user_seen_thank_you, record.roll_number)
        return ApiResponse(status="success", message="Check complete", data={"has_seen_thank_you": seen})
    except Exception:
        logger.exception("Failed to check thank you status")
        return JSONResponse(status_code=500, content={"status": "error", "message": "Unable to check status"})
