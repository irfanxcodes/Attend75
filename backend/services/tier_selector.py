"""
Tier Selector — picks the correct egress tier for every portal request.

Priority:
  Tier 1 — AWS Lambda      (intercept mode, IP-consistent login, permanent free tier)
  Tier 2 — API Gateway     (Fireprox, rotating IPs, 12-month free tier)
  Tier 3 — Direct          (no proxy, last resort)

Usage::

    from services.tier_selector import get_scraper_config
    base_url, stage_prefix = get_scraper_config()
    session = StagePreservingSession(stage_prefix=stage_prefix)
    scraper = PortalScraper(session=session, base_url=base_url)
"""

import logging
import os

logger = logging.getLogger(__name__)

_DIRECT_BASE = os.getenv("PORTAL_BASE_URL", "http://111.93.16.209/sz")


def get_scraper_config() -> tuple[str, str | None]:
    """
    Return (base_url, stage_prefix) for the highest-priority available tier.

    base_url    — the root URL passed to PortalScraper
    stage_prefix — "/proxy", "/fireprox", or None (for direct)
    """
    # ── Tier 1: AWS Lambda ────────────────────────────────────────────────────
    try:
        from services.lambda_rotator import lambda_rotator
        if lambda_rotator.any_available():
            lambda_url = lambda_rotator.get_lambda_url()
            if lambda_url:
                # lambda_url e.g. https://pfob2x3bd0.execute-api.ap-south-1.amazonaws.com/proxy
                base_url = lambda_url.rstrip("/") + "/sz"
                logger.info("[TierSelector] Tier 1 — Lambda: %s", lambda_url)
                return base_url, "/proxy"
    except Exception as exc:
        logger.warning("[TierSelector] Lambda rotator error: %s", exc)

    # ── Tier 2: API Gateway (Fireprox) ────────────────────────────────────────
    try:
        from services.api_gateway_rotator import api_gateway_rotator
        if api_gateway_rotator.any_available():
            gw_url = api_gateway_rotator.get_gateway_url()
            if gw_url:
                # gw_url e.g. https://apzgvkhap5.execute-api.ap-southeast-1.amazonaws.com/fireprox
                base_url = gw_url.rstrip("/") + "/sz"
                logger.info("[TierSelector] Tier 2 — API Gateway: %s", gw_url)
                return base_url, "/fireprox"
    except Exception as exc:
        logger.warning("[TierSelector] API Gateway rotator error: %s", exc)

    # ── Tier 3: Direct ────────────────────────────────────────────────────────
    logger.warning("[TierSelector] Tier 3 — Direct (no proxy available)")
    return _DIRECT_BASE, None


def mark_current_tier_failed(is_session_issue: bool = False) -> None:
    """
    Call this when a login attempt fails so the active tier endpoint gets
    put on cooldown and the next attempt tries the next available endpoint.
    """
    try:
        from services.lambda_rotator import lambda_rotator
        if lambda_rotator.any_available():
            lambda_rotator.mark_current_blocked(is_session_issue=is_session_issue)
            logger.info("[TierSelector] Marked current Lambda endpoint as blocked")
            return
    except Exception:
        pass

    try:
        from services.api_gateway_rotator import api_gateway_rotator
        if api_gateway_rotator.any_available():
            api_gateway_rotator.mark_current_blocked(is_session_issue=is_session_issue)
            logger.info("[TierSelector] Marked current API Gateway endpoint as blocked")
    except Exception:
        pass
