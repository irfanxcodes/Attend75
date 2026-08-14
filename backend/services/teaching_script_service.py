"""
Teaching Script Service

Generates and caches AI teaching action sequences for slides.

Key design decisions:
  - Generated ONCE per slide per version, then saved to DB
  - Every student reuses the same cached script (zero LLM cost after first)
  - Action sequence format supports speech, spotlight, and pause
  - AI returns normalized coordinates (0.0-1.0) for spotlights so they
    work at any resolution, with semantic fallback regions
  - Version column allows prompt improvements without re-rendering images

Action types:
  {type: "speech",    text: "..."}
  {type: "spotlight", coords: {x, y, w, h}, fallback_region: "title"|"body"|"table"|"full"}
  {type: "pause",     duration: 1.2}

The AI is prompted to behave as a teacher, not a screen reader:
  - Decide what matters pedagogically
  - Use real-world examples
  - Connect concepts, not just read bullet points
  - 3-5 teaching actions per slide (not one per bullet point)
"""

import json
import logging
import uuid
from datetime import datetime

logger = logging.getLogger(__name__)

# Current script version — bump to regenerate all scripts with new prompts
# v3: uses actual PPTX shape bounding boxes when available instead of guessing coords
CURRENT_VERSION = 3


def get_or_generate_teaching_script(
    upload_id: str,
    slide_number: int,
    slide_title: str,
    slide_body: str,
    slide_concepts: list[dict],
    subject_name: str,
    chapter_name: str,
    is_title_slide: bool = False,
    shape_bboxes: list[dict] | None = None,
) -> dict:
    """
    Return the cached teaching script for a slide, generating it if needed.

    Args:
      shape_bboxes: optional list of shape dicts from shape_extractor.py.
                    When provided (PPTX uploads), the LLM receives exact shape
                    coordinates and references shape_id instead of guessing coords.
                    When None (PDF/DOCX), falls back to semantic regions.

    Returns:
      {
        "slide_number": int,
        "actions": [...],
        "model_used": str,
        "cached": bool,
      }

    Never raises — returns a minimal fallback on LLM failure.
    """
    from db.session import SessionLocal
    from db.models.slide_teaching_script import SlideTeachingScript

    # ── Check cache first ────────────────────────────────────────────────
    with SessionLocal() as session:
        existing = (
            session.query(SlideTeachingScript)
            .filter(
                SlideTeachingScript.upload_id == upload_id,
                SlideTeachingScript.slide_number == slide_number,
                SlideTeachingScript.version == CURRENT_VERSION,
            )
            .first()
        )
        if existing:
            return {
                "slide_number": slide_number,
                "actions": existing.actions,
                "model_used": existing.model_used,
                "cached": True,
            }

    # ── Generate with LLM ────────────────────────────────────────────────
    logger.info("[TeachingScript] Generating script for upload=%s slide=%d (title_slide=%s)",
                upload_id, slide_number, is_title_slide)
    actions, model_used = _generate_actions(
        slide_number=slide_number,
        slide_title=slide_title,
        slide_body=slide_body,
        slide_concepts=slide_concepts,
        subject_name=subject_name,
        chapter_name=chapter_name,
        is_title_slide=is_title_slide,
        shape_bboxes=shape_bboxes,
    )

    # ── Save to DB ───────────────────────────────────────────────────────
    with SessionLocal() as session:
        # Check again (race condition guard)
        existing = (
            session.query(SlideTeachingScript)
            .filter(
                SlideTeachingScript.upload_id == upload_id,
                SlideTeachingScript.slide_number == slide_number,
                SlideTeachingScript.version == CURRENT_VERSION,
            )
            .first()
        )
        if existing:
            return {
                "slide_number": slide_number,
                "actions": existing.actions,
                "model_used": existing.model_used,
                "cached": True,
            }

        row = SlideTeachingScript(
            id=str(uuid.uuid4()),
            upload_id=upload_id,
            slide_number=slide_number,
            actions=actions,
            model_used=model_used,
            version=CURRENT_VERSION,
            created_at=datetime.utcnow(),
        )
        session.add(row)
        session.commit()
        logger.info("[TeachingScript] Saved script for upload=%s slide=%d (%d actions)",
                    upload_id, slide_number, len(actions))

    return {
        "slide_number": slide_number,
        "actions": actions,
        "model_used": model_used,
        "cached": False,
    }


# ── LLM generation ────────────────────────────────────────────────────────────

