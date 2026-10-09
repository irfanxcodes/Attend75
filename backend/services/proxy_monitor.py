"""
Proxy monitoring service for tracking worker and proxy health status.
"""
import os
import json
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from dataclasses import dataclass, asdict
from collections import defaultdict

@dataclass
class ProxyStatus:
    """Status information for a single proxy/worker/api gateway."""
    url: str
    type: str  # "worker", "proxy", or "api_gateway"
    is_active: bool
    success_count: int
    failure_count: int
    last_success: Optional[datetime]
    last_failure: Optional[datetime]
    last_error: Optional[str]
    cooldown_until: Optional[datetime]
    response_time_avg_ms: float
    
    def to_dict(self):
        d = asdict(self)
        # Convert datetime to ISO format
        for key in ['last_success', 'last_failure', 'cooldown_until']:
            if d[key]:
                d[key] = d[key].isoformat()
        return d

class ProxyMonitor:
    """
    Monitors health and status of all Cloudflare Workers and HTTP proxies.
    Tracks success/failure rates, blocked IPs, and current usage.
    """
    
    def __init__(self):
        self.stats: Dict[str, ProxyStatus] = {}
        self.currently_using: Optional[str] = None  # Track the most recently used worker/proxy
        self._load_from_env()
    
    def _load_from_env(self):
        """Load proxy/worker/API Gateway URLs from environment and initialize stats."""
        # Load Cloudflare Workers
        worker_urls = os.getenv('PORTAL_WORKER_URLS', '').split(',')
        for url in worker_urls:
            url = url.strip()
            if url:
                if url not in self.stats:
                    self.stats[url] = ProxyStatus(
                        url=url,
                        type='worker',
                        is_active=True,
                        success_count=0,
                        failure_count=0,
                        last_success=None,
                        last_failure=None,
                        last_error=None,
                        cooldown_until=None,
                        response_time_avg_ms=0.0
                    )
        
        # Load AWS API Gateways
        api_gateway_urls = os.getenv('AWS_API_GATEWAY_ENDPOINTS', '').split(',')
        for url in api_gateway_urls:
            url = url.strip()
            if url:
                if url not in self.stats:
                    self.stats[url] = ProxyStatus(
                        url=url,
                        type='api_gateway',
                        is_active=True,
                        success_count=0,
                        failure_count=0,
                        last_success=None,
                        last_failure=None,
                        last_error=None,
                        cooldown_until=None,
                        response_time_avg_ms=0.0
                    )
        
        # Load HTTP Proxies
        proxy_urls = os.getenv('PORTAL_PROXIES', '').split(',')
        for url in proxy_urls:
            url = url.strip()
            if url:
                if url not in self.stats:
                    self.stats[url] = ProxyStatus(
                        url=url,
                        type='proxy',
                        is_active=True,
                        success_count=0,
                        failure_count=0,
                        last_success=None,
                        last_failure=None,
                        last_error=None,
                        cooldown_until=None,
                        response_time_avg_ms=0.0
                    )
    
    def record_success(self, url: str, response_time_ms: float):
        """Record a successful request through this proxy/worker."""
        if url not in self.stats:
            return
        
        # Mark this as currently in use
        self.currently_using = url
        
        stat = self.stats[url]
        stat.success_count += 1
        stat.last_success = datetime.utcnow()
        stat.cooldown_until = None  # Clear any cooldown
        
        # Update rolling average response time
        if stat.response_time_avg_ms == 0:
            stat.response_time_avg_ms = response_time_ms
        else:
            # Exponential moving average (90% old, 10% new)
            stat.response_time_avg_ms = 0.9 * stat.response_time_avg_ms + 0.1 * response_time_ms
    
    def record_failure(self, url: str, error: str, cooldown_seconds: int = 3600):
        """Record a failed request through this proxy/worker."""
        if url not in self.stats:
            return
        
        stat = self.stats[url]
        stat.failure_count += 1
        stat.last_failure = datetime.utcnow()
        stat.last_error = error[:200]  # Truncate long errors
        stat.cooldown_until = datetime.utcnow() + timedelta(seconds=cooldown_seconds)
    
    def get_all_status(self) -> List[Dict]:
        """Get status of all proxies/workers."""
        return [stat.to_dict() for stat in self.stats.values()]
    
    def get_active_workers(self) -> List[Dict]:
        """Get currently active (not in cooldown) Cloudflare Workers."""
        now = datetime.utcnow()
        return [
            stat.to_dict()
            for stat in self.stats.values()
            if stat.type == 'worker' 
            and (stat.cooldown_until is None or stat.cooldown_until < now)
        ]
    
    def get_active_api_gateways(self) -> List[Dict]:
        """Get currently active (not in cooldown) AWS API Gateways."""
        now = datetime.utcnow()
        return [
            stat.to_dict()
            for stat in self.stats.values()
            if stat.type == 'api_gateway'
            and (stat.cooldown_until is None or stat.cooldown_until < now)
        ]
    
    def get_active_proxies(self) -> List[Dict]:
        """Get currently active (not in cooldown) HTTP proxies."""
        now = datetime.utcnow()
        return [
            stat.to_dict()
            for stat in self.stats.values()
            if stat.type == 'proxy'
            and (stat.cooldown_until is None or stat.cooldown_until < now)
        ]
    
    def get_blocked(self) -> List[Dict]:
        """Get all proxies/workers currently in cooldown (blocked/failing)."""
        now = datetime.utcnow()
        return [
            stat.to_dict()
            for stat in self.stats.values()
            if stat.cooldown_until and stat.cooldown_until > now
        ]
    
    def get_statistics(self) -> Dict:
        """Get overall statistics."""
        now = datetime.utcnow()
        
        workers = [s for s in self.stats.values() if s.type == 'worker']
        api_gateways = [s for s in self.stats.values() if s.type == 'api_gateway']
        proxies = [s for s in self.stats.values() if s.type == 'proxy']
        
        active_workers = [w for w in workers if not w.cooldown_until or w.cooldown_until < now]
        active_api_gateways = [g for g in api_gateways if not g.cooldown_until or g.cooldown_until < now]
        active_proxies = [p for p in proxies if not p.cooldown_until or p.cooldown_until < now]
        
        total_success = sum(s.success_count for s in self.stats.values())
        total_failure = sum(s.failure_count for s in self.stats.values())
        total_requests = total_success + total_failure
        success_rate = (total_success / total_requests * 100) if total_requests > 0 else 0
        
        # Get info about currently used worker/proxy/api gateway
        currently_using_info = None
        if self.currently_using and self.currently_using in self.stats:
            stat = self.stats[self.currently_using]
            currently_using_info = {
                'url': stat.url,
                'type': stat.type,
                'last_success': stat.last_success.isoformat() if stat.last_success else None
            }
        
        return {
            'total_workers': len(workers),
            'active_workers': len(active_workers),
            'blocked_workers': len(workers) - len(active_workers),
            'total_api_gateways': len(api_gateways),
            'active_api_gateways': len(active_api_gateways),
            'blocked_api_gateways': len(api_gateways) - len(active_api_gateways),
            'total_proxies': len(proxies),
            'active_proxies': len(active_proxies),
            'blocked_proxies': len(proxies) - len(active_proxies),
            'total_requests': total_requests,
            'total_success': total_success,
            'total_failures': total_failure,
            'success_rate_percent': round(success_rate, 2),
            'avg_response_time_ms': round(
                sum(s.response_time_avg_ms for s in self.stats.values() if s.success_count > 0) / 
                len([s for s in self.stats.values() if s.success_count > 0])
                if any(s.success_count > 0 for s in self.stats.values()) else 0,
                2
            ),
            'currently_using': currently_using_info
        }

# Global singleton
_monitor = None

def get_proxy_monitor() -> ProxyMonitor:
    """Get or create the global ProxyMonitor instance."""
    global _monitor
    if _monitor is None:
        _monitor = ProxyMonitor()
    return _monitor
