import logging

from fastapi import APIRouter
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse

from models.schemas import (
    ApiResponse,
    StudyMeEventRequest,
    StudyMeImportanceQueryRequest,
    StudyMeLessonImportantToggleRequest,
    StudyMeTopicImportantToggleRequest,
)
from services.studyme_event_service import record_studyme_event
from services.studyme_importance_service import (
    fetch_subject_importance,
    toggle_lesson_importance,
    toggle_topic_importance,
)

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


@router.post("/importance/query", response_model=ApiResponse)
async def studyme_importance_query(payload: StudyMeImportanceQueryRequest):
    try:
        data = await run_in_threadpool(
            fetch_subject_importance,
            token=payload.token,
            subject_id=payload.subject_id,
            lesson_ids=payload.lesson_ids,
            topic_ids=payload.topic_ids,
        )
        return ApiResponse(status="success", message="StudyMe importance fetched", data=data)
    except PermissionError as exc:
        return JSONResponse(
            status_code=401,
            content={"status": "error", "message": str(exc)},
        )
    except ValueError as exc:
        return JSONResponse(
            status_code=422,
            content={"status": "error", "message": str(exc)},
        )
    except Exception:
        logger.exception("Failed to fetch StudyMe importance")
        return JSONResponse(
            status_code=500,
            content={"status": "error", "message": "Unable to fetch StudyMe importance"},
        )


@router.post("/importance/lesson/toggle", response_model=ApiResponse)
async def studyme_importance_lesson_toggle(payload: StudyMeLessonImportantToggleRequest):
    try:
        data = await run_in_threadpool(
            toggle_lesson_importance,
            token=payload.token,
            subject_id=payload.subject_id,
            subject_name=payload.subject_name,
            lesson_id=payload.lesson_id,
            lesson_name=payload.lesson_name,
        )
        return ApiResponse(status="success", message="Lesson importance updated", data=data)
    except PermissionError as exc:
        return JSONResponse(
            status_code=401,
            content={"status": "error", "message": str(exc)},
        )
    except ValueError as exc:
        return JSONResponse(
            status_code=422,
            content={"status": "error", "message": str(exc)},
        )
    except Exception:
        logger.exception("Failed to toggle lesson importance")
        return JSONResponse(
            status_code=500,
            content={"status": "error", "message": "Unable to update lesson importance"},
        )


@router.post("/importance/topic/toggle", response_model=ApiResponse)
async def studyme_importance_topic_toggle(payload: StudyMeTopicImportantToggleRequest):
    try:
        data = await run_in_threadpool(
            toggle_topic_importance,
            token=payload.token,
            subject_id=payload.subject_id,
            subject_name=payload.subject_name,
            lesson_id=payload.lesson_id,
            lesson_name=payload.lesson_name,
            topic_id=payload.topic_id,
            topic_name=payload.topic_name,
        )
        return ApiResponse(status="success", message="Topic importance updated", data=data)
    except PermissionError as exc:
        return JSONResponse(
            status_code=401,
            content={"status": "error", "message": str(exc)},
        )
    except ValueError as exc:
        return JSONResponse(
            status_code=422,
            content={"status": "error", "message": str(exc)},
        )
    except Exception:
        logger.exception("Failed to toggle topic importance")
        return JSONResponse(
            status_code=500,
            content={"status": "error", "message": "Unable to update topic importance"},
        )
