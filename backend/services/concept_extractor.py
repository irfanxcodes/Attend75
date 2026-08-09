"""
Concept Extractor — AI Lesson Player

Sends parsed document text to an LLM via the fallback chain and extracts
structured concepts using the instructor library for validated Pydantic output.

The LLM is told to extract EVERYTHING — no summarization, no omissions.
Every heading must map to at least one concept.
StudyMe 2.0: also extracts worked_examples, content_type, source_elements,
and formula variable breakdowns.
"""

import json
import logging
import re
from typing import Any

from models.schemas import ChapterConceptList, ConceptSchema
from services.llm_config import INGESTION_FALLBACK_CHAIN
from services.document_parser import RawDocumentModel

logger = logging.getLogger(__name__)

# Maximum chars of document text to send in one LLM call.
MAX_EXTRACTION_CHARS = 80_000

_EXTRACTION_PROMPT = """You are an educational content architect working with Indian university BBA/MBA course material.

Your job is to extract EVERY teachable concept from this chapter text.

STRICT RULES:
1. Every heading and sub-heading in the document MUST map to at least one concept.
2. Every definition must be captured EXACTLY as written in the source.
3. Every formula must be captured — include a LaTeX version if mathematical, and break down every variable.
4. Do NOT summarize — extract complete information.
5. Do NOT add concepts from outside this document.
6. Explanations must be simplified but faithful to the source (max 150 words each).
7. Misconceptions must be realistic mistakes a BBA student would make.
8. Exam questions must be the kind a professor would actually ask.
9. Prerequisites must be titles of OTHER concepts in this same chapter (or empty list).
10. content_type: use "numerical" if the concept involves formulas/calculations, "theory" if purely conceptual, "mixed" if both.
11. worked_examples: extract EVERY numerical example or solved problem from the source — do not skip any.
12. For each formula, list every variable with its meaning.

Return a JSON object with this exact structure:
{{
  "chapter_title": "string",
  "concepts": [
    {{
      "title": "string",
      "explanation": "string (max 150 words, student-friendly)",
      "definition": "string or null (exact wording from source)",
      "keywords": ["string", ...],
      "formulas": [
        {{
          "name": "string",
          "text": "string (plain text formula)",
          "latex": "string or null (LaTeX if mathematical)",
          "variables": [
            {{"symbol": "string", "meaning": "string"}}
          ]
        }}
      ],
      "examples": ["string (theory/illustrative examples only)"],
      "worked_examples": [
        {{
          "question": "string (exact problem from source)",
          "steps": [
            {{"step": "string", "calculation": "string", "note": "string"}}
          ],
          "answer": "string",
          "source_page": integer
        }}
      ],
      "misconceptions": ["string", ...],
      "exam_questions": ["string", ...],
      "source_page": integer,
      "source_heading": "string",
      "prerequisites": ["concept title", ...],
      "content_type": "theory | numerical | mixed",
      "source_elements": [
        {{"slide_or_page": integer, "element_type": "text|heading|table|formula|image", "text": "string"}}
      ]
    }}
  ]
}}

CHAPTER TEXT:
{chapter_text}"""


def _call_llm_for_extraction(chapter_text: str, chapter_title_hint: str = "") -> dict:
    """
    Call LLM with fallback chain, return parsed JSON dict.
    Uses instructor-style structured extraction via JSON mode.
    """
    import litellm

    # Normalize NVIDIA env var
    import os
    nvidia = os.getenv("NVIDIA_API_KEY", "")
    if nvidia and not os.getenv("NVIDIA_NIM_API_KEY", ""):
        os.environ["NVIDIA_NIM_API_KEY"] = nvidia

    prompt = _EXTRACTION_PROMPT.format(chapter_text=chapter_text[:MAX_EXTRACTION_CHARS])
    messages = [{"role": "user", "content": prompt}]

    last_error = None
    for model in INGESTION_FALLBACK_CHAIN:
        try:
            logger.info("[ConceptExtractor] Trying model: %s", model)
            response = litellm.completion(
                model=model,
                messages=messages,
                max_tokens=8192,
                temperature=0.1,
                timeout=60,
            )
            raw_content = response.choices[0].message.content or ""
            logger.info("[ConceptExtractor] Got response from %s (%d chars)", model, len(raw_content))

            # Parse JSON from response
            parsed = _extract_json_from_response(raw_content)
            if parsed and "concepts" in parsed:
                return parsed, model

            logger.warning("[ConceptExtractor] %s returned invalid JSON, trying next", model)

        except Exception as exc:
            logger.warning("[ConceptExtractor] Model %s failed: %s", model, str(exc)[:150])
            last_error = exc
            continue

    raise RuntimeError(f"All extraction models failed. Last error: {last_error}")


def _extract_json_from_response(text: str) -> dict | None:
    """Extract JSON object from LLM response, handling markdown code blocks."""
    if not text:
        return None

    # Try to find JSON in markdown code block first
    code_block = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', text, re.DOTALL)
    if code_block:
        try:
            return json.loads(code_block.group(1))
        except json.JSONDecodeError:
            pass

    # Try to find raw JSON object
    json_match = re.search(r'\{.*\}', text, re.DOTALL)
    if json_match:
        try:
            return json.loads(json_match.group())
        except json.JSONDecodeError:
            pass

    # Try parsing the whole response
    try:
        return json.loads(text.strip())
    except json.JSONDecodeError:
        return None


