from fastapi import APIRouter
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse

from models.schemas import ApiResponse, FeedbackRequest
from services.feedback_service import submit_feedback

router = APIRouter(tags=["feedback"])


@router.post("/feedback", response_model=ApiResponse)
async def feedback(payload: FeedbackRequest):
    try:
        await run_in_threadpool(submit_feedback, payload.message)
        return ApiResponse(status="success", message="Feedback submitted", data={})
    except ValueError as exc:
        return JSONResponse(
            status_code=422,
            content={"status": "error", "message": str(exc)},
        )
    except Exception:
        return JSONResponse(
            status_code=500,
            content={"status": "error", "message": "Unable to save feedback"},
        )
