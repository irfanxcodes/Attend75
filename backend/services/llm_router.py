"""
LLM Router — AI Lesson Player

Wraps LiteLLM with multi-provider fallback chain execution.
Automatically tries the next provider on rate-limit (429) or quota errors.

Gemini is called directly via REST API (bypasses LiteLLM's Vertex AI routing bug).
All other providers go through LiteLLM.
"""

import json
import logging
import os
import requests
from typing import Any

import litellm
from litellm import completion, embedding

from services.llm_config import (
    DOUBT_FALLBACK_CHAIN,
    EMBEDDING_FALLBACK_CHAIN,
    INGESTION_FALLBACK_CHAIN,
)

logger = logging.getLogger(__name__)

litellm.set_verbose = os.getenv("LITELLM_VERBOSE", "false").lower() == "true"

# Gemini AI Studio REST endpoint — bypasses LiteLLM Vertex routing
_GEMINI_REST_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
_GEMINI_TIMEOUT = 60


def _setup_provider_env() -> None:
    """Normalize provider API key env var names that LiteLLM expects."""
    nvidia = os.getenv("NVIDIA_API_KEY", "").strip()
    if nvidia and not os.getenv("NVIDIA_NIM_API_KEY", "").strip():
        os.environ["NVIDIA_NIM_API_KEY"] = nvidia


_setup_provider_env()


# ── Gemini Direct REST Call ───────────────────────────────────────────────────

def _call_gemini_direct(
    messages: list[dict],
    model_name: str = "gemini-2.0-flash",
    max_tokens: int = 4096,
    temperature: float = 0.1,
) -> str:
    """
    Call Gemini AI Studio directly via REST — bypasses LiteLLM's Vertex routing.
    Implements exponential backoff for RPM/TPM 429 errors (not project-level quota=0).
    Raises RuntimeError on failure.
    """
    import time

    key = os.getenv("GEMINI_API_KEY", "").strip()
    if not key:
        raise RuntimeError("GEMINI_API_KEY not set")

    # Convert OpenAI messages → Gemini format
    contents = []
    for msg in messages:
        role = "model" if msg.get("role") == "assistant" else "user"
        contents.append({"role": role, "parts": [{"text": msg.get("content", "")}]})

    payload = {
        "contents": contents,
        "generationConfig": {
            "maxOutputTokens": max_tokens,
            "temperature": temperature,
        },
    }

    url = f"{_GEMINI_REST_BASE}/{model_name}:generateContent"
    headers = {"x-goog-api-key": key, "Content-Type": "application/json"}

    # Exponential backoff for RPM/TPM rate limits (not project quota=0)
    backoff_delays = [2, 4, 8]  # seconds
    for attempt, delay in enumerate([0] + backoff_delays):
        if delay > 0:
            logger.info("[Gemini] Rate limited, retrying in %ds (attempt %d)...", delay, attempt + 1)
            time.sleep(delay)

        resp = requests.post(url, headers=headers, json=payload, timeout=_GEMINI_TIMEOUT)

        if resp.status_code == 200:
            return resp.json()["candidates"][0]["content"]["parts"][0]["text"]

        if resp.status_code == 429:
            err = resp.json().get("error", {})
            # Check if this is project-level quota=0 (not retryable) vs RPM/TPM (retryable)
            is_project_quota_zero = any(
                "PerDay" in v.get("quotaId", "")
                for d in err.get("details", [])
                for v in d.get("violations", [])
                if any(lim in v.get("quotaId", "") for lim in ["PerDay", "PerDayPer"])
            )
            if is_project_quota_zero and attempt == 0:
                # Project quota is zero — no point retrying
                raise RuntimeError(
                    f"Gemini project quota is zero (free tier not enabled). "
                    f"Create API key in a new project at aistudio.google.com"
                )
            if attempt < len(backoff_delays):
                continue  # retry with backoff
            resp.raise_for_status()

        # Non-429 error — raise immediately
        resp.raise_for_status()

    raise RuntimeError("Gemini: all retry attempts failed")


def _is_gemini_model(model: str) -> bool:
    return model.startswith("gemini/")


def _gemini_model_name(model: str) -> str:
    """'gemini/gemini-2.0-flash' → 'gemini-2.0-flash'"""
    return model.split("/", 1)[-1]


