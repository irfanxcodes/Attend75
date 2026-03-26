from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from routers.auth import router as auth_router

app = FastAPI(title="Attend75 Backend", version="0.1.0")


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_, exc: RequestValidationError):
    first_error = exc.errors()[0] if exc.errors() else {}
    message = first_error.get("msg", "Invalid input")
    return JSONResponse(
        status_code=422,
        content={"status": "error", "message": message},
    )


@app.get("/health")
async def health_check():
    return {"status": "success", "message": "Backend is running", "data": {}}


app.include_router(auth_router)
