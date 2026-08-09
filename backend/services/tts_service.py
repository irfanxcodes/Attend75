"""
TTS Service — Gemini Neural Voice

Generates high-quality speech audio for lesson blocks using Gemini TTS.
Audio is pre-generated during ingestion and cached as WAV files.
Falls back gracefully — if TTS fails, the frontend uses Web Speech API.

Audio format: audio/l16 (raw PCM 24kHz mono) → converted to WAV in-memory.
WAV is universally supported by all browsers natively.
"""

import base64
import logging
import os
import struct
import wave
import io
from pathlib import Path

import requests

logger = logging.getLogger(__name__)

# Where audio files are stored — served as static files
_AUDIO_DIR = Path(__file__).resolve().parent.parent / "uploads" / "lesson_audio"
_AUDIO_DIR.mkdir(parents=True, exist_ok=True)

_GEMINI_TTS_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    "gemini-3.1-flash-tts-preview:generateContent"
)

# Voice options — Kore is clear, professional, Indian-English friendly
# Other options: Aoede, Charon, Fenrir, Puck, Leda, Orus, Zephyr
_DEFAULT_VOICE = "Kore"

# PCM specs returned by Gemini TTS
_SAMPLE_RATE = 24000
_CHANNELS = 1
_SAMPLE_WIDTH = 2  # 16-bit = 2 bytes


def _pcm_to_wav(pcm_bytes: bytes) -> bytes:
    """Convert raw PCM bytes to a proper WAV file in memory."""
    buf = io.BytesIO()
    with wave.open(buf, 'wb') as wf:
        wf.setnchannels(_CHANNELS)
        wf.setsampwidth(_SAMPLE_WIDTH)
        wf.setframerate(_SAMPLE_RATE)
        wf.writeframes(pcm_bytes)
    return buf.getvalue()


def _generate_audio(text: str, voice: str = _DEFAULT_VOICE) -> bytes | None:
    """
    Call Gemini TTS API for a single text string.
    Returns WAV bytes or None if generation fails.
    Never raises — TTS failure is non-blocking.
    """
    key = os.getenv("GEMINI_API_KEY", "").strip()
    if not key:
        logger.debug("[TTS] GEMINI_API_KEY not set — skipping TTS generation")
        return None

    if not text or not text.strip():
        return None

    # Truncate very long texts — Gemini TTS has ~3000 char limit
    text = text.strip()[:2500]

    payload = {
        "contents": [{"role": "user", "parts": [{"text": text}]}],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {
                "voiceConfig": {
                    "prebuiltVoiceConfig": {"voiceName": voice}
                }
            },
        },
    }

    try:
        resp = requests.post(
            _GEMINI_TTS_URL,
            headers={"x-goog-api-key": key, "Content-Type": "application/json"},
            json=payload,
            timeout=30,
        )

        if resp.status_code == 429:
            err = resp.json().get("error", {})
            # Check if daily limit exhausted vs per-minute rate limit
            violations = [
                v.get("quotaId", "")
                for d in err.get("details", [])
                for v in d.get("violations", [])
            ]
            is_daily_limit = any("PerDay" in v for v in violations)
            if is_daily_limit:
                logger.warning("[TTS] Daily quota exhausted — audio generation paused until midnight PT")
                return None  # Stop trying, quota won't recover until next day
            logger.warning("[TTS] Rate limited — skipping audio for this block")
            return None

        if resp.status_code != 200:
            logger.warning("[TTS] HTTP %d — skipping audio", resp.status_code)
            return None

        data = resp.json()
        parts = data["candidates"][0]["content"]["parts"]
        for part in parts:
            if "inlineData" in part:
                b64_data = part["inlineData"]["data"]
                pcm_bytes = base64.b64decode(b64_data)
                return _pcm_to_wav(pcm_bytes)

        logger.warning("[TTS] No audio part in response")
        return None

    except requests.Timeout:
        logger.warning("[TTS] Request timed out — skipping")
        return None
    except Exception as exc:
        logger.warning("[TTS] Generation failed: %s", str(exc)[:150])
        return None


def get_audio_path(block_id: str) -> Path:
    """Return the filesystem path where a block's audio file should live."""
    return _AUDIO_DIR / f"{block_id}.wav"


def get_audio_url(block_id: str) -> str:
    """Return the URL path clients use to fetch the audio file."""
    return f"/uploads/lesson_audio/{block_id}.wav"


def audio_exists(block_id: str) -> bool:
    """True if the audio file is already cached on disk."""
    return get_audio_path(block_id).exists()


def generate_and_cache(block_id: str, voice_text: str, voice: str = _DEFAULT_VOICE) -> bool:
    """
    Generate TTS audio for a block and save to disk.
    Returns True if audio was successfully created, False otherwise.
    Idempotent — skips if file already exists.
    """
    if audio_exists(block_id):
        return True

    if not voice_text or not voice_text.strip():
        return False

    wav_bytes = _generate_audio(voice_text, voice)
    if not wav_bytes:
        return False

    try:
        path = get_audio_path(block_id)
        path.write_bytes(wav_bytes)
        logger.debug("[TTS] Saved audio: %s (%d KB)", path.name, len(wav_bytes) // 1024)
        return True
    except Exception as exc:
        logger.warning("[TTS] Failed to save audio file: %s", exc)
        return False


def generate_for_script(script_id: str, blocks: list, max_blocks: int = 50) -> int:
    """
    Pre-generate TTS audio for all narration blocks in a lesson script.
    Called during ingestion — runs synchronously, best-effort.
    
    Adds a 5-second delay between requests to stay within Gemini's
    15 RPM free tier limit without hitting rate limits.

    Only generates audio for narration, definition, and recap blocks.
    Skips keyword, formula, diagram, quiz blocks (short/technical content).

    Args:
        script_id: For logging
        blocks: list of LessonBlock ORM objects or dicts with id, block_type, voice_text
        max_blocks: Safety cap to avoid burning TTS quota on huge chapters

    Returns:
        Number of audio files successfully generated.
    """
    import time

    AUDIO_BLOCK_TYPES = {"narration", "definition", "recap", "example"}
    # 5s delay = 12 RPM — safely under the 15 RPM free tier limit
    REQUEST_DELAY_SECONDS = 5

    generated = 0
    skipped = 0
    failed = 0

    for block in blocks:
        block_id = str(getattr(block, 'id', None) or block.get('id', ''))
        block_type = getattr(block, 'block_type', None) or block.get('block_type', '')
        voice_text = getattr(block, 'voice_text', None) or block.get('voice_text', '')

        if block_type not in AUDIO_BLOCK_TYPES:
            skipped += 1
            continue

        if not voice_text or not voice_text.strip():
            skipped += 1
            continue

        if generated >= max_blocks:
            logger.info("[TTS] Reached max_blocks=%d limit, stopping", max_blocks)
            break

        # Skip if already cached
        if audio_exists(block_id):
            generated += 1
            continue

        # Rate limit delay — wait before each request (except first)
        if generated > 0:
            time.sleep(REQUEST_DELAY_SECONDS)

        success = generate_and_cache(block_id, voice_text)
        if success:
            generated += 1
        else:
            failed += 1
            # If we've failed 3 times in a row, daily quota likely exhausted — stop
            if failed >= 3:
                logger.warning("[TTS] Multiple failures — daily quota likely exhausted, stopping early")
                break

    logger.info(
        "[TTS] Script %s: generated=%d skipped=%d failed=%d",
        script_id[:8], generated, skipped, failed
    )
    return generated
