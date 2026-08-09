"""
Doubt Service — AI Lesson Player

Handles live student doubt answering during lesson playback.
Uses RAG to retrieve relevant chapter chunks, then calls LLM
with a tight context-aware prompt.

The answer is grounded in uploaded course material — not general LLM knowledge.
Max 80 words per answer to keep it concise and fast.
"""

import logging

from services.llm_router import chat_doubt
from services import rag_service

logger = logging.getLogger(__name__)

_DOUBT_PROMPT = """You are a university professor teaching {subject_name}.
The student is currently studying: "{current_concept_title}".

Relevant course material:
{context}

Student question: {question}

Answer the question clearly and concisely in maximum 80 words.
Stay completely faithful to the course material above.
Do not introduce information that is not in the material.
If the material does not cover the question, say so briefly."""


def answer_doubt(
    question: str,
    upload_id: str,
    current_concept_title: str,
    subject_name: str,
    script_id: str,
) -> tuple[str, str]:
    """
    Answer a student's doubt using RAG + LLM.

    Args:
        question: The student's question text
        upload_id: UUID of the chapter_uploads row (for RAG retrieval)
        current_concept_title: The concept being taught when student asked
        subject_name: Human-readable subject name e.g. "Organizational Behavior"
        script_id: For logging/analytics

    Returns:
        (answer_text, model_used)
    """
    logger.info(
        "[DoubtService] Question: '%s...' | concept: '%s'",
        question[:50], current_concept_title
    )

    # Retrieve relevant chunks from the chapter (RAG)
    retrieved_chunks = rag_service.retrieve(
        question=question,
        upload_id=upload_id,
        top_k=3,
    )

    if retrieved_chunks:
        context = "\n\n---\n\n".join(retrieved_chunks)
        logger.info("[DoubtService] Retrieved %d RAG chunks", len(retrieved_chunks))
    else:
        # No RAG available (SQLite dev mode or embedding failure)
        # Use the concept title as minimal context
        context = f"This question is about: {current_concept_title}"
        logger.info("[DoubtService] No RAG chunks — using concept title as context")

    prompt = _DOUBT_PROMPT.format(
        subject_name=subject_name,
        current_concept_title=current_concept_title,
        context=context,
        question=question,
    )

    messages = [{"role": "user", "content": prompt}]

    try:
        answer, model_used = chat_doubt(messages=messages, max_tokens=200)
        # Trim to ensure we don't go over 80 words
        words = answer.strip().split()
        if len(words) > 100:  # allow slight overflow
            answer = " ".join(words[:100]) + "..."
        logger.info("[DoubtService] Answered via %s (%d words)", model_used, len(words))
        return answer.strip(), model_used
    except Exception as exc:
        logger.error("[DoubtService] All models failed: %s", exc)
        return (
            "I'm having trouble connecting right now. Please try again in a moment.",
            "error"
        )
