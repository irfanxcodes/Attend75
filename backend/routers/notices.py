"""
Notice Board API Router
"""

import logging

from fastapi import APIRouter, Query
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse, StreamingResponse

from models.schemas import ApiResponse
from pydantic import BaseModel, Field
from services.notice_scheduler import notice_scheduler
from services.notice_service import (
    dismiss_notice,
    fetch_notices_for_user,
    get_notice_detail,
    get_notice_stats,
    toggle_bookmark,
)
from services.session_store import session_store

router = APIRouter(prefix="/notices", tags=["notices"])
logger = logging.getLogger(__name__)


class NoticeTokenRequest(BaseModel):
    token: str = Field(..., description="Session token")


# GET /notices?token=...&limit=10&offset=0&category=Exam&include_dismissed=false&q=
@router.get("", response_model=ApiResponse)
async def list_notices(
    token: str = Query(..., description="Session token"),
    limit: int = Query(default=10, ge=1, le=50),
    offset: int = Query(default=0, ge=0),
    category: str | None = Query(default=None),
    include_dismissed: bool = Query(default=False),
    q: str | None = Query(default=None),
):
    # Reserve "q" param for future search — return 501 if used
    if q:
        return JSONResponse(status_code=501, content={"status": "error", "message": "Search is not yet implemented"})

    try:
        data = await run_in_threadpool(
            fetch_notices_for_user, token, limit, offset, category, include_dismissed
        )
        return ApiResponse(status="success", message="Notices fetched", data=data)
    except PermissionError:
        return JSONResponse(status_code=401, content={"status": "error", "message": "Session expired"})
    except Exception:
        logger.exception("Failed to fetch notices")
        return JSONResponse(status_code=500, content={"status": "error", "message": "Unable to load notices"})


# GET /notices/stats?token=...
@router.get("/stats", response_model=ApiResponse)
async def notices_stats(token: str = Query(..., description="Session token")):
    try:
        data = await run_in_threadpool(get_notice_stats, token)
        return ApiResponse(status="success", message="Notice stats fetched", data=data)
    except PermissionError:
        return JSONResponse(status_code=401, content={"status": "error", "message": "Session expired"})
    except Exception:
        logger.exception("Failed to fetch notice stats")
        return JSONResponse(status_code=500, content={"status": "error", "message": "Unable to load notice stats"})


# GET /notices/timetable?token=...
@router.get("/timetable", response_model=ApiResponse)
async def get_timetable(token: str = Query(..., description="Session token")):
    """Get personalized timetable for the student."""
    from services.timetable_service import get_personalized_timetable

    try:
        data = await run_in_threadpool(get_personalized_timetable, token)
        if data is None:
            return ApiResponse(status="success", message="No timetable available", data={"schedule": None})
        return ApiResponse(status="success", message="Timetable fetched", data=data)
    except PermissionError:
        return JSONResponse(status_code=401, content={"status": "error", "message": "Session expired"})
    except Exception:
        logger.exception("Failed to fetch timetable")
        return JSONResponse(status_code=500, content={"status": "error", "message": "Unable to load timetable"})


# GET /notices/{id}?token=...
@router.get("/{notice_id}", response_model=ApiResponse)
async def notice_detail(notice_id: int, token: str = Query(..., description="Session token")):
    try:
        data = await run_in_threadpool(get_notice_detail, token, notice_id)
        if data is None:
            return JSONResponse(status_code=404, content={"status": "error", "message": "Notice not found"})
        return ApiResponse(status="success", message="Notice detail fetched", data=data)
    except PermissionError:
        return JSONResponse(status_code=401, content={"status": "error", "message": "Session expired"})
    except Exception:
        logger.exception("Failed to fetch notice detail")
        return JSONResponse(status_code=500, content={"status": "error", "message": "Unable to load notice"})


# GET /notices/{id}/pdf?token=...
@router.get("/{notice_id}/pdf")
async def notice_pdf_proxy(notice_id: int, token: str = Query(..., description="Session token")):
    """Stream PDF from portal without exposing credentials."""
    record = session_store.get(token)
    if record is None:
        return JSONResponse(status_code=401, content={"status": "error", "message": "Session expired"})

    from db.models.notice import Notice
    from db.session import SessionLocal

    with SessionLocal() as session:
        notice = session.query(Notice).filter(Notice.notice_id == notice_id).one_or_none()
        if not notice:
            return JSONResponse(status_code=404, content={"status": "error", "message": "Notice not found"})
        pdf_url_path = notice.pdf_url_path

    # Stream PDF from portal
    try:
        scraper = record.scraper
        pdf_url = f"{scraper.base_url.rstrip('/')}/{pdf_url_path}"

        with record.scraper_lock:
            response = scraper.session.get(pdf_url, timeout=30, stream=True)

        if response.status_code != 200:
            return JSONResponse(status_code=404, content={"status": "error", "message": "PDF not available on portal"})

        def generate():
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    yield chunk

        return StreamingResponse(
            generate(),
            media_type="application/pdf",
            headers={"Content-Disposition": f"inline; filename=notice_{notice_id}.pdf"},
        )
    except Exception:
        logger.exception("Failed to stream PDF for notice %d", notice_id)
        return JSONResponse(status_code=502, content={"status": "error", "message": "Unable to fetch PDF from portal"})


# POST /notices/{id}/bookmark
@router.post("/{notice_id}/bookmark", response_model=ApiResponse)
async def bookmark_notice(notice_id: int, payload: NoticeTokenRequest):
    try:
        data = await run_in_threadpool(toggle_bookmark, payload.token, notice_id)
        return ApiResponse(status="success", message="Bookmark toggled", data=data)
    except PermissionError:
        return JSONResponse(status_code=401, content={"status": "error", "message": "Session expired"})
    except Exception:
        logger.exception("Failed to toggle bookmark")
        return JSONResponse(status_code=500, content={"status": "error", "message": "Unable to update bookmark"})


# POST /notices/{id}/dismiss
@router.post("/{notice_id}/dismiss", response_model=ApiResponse)
async def dismiss_notice_endpoint(notice_id: int, payload: NoticeTokenRequest):
    try:
        data = await run_in_threadpool(dismiss_notice, payload.token, notice_id)
        return ApiResponse(status="success", message="Notice dismissed", data=data)
    except PermissionError:
        return JSONResponse(status_code=401, content={"status": "error", "message": "Session expired"})
    except Exception:
        logger.exception("Failed to dismiss notice")
        return JSONResponse(status_code=500, content={"status": "error", "message": "Unable to dismiss notice"})


# POST /notices/refresh
@router.post("/refresh", response_model=ApiResponse)
async def refresh_notices(payload: NoticeTokenRequest):
    record = session_store.get(payload.token)
    if record is None:
        return JSONResponse(status_code=401, content={"status": "error", "message": "Session expired"})

    try:
        source_program = record.program_full or record.program_sn
        with record.scraper_lock:
            data = await run_in_threadpool(
                notice_scheduler.trigger_immediate, record.scraper, source_program
            )
        return ApiResponse(status="success", message="Notice refresh complete", data=data)
    except Exception:
        logger.exception("Failed to refresh notices")
        return JSONResponse(status_code=500, content={"status": "error", "message": "Unable to refresh notices"})
