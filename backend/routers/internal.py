"""
Internal endpoints — not exposed to users.
Used for machine-to-machine communication (e.g. GitHub Actions → Oracle).
"""
import logging

from fastapi import APIRouter, Header, HTTPException, Request

router = APIRouter(prefix="/internal", tags=["internal"])
logger = logging.getLogger(__name__)


@router.post("/scrape-result")
async def receive_scrape_result(
    request: Request,
    x_scraper_secret: str | None = Header(default=None),
    x_job_id: str | None = Header(default=None),
):
    """
    Webhook endpoint — GitHub Actions runner POSTs scraped data here.
    Verified with HMAC secret or plain shared secret header.
    """
    from services.github_scraper_service import receive_result, verify_webhook_signature

    body = await request.body()

    # Verify secret
    if not verify_webhook_signature(body, x_scraper_secret or ""):
        logger.warning("[Internal] Scrape result rejected — invalid secret. job_id=%s", x_job_id)
        raise HTTPException(status_code=403, detail="Invalid scraper secret")

    try:
        result = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    job_id = x_job_id or result.get("job_id", "unknown")
    receive_result(job_id, result)

    logger.info("[Internal] Scrape result received job_id=%s status=%s", job_id, result.get("status"))
    return {"ok": True, "job_id": job_id}
