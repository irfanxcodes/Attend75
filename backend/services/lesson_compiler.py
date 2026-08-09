"""
Lesson Compiler — AI Lesson Player

Takes an ordered list of concepts (from CurriculumCompiler) and:

1. Compiles them into Teaching Script blocks (lesson_blocks) for legacy playback
2. Compiles them into ConceptSections (concept_sections) for StudyMe 2.0 Canvas

Legacy blocks (lesson_blocks) are preserved for existing uploaded chapters.
New Canvas sections (concept_sections) power the StudyMe 2.0 scrollable workspace.

For each concept it generates these block types in order (legacy):
  1. narration       — AI explains the concept
  2. keyword_highlight — important keywords
  3. definition      — exact definition
  4. formula         — one block per formula
  5. example         — real-world example
  6. diagram_spec    — Mermaid flowchart
  7. quiz            — one recall question

And these Canvas sections (StudyMe 2.0):
  explanation → definition → formula(s) → formula_explanation →
  worked_example(s) → theory_example → visual → common_mistake → takeaway

LLM is NOT called during compilation — all content comes from the extracted concepts.
"""

import json
import logging
import uuid
from datetime import datetime

from models.schemas import ConceptSchema
from services.llm_config import INGESTION_FALLBACK_CHAIN

logger = logging.getLogger(__name__)

_NARRATION_WPM = 130


def _estimate_seconds(text: str) -> int:
    words = len(text.split())
    return max(5, int((words / _NARRATION_WPM) * 60))


def _generate_voice_text(concept: ConceptSchema) -> str:
    text = concept.explanation or concept.title
    words = text.split()
    if len(words) > 80:
        text = ' '.join(words[:80]) + '.'
    return text


def _build_diagram_spec(concept: ConceptSchema, all_concepts: list[ConceptSchema]) -> str | None:
    if not concept.prerequisites:
        return None
    concept_titles = {c.title.lower(): c.title for c in all_concepts}
    valid_prereqs = []
    for prereq in concept.prerequisites:
        if prereq.lower() in concept_titles:
            valid_prereqs.append(concept_titles[prereq.lower()])
    if not valid_prereqs:
        return None
    lines = ["flowchart TD"]
    safe_title = concept.title.replace('"', "'")
    lines.append(f'    A["{safe_title}"]')
    for i, prereq in enumerate(valid_prereqs[:3]):
        safe_prereq = prereq.replace('"', "'")
        label = chr(66 + i)
        lines.append(f'    {label}["{safe_prereq}"]')
        lines.append(f'    {label} --> A')
    return "\n".join(lines)


def _select_best_exam_question(concept: ConceptSchema) -> str | None:
    if not concept.exam_questions:
        return None
    for q in concept.exam_questions:
        if any(q.lower().startswith(kw) for kw in ["define", "explain", "what is", "describe"]):
            return q
    return concept.exam_questions[0]


# ── Canvas section builder ────────────────────────────────────────────────────

