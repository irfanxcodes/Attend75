from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from db.session import init_database
from routers.auth import router as auth_router
from routers.feedback import router as feedback_router
from routers.firebase_auth import router as firebase_auth_router

app = FastAPI(title="Attend75 Backend", version="0.1.0")


@app.on_event("startup")
async def startup_event() -> None:
    init_database()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
app.include_router(feedback_router)
app.include_router(firebase_auth_router)
