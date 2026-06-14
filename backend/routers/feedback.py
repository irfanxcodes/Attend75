import logging

from fastapi import APIRouter
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse

from models.schemas import ApiResponse, FeedbackRequest
from services.feedback_service import submit_feedback

router = APIRouter(tags=["feedback"])
logger = logging.getLogger(__name__)


@router.post("/feedback", response_model=ApiResponse)
async def feedback(payload: FeedbackRequest):
    try:
        entry = await run_in_threadpool(submit_feedback, payload.message, payload.user_name)
        return ApiResponse(
            status="success",
            message="Feedback submitted",
            data={"feedback_id": entry.get("id"), "timestamp": entry.get("timestamp")},
        )
    except ValueError as exc:
        logger.warning("Feedback rejected: %s", str(exc))
        return JSONResponse(
            status_code=422,
            content={"status": "error", "message": str(exc)},
        )
    except Exception:
        logger.exception("Unexpected feedback persistence error")
        return JSONResponse(
            status_code=500,
            content={"status": "error", "error_code": "FEEDBACK_SAVE_FAILED", "message": "Unable to save feedback"},
        )


@router.post("/college-interest", response_model=ApiResponse)
async def college_interest(payload: dict):
    from db.models.college_interest import CollegeInterest
    from db.session import SessionLocal

    try:
        name = str(payload.get("name") or "").strip()
        email = str(payload.get("email") or "").strip()
        college_name = str(payload.get("college_name") or "").strip()
        message = str(payload.get("message") or "").strip() or None

        if not name or not email or not college_name:
            return JSONResponse(status_code=422, content={"status": "error", "message": "Name, email, and college name are required."})

        with SessionLocal() as session:
            entry = CollegeInterest(name=name, email=email, college_name=college_name, message=message)
            session.add(entry)
            session.commit()

        return ApiResponse(status="success", message="College interest submitted", data={"submitted": True})
    except Exception:
        logger.exception("College interest submission error")
        return JSONResponse(status_code=500, content={"status": "error", "message": "Unable to submit. Please try again."})
