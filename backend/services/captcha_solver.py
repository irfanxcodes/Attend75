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
    Uses BOTH ddddocr and Tesseract in parallel and picks the best result.
    This hybrid approach improves accuracy on difficult captchas.
    """

    dddd_result = None
    tess_result = None

    # ── Primary: ddddocr ─────────────────────────────────────────────────────
    try:
        ocr = _get_dddd_ocr()
        result = ocr.classification(image_bytes)
        result = re.sub(r'\s+', '', result).strip().upper()  # portal requires uppercase
        
        # Validate result: portal captchas are 5 alphanumeric characters
        if result and len(result) == 5 and result.isalnum():
            dddd_result = result
            logger.info("ddddocr candidate: %s", result)
        elif result:
            logger.warning("ddddocr returned invalid format [text=%s, len=%d]", result, len(result))
        else:
            logger.warning("ddddocr returned empty result")
    except Exception as exc:
        logger.warning("ddddocr failed (%s)", exc)

    # ── Also try: Tesseract with preprocessing ────────────────────────────────
    try:
        from PIL import Image, ImageEnhance, ImageOps, ImageFilter
        import pytesseract
        import numpy as np

        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        arr = np.array(img)

        def _ocr(pil_img, psm=8) -> str:
            cfg = f"--psm {psm} --oem 3 -c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
            text = pytesseract.image_to_string(pil_img, config=cfg).strip()
            return re.sub(r"[^A-Z0-9]", "", text.upper())

        # Multiple preprocessing strategies
        grey_arr = np.mean(arr, axis=2)
        
        # Strategy 1: Dark pixel mask (removes background)
        mask1 = (grey_arr < 150).astype("uint8") * 255
        masked1 = Image.fromarray(mask1).resize(
            (img.width * 4, img.height * 4), Image.NEAREST
        )
        
        # Strategy 2: Different threshold
        mask2 = (grey_arr < 180).astype("uint8") * 255
        masked2 = Image.fromarray(mask2).resize(
            (img.width * 4, img.height * 4), Image.NEAREST
        )
        
        # Strategy 3: Invert + sharpen (for light-on-dark captchas)
        inverted = ImageOps.invert(img.convert('L'))
        sharpened = inverted.filter(ImageFilter.SHARPEN).resize(
            (img.width * 3, img.height * 3), Image.BICUBIC
        )
        
        # Try all strategies with multiple PSM modes
        candidates = [
            _ocr(masked1, psm=8),  # Single word
            _ocr(masked1, psm=7),  # Single text line
            _ocr(masked2, psm=8),  # Different threshold
            _ocr(sharpened, psm=8),  # Inverted + sharpened
            _ocr(sharpened, psm=7),
        ]
        
        # Find best Tesseract result (prefer exact length)
        exact = [c for c in candidates if len(c) == _EXPECTED_LEN and c.isalnum()]
        tess_best = exact[0] if exact else max(candidates, key=len, default="")
        
        if tess_best and len(tess_best) >= 4:
            tess_result = tess_best if len(tess_best) == 5 else None
            if tess_result:
                logger.info("Tesseract candidate: %s", tess_result)

    except Exception as exc:
        logger.warning("Tesseract failed: %s", exc)

    # ── Choose best result ─────────────────────────────────────────────────────
    # Prefer results that are exactly 5 characters
    if dddd_result and tess_result:
        # Both engines agree? Very high confidence
        if dddd_result == tess_result:
            logger.info("HIGH CONFIDENCE: Both engines agree [text=%s]", dddd_result)
            return dddd_result
        else:
            # Different results - prefer ddddocr (usually more accurate for modern captchas)
            logger.info("Engines disagree: ddddocr=%s vs Tesseract=%s, using ddddocr", dddd_result, tess_result)
            return dddd_result
    elif dddd_result:
        logger.info("Captcha extracted via ddddocr [text=%s]", dddd_result)
        return dddd_result
    elif tess_result:
        logger.info("Captcha extracted via Tesseract [text=%s]", tess_result)
        return tess_result

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
