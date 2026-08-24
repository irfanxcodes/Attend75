"""
Advertisement router.

Admin-only endpoints for managing the dashboard ad banner.
Public endpoint for the frontend to fetch the active ad (no auth needed).

Endpoints
---------
GET  /advertisement/active          — public: returns active ad or null
POST /admin/advertisement/upload    — admin: upload new banner, deactivates previous
DELETE /admin/advertisement/{id}    — admin: remove an ad (falls back to attendance card)
GET  /admin/advertisement/list      — admin: list all ads
"""

import logging
import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool

from db.session import SessionLocal
from db.models.advertisement import Advertisement
from models.schemas import ApiResponse
from services.admin_service import require_admin_user

router = APIRouter(tags=["advertisement"])
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Images and videos land in backend/uploads/ads/
UPLOADS_DIR = Path(__file__).resolve().parent.parent / "uploads" / "ads"

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
ALLOWED_VIDEO_TYPES = {"video/mp4", "video/webm"}
ALLOWED_TYPES = ALLOWED_IMAGE_TYPES | ALLOWED_VIDEO_TYPES

MAX_IMAGE_SIZE = 5 * 1024 * 1024   # 5 MB
MAX_VIDEO_SIZE = 20 * 1024 * 1024  # 20 MB

EXTENSION_MAP = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _db():
    with SessionLocal() as session:
        yield session


def _get_active_ad(db) -> Advertisement | None:
    return (
        db.query(Advertisement)
        .filter(Advertisement.is_active == True)  # noqa: E712
        .order_by(Advertisement.created_at.desc())
        .first()
    )


def _ad_to_dict(ad: Advertisement) -> dict:
    return {
        "id": ad.id,
        "media_type": ad.media_type,
        "placement": ad.placement,
        "file_path": ad.file_path,
        "url": f"/uploads/ads/{Path(ad.file_path).name}",
        "original_filename": ad.original_filename,
        "link_url": ad.link_url,
        "advertiser_name": ad.advertiser_name,
        "is_active": ad.is_active,
        "created_at": ad.created_at.isoformat(),
    }


# ---------------------------------------------------------------------------
# Public endpoint — no auth, called by every dashboard load
# ---------------------------------------------------------------------------


@router.get("/advertisement/active", response_model=ApiResponse)
async def get_active_advertisement(placement: str = "dashboard"):
    """Return the currently active ad for the given placement, or null if none is live."""
    def _query():
        with SessionLocal() as db:
            ad = (
                db.query(Advertisement)
                .filter(
                    Advertisement.is_active == True,  # noqa: E712
                    Advertisement.placement == placement,
                )
                .order_by(Advertisement.created_at.desc())
                .first()
            )
            return _ad_to_dict(ad) if ad else None

    ad = await run_in_threadpool(_query)
    return ApiResponse(status="success", message="ok", data={"ad": ad})


# ---------------------------------------------------------------------------
# Admin endpoints — require admin session token
# ---------------------------------------------------------------------------


