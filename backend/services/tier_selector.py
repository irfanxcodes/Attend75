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


def mark_current_tier_failed(base_url: str | None = None, is_session_issue: bool = False) -> None:
    """
    Penalise the endpoint that just failed. base_url is the value returned by
    get_scraper_config() so we know exactly which rotator owns it.
    """
    if not base_url:
        return

    # Determine which rotator owns this URL by checking its endpoint list
    try:
        from services.lambda_rotator import lambda_rotator
        for ep in (lambda_rotator._endpoints or []):
            if base_url.startswith(ep.rstrip("/")):
                lambda_rotator.mark_current_blocked(is_session_issue=is_session_issue)
                logger.info("[TierSelector] Marked Lambda endpoint blocked (%s): %s",
                            "session" if is_session_issue else "IP block", ep)
                return
    except Exception as exc:
        logger.warning("[TierSelector] Lambda block error: %s", exc)

    try:
        from services.api_gateway_rotator import api_gateway_rotator
        for ep in (api_gateway_rotator._endpoints or []):
            if base_url.startswith(ep.rstrip("/")):
                api_gateway_rotator.mark_current_blocked(is_session_issue=is_session_issue)
                logger.info("[TierSelector] Marked API Gateway endpoint blocked (%s): %s",
                            "session" if is_session_issue else "IP block", ep)
                return
    except Exception as exc:
        logger.warning("[TierSelector] API Gateway block error: %s", exc)


def clear_all_blocks() -> dict:
    """Clear all cooldown blocks on all tiers. Used by admin reset endpoint."""
    cleared = {"lambda": 0, "api_gateway": 0}
    try:
        from services.lambda_rotator import lambda_rotator
        cleared["lambda"] = len(lambda_rotator._blocked_until)
        lambda_rotator._blocked_until.clear()
        lambda_rotator._current_index = 0
        logger.info("[TierSelector] Cleared all Lambda blocks")
    except Exception as exc:
        logger.warning("[TierSelector] Lambda clear error: %s", exc)

    try:
        from services.api_gateway_rotator import api_gateway_rotator
        cleared["api_gateway"] = len(api_gateway_rotator._blocked_until)
        api_gateway_rotator._blocked_until.clear()
        api_gateway_rotator._current_index = 0
        logger.info("[TierSelector] Cleared all API Gateway blocks")
    except Exception as exc:
        logger.warning("[TierSelector] API Gateway clear error: %s", exc)

    return cleared


def force_next_tier() -> dict:
    """
    Force rotation to next tier by blocking all endpoints in the currently active tier.
    Blocks last for 30 minutes, then auto-recover.
    
    Returns dict with:
        - blocked_tier: which tier was blocked ("lambda", "api_gateway", or "none")
        - blocked_count: how many endpoints were blocked
        - next_tier: which tier will be used now
        - auto_unblock_minutes: when the block expires
    """
    from datetime import datetime, timedelta
    
    blocked_tier = "none"
    blocked_count = 0
    next_tier = "direct"
    auto_unblock_minutes = 30
    
    # Check which tier is currently active and block it
    try:
        from services.lambda_rotator import lambda_rotator
        if lambda_rotator.any_available():
            # Lambda is active, block all Lambda endpoints for 30 minutes
            block_until = datetime.utcnow() + timedelta(minutes=auto_unblock_minutes)
            for i in range(len(lambda_rotator._endpoints)):
                lambda_rotator._blocked_until[i] = block_until
            blocked_count = len(lambda_rotator._endpoints)
            blocked_tier = "lambda"
            logger.info("[TierSelector] Force-blocked all %d Lambda endpoints until %s", 
                       blocked_count, block_until.isoformat())
            
            # Check what's next
            from services.api_gateway_rotator import api_gateway_rotator
            if api_gateway_rotator.any_available():
                next_tier = "api_gateway"
            else:
                next_tier = "direct"
            
            return {
                "blocked_tier": blocked_tier,
                "blocked_count": blocked_count,
                "next_tier": next_tier,
                "auto_unblock_minutes": auto_unblock_minutes,
            }
    except Exception as exc:
        logger.warning("[TierSelector] Lambda force-block error: %s", exc)
    
    # If Lambda wasn't active, try API Gateway
    try:
        from services.api_gateway_rotator import api_gateway_rotator
        if api_gateway_rotator.any_available():
            # API Gateway is active, block all endpoints for 30 minutes
            block_until = datetime.utcnow() + timedelta(minutes=auto_unblock_minutes)
            for i in range(len(api_gateway_rotator._endpoints)):
                api_gateway_rotator._blocked_until[i] = block_until
            blocked_count = len(api_gateway_rotator._endpoints)
            blocked_tier = "api_gateway"
            logger.info("[TierSelector] Force-blocked all %d API Gateway endpoints until %s", 
                       blocked_count, block_until.isoformat())
            next_tier = "direct"
            
            return {
                "blocked_tier": blocked_tier,
                "blocked_count": blocked_count,
                "next_tier": next_tier,
                "auto_unblock_minutes": auto_unblock_minutes,
            }
    except Exception as exc:
        logger.warning("[TierSelector] API Gateway force-block error: %s", exc)
    
    # Nothing to block (already on direct)
    logger.warning("[TierSelector] No tier available to block — already on direct/fallback")
    return {
        "blocked_tier": "none",
        "blocked_count": 0,
        "next_tier": "direct",
        "auto_unblock_minutes": 0,
    }
