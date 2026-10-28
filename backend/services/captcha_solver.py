"""
Captcha solver for the IBS portal.

The portal originally served its captcha as an SVG with characters in <text>
elements. It switched to a PNG image (190×54 px, 5-char alphanumeric) in Oct 2026.

Strategy:
  1. If content looks like SVG → use the old XML parser (backwards-compat).
  2. If content is PNG/image → use ddddocr (deep-learning captcha OCR, ~99% accurate).
  3. Falls back to Tesseract if ddddocr is unavailable.
"""

import io
import logging
import re

import requests

logger = logging.getLogger(__name__)

_EXPECTED_LEN = 5

# Lazy-initialised ddddocr instance (model loading is slow; initialise once)
_dddd_ocr = None


def _get_dddd_ocr():
    global _dddd_ocr
    if _dddd_ocr is None:
        import ddddocr
        _dddd_ocr = ddddocr.DdddOcr(show_ad=False)
    return _dddd_ocr


class CaptchaSolveError(Exception):
    def __init__(self, message: str, code: str = "CAPTCHA_SOLVE_FAILED"):
        super().__init__(message)
        self.code = code


# ── SVG solver (legacy — old portal format) ─────────────────────────────────

def extract_from_svg(svg_content: str | bytes) -> str:
    """Extract captcha text from SVG <text> elements (old portal format)."""
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


# ── PNG / image solver — ddddocr primary, Tesseract fallback ─────────────────

def extract_from_image(image_bytes: bytes) -> str:
    """
    Extract captcha text from a PNG/JPEG image.
    Uses ddddocr (deep-learning captcha model) as primary;
    falls back to Tesseract if ddddocr is unavailable.
    """

    # ── Primary: ddddocr ─────────────────────────────────────────────────────
    try:
        ocr = _get_dddd_ocr()
        result = ocr.classification(image_bytes)
        result = re.sub(r'\s+', '', result).strip().upper()  # portal requires uppercase
        if result:
            logger.info("Captcha extracted via ddddocr [text=%s]", result)
            return result
    except Exception as exc:
        logger.warning("ddddocr failed (%s), falling back to Tesseract", exc)

    # ── Fallback: Tesseract with preprocessing ────────────────────────────────
    try:
        from PIL import Image, ImageEnhance, ImageOps
        import pytesseract
        import numpy as np

        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        arr = np.array(img)

        def _ocr(pil_img, psm=8) -> str:
            cfg = f"--psm {psm} --oem 3 -c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
            text = pytesseract.image_to_string(pil_img, config=cfg).strip()
            return re.sub(r"[^A-Z0-9]", "", text.upper())

        # Dark pixel mask to strip noisy background grid
        grey_arr = np.mean(arr, axis=2)
        mask = (grey_arr < 150).astype("uint8") * 255
        masked = Image.fromarray(mask).resize(
            (img.width * 4, img.height * 4), Image.NEAREST
        )
        candidates = [_ocr(masked, psm=8), _ocr(masked, psm=7)]
        exact = [c for c in candidates if len(c) == _EXPECTED_LEN]
        best = exact[0] if exact else max(candidates, key=len, default="")

        if best:
            logger.info("Captcha extracted via Tesseract fallback [text=%s]", best)
            return best

    except Exception as exc:
        logger.warning("Tesseract fallback also failed: %s", exc)

    raise CaptchaSolveError(
        "All OCR methods failed to read captcha image",
        code="CAPTCHA_OCR_FAILED",
    )


# ── Main entry point ──────────────────────────────────────────────────────────

def fetch_and_solve(captcha_image_url: str, session: requests.Session) -> str:
    """Fetch the captcha from the portal and return the solved text."""
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
        raise CaptchaSolveError(
            "Captcha response was empty", code="CAPTCHA_IMAGE_FETCH_FAILED"
        )

    content_type = response.headers.get("content-type", "").lower()

    # Check if Lambda returned base64-encoded response
    # Lambda + API Gateway may return base64 for binary data
    if content[:20].isascii() and not content[:4] in (b"\x89PNG", b"\xff\xd8", b"<?xml", b"<svg"):
        try:
            import base64
            decoded = base64.b64decode(content)
            if decoded[:4] == b"\x89PNG" or decoded[:2] == b"\xff\xd8":
                logger.info("Detected base64-encoded image from Lambda, decoding...")
                content = decoded
        except Exception:
            pass  # Not base64, continue with original content

    # SVG path (old portal format)
    if "svg" in content_type or content[:5] == b"<?xml" or content[:4] == b"<svg":
        return extract_from_svg(content)

    # PNG/JPEG path (new portal format as of Oct 2026)
    if "image" in content_type or content[:4] == b"\x89PNG" or content[:2] == b"\xff\xd8":
        return extract_from_image(content)

    # Unknown content type — try SVG first, then image
    try:
        return extract_from_svg(content)
    except CaptchaSolveError:
        return extract_from_image(content)