@router.post("/admin/advertisement/upload", response_model=ApiResponse)
async def upload_advertisement(
    file: UploadFile = File(...),
    link_url: str = Form(default=""),
    advertiser_name: str = Form(default=""),
    placement: str = Form(default="dashboard"),
    _admin=Depends(require_admin_user),
):
    """Upload a new ad banner. The previous active ad for the same placement is deactivated."""
    content_type = (file.content_type or "").lower()
    if content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{content_type}'. Allowed: JPEG, PNG, WEBP, GIF, MP4, WEBM.",
        )

    valid_placements = {"dashboard", "arcade_game_over"}
    if placement not in valid_placements:
        raise HTTPException(status_code=400, detail=f"Invalid placement. Must be one of: {valid_placements}")

    is_video = content_type in ALLOWED_VIDEO_TYPES
    max_size = MAX_VIDEO_SIZE if is_video else MAX_IMAGE_SIZE
    media_type = "video" if is_video else "image"

    contents = await file.read()
    if len(contents) > max_size:
        limit_mb = max_size // (1024 * 1024)
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum size for {media_type}s is {limit_mb} MB.",
        )

    ext = EXTENSION_MAP.get(content_type, ".bin")
    unique_name = f"{uuid.uuid4().hex}{ext}"

    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    dest = UPLOADS_DIR / unique_name
    dest.write_bytes(contents)

    def _save():
        with SessionLocal() as db:
            # Deactivate any currently active ads for this placement only
            db.query(Advertisement).filter(
                Advertisement.is_active == True,  # noqa: E712
                Advertisement.placement == placement,
            ).update({"is_active": False}, synchronize_session=False)

            ad = Advertisement(
                media_type=media_type,
                placement=placement,
                file_path=unique_name,
                original_filename=file.filename or unique_name,
                link_url=link_url.strip() or None,
                advertiser_name=advertiser_name.strip() or None,
                is_active=True,
            )
            db.add(ad)
            db.commit()
            db.refresh(ad)
            return _ad_to_dict(ad)

    ad_data = await run_in_threadpool(_save)
    logger.info("Admin uploaded advertisement: %s (%s, placement=%s)", unique_name, media_type, placement)
    return ApiResponse(status="success", message="Advertisement uploaded and is now live.", data={"ad": ad_data})


@router.delete("/admin/advertisement/{ad_id}", response_model=ApiResponse)
async def delete_advertisement(ad_id: int, _admin=Depends(require_admin_user)):
    """Remove an ad. If it was the active one, the dashboard reverts to the attendance card."""
    def _delete():
        with SessionLocal() as db:
            ad = db.query(Advertisement).filter(Advertisement.id == ad_id).first()
            if not ad:
                return None
            # Delete the physical file if it exists
            file_path = UPLOADS_DIR / ad.file_path
            if file_path.exists():
                try:
                    os.remove(file_path)
                except OSError as exc:
                    logger.warning("Could not delete ad file %s: %s", file_path, exc)
            db.delete(ad)
            db.commit()
            return ad_id

    deleted = await run_in_threadpool(_delete)
    if deleted is None:
        raise HTTPException(status_code=404, detail="Advertisement not found.")

    logger.info("Admin deleted advertisement id=%d", ad_id)
    return ApiResponse(status="success", message="Advertisement removed. Dashboard has reverted to attendance card.", data={})


@router.get("/admin/advertisement/list", response_model=ApiResponse)
async def list_advertisements(_admin=Depends(require_admin_user)):
    """Return all ads (active + historical) for the admin panel."""
    def _list():
        with SessionLocal() as db:
            ads = (
                db.query(Advertisement)
                .order_by(Advertisement.created_at.desc())
                .all()
            )
            return [_ad_to_dict(a) for a in ads]

    ads = await run_in_threadpool(_list)
    return ApiResponse(status="success", message="ok", data={"ads": ads})


@router.patch("/admin/advertisement/{ad_id}/activate", response_model=ApiResponse)
async def activate_advertisement(ad_id: int, _admin=Depends(require_admin_user)):
    """Re-activate an existing ad (deactivates any current active ad for the same placement)."""
    def _activate():
        with SessionLocal() as db:
            ad = db.query(Advertisement).filter(Advertisement.id == ad_id).first()
            if not ad:
                return None
            # Deactivate others in the same placement only
            db.query(Advertisement).filter(
                Advertisement.is_active == True,  # noqa: E712
                Advertisement.placement == ad.placement,
            ).update({"is_active": False}, synchronize_session=False)
            ad.is_active = True
            db.commit()
            db.refresh(ad)
            return _ad_to_dict(ad)

    ad_data = await run_in_threadpool(_activate)
    if ad_data is None:
        raise HTTPException(status_code=404, detail="Advertisement not found.")

    return ApiResponse(status="success", message="Advertisement is now live.", data={"ad": ad_data})