def _build_concept_sections(
    concept: ConceptSchema,
    concept_db_id: str,
    upload_id: str,
    script_id: str,  # kept for reference but not stored in sections
    all_concepts: list[ConceptSchema],
) -> list[dict]:
    """
    Build ConceptSection rows for a single concept.
    Returns list of dicts ready for DB insert.
    """
    sections = []
    seq = 0
    now = datetime.utcnow()

    def make_section(section_type: str, content: dict, voice_text: str | None = None,
                     source_refs: list | None = None) -> dict:
        nonlocal seq
        s = {
            "id": str(uuid.uuid4()),
            "concept_id": concept_db_id,
            "upload_id": upload_id,
            "section_type": section_type,
            "sequence_order": seq,
            "content": content,
            "source_references": source_refs or [],
            "voice_text": voice_text,
            "created_at": now,
        }
        seq += 1
        return s

    source_ref = []
    if concept.source_page:
        source_ref = [{"slide_or_page": concept.source_page, "heading": concept.source_heading or ""}]

    # 1. Explanation — always first
    sections.append(make_section(
        "explanation",
        {"text": concept.explanation, "summary": concept.explanation[:100] if concept.explanation else ""},
        voice_text=_generate_voice_text(concept),
        source_refs=source_ref,
    ))

    # 2. Definition — if present
    if concept.definition:
        sections.append(make_section(
            "definition",
            {"text": concept.definition},
            voice_text=f"The definition: {concept.definition}",
            source_refs=source_ref,
        ))

    # 3. Formulas — one section per formula, followed by formula_explanation
    for formula in concept.formulas[:6]:
        f_dict = formula.model_dump() if hasattr(formula, 'model_dump') else dict(formula)
        sections.append(make_section(
            "formula",
            {
                "name": f_dict.get("name", ""),
                "text": f_dict.get("text", ""),
                "latex": f_dict.get("latex"),
                "variables": f_dict.get("variables", []),
            },
            voice_text=f"Formula: {f_dict.get('name', '')} — {f_dict.get('text', '')}",
            source_refs=source_ref,
        ))
        # formula_explanation — how/when to use it
        if len(concept.examples) > 0 or concept.explanation:
            explanation_text = (
                f"To use {f_dict.get('name', 'this formula')}: "
                f"{concept.explanation[:120] if concept.explanation else 'Apply the formula as shown above.'}"
            )
            sections.append(make_section(
                "formula_explanation",
                {"text": explanation_text},
                voice_text=explanation_text,
                source_refs=source_ref,
            ))

    # 4. Worked examples — critical for numerical subjects
    worked = concept.worked_examples if hasattr(concept, 'worked_examples') else []
    if not worked and hasattr(concept, '__dict__'):
        worked = concept.__dict__.get('worked_examples', [])
    for we in (worked or [])[:3]:
        we_dict = we.model_dump() if hasattr(we, 'model_dump') else dict(we)
        we_ref = [{"slide_or_page": we_dict.get("source_page", 0), "heading": ""}] if we_dict.get("source_page") else source_ref
        sections.append(make_section(
            "worked_example",
            {
                "question": we_dict.get("question", ""),
                "steps": we_dict.get("steps", []),
                "answer": we_dict.get("answer", ""),
                "source_page": we_dict.get("source_page", 0),
            },
            voice_text=f"Let's work through an example: {we_dict.get('question', '')}",
            source_refs=we_ref,
        ))

    # 5. Theory example — first illustrative example
    if concept.examples:
        sections.append(make_section(
            "theory_example",
            {"text": concept.examples[0], "source": ""},
            voice_text=f"For example: {concept.examples[0]}",
            source_refs=source_ref,
        ))

    # 6. Visual / concept map — if prerequisites exist
    diagram_spec = _build_diagram_spec(concept, all_concepts)
    if diagram_spec:
        sections.append(make_section(
            "visual",
            {"spec_type": "mermaid", "spec": diagram_spec, "caption": f"How {concept.title} relates to prior concepts"},
            voice_text=f"Let me show you how {concept.title} connects to what we've already covered.",
            source_refs=source_ref,
        ))

    # 7. Common mistake — if present
    if concept.misconceptions:
        sections.append(make_section(
            "common_mistake",
            {"mistake": concept.misconceptions[0], "correction": ""},
            voice_text=f"A common mistake: {concept.misconceptions[0]}",
            source_refs=source_ref,
        ))

    # 8. Takeaway — key point
    takeaway_text = concept.definition or (concept.explanation[:100] + "…" if len(concept.explanation) > 100 else concept.explanation)
    sections.append(make_section(
        "takeaway",
        {"text": f"Key point: {takeaway_text}"},
        voice_text=f"Remember: {takeaway_text}",
        source_refs=source_ref,
    ))

    return sections


# ── Main compiler ─────────────────────────────────────────────────────────────

