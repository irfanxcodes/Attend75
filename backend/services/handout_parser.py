"""
Course Handout Parser — extracts structured syllabus from uploaded handout files.
Supports PDF, DOCX. Uses Gemini for structured extraction with fallback handling.

Failure modes defended against:
  1. LLM dumps all chapters into 1 module  → detected + retried with re-split prompt
  2. Module headings missed by LLM         → pre-scan injects detected headings as hint
  3. Both LLM attempts fail                → deterministic rule-based fallback splitter
  4. Text truncation hides later modules   → trim limit 12000 chars, improved skip logic
  5. .format() crash on JSON in prompt     → hint injected via string replacement, not .format()
"""
import json
import logging
import re
from pathlib import Path

logger = logging.getLogger(__name__)

# ── Prompts ───────────────────────────────────────────────────────────────────

# NOTE: Do NOT use .format() on this string — it contains JSON braces.
# The HINT_PLACEHOLDER is replaced via str.replace() in parse_syllabus_with_llm.
_EXTRACTION_PROMPT = '''You are extracting structured syllabus data from an Indian university course handout.

Extract ALL information and return ONLY valid JSON matching this exact structure:
{
  "subject_name": "string",
  "subject_code": "string or null",
  "program": "string or null (e.g. BBA, MBA, B.Tech)",
  "semester": "string or null (e.g. V, 5, Third)",
  "credits": number or null,
  "instructor_name": "string or null",
  "instructor_email": "string or null",
  "course_description": "string or null (1-2 sentences)",
  "modules": [
    {
      "number": 1,
      "title": "string",
      "session_range": "string or null (e.g. 1-8)",
      "overview_topics": ["string", ...],
      "chapters": [
        {
          "title": "string",
          "sessions": "string or null (e.g. 1-3)",
          "topics": ["string", ...]
        }
      ]
    }
  ]
}

MODULE EXTRACTION RULES:
1. A "module" or "unit" is a TOP-LEVEL grouping. Most Indian university handouts have 4-6 modules.
2. If the handout has headings like "Module 1", "Unit I", "UNIT-II", "Module I" — each is a SEPARATE module object. Never merge them.
3. If the handout has a session-plan table with NO explicit module headings, group chapters into 4-6 logical topic clusters, one cluster per module.
4. Use the session-wise outline table rows for chapters. Each distinct topic row = one chapter.
5. overview_topics = bullet-point topics listed under a module heading in the syllabus.
6. Exclude test sessions, exams, revision sessions, and evaluations from chapters.
7. subject_code must be the actual course code from the document (e.g. SHHR441).
8. If session numbers are given (e.g. "1-3", "4-7"), use them for the sessions field.
9. Do not produce 1 module unless the syllabus truly has only one unit/module.

__HINT__

Return ONLY the JSON object, no explanation, no markdown.'''

_RESPLIT_PROMPT = '''The previous extraction placed ALL chapters into a single module, which is incorrect.

Original syllabus text:
__TEXT__

Chapters extracted:
__CHAPTERS__

Task: group these chapters into 4-6 logical modules by topic similarity.
- Name each module after the theme of its chapters
- Distribute chapters roughly evenly — no module should hold more than half the total
- Use the session numbers already listed to set session_range for each module

Return ONLY valid JSON with the same structure. Minimum 3 separate module objects required.'''


# ── Text extraction ───────────────────────────────────────────────────────────

def extract_text_from_file(file_path: str) -> str:
    path = Path(file_path)
    ext = path.suffix.lower()
    if ext == ".pdf":
        return _extract_pdf(file_path)
    elif ext in (".docx", ".doc"):
        return _extract_docx(file_path)
    else:
        raise ValueError(f"Unsupported file type: {ext}")


def _extract_pdf(file_path: str) -> str:
    import pdfplumber
    parts = []
    with pdfplumber.open(file_path) as pdf:
        for page in pdf.pages:
            text = page.extract_text(x_tolerance=2, y_tolerance=2) or ""
            if text.strip():
                parts.append(text.strip())
    return "\n\n".join(parts)


