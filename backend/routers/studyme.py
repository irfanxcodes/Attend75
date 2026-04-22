import logging

from fastapi import APIRouter
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse

from models.schemas import ApiResponse, StudyMeEventRequest
from services.studyme_event_service import record_studyme_event

router = APIRouter(prefix="/studyme", tags=["studyme"])
logger = logging.getLogger(__name__)


@router.post("/events", response_model=ApiResponse)
async def studyme_event_track(payload: StudyMeEventRequest):
    try:
        data = await run_in_threadpool(
            record_studyme_event,
            event_type=payload.event_type,
            token=payload.token,
            user_name=payload.user_name,
            subject_name=payload.subject_name,
            lesson_name=payload.lesson_name,
            topic_name=payload.topic_name,
            event_date=payload.event_date,
        )
        return ApiResponse(status="success", message="StudyMe event tracked", data=data)
    except ValueError as exc:
        return JSONResponse(
            status_code=422,
            content={"status": "error", "message": str(exc)},
        )
    except Exception:
        logger.exception("Failed to track StudyMe event")
        return JSONResponse(
            status_code=500,
            content={"status": "error", "message": "Unable to track StudyMe event"},
        )
