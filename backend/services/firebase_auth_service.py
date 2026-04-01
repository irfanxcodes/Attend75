import os
import logging
from pathlib import Path

import firebase_admin
from firebase_admin import auth, credentials


class FirebaseAuthError(Exception):
    pass


logger = logging.getLogger(__name__)


def _resolve_credentials_path() -> str | None:
    explicit_path = os.getenv("FIREBASE_SERVICE_ACCOUNT_FILE", "").strip()
    if explicit_path:
        return explicit_path

    google_app_credentials = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "").strip()
    if google_app_credentials:
        return google_app_credentials

    return None


def initialize_firebase() -> None:
    if firebase_admin._apps:
        return

    credentials_path = _resolve_credentials_path()
    if credentials_path:
        path = Path(credentials_path).expanduser().resolve()
        if not path.exists():
            logger.error("Firebase credentials file not found at path=%s", path)
            raise FirebaseAuthError("Firebase credentials file not found")
        cred = credentials.Certificate(str(path))
        firebase_admin.initialize_app(cred)
        logger.info("Firebase Admin initialized with explicit service account path=%s", path)
        return

    # Fallback: rely on default environment credentials if available.
    try:
        firebase_admin.initialize_app()
        logger.info("Firebase Admin initialized with default application credentials")
    except Exception as exc:
        logger.exception("Firebase Admin SDK initialization failed")
        raise FirebaseAuthError("Unable to initialize Firebase Admin SDK") from exc


def verify_firebase_id_token(id_token: str) -> dict:
    token = (id_token or "").strip()
    if not token:
        raise FirebaseAuthError("id_token is required")

    initialize_firebase()

    try:
        decoded = auth.verify_id_token(token)
    except Exception as exc:
        logger.warning("Firebase ID token verification failed: %s", exc)
        raise FirebaseAuthError("Invalid Firebase ID token") from exc

    return {
        "firebase_uid": decoded.get("uid"),
        "email": decoded.get("email"),
        "display_name": decoded.get("name") or decoded.get("email") or decoded.get("uid"),
    }