def _extract_docx(file_path: str) -> str:
    try:
        import docx
    except ImportError:
        raise ImportError("python-docx required: pip install python-docx")

    doc = docx.Document(file_path)
    from docx.oxml.ns import qn

    parts = []
    body = doc.element.body

    for child in body:
        tag = child.tag.split('}')[-1] if '}' in child.tag else child.tag

        if tag == 'p':
            text = ''.join(r.text for r in child.iter(qn('w:t'))).strip()
            if text:
                parts.append(text)

        elif tag == 'tbl':
            for tr in child.iter(qn('w:tr')):
                cells = []
                for tc in tr.iter(qn('w:tc')):
                    cell_text = ''.join(r.text for r in tc.iter(qn('w:t'))).strip()
                    if cell_text:
                        cells.append(cell_text)
                # Deduplicate merged cells
                seen: set[str] = set()
                unique = []
                for c in cells:
                    if c not in seen:
                        seen.add(c)
                        unique.append(c)
                if unique:
                    parts.append(' | '.join(unique))

    return "\n".join(parts)


# ── Pre-LLM: detect module/unit headings ─────────────────────────────────────

# Only matches lines that START with "Module" or "Unit" followed by a number/roman numeral
# e.g. "Module 1", "Unit I", "UNIT-II", "Module 3:" — but NOT "unit price" or "module summary"
_MODULE_HEADING_RE = re.compile(
    r'^(module|unit)\s*[-:.]?\s*([ivxlcdm]+|\d+)\b\s*[:\-–]?\s*(.*)$',
    re.IGNORECASE,
)


def _detect_module_headings(text: str) -> list[str]:
    """
    Scan text for lines that are clearly module/unit headings.
    Returns deduplicated list, max 10 (avoids polluting the hint with noise).
    """
    headings: list[str] = []
    seen: set[str] = set()
    for line in text.splitlines():
        stripped = line.strip()
        # Must start with Module/Unit and be a short line (headings aren't paragraphs)
        if stripped and len(stripped) < 120 and _MODULE_HEADING_RE.match(stripped):
            key = stripped.lower()
            if key not in seen:
                seen.add(key)
                headings.append(stripped)
    return headings[:10]


def _build_hint(headings: list[str]) -> str:
    if not headings:
        return ""
    lines = "\n".join(f"  - {h}" for h in headings)
    return (
        "IMPORTANT: The following module/unit headings were found in the text. "
        "Each one MUST become a separate module object in your output:\n" + lines
    )


# ── Trim irrelevant sections ──────────────────────────────────────────────────

def _trim_to_relevant_sections(text: str) -> str:
    """
    Keep header + syllabus/session content. Strip boilerplate.
    Cap at 12000 chars so multi-module handouts aren't truncated.
    """
    header = text[:800]
    lines = text[800:].split('\n')
    relevant = []
    skip_section = False

    skip_markers = [
        'reference book', 'suggested reference', 'recommended text',
        'co mapping', 'po mapping', 'programme outcome',
        'assessment and evaluation', 'course policies', 'support services',
        'academic integrity', 'consultation hour',
        'pso', '3-high', '2-medium', '1-low',
    ]
    resume_markers = ['module', 'unit ', 'unit-', 'session', 'syllabus', 'chapter']

    for line in lines:
        ll = line.lower().strip()
        if any(m in ll for m in skip_markers):
            skip_section = True
        if skip_section and any(kw in ll for kw in resume_markers):
            skip_section = False
        if not skip_section and line.strip():
            relevant.append(line)

    body = '\n'.join(relevant)
    result = header + '\n' + body
    return result[:12000] if len(result) >= 500 else text[:12000]


# ── JSON helpers ──────────────────────────────────────────────────────────────

def _repair_truncated_json(text: str) -> str:
    """Close any unclosed braces/brackets caused by LLM token cutoff."""
    depth_brace = depth_bracket = 0
    in_string = escape_next = False

    for ch in text:
        if escape_next:
            escape_next = False
            continue
        if ch == '\\' and in_string:
            escape_next = True
            continue
        if ch == '"' and not escape_next:
            in_string = not in_string
            continue
        if in_string:
            continue
        if ch == '{':     depth_brace += 1
        elif ch == '}':   depth_brace -= 1
        elif ch == '[':   depth_bracket += 1
        elif ch == ']':   depth_bracket -= 1

    text = text.rstrip()
    while text and text[-1] == ',':
        text = text[:-1].rstrip()

    text += ']' * max(depth_bracket, 0)
    text += '}' * max(depth_brace, 0)
    return text