def _generate_actions(
    slide_number: int,
    slide_title: str,
    slide_body: str,
    slide_concepts: list[dict],
    subject_name: str,
    chapter_name: str,
    is_title_slide: bool = False,
    shape_bboxes: list[dict] | None = None,
) -> tuple[list[dict], str]:
    """
    Call the LLM to generate a teaching action sequence for one slide.
    Returns (actions_list, model_used).
    """
    # For slide 1, always give a chapter intro regardless of content
    if is_title_slide:
        return _generate_title_slide_actions(slide_title, slide_concepts, subject_name, chapter_name)

    # Build rich concept context — title, definition, keywords, examples
    concept_context = ""
    if slide_concepts:
        lines = []
        for c in slide_concepts[:4]:
            title = c.get("title", "")
            definition = (c.get("definition") or "")[:220]
            explanation = (c.get("explanation") or "")[:220]
            keywords = ", ".join((c.get("keywords") or [])[:6])
            examples = "; ".join((c.get("examples") or [])[:2])

            parts = [f"CONCEPT: {title}"]
            if definition:
                parts.append(f"Definition: {definition}")
            elif explanation:
                parts.append(f"Explanation: {explanation}")
            if keywords:
                parts.append(f"Keywords: {keywords}")
            if examples:
                parts.append(f"Examples from textbook: {examples}")
            lines.append("\n  ".join(parts))
        concept_context = "\n\n".join(lines)

    # ── Build shape context block ─────────────────────────────────────────
    # When we have real PPTX bboxes, give the LLM the actual shape list and
    # ask it to reference shape_id.  This replaces coordinate guessing.
    has_shapes = bool(shape_bboxes)

    if has_shapes:
        # Filter to shapes that are useful for spotlighting (skip tiny decorative ones)
        useful_shapes = [
            s for s in shape_bboxes
            if s["type"] in ("title", "body", "image", "table")
            and s["w"] > 0.05 and s["h"] > 0.03
        ][:8]  # cap at 8 shapes to keep prompt tight

        shapes_json = json.dumps(
            [
                {
                    "shape_id": s["shape_id"],
                    "type":     s["type"],
                    "bbox":     {"x": s["x"], "y": s["y"], "w": s["w"], "h": s["h"]},
                    "preview":  s["text_preview"][:60],
                }
                for s in useful_shapes
            ],
            indent=2,
        )
        shape_section = f"""
--- ACTUAL SLIDE SHAPES (use these for spotlight coords) ---
{shapes_json}
--- END SHAPES ---
"""
        spotlight_format = """{{"type": "spotlight", "shape_id": <int>, "coords": {{"x": <from shape>, "y": <from shape>, "w": <from shape>, "h": <from shape>}}, "fallback_region": "title"|"body"|"table"|"image", "duration": 0.7}}"""
        coord_instruction = (
            "USE the exact bbox from the shapes list above for coords. "
            "Set shape_id to the matching shape_id integer. "
            "Set fallback_region to the shape type (title/body/table/image)."
        )
    else:
        shape_section = ""
        spotlight_format = """{{"type": "spotlight", "coords": {{"x": 0.03, "y": 0.02, "w": 0.94, "h": 0.20}}, "fallback_region": "title", "duration": 0.7}}"""
        coord_instruction = (
            "Estimate coordinates as fractions 0.0–1.0 of slide dimensions. "
            "title is typically top 20%, body is middle 60%."
        )

    prompt = f"""You are a clear, engaging university professor teaching {subject_name} to undergraduate students.

You are presenting slide {slide_number} of the chapter "{chapter_name}".

--- SLIDE CONTENT ---
TITLE: {slide_title}

BODY TEXT:
{slide_body[:1200]}
{f"--- KEY CONCEPTS ON THIS SLIDE ---{chr(10)}{concept_context}" if concept_context else ""}
{shape_section}--- END OF SLIDE ---

Your task: Generate a teaching action sequence for this slide. You must:

1. START by spotlighting the title shape and introducing the core idea in 1-2 sentences
2. THEN spotlight the main body content and EXPLAIN the actual content — definitions, relationships, distinctions, or data visible on the slide
3. USE only examples from the subject domain ({subject_name}) — NOT food/cooking/recipe analogies
4. Each speech should be 2-3 natural spoken sentences
5. Include 4-6 actions total: spotlight → speech → [spotlight → speech] → pause

STRICT RULES:
- Do NOT use food, cooking, recipes, or chef analogies EVER
- Do NOT say "let's explore" or "today we're going to" — just teach directly
- Do NOT summarize the slide title back — explain what it means
- Speech text must sound like a professor explaining, not reading
- {coord_instruction}

Return ONLY a valid JSON array. No explanation, no markdown fences. Format:
[
  {spotlight_format},
  {{"type": "speech", "text": "Direct explanation in 2-3 sentences."}},
  {spotlight_format},
  {{"type": "speech", "text": "Deeper explanation with a subject-relevant example."}},
  {{"type": "pause", "duration": 1.2}}
]

fallback_region must be one of: "title", "body", "table", "image", "full\""""

    try:
        from services.llm_router import chat_doubt
        raw, model_used = chat_doubt(
            messages=[{"role": "user", "content": prompt}],
            max_tokens=900,
        )
        actions = _parse_actions(raw.strip())
        if actions:
            return actions, model_used
    except Exception as exc:
        logger.warning("[TeachingScript] LLM call failed: %s", exc)

    # Fallback: minimal script that still works
    return _fallback_actions(slide_title, slide_body), "fallback"