def _validate_and_parse_concepts(raw: dict, doc: RawDocumentModel) -> ChapterConceptList:
    """Validate the raw LLM output against our Pydantic schema."""
    try:
        return ChapterConceptList.model_validate(raw)
    except Exception as exc:
        logger.warning("[ConceptExtractor] Pydantic validation failed: %s", exc)
        # Attempt partial recovery — keep concepts that do validate
        valid_concepts = []
        for concept_data in raw.get("concepts", []):
            try:
                valid_concepts.append(ConceptSchema.model_validate(concept_data))
            except Exception:
                # Log but skip invalid concepts
                logger.debug("[ConceptExtractor] Skipping invalid concept: %s", concept_data.get("title", "?"))

        return ChapterConceptList(
            chapter_title=raw.get("chapter_title", doc.title),
            concepts=valid_concepts,
        )


def calculate_coverage_score(concepts: list[ConceptSchema], doc: RawDocumentModel) -> tuple[float, list[str]]:
    """
    Calculate how well the extraction covers the document's headings.
    Returns (score 0.0-1.0, list of uncovered headings).
    """
    if not doc.all_headings:
        return 1.0, []

    # Filter out learning-objective style headings (questions, numbered tasks)
    # These are meta-headings (study objectives) not content headings
    content_headings = []
    for h in doc.all_headings:
        stripped = h.strip()
        # Skip question-style headings (start with number + question word)
        if re.match(r'^\d+[\.\)]\s+(define|identify|describe|list|explain|discuss|analyze|compare|outline|state)', stripped, re.IGNORECASE):
            continue
        # Skip very short headings (page numbers, etc.)
        if len(stripped) < 5:
            continue
        content_headings.append(stripped)

    if not content_headings:
        # All headings were objectives — full credit
        logger.info("[ConceptExtractor] All headings appear to be learning objectives — full coverage assumed")
        return 1.0, []

    covered = 0
    uncovered = []

    for heading in content_headings:
        heading_lower = heading.lower().strip()
        found = any(
            heading_lower in concept.title.lower() or
            concept.title.lower() in heading_lower or
            heading_lower in concept.source_heading.lower() or
            # Check keyword overlap — at least 2 significant words match
            _keyword_overlap(heading_lower, concept.title.lower()) >= 2
            for concept in concepts
        )
        if found:
            covered += 1
        else:
            uncovered.append(heading)

    score = covered / len(content_headings)
    logger.info(
        "[ConceptExtractor] Coverage: %d/%d content headings (%.1f%%) | Uncovered: %s",
        covered, len(content_headings), score * 100, uncovered[:5]
    )
    return round(score, 3), uncovered


def _keyword_overlap(a: str, b: str) -> int:
    """Count significant words shared between two strings."""
    stopwords = {'the', 'a', 'an', 'of', 'in', 'to', 'and', 'or', 'for', 'is', 'are', 'its', 'it', 'be'}
    words_a = {w for w in re.split(r'\W+', a) if len(w) > 3 and w not in stopwords}
    words_b = {w for w in re.split(r'\W+', b) if len(w) > 3 and w not in stopwords}
    return len(words_a & words_b)


def extract_concepts(doc: RawDocumentModel, retry_if_below: float = 0.70) -> tuple[ChapterConceptList, float, str]:
    """
    Main entry point for concept extraction.

    Args:
        doc: Parsed document model
        retry_if_below: Coverage threshold — retry with stronger prompt if below this

    Returns:
        (ChapterConceptList, coverage_score, model_used)
    """
    logger.info("[ConceptExtractor] Starting extraction for: %s", doc.title)

    raw, model_used = _call_llm_for_extraction(doc.full_text, doc.title)
    result = _validate_and_parse_concepts(raw, doc)
    score, uncovered = calculate_coverage_score(result.concepts, doc)

    # Auto-retry with stronger prompt if coverage is low
    if score < retry_if_below and uncovered:
        logger.warning(
            "[ConceptExtractor] Coverage %.1f%% below threshold %.1f%%, retrying with uncovered headings...",
            score * 100, retry_if_below * 100
        )

        # Build a retry prompt that explicitly calls out missing sections
        uncovered_str = "\n".join(f"- {h}" for h in uncovered[:20])
        retry_text = (
            f"{doc.full_text[:MAX_EXTRACTION_CHARS]}\n\n"
            f"IMPORTANT: The following sections were NOT covered in the previous extraction. "
            f"You MUST extract concepts for each of these:\n{uncovered_str}"
        )

        try:
            retry_raw, retry_model = _call_llm_for_extraction(retry_text, doc.title)
            retry_result = _validate_and_parse_concepts(retry_raw, doc)
            retry_score, _ = calculate_coverage_score(retry_result.concepts, doc)

            if retry_score > score:
                logger.info("[ConceptExtractor] Retry improved coverage: %.1f%% → %.1f%%", score * 100, retry_score * 100)
                return retry_result, retry_score, retry_model
            else:
                logger.info("[ConceptExtractor] Retry did not improve coverage, keeping original")
        except Exception as exc:
            logger.warning("[ConceptExtractor] Retry failed: %s", exc)

    logger.info(
        "[ConceptExtractor] Final: %d concepts, %.1f%% coverage, model=%s",
        len(result.concepts), score * 100, model_used
    )
    return result, score, model_used
