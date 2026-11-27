"""
Premium Router — Waitlist signup and status check.
No payment integration; premium is not currently active.
"""
import logging
from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse
from models.schemas import ApiResponse
from services.session_store import session_store

router = APIRouter(prefix="/premium", tags=["premium"])
logger = logging.getLogger(__name__)


# GET /premium/status?token=...
@router.get("/status", response_model=ApiResponse)
async def get_status(token: str = Query(..., description="Session token")):
    record = session_store.get(token)
    if record is None:
        return JSONResponse(status_code=401, content={"status": "error", "message": "Session expired"})
    # Premium is not currently active; always return not subscribed
    data = {
        "is_premium": False,
        "status": "none",
        "plan": None,
        "waitlisted": False,
    }
    # Check waitlist status
    try:
        from db.models.premium_waitlist import PremiumWaitlist
        from db.session import SessionLocal
        with SessionLocal() as session:
            existing = (
                session.query(PremiumWaitlist)
                .filter(PremiumWaitlist.roll_number == record.roll_number)
                .first()
            )
            if existing:
                data["waitlisted"] = True
    except Exception:
        pass
    return ApiResponse(status="success", message="Premium status fetched", data=data)


# POST /premium/waitlist
@router.post("/waitlist", response_model=ApiResponse)
async def join_waitlist(payload: dict):
    from db.models.premium_waitlist import PremiumWaitlist
    from db.session import SessionLocal

    token = (payload.get("token") or "").strip()
    record = session_store.get(token)
    if record is None:
        return JSONResponse(status_code=401, content={"status": "error", "message": "Session expired"})

    roll_number = record.roll_number
    with SessionLocal() as session:
        existing = (
            session.query(PremiumWaitlist)
            .filter(PremiumWaitlist.roll_number == roll_number)
            .first()
        )
        if not existing:
            entry = PremiumWaitlist(roll_number=roll_number)
            session.add(entry)
            session.commit()

    return ApiResponse(status="success", message="Added to waitlist", data={"waitlisted": True})