def _generate_title_slide_actions(
    slide_title: str,
    slide_concepts: list[dict],
    subject_name: str,
    chapter_name: str,
) -> tuple[list[dict], str]:
    """
    Generate a chapter intro for slide 1.
    Brief 2-3 sentence overview of what the chapter covers.
    """
    concept_titles = [c.get("title", "") for c in slide_concepts[:5] if c.get("title")]
    concept_list = ", ".join(concept_titles) if concept_titles else chapter_name

    prompt = f"""You are a professor teaching {subject_name}.

You are starting a new chapter called "{chapter_name}".
The chapter covers these topics: {concept_list}

Write exactly 2-3 natural spoken sentences that:
- Welcome students to this chapter
- Tell them what they will learn (mention 2-3 specific topics from the list)
- Sound conversational, like a professor starting a lecture
- Do NOT start explaining any concept yet — just introduce what's coming

Return ONLY a JSON array (no markdown, no extra text):
[
  {{"type": "spotlight", "fallback_region": "title", "duration": 0.8}},
  {{"type": "speech", "text": "Your 2-3 sentence chapter intro here."}},
  {{"type": "pause", "duration": 1.0}}
]"""

    try:
        from services.llm_router import chat_doubt
        raw, model_used = chat_doubt(
            messages=[{"role": "user", "content": prompt}],
            max_tokens=200,
        )
        actions = _parse_actions(raw.strip())
        if actions:
            return actions, model_used
    except Exception as exc:
        logger.warning("[TeachingScript] Title slide LLM call failed: %s", exc)

    # Fallback
    return [
        {"type": "spotlight", "fallback_region": "title", "duration": 0.8},
        {"type": "speech", "text": f"Welcome to this chapter on {chapter_name}. We'll be covering {concept_list}. Let's get started."},
        {"type": "pause", "duration": 1.0},
    ], "fallback"


def _parse_actions(raw: str) -> list[dict]:
    """Parse and validate the LLM's JSON output."""
    # Strip markdown code fences if present
    if raw.startswith("```"):
        lines = raw.split("\n")
        raw = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
    raw = raw.strip()

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        # Try to extract JSON array from the response
        start = raw.find("[")
        end = raw.rfind("]") + 1
        if start >= 0 and end > start:
            try:
                parsed = json.loads(raw[start:end])
            except json.JSONDecodeError:
                return []
        else:
            return []

    if not isinstance(parsed, list):
        return []

    actions = []
    for item in parsed:
        if not isinstance(item, dict):
            continue
        action_type = item.get("type")
        if action_type == "speech":
            text = str(item.get("text", "")).strip()
            if text:
                actions.append({"type": "speech", "text": text})
        elif action_type == "spotlight":
            coords = item.get("coords")
            fallback = item.get("fallback_region", "full")
            duration = float(item.get("duration", 0.6))
            entry: dict = {
                "type": "spotlight",
                "fallback_region": fallback,
                "duration": duration,
            }
            # Carry shape_id when present (PPTX precision mode)
            shape_id = item.get("shape_id")
            if shape_id is not None:
                try:
                    entry["shape_id"] = int(shape_id)
                except (TypeError, ValueError):
                    pass
            if isinstance(coords, dict):
                # Validate and clamp coordinates
                try:
                    entry["coords"] = {
                        "x": max(0.0, min(1.0, float(coords.get("x", 0.0)))),
                        "y": max(0.0, min(1.0, float(coords.get("y", 0.0)))),
                        "w": max(0.05, min(1.0, float(coords.get("w", 0.9)))),
                        "h": max(0.05, min(1.0, float(coords.get("h", 0.2)))),
                    }
                except (TypeError, ValueError):
                    pass
            actions.append(entry)
        elif action_type == "pause":
            duration = float(item.get("duration", 1.0))
            actions.append({"type": "pause", "duration": min(duration, 5.0)})

    return actions


def _fallback_actions(slide_title: str, slide_body: str) -> list[dict]:
    """Minimal teaching script used when LLM is unavailable."""
    body_short = (slide_body or "")[:200].strip()
    return [
        {
            "type": "spotlight",
            "fallback_region": "title",
            "duration": 0.6,
        },
        {
            "type": "speech",
            "text": f"This slide covers {slide_title}.",
        },
        {
            "type": "pause",
            "duration": 0.8,
        },
        {
            "type": "spotlight",
            "fallback_region": "body",
            "duration": 0.5,
        },
        {
            "type": "speech",
            "text": body_short if body_short else f"Study the content of this slide carefully.",
        },
    ]
