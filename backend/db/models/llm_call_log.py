"""llm_call_log — lightweight per-call log for LLM usage tracking.

One row per successful LLM call. Failures are also recorded (success=False).
Used by admin dashboard to show:
  - Which model handled each call type
  - Fallback chain position (how many models failed before success)
  - Token usage (if returned by provider)
  - Exhaustion detection (consecutive failures per model)
"""
import uuid
from datetime import datetime
from sqlalchemy import Boolean, Column, DateTime, Integer, String
from db.base import Base


def _new_uuid() -> str:
    return str(uuid.uuid4())


class LlmCallLog(Base):
    __tablename__ = "llm_call_log"

    id             = Column(String(36), primary_key=True, default=_new_uuid)
    # "ingestion" | "doubt" | "embedding" | "slide_script" | "notes" | "handout" | "quiz"
    call_type      = Column(String(32), nullable=False, index=True)
    model          = Column(String(128), nullable=False, index=True)
    # Provider extracted from model string (gemini, groq, mistral, cohere, openrouter)
    provider       = Column(String(32), nullable=False, index=True)
    success        = Column(Boolean, nullable=False, default=True)
    # Position in fallback chain (0 = first try, 1 = first fallback, etc.)
    fallback_index = Column(Integer, nullable=False, default=0)
    # Approximate tokens (not all providers return this)
    prompt_tokens  = Column(Integer, nullable=True)
    completion_tokens = Column(Integer, nullable=True)
    duration_ms    = Column(Integer, nullable=True)
    error_snippet  = Column(String(256), nullable=True)   # first 256 chars of error if failed
    created_at     = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)

    def __repr__(self) -> str:
        status = "✓" if self.success else "✗"
        return f"<LlmCallLog {status} {self.model} type={self.call_type}>"