def _is_quota_error(exc: Exception) -> bool:
    msg = str(exc).lower()
    return any(k in msg for k in ["429", "quota", "rate limit", "resource_exhausted", "too many"])


# ── Main Fallback Chat ────────────────────────────────────────────────────────

def chat_with_fallback(
    messages: list[dict],
    chain: list[str],
    max_tokens: int = 4096,
    temperature: float = 0.1,
) -> tuple[str, str]:
    """
    Try each model in the chain until one succeeds.
    Returns (response_text, model_used).
    Raises RuntimeError if all providers fail.
    """
    last_error: Exception | None = None

    for model in chain:
        try:
            # Gemini: use direct REST to avoid LiteLLM Vertex routing
            if _is_gemini_model(model):
                logger.info("[LLMRouter] Trying Gemini (direct REST): %s", model)
                text = _call_gemini_direct(
                    messages=messages,
                    model_name=_gemini_model_name(model),
                    max_tokens=max_tokens,
                    temperature=temperature,
                )
                logger.info("[LLMRouter] Gemini success: %s", model)
                return text, model

            # All other providers: LiteLLM
            logger.info("[LLMRouter] Trying model: %s", model)
            response = completion(
                model=model,
                messages=messages,
                max_tokens=max_tokens,
                temperature=temperature,
                timeout=30,
            )
            content = response.choices[0].message.content or ""
            logger.info("[LLMRouter] Success: %s", model)
            return content, model

        except Exception as exc:
            logger.warning("[LLMRouter] Model %s failed: %s", model, str(exc)[:120])
            last_error = exc
            continue

    raise RuntimeError(f"All LLM providers failed. Last error: {last_error}")


# ── Embedding with Fallback ───────────────────────────────────────────────────

def embed_with_fallback(text: str) -> tuple[list[float], str]:
    """
    Embed text using the embedding fallback chain.
    Returns (embedding_vector, model_used).
    Raises RuntimeError if all providers fail.
    """
    last_error: Exception | None = None

    for model in EMBEDDING_FALLBACK_CHAIN:
        # Gemini embeddings via direct REST
        if _is_gemini_model(model):
            try:
                key = os.getenv("GEMINI_API_KEY", "").strip()
                if not key:
                    continue
                model_name = _gemini_model_name(model)
                url = f"{_GEMINI_REST_BASE}/{model_name}:embedContent"
                resp = requests.post(
                    url,
                    headers={"x-goog-api-key": key, "Content-Type": "application/json"},
                    json={
                        "model": f"models/{model_name}",
                        "content": {"parts": [{"text": text[:8000]}]},
                    },
                    timeout=30,
                )
                resp.raise_for_status()
                vector = resp.json()["embedding"]["values"]
                logger.info("[LLMRouter] Gemini embedding success: %s (dims=%d)", model, len(vector))
                return vector, model
            except Exception as exc:
                logger.warning("[LLMRouter] Gemini embedding failed: %s", str(exc)[:120])
                last_error = exc
                continue

        # Other embedding providers via LiteLLM
        try:
            logger.info("[LLMRouter] Trying embedding: %s", model)
            response = embedding(model=model, input=[text])
            vector = response.data[0]["embedding"]
            logger.info("[LLMRouter] Embedding success: %s (dims=%d)", model, len(vector))
            return vector, model
        except Exception as exc:
            logger.warning("[LLMRouter] Embedding %s failed: %s", model, str(exc)[:120])
            last_error = exc
            continue

    raise RuntimeError(f"All embedding providers failed. Last error: {last_error}")


# ── Convenience Wrappers ──────────────────────────────────────────────────────

def chat_ingestion(messages: list[dict], max_tokens: int = 8192) -> tuple[str, str]:
    """Ingestion-time LLM calls (concept extraction, lesson compilation)."""
    return chat_with_fallback(
        messages=messages,
        chain=INGESTION_FALLBACK_CHAIN,
        max_tokens=max_tokens,
        temperature=0.1,
    )


def chat_doubt(messages: list[dict], max_tokens: int = 512) -> tuple[str, str]:
    """Live student doubt answering."""
    return chat_with_fallback(
        messages=messages,
        chain=DOUBT_FALLBACK_CHAIN,
        max_tokens=max_tokens,
        temperature=0.3,
    )
