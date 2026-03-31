from contextlib import contextmanager
from collections.abc import Iterator

from sqlalchemy.orm import Session

from db.models.portal_credential import PortalCredential
from db.models.user import User
from db.session import SessionLocal
from services.auth_service import login_user
from services.crypto_service import credential_crypto_service
from services.firebase_auth_service import FirebaseAuthError, verify_firebase_id_token


@contextmanager
def _db_session() -> Iterator[Session]:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def _upsert_user(session: Session, firebase_user: dict) -> User:
    firebase_uid = str(firebase_user.get("firebase_uid") or "").strip()
    if not firebase_uid:
        raise FirebaseAuthError("Invalid Firebase user payload")

    user = session.query(User).filter(User.firebase_uid == firebase_uid).one_or_none()
    if user is None:
        user = User(
            firebase_uid=firebase_uid,
            email=(firebase_user.get("email") or None),
            display_name=(firebase_user.get("display_name") or None),
        )
        session.add(user)
        session.flush()
    else:
        user.email = firebase_user.get("email") or user.email
        user.display_name = firebase_user.get("display_name") or user.display_name

    session.commit()
    session.refresh(user)
    return user


def firebase_login(id_token: str) -> dict:
    firebase_user = verify_firebase_id_token(id_token)

    with _db_session() as session:
        user = _upsert_user(session, firebase_user)
        credential = session.query(PortalCredential).filter(PortalCredential.user_id == user.id).one_or_none()

        if credential is None:
            return {
                "linked": False,
                "firebase_uid": user.firebase_uid,
                "email": user.email,
                "display_name": user.display_name,
            }

        portal_password = credential_crypto_service.decrypt(credential.encrypted_password)
        guest_session = login_user(roll_number=credential.roll_number, password=portal_password)
        return {
            "linked": True,
            "firebase_uid": user.firebase_uid,
            "email": user.email,
            "display_name": user.display_name,
            **guest_session,
        }


def link_firebase_credentials(id_token: str, roll_number: str, password: str) -> dict:
    firebase_user = verify_firebase_id_token(id_token)
    cleaned_roll = (roll_number or "").strip().upper()
    encrypted_password = credential_crypto_service.encrypt(password)

    with _db_session() as session:
        user = _upsert_user(session, firebase_user)
        credential = session.query(PortalCredential).filter(PortalCredential.user_id == user.id).one_or_none()

        if credential is None:
            credential = PortalCredential(
                user_id=user.id,
                roll_number=cleaned_roll,
                encrypted_password=encrypted_password,
            )
            session.add(credential)
        else:
            credential.roll_number = cleaned_roll
            credential.encrypted_password = encrypted_password

        session.commit()

    guest_session = login_user(roll_number=cleaned_roll, password=password)
    return {
        "linked": True,
        "firebase_uid": firebase_user.get("firebase_uid"),
        "email": firebase_user.get("email"),
        "display_name": firebase_user.get("display_name"),
        **guest_session,
    }
