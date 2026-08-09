"""
Quiz Service — StudyMe 2.0 Phase 5

Evaluates student answers to concept questions using LLM.
Grounded in course material via RAG.

Returns a structured verdict with:
  - is_correct: bool
  - verdict: 'correct' | 'partial' | 'incorrect'
  - feedback: specific feedback on the student's answer
  - hint: optional hint for another try (if incorrect)
  - model_used: which LLM responded

The LLM is instructed to be faithful to the course material —
it will not accept answers that contradict the source, even if
technically correct by general knowledge.
"""

import logging

from services.llm_router import chat_doubt
from services import rag_service

logger = logging.getLogger(__name__)

_EVAL_PROMPT = """You are evaluating a university student's answer to an exam question.

Subject: {subject_name}
Concept: {concept_title}

Relevant course material:
{context}

Question: {question}
Expected answer (from course material): {expected_answer}
Student's answer: {student_answer}

Evaluate the student's answer strictly based on the course material above.

Respond with a JSON object in this exact format:
{{
  "verdict": "correct" | "partial" | "incorrect",
  "is_correct": true | false,
  "feedback": "Brief specific feedback on what was right/wrong (max 60 words). Be constructive.",
  "hint": "A single helpful hint for the student to try again (max 25 words). Only include if verdict is 'partial' or 'incorrect'. Otherwise null."
}}

Rules:
- "correct": answer captures the key idea faithfully
- "partial": answer is partly right but missing important detail or has a minor error
- "incorrect": answer is wrong, off-topic, or contradicts the course material
- is_correct: true only for "correct", false for "partial" and "incorrect"
- feedback must be specific — not just "Good job" or "That's wrong"
- hint should guide without giving away the answer"""

_GENERATE_QUESTION_PROMPT = """You are a university professor creating an exam question.

Subject: {subject_name}
Concept: {concept_title}

Course material:
{context}

Generate ONE short-answer exam question about this concept.
The question should test deep understanding, not just memorization.
For numerical concepts, include a calculation question.
Keep it under 30 words.
Return only the question text, nothing else."""


def evaluate_answer(
    question: str,
    student_answer: str,
    expected_answer: str,
    concept_title: str,
    upload_id: str,
    subject_name: str,
) -> dict:
    """
    Evaluate a student's answer using LLM + RAG.

    Returns:
        {verdict, is_correct, feedback, hint, model_used}
    """
    import json, re

    logger.info(
        "[QuizService] Evaluating answer for concept='%s' answer='%s...'",
        concept_title, student_answer[:40]
    )

    # RAG: get relevant context
    context = ""
    if upload_id:
        chunks = rag_service.retrieve(question=question, upload_id=upload_id, top_k=3)
        if chunks:
            context = "\n\n---\n\n".join(chunks)

    if not context:
        context = f"This question is about: {concept_title}. Expected answer: {expected_answer}"

    prompt = _EVAL_PROMPT.format(
        subject_name=subject_name,
        concept_title=concept_title,
        context=context,
        question=question,
        expected_answer=expected_answer[:500],
        student_answer=student_answer[:500],
    )

    messages = [{"role": "user", "content": prompt}]

    try:
        raw, model_used = chat_doubt(messages=messages, max_tokens=300)

        # Parse JSON from response
        result = _parse_json_response(raw)
        if result:
            logger.info(
                "[QuizService] verdict=%s via %s",
                result.get("verdict", "?"), model_used
            )
            return {
                "verdict": result.get("verdict", "incorrect"),
                "is_correct": bool(result.get("is_correct", False)),
                "feedback": result.get("feedback", "Keep trying!"),
                "hint": result.get("hint"),
                "model_used": model_used,
            }
        else:
            # JSON parse failed — do a simple keyword check
            logger.warning("[QuizService] JSON parse failed, falling back to keyword check")
            return _keyword_fallback(raw, student_answer, expected_answer, model_used)

    except Exception as exc:
        logger.error("[QuizService] Evaluation failed: %s", exc)
        return {
            "verdict": "error",
            "is_correct": False,
            "feedback": "Could not evaluate your answer right now. Please try again.",
            "hint": None,
            "model_used": "error",
        }


def generate_question(
    concept_title: str,
    upload_id: str,
    subject_name: str,
    existing_questions: list[str] | None = None,
) -> dict:
    """
    Generate a fresh quiz question for a concept.
    Avoids repeating questions already asked in this session.

    Returns: {question, model_used}
    """
    context = ""
    if upload_id:
        chunks = rag_service.retrieve(
            question=f"explain {concept_title}",
            upload_id=upload_id,
            top_k=2,
        )
        if chunks:
            context = "\n\n".join(chunks)

    if not context:
        context = f"The concept is: {concept_title}"

    avoid_note = ""
    if existing_questions:
        avoid_note = f"\nAvoid repeating these questions: {'; '.join(existing_questions[:3])}"

    prompt = _GENERATE_QUESTION_PROMPT.format(
        subject_name=subject_name,
        concept_title=concept_title,
        context=context + avoid_note,
    )

    messages = [{"role": "user", "content": prompt}]

    try:
        question, model_used = chat_doubt(messages=messages, max_tokens=80)
        question = question.strip().strip('"').strip("'")
        # Ensure it ends with a question mark
        if question and not question.endswith('?'):
            question += '?'
        return {"question": question, "model_used": model_used}
    except Exception as exc:
        logger.error("[QuizService] Question generation failed: %s", exc)
        return {
            "question": f"Explain the concept of {concept_title} in your own words.",
            "model_used": "fallback",
        }


def _parse_json_response(text: str) -> dict | None:
    """Extract JSON object from LLM response."""
    import json, re
    if not text:
        return None
    # Try markdown code block first
    block = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', text, re.DOTALL)
    if block:
        try:
            return json.loads(block.group(1))
        except Exception:
            pass
    # Try raw JSON
    match = re.search(r'\{.*\}', text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except Exception:
            pass
    return None


def _keyword_fallback(raw: str, student_answer: str, expected_answer: str, model_used: str) -> dict:
    """Simple keyword overlap check when JSON parsing fails."""
    raw_lower = raw.lower()
    is_correct = any(word in raw_lower for word in ['correct', 'right', 'yes', 'good', 'excellent'])
    is_incorrect = any(word in raw_lower for word in ['incorrect', 'wrong', 'no', 'not'])

    if is_correct and not is_incorrect:
        verdict = 'correct'
    elif is_incorrect:
        verdict = 'incorrect'
    else:
        verdict = 'partial'

    return {
        "verdict": verdict,
        "is_correct": verdict == 'correct',
        "feedback": raw[:200] if raw else "Review the concept and try again.",
        "hint": None,
        "model_used": model_used,
    }
