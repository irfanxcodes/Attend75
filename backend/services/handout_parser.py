"""
Course Handout Parser — extracts structured syllabus from uploaded handout files.
Supports PDF, DOCX. Uses one Gemini call for accurate structured extraction.
"""
import json
import logging
import os
import re
import tempfile
from pathlib import Path

logger = logging.getLogger(__name__)

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

Rules:
- Extract EVERY module/unit listed in the syllabus section
- For chapters, use the session-wise outline table if present
- If no session table exists, create one chapter per major topic cluster in the module
- overview_topics = the bullet-point topics listed under the module in the syllabus section
- Do NOT include test sessions, exams, or evaluations as chapters
- subject_code must be the course code (e.g. SHAC441), not a made-up value
- Return ONLY the JSON object, no explanation, no markdown'''


def extract_text_from_file(file_path: str) -> str:
    """Extract raw text from PDF or DOCX file."""
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

    # Build a position-aware extraction by iterating the document body in order
    # python-docx exposes the XML body — iterate children to get paragraphs and tables in order
    from docx.oxml.ns import qn

    parts = []
    body = doc.element.body

    for child in body:
        tag = child.tag.split('}')[-1] if '}' in child.tag else child.tag

        if tag == 'p':
            # Paragraph
            text = ''.join(r.text for r in child.iter(qn('w:t'))).strip()
            if text:
                parts.append(text)

        elif tag == 'tbl':
            # Table — extract rows
            for tr in child.iter(qn('w:tr')):
                cells = []
                for tc in tr.iter(qn('w:tc')):
                    cell_text = ''.join(r.text for r in tc.iter(qn('w:t'))).strip()
                    if cell_text:
                        cells.append(cell_text)
                # Deduplicate merged cells
                seen = set()
                unique = []
                for c in cells:
                    if c not in seen:
                        seen.add(c)
                        unique.append(c)
                if unique:
                    parts.append(' | '.join(unique))

    return "\n".join(parts)


def _repair_truncated_json(text: str) -> str:
    """
    Attempt to repair truncated JSON by closing open structures.
    Handles cases where Gemini stops mid-response.
    """
    # Count open braces/brackets
    depth_brace = 0
    depth_bracket = 0
    in_string = False
    escape_next = False

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
        if ch == '{':
            depth_brace += 1
        elif ch == '}':
            depth_brace -= 1
        elif ch == '[':
            depth_bracket += 1
        elif ch == ']':
            depth_bracket -= 1

    # Close any open structures
    # Remove trailing comma if present
    text = text.rstrip()
    while text and text[-1] in ',':
        text = text[:-1].rstrip()

    # Close open brackets first, then braces
    text += ']' * depth_bracket
    text += '}' * depth_brace

    return text


def parse_syllabus_with_llm(raw_text: str) -> dict:
    """
    Call Gemini to extract structured syllabus from raw text.
    Returns parsed dict. Raises RuntimeError if extraction fails.
    """
    from services.llm_router import _call_gemini_direct

    # Use string concatenation to avoid .format() issues with JSON braces in prompt
    prompt = _EXTRACTION_PROMPT + "\n\nHANDOUT TEXT:\n" + raw_text[:15000]

    raw_response = _call_gemini_direct(
        messages=[{"role": "user", "content": prompt}],
        model_name="gemini-3.6-flash",
        max_tokens=8192,
        temperature=0.1,
    )

    # Strip markdown if present
    cleaned = raw_response.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)

    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        # Try repair first
        try:
            repaired = _repair_truncated_json(cleaned)
            data = json.loads(repaired)
        except json.JSONDecodeError:
            # Try to extract JSON object from response
            match = re.search(r'\{.*\}', cleaned, re.DOTALL)
            if match:
                try:
                    data = json.loads(match.group())
                except json.JSONDecodeError:
                    repaired = _repair_truncated_json(match.group())
                    data = json.loads(repaired)
            else:
                raise RuntimeError(f"LLM returned invalid JSON that could not be repaired")

    _validate_syllabus(data)
    return data


def _validate_syllabus(data: dict) -> None:
    """Basic validation — raises ValueError if structure is wrong."""
    if not isinstance(data, dict):
        raise ValueError("Expected a JSON object")
    if not data.get("subject_name"):
        raise ValueError("subject_name is missing")
    if not isinstance(data.get("modules"), list) or len(data["modules"]) == 0:
        raise ValueError("modules list is empty or missing")
    for i, mod in enumerate(data["modules"]):
        if not mod.get("title"):
            raise ValueError(f"Module {i+1} has no title")


def _trim_to_relevant_sections(text: str) -> str:
    """
    Extract only the syllabus-relevant parts from a course handout.
    Always keeps the header (first 800 chars), then keeps syllabus/session content.
    Removes CO/PO mapping tables, reference books, assessment grids.
    """
    # Always keep the header (course details, instructor info)
    header = text[:800]

    lines = text[800:].split('\n')
    relevant = []
    skip_section = False

    skip_markers = [
        'reference book', 'suggested reference', 'recommended text',
        'course outcome', 'co mapping', 'po mapping', 'programme outcome',
        'assessment and evaluation', 'course policies', 'support services',
        'academic integrity', 'consultation hour',
        'pso', '3-high', '2-medium', '1-low',
    ]

    for line in lines:
        line_lower = line.lower().strip()
        if any(m in line_lower for m in skip_markers):
            skip_section = True
        if skip_section and any(kw in line_lower for kw in ['module', 'unit', 'session', 'syllabus']):
            skip_section = False
        if not skip_section and line.strip():
            relevant.append(line)

    body = '\n'.join(relevant)
    result = header + '\n' + body

    if len(result) < 500:
        return text[:8000]
    return result[:8000]


def parse_handout(file_path: str) -> tuple[str, dict]:
    """
    Full pipeline: extract text → LLM parse → validate.
    Returns (raw_text, structured_syllabus).
    """
    logger.info("[HandoutParser] Extracting text from: %s", Path(file_path).name)
    raw_text = extract_text_from_file(file_path)

    if len(raw_text.strip()) < 100:
        raise ValueError("Could not extract meaningful text from file. Is it a scanned image PDF?")

    # Trim to only the relevant syllabus sections to avoid token limit issues
    trimmed_text = _trim_to_relevant_sections(raw_text)

    logger.info("[HandoutParser] Trimmed to %d chars (from %d), calling LLM...", len(trimmed_text), len(raw_text))
    structured = parse_syllabus_with_llm(trimmed_text)

    logger.info(
        "[HandoutParser] Done: %s — %d modules",
        structured.get("subject_name", "?"),
        len(structured.get("modules", []))
    )
    return raw_text, structured
