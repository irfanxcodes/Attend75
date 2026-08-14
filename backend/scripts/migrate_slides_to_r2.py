"""
migrate_slides_to_r2.py
=======================

One-time migration: upload all locally-stored slide images to Cloudflare R2
and update the lesson_slides.image_url column to point to the new R2 URLs.

Safe to re-run — skips slides already in R2 (idempotent).
Does NOT delete local files (safe rollback: just clear R2 env vars to revert).

Usage (from backend/ directory):
    source .venv/bin/activate
    python scripts/migrate_slides_to_r2.py

    # Dry run (no uploads, no DB writes):
    python scripts/migrate_slides_to_r2.py --dry-run

Requirements:
    - R2_ACCOUNT_ID, R2_ACCESS_KEY, R2_SECRET_KEY, R2_BUCKET set in backend/.env
    - Run from the backend/ directory so .env and DB are found correctly
"""

import argparse
import logging
import os
import sys
from pathlib import Path

# ── Bootstrap: make sure we can import from backend/ ─────────────────────────
BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from dotenv import load_dotenv
load_dotenv(BACKEND_DIR / ".env")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s  %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("migrate_slides")


def main(dry_run: bool = False) -> None:
    # ── Validate R2 config ────────────────────────────────────────────────────
    import boto3
    import botocore.config

    account_id = os.getenv("R2_ACCOUNT_ID", "").strip()
    access_key = os.getenv("R2_ACCESS_KEY", "").strip()
    secret_key = os.getenv("R2_SECRET_KEY", "").strip()
    bucket     = os.getenv("R2_BUCKET", "").strip()
    public_url = os.getenv("R2_PUBLIC_URL", "").strip()

    missing = [k for k, v in [
        ("R2_ACCOUNT_ID", account_id),
        ("R2_ACCESS_KEY", access_key),
        ("R2_SECRET_KEY", secret_key),
        ("R2_BUCKET",     bucket),
    ] if not v]

    if missing:
        logger.error("Missing env vars: %s — set them in backend/.env and retry.", missing)
        sys.exit(1)

    s3 = boto3.client(
        "s3",
        endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name="auto",
        config=botocore.config.Config(signature_version="s3v4"),
    )

    logger.info("R2 config OK — bucket=%s  public_url=%s", bucket, public_url or "(presigned)")
    if dry_run:
        logger.info("DRY RUN — no uploads or DB writes will happen")

    # ── Load all slides from DB ───────────────────────────────────────────────
    from db.session import SessionLocal
    from db.models.lesson_slide import LessonSlide

    with SessionLocal() as session:
        slides = session.query(LessonSlide).order_by(
            LessonSlide.upload_id, LessonSlide.slide_number
        ).all()

    total = len(slides)
    logger.info("Found %d slides in DB", total)

    # ── Local disk base ───────────────────────────────────────────────────────
    local_base = BACKEND_DIR / "uploads" / "slide_images"

    # ── Migration loop ────────────────────────────────────────────────────────
    skipped_already_r2   = 0
    skipped_missing_file = 0
    uploaded             = 0
    failed               = 0
    total_bytes          = 0

    for idx, slide in enumerate(slides, 1):
        upload_id    = slide.upload_id
        slide_number = slide.slide_number
        r2_key       = f"slides/{upload_id}/slide_{slide_number:03d}.webp"

        # Build the expected R2 public URL
        if public_url:
            new_url = f"{public_url.rstrip('/')}/{r2_key}"
        else:
            new_url = f"https://{account_id}.r2.cloudflarestorage.com/{bucket}/{r2_key}"

        # ── Already migrated? (URL already points to R2) ──────────────────
        current_url = slide.image_url or ""
        if current_url.startswith("http") and "r2" in current_url or (
            public_url and current_url.startswith(public_url)
        ):
            skipped_already_r2 += 1
            logger.debug("[%d/%d] SKIP (already R2): %s", idx, total, r2_key)
            continue

        # ── Find local file ───────────────────────────────────────────────
        local_path = local_base / upload_id / f"slide_{slide_number:03d}.webp"
        if not local_path.exists():
            skipped_missing_file += 1
            logger.warning("[%d/%d] LOCAL FILE MISSING: %s — skipping", idx, total, local_path)
            continue

        img_bytes = local_path.read_bytes()
        size_kb   = len(img_bytes) // 1024

        if dry_run:
            logger.info("[%d/%d] DRY RUN: would upload %s (%d KB) → %s",
                        idx, total, r2_key, size_kb, new_url)
            uploaded += 1
            total_bytes += len(img_bytes)
            continue

        # ── Upload to R2 ──────────────────────────────────────────────────
        try:
            s3.put_object(
                Bucket=bucket,
                Key=r2_key,
                Body=img_bytes,
                ContentType="image/webp",
                CacheControl="public, max-age=31536000",
            )
            total_bytes += len(img_bytes)
            uploaded    += 1
            logger.info("[%d/%d] ✓ Uploaded %s (%d KB)", idx, total, r2_key, size_kb)
        except Exception as exc:
            failed += 1
            logger.error("[%d/%d] ✗ Upload failed: %s — %s", idx, total, r2_key, exc)
            continue

        # ── Update DB row to new R2 URL ───────────────────────────────────
        try:
            with SessionLocal() as session:
                db_slide = session.get(LessonSlide, slide.id)
                if db_slide:
                    db_slide.image_url = new_url
                    session.commit()
        except Exception as exc:
            logger.error("[%d/%d] ✗ DB update failed for slide_id=%s: %s",
                         idx, total, slide.id, exc)
            failed += 1

    # ── Update storage cap counters ───────────────────────────────────────────
    if not dry_run and uploaded > 0:
        try:
            from services.storage_cap_service import get_caps
            from db.session import SessionLocal
            from db.models.storage_cap_state import StorageCapState
            from datetime import datetime

            caps = get_caps()
            now  = datetime.utcnow()

            with SessionLocal() as session:
                state = session.query(StorageCapState).filter(
                    StorageCapState.id == 1
                ).first()
                if state:
                    state.reserved_bytes       = (state.reserved_bytes or 0) + total_bytes
                    state.reserved_class_a_ops = (state.reserved_class_a_ops or 0) + uploaded
                    state.total_slides_stored  = (state.total_slides_stored or 0) + uploaded
                    state.updated_at           = now
                    session.commit()
                    logger.info(
                        "Storage cap counters updated: +%d bytes, +%d class-A ops, +%d slides",
                        total_bytes, uploaded, uploaded,
                    )
        except Exception as exc:
            logger.warning("Could not update storage cap counters: %s", exc)

    # ── Summary ───────────────────────────────────────────────────────────────
    logger.info("")
    logger.info("═══════════════════════════════════════")
    logger.info("  Migration %s", "DRY RUN" if dry_run else "COMPLETE")
    logger.info("  Total slides in DB    : %d", total)
    logger.info("  Uploaded to R2        : %d", uploaded)
    logger.info("  Already in R2 (skip)  : %d", skipped_already_r2)
    logger.info("  Missing local file    : %d", skipped_missing_file)
    logger.info("  Failed                : %d", failed)
    logger.info("  Total data uploaded   : %.2f MB", total_bytes / 1_048_576)
    logger.info("═══════════════════════════════════════")

    if failed > 0:
        logger.warning("%d slides failed — re-run this script to retry them.", failed)
        sys.exit(1)

    if skipped_missing_file > 0:
        logger.warning(
            "%d slides have no local file. "
            "These are likely on the production server, not your Mac. "
            "Run this script again on the production server for those.",
            skipped_missing_file,
        )

    if not dry_run:
        logger.info("Done. Local files are kept — delete them manually once you verify R2 is working.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Migrate local slide images to Cloudflare R2")
    parser.add_argument("--dry-run", action="store_true", help="Preview only — no uploads or DB writes")
    args = parser.parse_args()
    main(dry_run=args.dry_run)
