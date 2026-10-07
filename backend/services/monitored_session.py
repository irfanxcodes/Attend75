"""
Monitored requests.Session wrapper that tracks proxy/worker usage and success/failure rates.
"""
import time
import logging
import requests
from typing import Any
from urllib.parse import urlparse
from services.proxy_monitor import get_proxy_monitor

_logger = logging.getLogger(__name__)

class MonitoredSession(requests.Session):
    """
    A requests.Session subclass that automatically tracks all requests
    through the proxy monitor for admin visibility.
    
    Tracks both:
    1. Cloudflare Worker URLs (detected from request URL)
    2. HTTP proxies (from session.proxies or request proxies parameter)
    """
    
    def request(self, method: str, url: str, **kwargs) -> requests.Response:
        """Override request to add monitoring."""
        start_time = time.time()
        monitor = get_proxy_monitor()
        
        # Detect proxy source (priority: request param > session.proxies)
        request_proxies = kwargs.get('proxies', {})
        session_proxies = self.proxies if hasattr(self, 'proxies') else {}
        proxy_url = (
            request_proxies.get('http') or 
            request_proxies.get('https') or
            session_proxies.get('http') or 
            session_proxies.get('https')
        )
        
        # Detect if request is going to a Cloudflare Worker
        # Workers are identified by domains containing ".workers.dev"
        worker_url = None
        parsed_url = urlparse(url)
        if '.workers.dev' in parsed_url.netloc:
            # Extract base worker URL (protocol + host)
            worker_url = f"{parsed_url.scheme}://{parsed_url.netloc}"
        
        # Determine what we're tracking (worker takes priority over proxy)
        tracking_url = worker_url or proxy_url
        
        _logger.info(
            "[MonitoredSession] Request: method=%s url=%s worker=%s proxy=%s tracking=%s",
            method, url[:100], worker_url, proxy_url, tracking_url
        )
        
        try:
            response = super().request(method, url, **kwargs)
            
            # Record success
            if tracking_url:
                elapsed_ms = (time.time() - start_time) * 1000
                _logger.info(
                    "[MonitoredSession] Success: tracking_url=%s elapsed_ms=%.2f",
                    tracking_url, elapsed_ms
                )
                monitor.record_success(tracking_url, elapsed_ms)
            else:
                _logger.warning(
                    "[MonitoredSession] No tracking_url found for request to %s (worker=%s, proxy=%s)",
                    url[:100], worker_url, proxy_url
                )
            
            return response
            
        except Exception as exc:
            # Record failure
            if tracking_url:
                error_msg = f"{type(exc).__name__}: {str(exc)}"
                _logger.error(
                    "[MonitoredSession] Failure: tracking_url=%s error=%s",
                    tracking_url, error_msg
                )
                monitor.record_failure(tracking_url, error_msg)
            raise

def create_monitored_session() -> MonitoredSession:
    """Create a new monitored session for portal scraping."""
    return MonitoredSession()