def compile_lesson(
    concepts: list[ConceptSchema],
    script_id: str,
    subject_id: str,
    chapter_key: str,
    upload_id: str,
    concept_id_map: dict[str, str],
) -> tuple[list[dict], int]:
    """
    Compile ordered concepts into:
    1. lesson_blocks (legacy sequential player)
    2. concept_sections (StudyMe 2.0 Canvas)

    Returns (blocks, estimated_duration_seconds).
    ConceptSections are written to DB inside this function.
    """
    blocks = []
    sequence = 0
    now = datetime.utcnow()

    # Collect all concept_sections to bulk-insert after blocks
    all_sections: list[dict] = []

    logger.info("[LessonCompiler] Compiling %d concepts...", len(concepts))

    for concept in concepts:
        concept_db_id = concept_id_map.get(concept.title)

        def make_block(block_type: str, content: str, voice_text: str | None = None,
                       expected_answer: str | None = None) -> dict:
            nonlocal sequence
            b = {
                "id": str(uuid.uuid4()),
                "script_id": script_id,
                "concept_id": concept_db_id,
                "sequence_order": sequence,
                "block_type": block_type,
                "content": content,
                "voice_text": voice_text,
                "expected_answer": expected_answer,
                "created_at": now,
            }
            sequence += 1
            return b

        # ── Legacy lesson_blocks ──────────────────────────────────────────
        voice = _generate_voice_text(concept)
        blocks.append(make_block("narration", concept.explanation, voice_text=voice))

        if concept.keywords:
            kw_content = json.dumps(concept.keywords[:8])
            kw_voice = f"Key terms: {', '.join(concept.keywords[:5])}."
            blocks.append(make_block("keyword_highlight", kw_content, voice_text=kw_voice))

        if concept.definition:
            blocks.append(make_block("definition", concept.definition,
                                     voice_text=f"The official definition: {concept.definition}"))

        for formula in concept.formulas[:4]:
            f_dict = formula.model_dump() if hasattr(formula, 'model_dump') else dict(formula)
            formula_content = f_dict.get("latex") or f_dict.get("text", "")
            formula_voice = f"The formula for {f_dict.get('name', '')} is: {f_dict.get('text', '')}"
            blocks.append(make_block("formula", formula_content, voice_text=formula_voice))

        if concept.examples:
            example_voice = f"Here's an example: {concept.examples[0]}"
            blocks.append(make_block("example", concept.examples[0], voice_text=example_voice))

        diagram_spec = _build_diagram_spec(concept, concepts)
        if diagram_spec:
            blocks.append(make_block("diagram_spec", diagram_spec,
                                     voice_text=f"Let me show you how {concept.title} relates to what we just learned."))

        question = _select_best_exam_question(concept)
        if question:
            expected = concept.definition or concept.explanation[:200]
            blocks.append(make_block("quiz", question,
                                     voice_text=f"Quick check: {question}",
                                     expected_answer=expected))

        # ── StudyMe 2.0 Canvas sections ───────────────────────────────────
        if concept_db_id:
            sections = _build_concept_sections(concept, concept_db_id, upload_id, script_id, concepts)
            all_sections.extend(sections)

    # Final recap block (legacy)
    concept_titles = [c.title for c in concepts[:10]]
    recap_content = "In this chapter, we covered:\n" + "\n".join(f"• {t}" for t in concept_titles)
    if len(concepts) > 10:
        recap_content += f"\n...and {len(concepts) - 10} more concepts."
    recap_voice = (
        f"Excellent work! In this chapter, you learned about "
        f"{', '.join(concept_titles[:3])}"
        + (f", and {len(concepts) - 3} more topics." if len(concepts) > 3 else ".")
    )
    blocks.append({
        "id": str(uuid.uuid4()),
        "script_id": script_id,
        "concept_id": None,
        "sequence_order": sequence,
        "block_type": "recap",
        "content": recap_content,
        "voice_text": recap_voice,
        "expected_answer": None,
        "created_at": now,
    })

    # Bulk-insert concept_sections into DB
    if all_sections:
        _save_concept_sections(all_sections)

    total_duration = sum(
        _estimate_seconds(b.get("voice_text") or b.get("content") or "")
        for b in blocks
        if b["block_type"] in ("narration", "quiz", "recap")
    )

    logger.info(
        "[LessonCompiler] Done: %d blocks, %d canvas sections, estimated %ds (~%dmin)",
        len(blocks), len(all_sections), total_duration, total_duration // 60,
    )
    return blocks, total_duration


def _save_concept_sections(sections: list[dict]) -> None:
    """Bulk insert concept_sections rows. Called at end of compile_lesson."""
    try:
        from db.session import SessionLocal
        from db.models.concept_section import ConceptSection

        with SessionLocal() as session:
            for s in sections:
                row = ConceptSection(
                    id=s["id"],
                    concept_id=s["concept_id"],
                    upload_id=s["upload_id"],
                    section_type=s["section_type"],
                    sequence_order=s["sequence_order"],
                    content=s["content"],
                    source_references=s["source_references"],
                    voice_text=s.get("voice_text"),
                    created_at=s["created_at"],
                )
                session.add(row)
            session.commit()
            logger.info("[LessonCompiler] Saved %d concept sections to DB", len(sections))
    except Exception as exc:
        # Non-fatal — legacy blocks already saved, sections failure doesn't break lesson
        logger.error("[LessonCompiler] Failed to save concept sections: %s", exc, exc_info=True)
