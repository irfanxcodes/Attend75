import os
import time
import logging

from dotenv import load_dotenv
load_dotenv()

# Configure logging so all modules (including push_worker, subscription_manager) output to console
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi import Request

from db.session import init_database
from routers.arcade import router as arcade_router
from routers.auth import router as auth_router
from routers.admin import router as admin_router
from routers.feedback import router as feedback_router
from routers.firebase_auth import router as firebase_auth_router
from routers.notices import router as notices_router
from routers.push import router as push_router
from routers.premium import router as premium_router
from routers.studyme import router as studyme_router
from services.request_metrics import observe_request

app = FastAPI(title="Attend75 Backend", version="0.1.0")
logger = logging.getLogger("attend75.request")


def _cors_origins() -> list[str]:
    raw = os.getenv("CORS_ALLOW_ORIGINS", "").strip()
    if raw:
        return [origin.strip() for origin in raw.split(",") if origin.strip()]

    return [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]


def _cors_origin_regex() -> str:
    raw = os.getenv("CORS_ALLOW_ORIGIN_REGEX", "").strip()
    if raw:
        return raw

    # Local development: allow localhost and 127.0.0.1 across dev ports.
    return r"https?://(localhost|127\.0\.0\.1)(:\d+)?$"


@app.on_event("startup")
async def startup_event() -> None:
    init_database()
    # Start the notice scheduler (30-min background refresh)
    from services.notice_scheduler import notice_scheduler
    notice_scheduler.start()
    # Start the retention cleanup scheduler (daily)
    from services.retention_service import retention_scheduler
    retention_scheduler.start()
    # Start the push notification delivery worker
    from services.push_worker import push_worker
    push_worker.start()
    # Start the deadline reminder scheduler (daily 7:00 AM IST)
    from services.deadline_service import deadline_scheduler
    deadline_scheduler.start()
    # Start the timetable reminder scheduler (daily 5:30 AM IST)
    from services.timetable_reminder_engine import timetable_reminder_scheduler
    timetable_reminder_scheduler.start()
    # Start the weekly summary scheduler (Monday 9:00 AM IST)
    from services.weekly_summary_service import weekly_summary_scheduler
    weekly_summary_scheduler.start()
    # Start the nudge scheduler (daily 10:00 AM IST)
    from services.nudge_service import nudge_scheduler
    nudge_scheduler.start()
    # Start the background attendance fetcher (every 6 hours)
    from services.background_fetcher import background_fetch_scheduler
    background_fetch_scheduler.start()


@app.on_event("shutdown")
async def shutdown_event() -> None:
    from services.notice_scheduler import notice_scheduler
    notice_scheduler.stop()
    from services.retention_service import retention_scheduler
    retention_scheduler.stop()
    from services.push_worker import push_worker
    push_worker.stop()
    from services.deadline_service import deadline_scheduler
    deadline_scheduler.stop()
    from services.timetable_reminder_engine import timetable_reminder_scheduler
    timetable_reminder_scheduler.stop()
    from services.weekly_summary_service import weekly_summary_scheduler
    weekly_summary_scheduler.stop()
    from services.nudge_service import nudge_scheduler
    nudge_scheduler.stop()
    from services.background_fetcher import background_fetch_scheduler
    background_fetch_scheduler.stop()

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_origin_regex=_cors_origin_regex(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_timing_middleware(request: Request, call_next):
    started = time.perf_counter()
    response = await call_next(request)
    duration_ms = round((time.perf_counter() - started) * 1000, 2)
    observe_request(path=request.url.path, status_code=response.status_code, duration_ms=duration_ms)

    logger.info(
        "request path=%s method=%s status=%s duration_ms=%s",
        request.url.path,
        request.method,
        response.status_code,
        duration_ms,
    )
    return response


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_, exc: RequestValidationError):
    first_error = exc.errors()[0] if exc.errors() else {}
    message = first_error.get("msg", "Invalid input")
    location = first_error.get("loc", [])
    field_name = location[-1] if location else None

    if field_name and message.lower() == "field required":
        if field_name == "roll_number":
            message = "roll_number (or username) is required"
        else:
            message = f"{field_name} is required"

    return JSONResponse(
        status_code=422,
        content={"status": "error", "message": message},
    )


@app.get("/health")
async def health_check():
    return {"status": "success", "message": "Backend is running", "data": {}}


app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(arcade_router)
app.include_router(feedback_router)
app.include_router(firebase_auth_router)
app.include_router(notices_router)
app.include_router(push_router)
app.include_router(premium_router)
app.include_router(studyme_router)
