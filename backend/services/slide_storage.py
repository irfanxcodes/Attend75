"""
Slide Storage Service

Abstracts where slide images are stored:
  - Development (no R2 env vars): local disk at uploads/slide_images/
  - Production (R2 env vars set):  Cloudflare R2 bucket

Swapping between the two is automatic — just set/unset the R2 env vars.

Cloudflare R2 setup:
  R2_ACCOUNT_ID   = your Cloudflare account ID
  R2_ACCESS_KEY   = R2 API token Access Key ID
  R2_SECRET_KEY   = R2 API token Secret Access Key
  R2_BUCKET       = bucket name (e.g. "attend75-slides")
  R2_PUBLIC_URL   = public bucket URL (e.g. https://slides.attend75.xyz)
                    OR leave empty to use presigned URLs

Usage monitoring:
  get_storage_stats() returns total slides stored and estimated MB used.
  The slide endpoint caps renders at MAX_SLIDES_PER_UPLOAD and
  MAX_TOTAL_SLIDES_GLOBAL to prevent runaway costs.
"""

import io
import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)

# ── Config ───────────────────────────────────────────────────────────────────

_LOCAL_BASE = Path(__file__).resolve().parent.parent / "uploads" / "slide_images"
_LOCAL_BASE.mkdir(parents=True, exist_ok=True)

# Safety caps — prevent accidental mass rendering
MAX_SLIDES_PER_UPLOAD = 120   # most PPTs are under this
MAX_TOTAL_SLIDES_GLOBAL = 5000  # soft global cap before we alert

CURRENT_SCRIPT_VERSION = 1  # bump to regenerate all teaching scripts


def _r2_config() -> dict | None:
    """Return R2 config if all required env vars are set, else None (use local)."""
    account_id = os.getenv("R2_ACCOUNT_ID", "").strip()
    access_key = os.getenv("R2_ACCESS_KEY", "").strip()
    secret_key = os.getenv("R2_SECRET_KEY", "").strip()
    bucket     = os.getenv("R2_BUCKET", "").strip()
    if account_id and access_key and secret_key and bucket:
        return {
            "account_id": account_id,
            "access_key": access_key,
            "secret_key": secret_key,
            "bucket": bucket,
            "endpoint": f"https://{account_id}.r2.cloudflarestorage.com",
            "public_url": os.getenv("R2_PUBLIC_URL", "").strip(),
        }
    return None


def _get_r2_client():
    """Return a boto3 S3 client pointed at Cloudflare R2, or None."""
    cfg = _r2_config()
    if not cfg:
        return None, None
    try:
        import boto3
        client = boto3.client(
            "s3",
            endpoint_url=cfg["endpoint"],
            aws_access_key_id=cfg["access_key"],
            aws_secret_access_key=cfg["secret_key"],
            region_name="auto",
        )
        return client, cfg
    except Exception as exc:
        logger.error("[SlideStorage] Failed to create R2 client: %s", exc)
        return None, None


# ── Public API ────────────────────────────────────────────────────────────────

def save_slide_image(upload_id: str, slide_number: int, image_bytes: bytes) -> str:
    """
    Save a rendered slide image. Returns the URL to access it.

    In dev (no R2): saves to local disk, returns /slide-images/{upload_id}/{n}
    In prod (R2):   uploads to R2, returns public URL or presigned URL
    """
    client, cfg = _get_r2_client()

    if client and cfg:
        return _save_to_r2(client, cfg, upload_id, slide_number, image_bytes)
    else:
        return _save_to_local(upload_id, slide_number, image_bytes)


def get_slide_image_url(upload_id: str, slide_number: int) -> str | None:
    """
    Return the URL for an existing slide image, or None if not found.
    In dev: returns the local static path.
    In prod: returns the R2 public/presigned URL stored in DB.
    """
    client, cfg = _get_r2_client()
    if client and cfg:
        return _get_r2_url(client, cfg, upload_id, slide_number)
    else:
        path = _local_path(upload_id, slide_number)
        if path.exists():
            return f"/slide-images/{upload_id}/slide_{slide_number:03d}.webp"
        return None


def slide_image_exists(upload_id: str, slide_number: int) -> bool:
    """Check if a slide image has already been rendered."""
    client, cfg = _get_r2_client()
    if client and cfg:
        return _r2_object_exists(client, cfg, _r2_key(upload_id, slide_number))
    return _local_path(upload_id, slide_number).exists()


def get_local_image_bytes(upload_id: str, slide_number: int) -> bytes | None:
    """Read image bytes from local disk (dev only). Returns None if not found."""
    path = _local_path(upload_id, slide_number)
    if path.exists():
        return path.read_bytes()
    return None


