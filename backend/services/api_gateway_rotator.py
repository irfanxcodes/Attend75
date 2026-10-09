"""
AWS API Gateway rotator for Fireprox endpoints.
Provides rotating IPs through AWS infrastructure (different IP per region).
"""

import logging
import os
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)


class APIGatewayRotator:
    """
    Rotates through AWS API Gateway endpoints (Fireprox) across multiple regions.
    Each endpoint provides a different AWS IP pool for accessing the portal.
    """

    def __init__(self):
        # Parse comma-separated gateway URLs from environment
        endpoints_str = os.getenv("AWS_API_GATEWAY_ENDPOINTS", "")
        self._endpoints: list[str] = [
            url.strip() for url in endpoints_str.split(",") if url.strip()
        ]
        
        if not self._endpoints:
            logger.warning("[APIGatewayRotator] No AWS_API_GATEWAY_ENDPOINTS configured")
        else:
            logger.info(f"[APIGatewayRotator] Loaded {len(self._endpoints)} API Gateway endpoints")

        # Rotation settings
        self._rotate_every = max(int(os.getenv("AWS_API_GATEWAY_ROTATE_EVERY", "10")), 1)
        self._cooldown_seconds = max(int(os.getenv("AWS_API_GATEWAY_COOLDOWN_SECONDS", "3600")), 60)
        
        # State tracking
        self._current_index = 0
        self._usage_count = 0
        self._blocked_until: dict[int, datetime] = {}  # index -> unblock time

    def get_gateway_url(self) -> str | None:
        """
        Returns the current active API Gateway URL, or None if all are blocked.
        Automatically rotates after ROTATE_EVERY requests.
        Skips blocked gateways until their cooldown expires.
        """
        if not self._endpoints:
            return None

        # Find next available gateway (not blocked)
        attempts = 0
        max_attempts = len(self._endpoints)
        
        while attempts < max_attempts:
            # Check if current gateway is blocked
            if self._is_blocked(self._current_index):
                logger.debug(f"[APIGatewayRotator] Gateway {self._current_index} blocked, trying next")
                self._current_index = (self._current_index + 1) % len(self._endpoints)
                attempts += 1
                continue
            
            # Check if rotation is needed
            if self._usage_count >= self._rotate_every:
                logger.info(
                    f"[APIGatewayRotator] Rotating gateway after {self._usage_count} requests"
                )
                self._current_index = (self._current_index + 1) % len(self._endpoints)
                self._usage_count = 0
                
                # If new gateway is also blocked, keep trying
                if self._is_blocked(self._current_index):
                    attempts += 1
                    continue
            
            # Found available gateway
            self._usage_count += 1
            gateway_url = self._endpoints[self._current_index]
            logger.debug(
                f"[APIGatewayRotator] Using gateway {self._current_index}: {gateway_url} "
                f"(usage: {self._usage_count}/{self._rotate_every})"
            )
            return gateway_url
        
        # All gateways are blocked
        logger.error("[APIGatewayRotator] All API Gateways are blocked")
        return None

    def mark_current_blocked(self) -> None:
        """
        Mark the current gateway as blocked. It will be unavailable for
        AWS_API_GATEWAY_COOLDOWN_SECONDS before being retried.
        """
        if not self._endpoints:
            return
        
        unblock_at = datetime.utcnow() + timedelta(seconds=self._cooldown_seconds)
        self._blocked_until[self._current_index] = unblock_at
        
        gateway_url = self._endpoints[self._current_index]
        logger.warning(
            f"[APIGatewayRotator] Gateway {self._current_index} ({gateway_url}) blocked "
            f"until {unblock_at.isoformat()}Z (~{self._cooldown_seconds}s cooldown)"
        )
        
        # Reset usage count and move to next gateway
        self._usage_count = 0
        self._current_index = (self._current_index + 1) % len(self._endpoints)

    def _is_blocked(self, index: int) -> bool:
        """Check if a gateway index is currently blocked."""
        if index not in self._blocked_until:
            return False
        
        unblock_time = self._blocked_until[index]
        if datetime.utcnow() >= unblock_time:
            # Cooldown expired, remove block
            del self._blocked_until[index]
            logger.info(f"[APIGatewayRotator] Gateway {index} cooldown expired, now available")
            return False
        
        return True

    def get_status(self) -> dict:
        """Return current rotation status for monitoring."""
        if not self._endpoints:
            return {
                "configured": False,
                "total_endpoints": 0,
                "current_index": None,
                "current_url": None,
                "usage_count": 0,
                "blocked_count": 0,
            }
        
        return {
            "configured": True,
            "total_endpoints": len(self._endpoints),
            "current_index": self._current_index,
            "current_url": self._endpoints[self._current_index] if not self._is_blocked(self._current_index) else None,
            "usage_count": self._usage_count,
            "rotate_every": self._rotate_every,
            "blocked_count": len([i for i in range(len(self._endpoints)) if self._is_blocked(i)]),
            "blocked_until": {
                i: self._blocked_until[i].isoformat() + "Z"
                for i in range(len(self._endpoints))
                if i in self._blocked_until
            },
        }


# Global singleton instance
api_gateway_rotator = APIGatewayRotator()
