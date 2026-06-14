from db.models.user_rating import UserRating
from db.session import SessionLocal


def submit_rating(user_identifier: str, rating: int) -> dict:
    normalized_user = str(user_identifier or "").strip().upper()
    if not normalized_user:
        raise ValueError("user_identifier is required")
    if not (1 <= rating <= 5):
        raise ValueError("rating must be between 1 and 5")

    with SessionLocal() as session:
        # Upsert: update if exists, create if not
        existing = (
            session.query(UserRating)
            .filter(UserRating.user_identifier == normalized_user)
            .first()
        )

        if existing:
            existing.rating = rating
            session.commit()
            return {"rating": existing.rating, "updated": True}

        new_rating = UserRating(user_identifier=normalized_user, rating=rating)
        session.add(new_rating)
        session.commit()
        return {"rating": new_rating.rating, "updated": False}


def get_user_rating(user_identifier: str) -> int | None:
    normalized_user = str(user_identifier or "").strip().upper()
    if not normalized_user:
        return None

    with SessionLocal() as session:
        existing = (
            session.query(UserRating)
            .filter(UserRating.user_identifier == normalized_user)
            .first()
        )
        return existing.rating if existing else None