def _parse_json_response(raw: str) -> dict:
    """Strip markdown fences, parse JSON, attempt repair if needed."""
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)

    for candidate in [cleaned, _repair_truncated_json(cleaned)]:
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            pass

    # Last resort: find the outermost JSON object in the response
    m = re.search(r'\{.*\}', cleaned, re.DOTALL)
    if m:
        for candidate in [m.group(), _repair_truncated_json(m.group())]:
            try:
                return json.loads(candidate)
            except json.JSONDecodeError:
                pass

    raise RuntimeError("LLM returned invalid JSON that could not be repaired")


# ── Validation ────────────────────────────────────────────────────────────────

def _validate_syllabus(data: dict) -> None:
    """
    Lightweight structural check. Only raises for clearly broken output.
    Does NOT raise for unusual-but-valid structures (e.g. 1 module with 5 chapters
    for a subject that genuinely has one unit).
    """
    if not isinstance(data, dict):
        raise ValueError("Expected a JSON object at top level")
    if not data.get("subject_name"):
        raise ValueError("subject_name is missing")
    modules = data.get("modules")
    if not isinstance(modules, list) or len(modules) == 0:
        raise ValueError("modules list is empty or missing")
    for i, mod in enumerate(modules):
        if not mod.get("title"):
            raise ValueError(f"Module {i + 1} has no title")

    # Only flag the "all-in-one-module" failure when BOTH conditions are true:
    #   a) Only 1 module was produced
    #   b) That module has 8+ chapters AND its title is just the subject name
    #      (clearest sign the LLM used the subject as a catch-all container)
    if len(modules) == 1:
        n = len(modules[0].get("chapters", []))
        mod_title = (modules[0].get("title") or "").lower().strip()
        subject_name = (data.get("subject_name") or "").lower().strip()
        title_is_subject = (
            mod_title == subject_name
            or (len(subject_name) > 4 and subject_name in mod_title)
        )
        if n >= 8 and title_is_subject:
            raise ValueError(
                f"single-module-failure: 1 module '{mod_title}' with {n} chapters "
                "(module title = subject name — LLM used subject as catch-all)"
            )


# ── Rule-based fallback splitter ──────────────────────────────────────────────

def _session_start(s: str) -> int:
    """Parse the start session number from a string like '4-7' or '4'."""
    if not s:
        return 0
    try:
        return int(re.split(r'[-–]', str(s).strip())[0].strip())
    except (ValueError, IndexError):
        return 0


def _session_end(s: str) -> int:
    """Parse the end session number from a string like '4-7' or '4'."""
    if not s:
        return 0
    try:
        parts = re.split(r'[-–]', str(s).strip())
        return int(parts[-1].strip())
    except (ValueError, IndexError):
        return 0


