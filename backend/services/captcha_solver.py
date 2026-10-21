"""
Captcha solver for the IBS portal.

The portal originally served its captcha as an SVG with characters in <text>
elements. It switched to a PNG image (190×54 px, 5-char alphanumeric).

Strategy:
  1. If content looks like SVG → try the old XML parser (backwards-compat).
  2. If content is PNG/image → use Tesseract OCR with preprocessing.
  3. If OCR yields nothing → fall back to submitting a blank (portal will
     show a new captcha and the retry logic will try again).
"""

import io
import logging
import re

import requests

logger = logging.getLogger(__name__)

# ── Tesseract config ────────────────────────────────────────────────────────
# psm 8  = single word
# oem 3  = LSTM engine
# Whitelist: only uppercase letters + digits (IBS captcha is 5 chars, alnum)
_TESS_CONFIG = "--psm 8 --oem 3 -c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
_EXPECTED_LEN = 5


class CaptchaSolveError(Exception):
    def __init__(self, message: str, code: str = "CAPTCHA_SOLVE_FAILED"):
        super().__init__(message)
        self.code = code


# ── SVG solver (legacy, kept for backwards compatibility) ───────────────────

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


# ── PNG / image OCR solver ──────────────────────────────────────────────────

def extract_from_image(image_bytes: bytes) -> str:
    """
    Extract captcha text from a PNG/JPEG image using Tesseract OCR.
    Tries several preprocessing pipelines and returns the best result.
    """
    try:
        from PIL import Image, ImageEnhance, ImageFilter, ImageOps
        import pytesseract
        import numpy as np
    except ImportError as e:
        raise CaptchaSolveError(
            f"OCR dependencies not available: {e}",
            code="CAPTCHA_OCR_UNAVAILABLE",
        )

    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    arr = __import__('numpy').array(img)

    def _ocr(pil_img, psm=8) -> str:
        cfg = f"--psm {psm} --oem 3 -c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
        text = pytesseract.image_to_string(pil_img, config=cfg).strip()
        return re.sub(r"[^A-Z0-9]", "", text.upper())

    def _standard(base_img, scale=4, threshold=127, invert=False):
        grey = base_img.convert("L")
        if invert:
            grey = ImageOps.invert(grey)
        big = grey.resize((base_img.width * scale, base_img.height * scale), Image.LANCZOS)
        big = ImageEnhance.Contrast(big).enhance(2.5)
        return big.point(lambda p: 255 if p > threshold else 0)

    def _dark_pixel_mask(base_img, scale=4, threshold=150):
        """Keep only pixels significantly darker than background (text pixels)."""
        import numpy as np
        arr = np.array(base_img.convert("RGB"))
        grey = np.mean(arr, axis=2)
        mask = (grey < threshold).astype(np.uint8) * 255
        pil = Image.fromarray(mask)
        return pil.resize((base_img.width * scale, base_img.height * scale), Image.NEAREST)

    candidates = []

    # Pipeline 1: dark pixel mask (removes noisy background grid)
    masked = _dark_pixel_mask(img, scale=4, threshold=150)
    candidates.append(_ocr(masked, psm=8))
    candidates.append(_ocr(masked, psm=7))

    # Pipeline 2: standard greyscale + threshold
    candidates.append(_ocr(_standard(img, scale=4, threshold=100), psm=8))
    candidates.append(_ocr(_standard(img, scale=4, threshold=127), psm=8))

    # Pipeline 3: inverted
    candidates.append(_ocr(_standard(img, scale=4, threshold=127, invert=True), psm=8))

    # Pipeline 4: lower threshold (catch lighter chars)
    candidates.append(_ocr(_standard(img, scale=4, threshold=80), psm=7))

    logger.debug("Captcha OCR candidates: %s", candidates)

    # Pick best: prefer exact 5-char, then longest, then first
    exact = [c for c in candidates if len(c) == _EXPECTED_LEN]
    if exact:
        # If multiple exact matches, pick the most common one
        from collections import Counter
        best = Counter(exact).most_common(1)[0][0]
    else:
        non_empty = [c for c in candidates if c]
        best = max(non_empty, key=len) if non_empty else ""

    if not best:
        raise CaptchaSolveError(
            "OCR produced no text from captcha image",
            code="CAPTCHA_OCR_FAILED",
        )

    logger.info("Captcha extracted from PNG via OCR [text=%s, candidates=%s]", best, candidates)
    return best


# ── Main entry point ────────────────────────────────────────────────────────

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
        raise CaptchaSolveError("Captcha response was empty", code="CAPTCHA_IMAGE_FETCH_FAILED")

    content_type = response.headers.get("content-type", "").lower()

    # SVG path (old portal format)
    if "svg" in content_type or content[:5] == b"<?xml" or content[:4] == b"<svg":
        return extract_from_svg(content)

    # PNG/JPEG/image path (new portal format)
    if "image" in content_type or content[:4] == b"\x89PNG" or content[:2] == b"\xff\xd8":
        return extract_from_image(content)

    # Unknown — try SVG first, then image
    try:
        return extract_from_svg(content)
    except CaptchaSolveError:
        return extract_from_image(content)
