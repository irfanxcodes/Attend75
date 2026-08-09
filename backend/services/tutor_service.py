"""
Tutor Service — StudyMe 2.0

Persistent AI tutor for the Canvas workspace.
Superset of doubt_service — adds:
  - conversation history context
  - tutor modes: answer | socratic | hint | quiz
  - suggested UI actions (open_concept, focus_slide)
  - subject name resolution without hardcoded maps

Falls back gracefully — if RAG fails, uses concept title as context.
"""

import logging

from services.llm_router import chat_doubt
from services import rag_service

logger = logging.getLogger(__name__)

# ── Prompt templates per mode ─────────────────────────────────────────────────

_BASE_CONTEXT = """You are an AI tutor helping a university student study {subject_name}.
The student is currently on the concept: "{current_concept_title}".

Relevant course material:
{context}"""

_PROMPTS = {
    "answer": _BASE_CONTEXT + """

Previous conversation:
{conversation_summary}

Student question: {question}

Answer clearly and concisely (max 80 words). Stay completely faithful to the course material.
If the material doesn't cover the question, say so briefly.""",

    "socratic": _BASE_CONTEXT + """

Previous conversation:
{conversation_summary}

Student question: {question}

Do NOT directly answer. Instead, guide the student with a thought-provoking question that leads them toward the answer.
Keep your response under 50 words. End with a question mark.""",

    "hint": _BASE_CONTEXT + """

Previous conversation:
{conversation_summary}

Student question: {question}

Give ONE helpful hint (not the full answer) that points the student in the right direction.
Keep it under 30 words.""",

    "quiz": _BASE_CONTEXT + """

Based on the concept "{current_concept_title}", generate ONE short-answer quiz question that tests understanding.
The question should be the type a professor would ask in an exam.
Keep it under 25 words. Return only the question, nothing else.""",
}


def _build_conversation_summary(conversation: list[dict]) -> str:
    """Convert conversation history to a compact summary string."""
    if not conversation:
        return "No previous messages."
    lines = []
    for msg in conversation[-6:]:  # last 6 messages only — stay within context
        role = "Student" if msg.get("role") == "user" else "Tutor"
        content = str(msg.get("content", ""))[:200]
        lines.append(f"{role}: {content}")
    return "\n".join(lines)


def answer_tutor(
    question: str,
    upload_id: str,
    current_concept_title: str,
    subject_name: str,
    conversation: list[dict],
    mode: str = "answer",
) -> tuple[str, str, dict | None]:
    """
    Main tutor entry point.

    Args:
        question: Student's question or "" for quiz mode
        upload_id: Chapter upload UUID (for RAG)
        current_concept_title: Current concept being studied
        subject_name: Human-readable subject name
        conversation: Previous messages [{role, content}]
        mode: answer | socratic | hint | quiz

    Returns:
        (answer_text, model_used, suggested_action | None)
    """
    logger.info(
        "[TutorService] mode=%s question='%s...' concept='%s'",
        mode, question[:40], current_concept_title
    )

    # RAG retrieval — skip for quiz mode (tutor generates from concept, not question)
    context = ""
    if mode != "quiz" and upload_id:
        retrieved = rag_service.retrieve(
            question=question,
            upload_id=upload_id,
            top_k=3,
        )
        if retrieved:
            context = "\n\n---\n\n".join(retrieved)

    if not context:
        context = f"This is about: {current_concept_title}"

    conversation_summary = _build_conversation_summary(conversation)
    prompt_template = _PROMPTS.get(mode, _PROMPTS["answer"])

    prompt = prompt_template.format(
        subject_name=subject_name,
        current_concept_title=current_concept_title,
        context=context,
        conversation_summary=conversation_summary,
        question=question,
    )

    messages = [{"role": "user", "content": prompt}]

    max_tokens = {
        "answer": 200,
        "socratic": 100,
        "hint": 80,
        "quiz": 60,
    }.get(mode, 200)

    try:
        answer, model_used = chat_doubt(messages=messages, max_tokens=max_tokens)
        answer = answer.strip()

        # Word-count trim for answer/hint modes
        if mode in ("answer", "hint"):
            words = answer.split()
            limit = 100 if mode == "answer" else 40
            if len(words) > limit:
                answer = " ".join(words[:limit]) + "…"

        logger.info("[TutorService] Answered via %s (%d words)", model_used, len(answer.split()))
        return answer, model_used, None

    except Exception as exc:
        logger.error("[TutorService] All models failed: %s", exc)
        return (
            "I'm having trouble connecting right now. Please try again in a moment.",
            "error",
            None,
        )
