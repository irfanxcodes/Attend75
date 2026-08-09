"""
LLM Provider Configuration — AI Lesson Player

Confirmed working providers (as of Aug 2026):
  Chat:      Groq, Gemini 3.x (direct REST)
  Embedding: Mistral, Cohere, Gemini gemini-embedding-001

Gemini 2.0 models were shut down June 1 2026 — do not use them.
Gemini 2.5 models are "no longer available to new users" on free tier.
Use Gemini 3.x models which have explicit free tier support.

Rate limit strategy:
  - Gemini free tier: 15 RPM, 1M TPM, 1500 RPD per model
  - We call Gemini ONCE per chapter upload (ingestion) — well within limits
  - Groq is primary for doubts (instant, no per-chapter call)
  - Never call LLM in a loop — one call per concept block is eliminated (voice text is now deterministic)
"""

import os

# ── INGESTION CHAIN ────────────────────────────────────────────────────────
# Used during PDF processing: concept extraction only.
# Called ONCE per chapter upload — not per student, not per request.
# Strategy: Gemini 3.6 Flash first (best quality + large context), Groq fallback.
INGESTION_FALLBACK_CHAIN = [
    # Gemini 3.x — confirmed working free tier, called via direct REST
    "gemini/gemini-3.6-flash",       # best quality, 1M context, free
    "gemini/gemini-3.5-flash",       # slightly smaller, also free
    "gemini/gemini-3.5-flash-lite",  # fastest Gemini, free
    # Groq — fallback if Gemini is rate limited
    "groq/llama-3.3-70b-versatile",
    "groq/llama-3.1-8b-instant",
    # Last resort
    "openrouter/mistralai/mistral-7b-instruct:free",
]

# ── DOUBT CHAIN ───────────────────────────────────────────────────────────
# Called per student doubt during lesson playback.
# Strategy: Groq first (sub-second latency), Gemini as fallback.
# Gemini lite models used here to stay well within 15 RPM limit.
DOUBT_FALLBACK_CHAIN = [
    "groq/llama-3.3-70b-versatile",   # primary: fastest, free
    "groq/llama-3.1-8b-instant",      # groq fallback
    "gemini/gemini-3.1-flash-lite",   # gemini fallback: lightest model
    "gemini/gemini-3.5-flash-lite",   # gemini fallback 2
    "openrouter/mistralai/mistral-7b-instruct:free",
]

# ── EMBEDDING CHAIN ───────────────────────────────────────────────────────
# Called once per chunk during ingestion, and once per doubt question.
# Strategy: Mistral primary (confirmed 1024 dims), Gemini secondary.
EMBEDDING_FALLBACK_CHAIN = [
    "mistral/mistral-embed",                 # confirmed working, 1024 dims
    "cohere/embed-multilingual-light-v3.0",  # confirmed working, 384 dims
    "gemini/gemini-embedding-001",           # confirmed working, 3072 dims
]

# Dimension of embeddings from the PRIMARY model (mistral-embed = 1024)
# Must match the vector(N) column in chapter_chunks table
EMBEDDING_DIMENSIONS = 1024

# ── INGESTION SETTINGS ─────────────────────────────────────────────────────
INGESTION_COVERAGE_THRESHOLD = float(os.getenv("INGESTION_COVERAGE_THRESHOLD", "0.70"))
MAX_UPLOAD_SIZE_MB = int(os.getenv("MAX_UPLOAD_SIZE_MB", "20"))
MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024

# Chunk size for RAG text splitting (~400 tokens per chunk)
CHUNK_SIZE_CHARS = 1600
CHUNK_OVERLAP_CHARS = 200
