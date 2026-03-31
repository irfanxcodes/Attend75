from fastapi import APIRouter
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse

from models.schemas import ApiResponse, FirebaseLinkCredentialsRequest, FirebaseLoginRequest
from services.firebase_auth_service import FirebaseAuthError
from services.firebase_user_service import firebase_login, link_firebase_credentials

router = APIRouter(prefix="/auth/firebase", tags=["firebase-auth"])


@router.post("/login", response_model=ApiResponse)
async def login_with_firebase(payload: FirebaseLoginRequest):
    try:
        data = await run_in_threadpool(firebase_login, payload.id_token)
        return ApiResponse(status="success", message="Firebase login successful", data=data)
    except FirebaseAuthError as exc:
        return JSONResponse(
            status_code=401,
            content={"status": "error", "message": str(exc) or "Invalid Firebase ID token"},
        )
    except Exception:
        return JSONResponse(
            status_code=500,
            content={"status": "error", "message": "Server/network error"},
        )


@router.post("/link-credentials", response_model=ApiResponse)
async def link_credentials(payload: FirebaseLinkCredentialsRequest):
    try:
        data = await run_in_threadpool(
            link_firebase_credentials,
            payload.id_token,
            payload.roll_number,
            payload.password,
        )
        return ApiResponse(status="success", message="Credentials linked successfully", data=data)
    except FirebaseAuthError as exc:
        return JSONResponse(
            status_code=401,
            content={"status": "error", "message": str(exc) or "Invalid Firebase ID token"},
        )
    except Exception:
        return JSONResponse(
            status_code=500,
            content={"status": "error", "message": "Server/network error"},
        )
