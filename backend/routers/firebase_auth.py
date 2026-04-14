import logging

from fastapi import APIRouter
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse

from models.schemas import ApiResponse, FirebaseLinkCredentialsRequest, FirebaseLoginRequest
from scrapers.portal_scraper import PortalAuthenticationError, PortalNetworkError
from services.firebase_auth_service import FirebaseAuthError
from services.firebase_user_service import firebase_login, link_firebase_credentials

router = APIRouter(prefix="/auth/firebase", tags=["firebase-auth"])
logger = logging.getLogger(__name__)


@router.post("/login", response_model=ApiResponse)
async def login_with_firebase(payload: FirebaseLoginRequest):
    try:
        data = await run_in_threadpool(firebase_login, payload.id_token)
        return ApiResponse(status="success", message="Firebase login successful", data=data)
    except FirebaseAuthError as exc:
        logger.warning("Firebase login verification failed: %s", str(exc))
        return JSONResponse(
            status_code=401,
            content={
                "status": "error",
                "error_code": "FIREBASE_AUTH_FAILED",
                "message": "Unable to sign in with Google. Please try again.",
            },
        )
    except PortalAuthenticationError as exc:
        logger.warning("Firebase login portal credential failure: %s", str(exc))
        return JSONResponse(
            status_code=401,
            content={
                "status": "error",
                "error_code": "PORTAL_CREDENTIALS_INVALID",
                "message": "Your linked portal credentials need to be updated.",
            },
        )
    except PortalNetworkError as exc:
        error_code = getattr(exc, "code", "PORTAL_DATA_FETCH_FAILED")
        logger.exception("Firebase login portal data fetch failure [code=%s]", error_code)
        return JSONResponse(
            status_code=502,
            content={
                "status": "error",
                "error_code": error_code,
                "message": "Unable to load your data. Please try again later.",
            },
        )
    except Exception:
        logger.exception("Unexpected Firebase login error")
        return JSONResponse(
            status_code=500,
            content={
                "status": "error",
                "error_code": "FIREBASE_AUTH_FAILED",
                "message": "Something went wrong during sign-in.",
            },
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
        logger.warning("Firebase link verification failed: %s", str(exc))
        return JSONResponse(
            status_code=401,
            content={
                "status": "error",
                "error_code": "FIREBASE_AUTH_FAILED",
                "message": "Authentication failed. Please try again.",
            },
        )
    except PortalAuthenticationError as exc:
        logger.warning("Firebase link portal credential failure: %s", str(exc))
        return JSONResponse(
            status_code=401,
            content={
                "status": "error",
                "error_code": "PORTAL_CREDENTIALS_INVALID",
                "message": "Invalid portal credentials. Please check and try again.",
            },
        )
    except PortalNetworkError as exc:
        error_code = getattr(exc, "code", "PORTAL_DATA_FETCH_FAILED")
        logger.exception("Firebase link portal data fetch failure [code=%s]", error_code)
        return JSONResponse(
            status_code=502,
            content={
                "status": "error",
                "error_code": error_code,
                "message": "Unable to load your data. Please try again later.",
            },
        )
    except Exception:
        logger.exception("Unexpected Firebase link error")
        return JSONResponse(
            status_code=500,
            content={
                "status": "error",
                "error_code": "FIREBASE_AUTH_FAILED",
                "message": "Something went wrong during sign-in.",
            },
        )
