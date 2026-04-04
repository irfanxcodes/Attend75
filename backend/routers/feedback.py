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
        entry = await run_in_threadpool(submit_feedback, payload.message)
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
