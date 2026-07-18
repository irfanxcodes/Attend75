"""
Premium Router — Subscription status, PhonePe initiation/webhook/cancel, payment history.
"""

import logging

from fastapi import APIRouter, Query, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse

from models.schemas import ApiResponse
from services import premium_service
from services.session_store import session_store

router = APIRouter(prefix="/premium", tags=["premium"])
logger = logging.getLogger(__name__)


# GET /premium/status?token=...
@router.get("/status", response_model=ApiResponse)
async def get_status(token: str = Query(..., description="Session token")):
    record = session_store.get(token)
    if record is None:
        return JSONResponse(status_code=401, content={"status": "error", "message": "Session expired"})

    data = await run_in_threadpool(premium_service.get_subscription_status, record.roll_number)
    return ApiResponse(status="success", message="Premium status fetched", data=data)


# POST /premium/subscribe
@router.post("/subscribe", response_model=ApiResponse)
async def subscribe(payload: dict):
    from services.phonepe_service import initiate_subscription, PhonePeError

    token = (payload.get("token") or "").strip()
    record = session_store.get(token)
    if record is None:
        return JSONResponse(status_code=401, content={"status": "error", "message": "Session expired"})

    try:
        result = await run_in_threadpool(initiate_subscription, record.roll_number)
        return ApiResponse(status="success", message="Subscription initiated", data=result)
    except PhonePeError as exc:
        logger.warning("PhonePe initiation failed for %s: %s", record.roll_number, exc)
        return JSONResponse(
            status_code=502,
            content={"status": "error", "message": "Payment gateway unavailable. Please try again in a few minutes."},
        )
    except Exception:
        logger.exception("Unexpected error initiating subscription")
        return JSONResponse(status_code=500, content={"status": "error", "message": "Unable to initiate subscription"})


# POST /premium/cancel
@router.post("/cancel", response_model=ApiResponse)
async def cancel(payload: dict):
    from services.phonepe_service import cancel_subscription, PhonePeError

    token = (payload.get("token") or "").strip()
    record = session_store.get(token)
    if record is None:
        return JSONResponse(status_code=401, content={"status": "error", "message": "Session expired"})

    try:
        result = await run_in_threadpool(cancel_subscription, record.roll_number)
        return ApiResponse(status="success", message="Subscription cancelled", data=result)
    except PhonePeError as exc:
        logger.warning("PhonePe cancellation failed for %s: %s", record.roll_number, exc)
        return JSONResponse(
            status_code=502,
            content={"status": "error", "message": "Payment gateway unavailable. Please try again in a few minutes."},
        )
    except Exception:
        logger.exception("Unexpected error cancelling subscription")
        return JSONResponse(status_code=500, content={"status": "error", "message": "Unable to cancel subscription"})


# POST /premium/webhook — PhonePe callback (no session token; signature-verified)
@router.post("/webhook")
async def webhook(request: Request):
    from services.phonepe_service import handle_webhook

    raw_body = await request.body()
    x_verify = request.headers.get("X-VERIFY", "")

    try:
        result = await run_in_threadpool(handle_webhook, raw_body, x_verify)

        if result.get("status") == "rejected":
            return JSONResponse(status_code=400, content=result)

        return JSONResponse(status_code=200, content=result)
    except Exception:
        logger.exception("Webhook processing failed")
        return JSONResponse(status_code=500, content={"status": "error"})


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


# GET /premium/transactions?token=...
@router.get("/transactions", response_model=ApiResponse)
async def get_transactions(token: str = Query(..., description="Session token")):
    from db.models.payment_transaction import PaymentTransaction
    from db.session import SessionLocal

    record = session_store.get(token)
    if record is None:
        return JSONResponse(status_code=401, content={"status": "error", "message": "Session expired"})

    with SessionLocal() as session:
        rows = (
            session.query(PaymentTransaction)
            .filter(PaymentTransaction.roll_number == record.roll_number)
            .order_by(PaymentTransaction.created_at.desc())
            .limit(50)
            .all()
        )
        transactions = [
            {
                "transactionId": r.transaction_id,
                "amount": r.amount,
                "status": r.status,
                "createdAt": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ]

    return ApiResponse(status="success", message="Transactions fetched", data={"transactions": transactions})