def _split_chapters_into_modules(
    flat_chapters: list[dict],
    subject_name: str,
    base_data: dict,
) -> dict:
    """
    Deterministic fallback: split a flat chapter list into evenly-sized modules.
    Used only when both LLM attempts produce a single-module failure.
    Produces 3-5 modules depending on chapter count.
    """
    n = len(flat_chapters)
    if n == 0:
        raise ValueError("No chapters to split — cannot produce fallback modules")

    # Target group size: aim for 3-5 groups
    target_groups = max(3, min(5, n // 2))
    target_size = max(2, n // target_groups)
    groups = [flat_chapters[i:i + target_size] for i in range(0, n, target_size)]

    # Absorb a lone last group into the previous one
    if len(groups) > 1 and len(groups[-1]) == 1:
        groups[-2].extend(groups.pop())

    modules = []
    for idx, group in enumerate(groups, start=1):
        first_title = group[0].get("title", f"Module {idx}")
        words = first_title.split()
        mod_name = " ".join(words[:5]) if len(words) > 5 else first_title

        first_s = group[0].get("sessions", "")
        last_s = group[-1].get("sessions", "")
        if first_s and last_s:
            session_range = f"{_session_start(first_s)}-{_session_end(last_s)}"
        else:
            session_range = None

        modules.append({
            "number": idx,
            "title": mod_name,
            "session_range": session_range,
            "overview_topics": [ch.get("title", "") for ch in group],
            "chapters": group,
        })

    result = dict(base_data)
    result["modules"] = modules
    logger.warning(
        "[HandoutParser] Rule-based fallback: split %d chapters into %d modules",
        n, len(modules),
    )
    return result


# ── LLM extraction ────────────────────────────────────────────────────────────

def parse_syllabus_with_llm(raw_text: str) -> dict:
    """
    Extract structured syllabus from raw text using Gemini.

    Flow:
      Attempt 1  → full extraction + heading hint injected into prompt
      Attempt 2  → targeted re-split prompt (only if attempt 1 = single-module failure)
      Fallback   → deterministic Python splitter (no LLM, always succeeds)
    """
    from services.llm_router import _call_gemini_direct

    # Pre-scan: find any module/unit headings in the text
    headings = _detect_module_headings(raw_text)
    hint = _build_hint(headings)
    if headings:
        logger.info(
            "[HandoutParser] Pre-scan detected %d module headings: %s",
            len(headings), headings,
        )

    # Inject hint via str.replace — safe because the prompt has JSON braces
    prompt = (
        _EXTRACTION_PROMPT.replace("__HINT__", hint)
        + "\n\nHANDOUT TEXT:\n"
        + raw_text[:15000]
    )

    raw1 = _call_gemini_direct(
        messages=[{"role": "user", "content": prompt}],
        model_name="gemini-3.6-flash",
        max_tokens=8192,
        temperature=0.1,
    )

    data = _parse_json_response(raw1)

    try:
        _validate_syllabus(data)
        logger.info(
            "[HandoutParser] Attempt 1 OK: %d modules, %d chapters",
            len(data["modules"]),
            sum(len(m.get("chapters", [])) for m in data["modules"]),
        )
        return data
    except ValueError as e:
        if "single-module-failure" not in str(e):
            raise  # not a module-split problem — let it propagate

    # ── Attempt 2: focused re-split ───────────────────────────────────────
    logger.warning("[HandoutParser] Attempt 1 single-module failure — retrying with re-split prompt")

    flat_chapters = data["modules"][0].get("chapters", [])
    chapters_block = "\n".join(
        f"- {ch.get('title', '?')} (sessions {ch.get('sessions', '?')})"
        for ch in flat_chapters
    )
    retry_prompt = (
        _RESPLIT_PROMPT
        .replace("__TEXT__", raw_text[:8000])
        .replace("__CHAPTERS__", chapters_block)
    )

    try:
        raw2 = _call_gemini_direct(
            messages=[{"role": "user", "content": retry_prompt}],
            model_name="gemini-3.6-flash",
            max_tokens=8192,
            temperature=0.3,
        )
        data2 = _parse_json_response(raw2)
        _validate_syllabus(data2)
        logger.info(
            "[HandoutParser] Attempt 2 OK: %d modules",
            len(data2["modules"]),
        )
        return data2
    except Exception as e2:
        logger.warning(
            "[HandoutParser] Attempt 2 failed (%s) — using rule-based fallback", e2
        )

    # ── Deterministic fallback ────────────────────────────────────────────
    if flat_chapters:
        return _split_chapters_into_modules(
            flat_chapters, data.get("subject_name", ""), data
        )

    raise RuntimeError(
        "All extraction attempts failed and no chapters were available for fallback splitting."
    )


# ── Public API ────────────────────────────────────────────────────────────────

def parse_handout(file_path: str) -> tuple[str, dict]:
    """
    Full pipeline: extract text → trim → LLM parse (with retries) → validate.
    Returns (raw_text, structured_syllabus_dict).
    """
    logger.info("[HandoutParser] Extracting text from: %s", Path(file_path).name)
    raw_text = extract_text_from_file(file_path)

    if len(raw_text.strip()) < 100:
        raise ValueError(
            "Could not extract meaningful text from this file. "
            "If it is a scanned PDF, please upload a text-based version."
        )

    trimmed = _trim_to_relevant_sections(raw_text)
    logger.info("[HandoutParser] Text trimmed: %d → %d chars", len(raw_text), len(trimmed))

    structured = parse_syllabus_with_llm(trimmed)

    logger.info(
        "[HandoutParser] Done: '%s' — %d modules, %d chapters total",
        structured.get("subject_name", "?"),
        len(structured.get("modules", [])),
        sum(len(m.get("chapters", [])) for m in structured.get("modules", [])),
    )
    return raw_text, structured
