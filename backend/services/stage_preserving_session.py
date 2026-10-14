"""
Stage-Preserving HTTP Session for API Gateway Lambda Integrations

Solves the redirect handling defect where absolute path redirects strip
API Gateway stage prefixes, causing 404 errors.

Problem:
    Request:  https://api-gateway.com/proxy/sz/SDB.aspx
    Redirect: Location: /sz/Login.aspx (absolute path from portal)
    Resolved: https://api-gateway.com/sz/Login.aspx (stage lost!)
    Result:   404 Not Found

Solution:
    This session detects absolute path redirects and preserves the stage prefix.
    It also tracks every request through the proxy monitor for admin visibility.
"""

import time
import requests
from urllib.parse import urlparse, urljoin
import logging

logger = logging.getLogger(__name__)


class StagePreservingSession(requests.Session):
    """
    HTTP Session that:
    1. Preserves API Gateway stage prefixes during redirects.
    2. Automatically tracks all portal requests through the proxy monitor.

    When using Lambda behind API Gateway with a stage prefix (e.g., /proxy),
    absolute path redirects from the upstream server will lose the stage prefix
    during standard redirect resolution.

    This session intercepts redirects and rewrites absolute path Location headers
    to preserve the stage prefix before following them.

    Example:
        session = StagePreservingSession(stage_prefix="/proxy")
        resp = session.get("https://api-gw.com/proxy/sz/SDB.aspx")
        # Portal returns: Location: /sz/Login.aspx
        # Session rewrites to: /proxy/sz/Login.aspx
        # Final URL: https://api-gw.com/proxy/sz/Login.aspx ✅
    """

    def __init__(self, stage_prefix=None):
        """
        Initialize session with optional stage prefix.

        Args:
            stage_prefix: API Gateway stage prefix to preserve (e.g., "/proxy", "/fireprox")
                         Set to None to disable stage preservation (normal requests behavior)
        """
        super().__init__()
        self.stage_prefix = stage_prefix.rstrip("/") if stage_prefix else None
        if self.stage_prefix:
            logger.debug(f"[StagePreservingSession] Initialized with stage prefix: {self.stage_prefix}")

    # ------------------------------------------------------------------
    # Monitoring — record every portal request against the proxy monitor
    # ------------------------------------------------------------------

    @staticmethod
    def _extract_tracking_url(url: str, session_proxies: dict) -> str | None:
        """
        Derive the canonical tracking key from a request URL.

        Priority: Cloudflare Worker > AWS Lambda (direct) > API Gateway (Fireprox)
                  > API Gateway→Lambda > HTTP proxy
        Returns None for un-tracked requests (e.g. plain portal IP).
        """
        parsed = urlparse(url)
        netloc = parsed.netloc

        if ".workers.dev" in netloc:
            return f"{parsed.scheme}://{netloc}"

        if ".lambda-url." in netloc and ".on.aws" in netloc:
            return f"{parsed.scheme}://{netloc}"

        if ".execute-api." in netloc and ".amazonaws.com" in netloc:
            path_parts = parsed.path.split("/")
            for stage in ("fireprox", "proxy"):
                if stage in path_parts:
                    idx = path_parts.index(stage)
                    base_path = "/".join(path_parts[: idx + 1])
                    return f"{parsed.scheme}://{netloc}{base_path}"

        # HTTP proxy
        proxy_url = (
            session_proxies.get("http")
            or session_proxies.get("https")
        )
        return proxy_url or None

    def request(self, method: str, url: str, **kwargs) -> requests.Response:
        """Override to add per-request proxy monitor tracking."""
        from services.proxy_monitor import get_proxy_monitor

        start_time = time.time()

        # Build effective proxy dict (kwargs override session-level proxies)
        request_proxies: dict = kwargs.get("proxies") or {}
        effective_proxies = {**self.proxies, **request_proxies}
        tracking_url = self._extract_tracking_url(url, effective_proxies)

        try:
            response = super().request(method, url, **kwargs)
            if tracking_url:
                elapsed_ms = (time.time() - start_time) * 1000
                get_proxy_monitor().record_success(tracking_url, elapsed_ms)
            return response
        except Exception as exc:
            if tracking_url:
                get_proxy_monitor().record_failure(
                    tracking_url, f"{type(exc).__name__}: {exc}"
                )
            raise

    # ------------------------------------------------------------------
    # Stage-prefix redirect rewriting (unchanged logic)
    # ------------------------------------------------------------------

    def rebuild_proxies(self, prepared_request, proxies):
        """
        Override to log when stage preservation is active.
        Called by requests library before sending request.
        """
        result = super().rebuild_proxies(prepared_request, proxies)
        if self.stage_prefix and prepared_request.url:
            parsed = urlparse(prepared_request.url)
            if parsed.path.startswith(self.stage_prefix):
                logger.debug(f"[StagePreservingSession] Request with stage: {prepared_request.url}")
        return result

    def resolve_redirects(self, resp, req, stream=False, timeout=None, verify=True, cert=None, proxies=None, yield_requests=False, **adapter_kwargs):
        """
        Override redirect resolution to preserve stage prefix in absolute path redirects.

        This is called by requests.Session.send() when handling 3xx redirects.
        We intercept the Location header and rewrite it if needed before
        delegating to the parent implementation.
        """
        # Only process if stage preservation is enabled and this is a redirect
        if self.stage_prefix and resp.status_code in (301, 302, 303, 307, 308):
            location = resp.headers.get("location", "")

            if location and location.startswith("/"):
                # Absolute path redirect detected
                parsed_resp_url = urlparse(resp.url)

                # Check if the original request URL has the stage prefix
                if parsed_resp_url.path.startswith(self.stage_prefix):
                    # Check if location already has the stage prefix
                    if not location.startswith(self.stage_prefix):
                        # Add stage prefix to location
                        original_location = location
                        location = f"{self.stage_prefix}{location}"

                        logger.info(
                            f"[StagePreservingSession] Rewriting redirect - "
                            f"Original: {original_location}, "
                            f"Rewritten: {location}, "
                            f"Status: {resp.status_code}"
                        )

                        # Construct full URL with stage prefix
                        full_url = f"{parsed_resp_url.scheme}://{parsed_resp_url.netloc}{location}"

                        # Update the Location header
                        resp.headers["location"] = full_url

                        logger.debug(f"[StagePreservingSession] Full redirect URL: {full_url}")
                    else:
                        logger.debug(
                            f"[StagePreservingSession] Redirect already has stage prefix: {location}"
                        )
                else:
                    logger.debug(
                        f"[StagePreservingSession] Original URL has no stage prefix, "
                        f"not rewriting redirect: {location}"
                    )
            elif location and (location.startswith("http://") or location.startswith("https://")):
                # Full URL redirect - check if it's to a different host
                parsed_location = urlparse(location)
                parsed_resp_url = urlparse(resp.url)

                if parsed_location.netloc != parsed_resp_url.netloc:
                    # Redirect to different host - rebase onto our stage prefix
                    logger.info(
                        f"[StagePreservingSession] Cross-host redirect detected - "
                        f"From: {parsed_resp_url.netloc}, "
                        f"To: {parsed_location.netloc}"
                    )

                    # Extract path from redirect target
                    redirect_path = parsed_location.path

                    # Construct new URL with our host and stage prefix
                    new_location = f"{parsed_resp_url.scheme}://{parsed_resp_url.netloc}{self.stage_prefix}{redirect_path}"

                    logger.info(
                        f"[StagePreservingSession] Rebasing cross-host redirect - "
                        f"Original: {location}, "
                        f"Rebased: {new_location}"
                    )

                    resp.headers["location"] = new_location

        # Delegate to parent implementation with potentially modified Location header
        return super().resolve_redirects(
            resp,
            req,
            stream=stream,
            timeout=timeout,
            verify=verify,
            cert=cert,
            proxies=proxies,
            yield_requests=yield_requests,
            **adapter_kwargs,
        )

    def set_stage_prefix(self, stage_prefix):
        """
        Update the stage prefix dynamically.

        Useful when switching between different proxy tiers that use
        different stage prefixes.

        Args:
            stage_prefix: New stage prefix (e.g., "/proxy", "/fireprox") or None to disable
        """
        old_prefix = self.stage_prefix
        self.stage_prefix = stage_prefix.rstrip("/") if stage_prefix else None

        if old_prefix != self.stage_prefix:
            logger.info(
                f"[StagePreservingSession] Stage prefix changed: "
                f"{old_prefix} → {self.stage_prefix}"
            )

    def disable_stage_preservation(self):
        """
        Disable stage preservation, making this behave like a normal requests.Session.

        Useful when falling back to direct portal access without API Gateway.
        """
        if self.stage_prefix:
            logger.info("[StagePreservingSession] Stage preservation disabled")
            self.stage_prefix = None
