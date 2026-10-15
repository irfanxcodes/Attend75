"""
AWS Lambda IP Rotation Service

Manages rotation across multiple AWS Lambda function URLs deployed in different regions.
Each Lambda invocation uses a different AWS IP from the regional pool.

Free Tier: 1,000,000 requests/month PERMANENT (never expires)
Safe Cap: 900,000 requests/month (10% safety margin)
"""
import logging
import os
from datetime import datetime, timedelta
from typing import Optional

logger = logging.getLogger(__name__)


class LambdaRotator:
    """
    Rotates across AWS Lambda function URLs with usage tracking and hard cap enforcement.
    
    Similar to API Gateway rotator but with:
    - Permanent free tier (vs 12 months)
    - Monthly usage cap (900k requests)
    - Automatic reset on 1st of month
    """
    
    def __init__(self):
        # Parse Lambda endpoints from env
        endpoints_str = os.getenv("AWS_LAMBDA_ENDPOINTS", "")
        self._endpoints = [e.strip() for e in endpoints_str.split(",") if e.strip()]
        
        if not self._endpoints:
            logger.warning("[LambdaRotator] No Lambda endpoints configured")
        else:
            logger.info(f"[LambdaRotator] Initialized with {len(self._endpoints)} endpoints")
        
        # Rotation settings
        self._rotate_every = max(int(os.getenv("AWS_LAMBDA_ROTATE_EVERY", "10")), 1)
        self._cooldown_seconds = max(int(os.getenv("AWS_LAMBDA_COOLDOWN_SECONDS", "3600")), 60)
        self._session_cooldown_seconds = max(int(os.getenv("AWS_LAMBDA_SESSION_COOLDOWN_SECONDS", "300")), 60)
        
        # Hard cap settings (stay safely under 1M free tier limit)
        self._monthly_cap = int(os.getenv("AWS_LAMBDA_MONTHLY_CAP", "900000"))  # 900k = 90% of 1M
        
        # State tracking
        self._current_index = 0
        self._usage_count = 0  # Tracks rotations (for rotation logic)
        self._monthly_usage = 0  # Tracks actual Lambda invocations (for cap)
        self._current_month = datetime.utcnow().month
        self._blocked_until: dict[int, datetime] = {}  # index -> unblock time
        
        logger.info(
            f"[LambdaRotator] Config: rotate_every={self._rotate_every}, "
            f"cooldown={self._cooldown_seconds}s, monthly_cap={self._monthly_cap}"
        )
    
    def get_lambda_url(self) -> Optional[str]:
        """
        Get the current Lambda function URL, rotating if needed.
        Returns None if all endpoints are blocked or monthly cap reached.
        """
        if not self._endpoints:
            return None
        
        # Check if monthly cap reached
        self._check_monthly_reset()
        if self._monthly_usage >= self._monthly_cap:
            logger.warning(
                f"[LambdaRotator] Monthly cap reached: {self._monthly_usage}/{self._monthly_cap} requests"
            )
            return None
        
        # Rotate if usage count threshold met
        if self._usage_count >= self._rotate_every:
            self._usage_count = 0
            self._current_index = (self._current_index + 1) % len(self._endpoints)
            logger.info(f"[LambdaRotator] Rotating to endpoint {self._current_index}")
        
        # Find an unblocked endpoint
        attempts = 0
        while attempts < len(self._endpoints):
            # Check if current endpoint is blocked
            if self._current_index in self._blocked_until:
                if datetime.utcnow() < self._blocked_until[self._current_index]:
                    # Still blocked, try next
                    self._current_index = (self._current_index + 1) % len(self._endpoints)
                    attempts += 1
                    continue
                else:
                    # Unblock expired
                    del self._blocked_until[self._current_index]
                    logger.info(f"[LambdaRotator] Endpoint {self._current_index} unblocked")
            
            # Found unblocked endpoint
            self._usage_count += 1
            self._monthly_usage += 1  # Increment monthly counter
            
            url = self._endpoints[self._current_index]
            logger.debug(
                f"[LambdaRotator] Using endpoint {self._current_index}: {url} "
                f"(usage: {self._usage_count}/{self._rotate_every}, "
                f"monthly: {self._monthly_usage}/{self._monthly_cap})"
            )
            return url
        
        # All endpoints blocked
        logger.warning("[LambdaRotator] All Lambda endpoints are blocked")
        return None
    
    def mark_current_blocked(self, is_session_issue: bool = False) -> None:
        """
        Mark the current Lambda endpoint as blocked.
        
        Args:
            is_session_issue: If True, uses shorter session cooldown (5 min).
                            If False, uses full IP block cooldown (1 hour).
        """
        if not self._endpoints:
            return
        
        cooldown = self._session_cooldown_seconds if is_session_issue else self._cooldown_seconds
        unblock_at = datetime.utcnow() + timedelta(seconds=cooldown)
        self._blocked_until[self._current_index] = unblock_at
        
        lambda_url = self._endpoints[self._current_index]
        block_reason = "session issue" if is_session_issue else "IP block"
        logger.warning(
            f"[LambdaRotator] Endpoint {self._current_index} ({lambda_url}) blocked "
            f"due to {block_reason} until {unblock_at.isoformat()}Z (~{cooldown}s cooldown)"
        )
        
        # Reset usage count and move to next endpoint
        self._usage_count = 0
        self._current_index = (self._current_index + 1) % len(self._endpoints)
    
    def get_available_count(self) -> int:
        """Return the number of currently unblocked Lambda endpoints."""
        if not self._endpoints:
            return 0
        
        now = datetime.utcnow()
        return sum(
            1 for i in range(len(self._endpoints))
            if i not in self._blocked_until or now >= self._blocked_until[i]
        )
    
    def get_usage_stats(self) -> dict:
        """
        Return current usage statistics for monitoring.
        
        Returns:
            dict with:
            - monthly_usage: Total Lambda invocations this month
            - monthly_cap: Maximum allowed per month
            - usage_percent: Percentage of cap used
            - remaining: Requests remaining before cap
            - current_month: Current month being tracked
        """
        self._check_monthly_reset()
        
        return {
            "monthly_usage": self._monthly_usage,
            "monthly_cap": self._monthly_cap,
            "usage_percent": round((self._monthly_usage / self._monthly_cap * 100), 2),
            "remaining": self._monthly_cap - self._monthly_usage,
            "current_month": self._current_month,
            "available_endpoints": self.get_available_count(),
            "total_endpoints": len(self._endpoints),
        }
    
    def _check_monthly_reset(self) -> None:
        """Reset monthly usage counter if we've entered a new month."""
        current_month = datetime.utcnow().month
        if current_month != self._current_month:
            old_usage = self._monthly_usage
            self._monthly_usage = 0
            self._current_month = current_month
            logger.info(
                f"[LambdaRotator] Monthly reset: cleared {old_usage} requests, "
                f"now tracking month {current_month}"
            )
    
    def is_available(self) -> bool:
        """Check if Lambda rotation is available (not at cap and has endpoints)."""
        if not self._endpoints:
            return False
        
        self._check_monthly_reset()
        
        # Check monthly cap
        if self._monthly_usage >= self._monthly_cap:
            return False
        
        # Check if any endpoint is unblocked
        return self.get_available_count() > 0

    def any_available(self) -> bool:
        """Alias for is_available() — matches the interface used by APIGatewayRotator and proxy_rotator."""
        return self.is_available()


# Global singleton instance
lambda_rotator = LambdaRotator()
