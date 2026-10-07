"""
Monitored requests.Session wrapper that tracks proxy/worker usage and success/failure rates.
"""
import time
import requests
from typing import Any
from services.proxy_monitor import get_proxy_monitor

class MonitoredSession(requests.Session):
    """
    A requests.Session subclass that automatically tracks all requests
    through the proxy monitor for admin visibility.
    """
    
    def request(self, method: str, url: str, **kwargs) -> requests.Response:
        """Override request to add monitoring."""
        start_time = time.time()
        proxy_url = kwargs.get('proxies', {}).get('http') or kwargs.get('proxies', {}).get('https')
        
        try:
            response = super().request(method, url, **kwargs)
            
            # Record success
            if proxy_url:
                elapsed_ms = (time.time() - start_time) * 1000
                monitor = get_proxy_monitor()
                monitor.record_success(proxy_url, elapsed_ms)
            
            return response
            
        except Exception as exc:
            # Record failure
            if proxy_url:
                monitor = get_proxy_monitor()
                error_msg = f"{type(exc).__name__}: {str(exc)}"
                monitor.record_failure(proxy_url, error_msg)
            raise

def create_monitored_session() -> MonitoredSession:
    """Create a new monitored session for portal scraping."""
    return MonitoredSession()
