"""
Quick verification script — tests each LLM provider individually.
Run from the backend directory:
    source .venv/bin/activate
    python scripts/verify_llm_providers.py

Shows which providers are working and which need attention.
"""

import os
import sys

# Load .env before importing anything else
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import litellm
litellm.set_verbose = False

# LiteLLM expects NVIDIA_NIM_API_KEY for nvidia_nim/ prefix
nvidia_key = os.getenv("NVIDIA_API_KEY", "")
if nvidia_key:
    os.environ["NVIDIA_NIM_API_KEY"] = nvidia_key

# NOTE: Gemini is now tested via direct REST (bypasses LiteLLM Vertex routing)


def test_gemini_direct(model_name: str) -> str:
    """Test Gemini via direct REST call."""
    key = os.getenv("GEMINI_API_KEY", "").strip()
    if not key:
        return "SKIP — GEMINI_API_KEY not set"
    try:
        import requests as _req
        r = _req.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent",
            headers={"x-goog-api-key": key, "Content-Type": "application/json"},
            json={"contents": [{"role": "user", "parts": [{"text": "Reply with exactly: OK"}]}]},
            timeout=15,
        )
        if r.status_code == 200:
            text = r.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
            return f"OK — replied: {text!r}"
        else:
            err = r.json().get("error", {})
            code = err.get("status", r.status_code)
            msg = err.get("message", "")[:100]
            if "RESOURCE_EXHAUSTED" in str(code) or "quota" in msg.lower():
                return f"QUOTA — project quota exhausted. Create key in NEW project at aistudio.google.com"
            return f"FAIL — {code}: {msg}"
    except Exception as exc:
        return f"FAIL — {str(exc)[:120]}"


def test_gemini_embed(model_name: str) -> str:
    """Test Gemini embedding via direct REST call."""
    key = os.getenv("GEMINI_API_KEY", "").strip()
    if not key:
        return "SKIP — GEMINI_API_KEY not set"
    try:
        import requests as _req
        r = _req.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:embedContent",
            headers={"x-goog-api-key": key, "Content-Type": "application/json"},
            json={"model": f"models/{model_name}", "content": {"parts": [{"text": "test"}]}},
            timeout=15,
        )
        if r.status_code == 200:
            dims = len(r.json()["embedding"]["values"])
            return f"OK — {dims} dimensions"
        else:
            err = r.json().get("error", {})
            return f"FAIL — {err.get('status', r.status_code)}: {err.get('message','')[:80]}"
    except Exception as exc:
        return f"FAIL — {str(exc)[:120]}"

TEST_MESSAGE = [{"role": "user", "content": "Reply with exactly: OK"}]

PROVIDERS_TO_TEST = [
    ("gemini-direct/gemini-3.6-flash",                  "GEMINI_API_KEY"),  # direct REST
    ("gemini-direct/gemini-3.5-flash-lite",             "GEMINI_API_KEY"),  # direct REST
    ("groq/llama-3.3-70b-versatile",                    "GROQ_API_KEY"),
    ("groq/llama-3.1-8b-instant",                       "GROQ_API_KEY"),
]

EMBEDDING_PROVIDERS_TO_TEST = [
    ("mistral/mistral-embed",                           "MISTRAL_API_KEY"),
    ("cohere/embed-multilingual-light-v3.0",            "COHERE_API_KEY"),
    ("gemini-embed/gemini-embedding-001",               "GEMINI_API_KEY"),  # direct REST
]


def check_key(env_var: str) -> bool:
    val = os.getenv(env_var, "").strip()
    return bool(val)


def test_chat(model: str, env_var: str) -> str:
    if not check_key(env_var):
        return "SKIP — key not set"
    # Gemini: use direct REST tester
    if model.startswith("gemini-direct/"):
        return test_gemini_direct(model.split("/", 1)[-1])
    try:
        from litellm import completion
        resp = completion(model=model, messages=TEST_MESSAGE, max_tokens=10, timeout=15)
        text = (resp.choices[0].message.content or "").strip()
        return f"OK — replied: {text!r}"
    except Exception as exc:
        short = str(exc)[:120]
        return f"FAIL — {short}"


def test_embed(model: str, env_var: str) -> str:
    if not check_key(env_var):
        return "SKIP — key not set"
    # Gemini: use direct REST tester
    if model.startswith("gemini-embed/"):
        return test_gemini_embed(model.split("/", 1)[-1])
    try:
        from litellm import embedding
        resp = embedding(model=model, input=["test"])
        dims = len(resp.data[0]["embedding"])
        return f"OK — {dims} dimensions"
    except Exception as exc:
        short = str(exc)[:120]
        return f"FAIL — {short}"


def main():
    print("\n" + "="*60)
    print("  LLM Provider Verification")
    print("="*60)

    print("\n── Chat / Completion Models ──")
    all_chat_ok = False
    for model, key in PROVIDERS_TO_TEST:
        result = test_chat(model, key)
        status = "✓" if result.startswith("OK") else ("·" if result.startswith("SKIP") else "✗")
        print(f"  {status}  {model:<50}  {result}")
        if result.startswith("OK"):
            all_chat_ok = True

    print("\n── Embedding Models ──")
    all_embed_ok = False
    for model, key in EMBEDDING_PROVIDERS_TO_TEST:
        result = test_embed(model, key)
        status = "✓" if result.startswith("OK") else ("·" if result.startswith("SKIP") else "✗")
        print(f"  {status}  {model:<50}  {result}")
        if result.startswith("OK"):
            all_embed_ok = True

    print("\n" + "="*60)
    if all_chat_ok and all_embed_ok:
        print("  ✓  At least one chat + one embedding provider working.")
        print("     Ready to build.")
    elif all_chat_ok:
        print("  ⚠  Chat providers work but NO embedding provider works.")
        print("     RAG will not function. Add GEMINI_API_KEY or MISTRAL_API_KEY.")
    else:
        print("  ✗  No working chat providers found.")
        print("     Check your API keys in backend/.env")
    print("="*60 + "\n")


if __name__ == "__main__":
    main()
