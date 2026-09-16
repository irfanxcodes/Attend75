"""
Captcha solver for the IBS portal.

The portal serves its captcha as an SVG with characters embedded directly
in <text> elements. We parse the XML — no OCR, no external API needed.
"""

import logging
import re

import requests

logger = logging.getLogger(__name__)


class CaptchaSolveError(Exception):
    def __init__(self, message: str, code: str = "CAPTCHA_SOLVE_FAILED"):
        super().__init__(message)
        self.code = code


def extract_from_svg(svg_content: str | bytes) -> str:
    """
    Extract captcha text directly from the SVG source.
    Characters are sorted by their x attribute (left-to-right order).
    """
    if isinstance(svg_content, bytes):
        svg_content = svg_content.decode("utf-8", errors="ignore")

    matches = re.findall(
        r'<text[^>]+\bx=["\'](\d+(?:\.\d+)?)["\'][^>]*>([^<]+)</text>',
        svg_content,
    )

    if not matches:
        raise CaptchaSolveError(
            "No <text> elements found in captcha SVG",
            code="CAPTCHA_SVG_PARSE_FAILED",
        )

    sorted_chars = sorted(matches, key=lambda m: float(m[0]))
    captcha_text = "".join(char.strip() for _, char in sorted_chars).upper()

    if not captcha_text:
        raise CaptchaSolveError(
            "Captcha SVG parsed but yielded empty text",
            code="CAPTCHA_SVG_PARSE_FAILED",
        )

    logger.info("Captcha extracted from SVG [text=%s]", captcha_text)
    return captcha_text


def fetch_and_solve(captcha_image_url: str, session: requests.Session) -> str:
    """Fetch the captcha SVG from the portal and return the solved text."""
    try:
        response = session.get(captcha_image_url, timeout=10)
        response.raise_for_status()
        content = response.content
    except Exception as exc:
        raise CaptchaSolveError(
            f"Failed to download captcha: {exc}",
            code="CAPTCHA_IMAGE_FETCH_FAILED",
        ) from exc

    if not content:
        raise CaptchaSolveError("Captcha response was empty", code="CAPTCHA_IMAGE_FETCH_FAILED")

    return extract_from_svg(content)