def delete_all_slides(upload_id: str) -> None:
    """Delete all slide images for an upload (e.g. if chapter is removed)."""
    client, cfg = _get_r2_client()
    if client and cfg:
        _delete_r2_prefix(client, cfg, f"slides/{upload_id}/")
    else:
        import shutil
        d = _LOCAL_BASE / upload_id
        if d.exists():
            shutil.rmtree(d)
    logger.info("[SlideStorage] Deleted slides for upload_id=%s", upload_id)


def get_storage_stats() -> dict:
    """
    Return basic usage stats for monitoring.
    Reads from local disk in dev, from DB in prod (R2 doesn't have cheap list-all).
    """
    client, cfg = _get_r2_client()
    mode = "r2" if client else "local"

    if mode == "local":
        total_slides = 0
        total_bytes = 0
        for p in _LOCAL_BASE.rglob("slide_*.webp"):
            total_slides += 1
            total_bytes += p.stat().st_size
        return {
            "mode": "local",
            "total_slides": total_slides,
            "total_mb": round(total_bytes / 1_048_576, 2),
        }
    else:
        # In prod, get counts from DB (cheaper than listing R2)
        try:
            from db.session import SessionLocal
            from db.models.lesson_slide import LessonSlide
            with SessionLocal() as session:
                count = session.query(LessonSlide).count()
            return {"mode": "r2", "total_slides": count, "total_mb": None}
        except Exception:
            return {"mode": "r2", "total_slides": -1, "total_mb": None}


def using_r2() -> bool:
    """Returns True if R2 is configured (production mode)."""
    return _r2_config() is not None


# ── Local disk helpers ────────────────────────────────────────────────────────

def _local_path(upload_id: str, slide_number: int) -> Path:
    return _LOCAL_BASE / upload_id / f"slide_{slide_number:03d}.webp"


def _save_to_local(upload_id: str, slide_number: int, image_bytes: bytes) -> str:
    out_dir = _LOCAL_BASE / upload_id
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"slide_{slide_number:03d}.webp"
    path.write_bytes(image_bytes)
    logger.debug("[SlideStorage] Local: saved slide %d for %s (%d KB)",
                 slide_number, upload_id, len(image_bytes) // 1024)
    # Return the full static path that matches the FastAPI /slide-images mount
    return f"/slide-images/{upload_id}/slide_{slide_number:03d}.webp"


# ── R2 helpers ────────────────────────────────────────────────────────────────

def _r2_key(upload_id: str, slide_number: int) -> str:
    return f"slides/{upload_id}/slide_{slide_number:03d}.webp"


def _save_to_r2(client, cfg: dict, upload_id: str, slide_number: int, image_bytes: bytes) -> str:
    key = _r2_key(upload_id, slide_number)
    try:
        client.put_object(
            Bucket=cfg["bucket"],
            Key=key,
            Body=image_bytes,
            ContentType="image/webp",
            CacheControl="public, max-age=31536000",  # 1 year — content never changes
        )
        url = _build_public_url(cfg, key)
        logger.debug("[SlideStorage] R2: uploaded %s (%d KB)", key, len(image_bytes) // 1024)
        return url
    except Exception as exc:
        logger.error("[SlideStorage] R2 upload failed for %s: %s", key, exc)
        raise


def _get_r2_url(client, cfg: dict, upload_id: str, slide_number: int) -> str | None:
    key = _r2_key(upload_id, slide_number)
    if not _r2_object_exists(client, cfg, key):
        return None
    return _build_public_url(cfg, key)


def _r2_object_exists(client, cfg: dict, key: str) -> bool:
    try:
        client.head_object(Bucket=cfg["bucket"], Key=key)
        return True
    except Exception:
        return False


def _build_public_url(cfg: dict, key: str) -> str:
    """Build the public URL for an R2 object."""
    if cfg["public_url"]:
        return f"{cfg['public_url'].rstrip('/')}/{key}"
    # Fallback: presigned URL (valid 7 days)
    client, _ = _get_r2_client()
    try:
        return client.generate_presigned_url(
            "get_object",
            Params={"Bucket": cfg["bucket"], "Key": key},
            ExpiresIn=604800,  # 7 days
        )
    except Exception as exc:
        logger.error("[SlideStorage] Failed to generate presigned URL: %s", exc)
        return ""


def _delete_r2_prefix(client, cfg: dict, prefix: str) -> None:
    """Delete all R2 objects with the given prefix."""
    try:
        paginator = client.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=cfg["bucket"], Prefix=prefix):
            objects = [{"Key": obj["Key"]} for obj in page.get("Contents", [])]
            if objects:
                client.delete_objects(Bucket=cfg["bucket"], Delete={"Objects": objects})
    except Exception as exc:
        logger.error("[SlideStorage] R2 delete failed for prefix %s: %s", prefix, exc)
