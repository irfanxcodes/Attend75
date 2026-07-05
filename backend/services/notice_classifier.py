"""
Notice Classifier — Category, Priority, Summary, Deadline, Program Detection

All intelligence for processing a notice lives here.
Uses deterministic rules — no ML, no API calls.
"""

import json
import logging
import os
import re
from datetime import date, datetime, timedelta
from pathlib import Path

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Category Config Loading
# ---------------------------------------------------------------------------

_CONFIG_PATH = Path(__file__).parent.parent / "category_config.json"
_categories_cache: list[dict] | None = None


def _load_categories() -> list[dict]:
    global _categories_cache
    if _categories_cache is not None:
        return _categories_cache

    try:
        with open(_CONFIG_PATH, "r") as f:
            config = json.load(f)
        _categories_cache = config.get("categories", [])
        return _categories_cache
    except Exception as exc:
        logger.warning("Failed to load category_config.json, using hardcoded defaults: %s", exc)
        _categories_cache = _HARDCODED_CATEGORIES
        return _categories_cache


_HARDCODED_CATEGORIES = [
    {"name": "Exam", "color": "#FF5B5B", "priority_rank": 1, "keywords": ["EXAM", "TIMETABLE", "HALL TICKET", "RECHECK", "ELIGIBILITY LIST", "MAKEUP", "GRADE SHEET"]},
    {"name": "Fee", "color": "#FFB23E", "priority_rank": 2, "keywords": ["FEE", "DEMAND", "INSTALLMENT", "DUES", "LOAN"]},
    {"name": "Academic", "color": "#6CB4FF", "priority_rank": 3, "keywords": ["CLASS", "SUMMER", "REMEDIAL", "HOLIDAY", "ATTENDANCE", "REGISTRATION"]},
    {"name": "Internship", "color": "#A78BFA", "priority_rank": 4, "keywords": ["INTERNSHIP", "SIP", "TRAINING", "PLACEMENT"]},
    {"name": "Event", "color": "#4EF0A0", "priority_rank": 5, "keywords": ["SEMINAR", "WORKSHOP", "FEST", "COMPETITION", "FAREWELL", "ORIENTATION"]},
    {"name": "Guest Lecture", "color": "#D97706", "priority_rank": 6, "keywords": ["THRIIVE", "WISDOM", "LEADER", "INNOVATION", "TALK"]},
    {"name": "General", "color": "#7a6f94", "priority_rank": 7, "keywords": ["LOST", "FOUND", "BUS", "TRANSPORT", "MESS", "HOSTEL"]},
]


# ---------------------------------------------------------------------------
# Category Classification
# ---------------------------------------------------------------------------

def classify(title: str, text: str) -> tuple[str, float]:
    """
    Classify a notice into one category. Returns (category_name, confidence).
    Title keywords weighted 2x vs PDF text.
    """
    categories = _load_categories()
    title_upper = (title or "").upper()
    text_upper = (text or "").upper()

    best_category = "General"
    best_score = 0
    best_confidence = 0.0

    for cat in categories:
        if cat["name"] == "General":
            continue
        keywords = cat.get("keywords", [])
        if not keywords:
            continue

        matched = 0
        for kw in keywords:
            kw_upper = kw.upper()
            # Title match counts 2x
            if kw_upper in title_upper:
                matched += 2
            elif kw_upper in text_upper:
                matched += 1

        if matched > best_score:
            best_score = matched
            best_category = cat["name"]
            best_confidence = min(matched / len(keywords), 1.0)

    # Check Guest Lecture pattern: mixed case (lowercase with UPPERCASE phrases)
    if best_category == "General" or best_score < 2:
        if _looks_like_guest_lecture(title):
            best_category = "Guest Lecture"
            best_confidence = 0.6

    return best_category, round(best_confidence, 3)


def _looks_like_guest_lecture(title: str) -> bool:
    """Detect lecture-style titles with mixed case patterns."""
    if not title:
        return False
    # Has both uppercase words and lowercase words (not all-caps, not all-lower)
    words = title.split()
    upper_words = sum(1 for w in words if w.isupper() and len(w) > 2)
    lower_words = sum(1 for w in words if w.islower() and len(w) > 2)
    mixed_words = sum(1 for w in words if w[0].isupper() and not w.isupper() and len(w) > 3)
    return mixed_words >= 3 and (upper_words >= 1 or lower_words >= 1)


# ---------------------------------------------------------------------------
# Priority Scoring (additive, clamped 0-100)
# ---------------------------------------------------------------------------

def score_priority(title: str, text: str, deadline: date | None) -> int:
    """Additive priority scoring. Returns 0-100."""
    combined = ((title or "") + " " + (text or "")).upper()
    score = 0

    # Hall Ticket: +40
    if "HALL TICKET" in combined or "HALLTICKET" in combined:
        score += 40

    # Deadline within 3 days: +30
    if deadline:
        days_until = (deadline - date.today()).days
        if 0 <= days_until <= 3:
            score += 30
        elif 4 <= days_until <= 7:
            score += 15

    # Mandatory/Compulsory: +15
    if "MANDATORY" in combined or "COMPULSORY" in combined or "MUST" in combined:
        score += 15

    # Today's date in text: +20
    today_str = date.today().strftime("%d/%m/%Y")
    today_str2 = date.today().strftime("%d-%m-%Y")
    if today_str in combined or today_str2 in combined:
        score += 20

    # Exam keyword: +25
    if "EXAM" in combined or "TEST" in combined or "MIDTERM" in combined:
        score += 25

    # Fee keyword: +15
    if "FEE" in combined or "DEMAND" in combined or "DUES" in combined:
        score += 15

    # Submission keyword: +10
    if "SUBMISSION" in combined or "SUBMIT" in combined:
        score += 10

    # Last date / deadline phrase: +10
    if "LAST DATE" in combined or "DEADLINE" in combined or "DUE DATE" in combined:
        score += 10

    # Urgent: +20
    if "URGENT" in combined or "IMMEDIATELY" in combined:
        score += 20

    return min(score, 100)


# ---------------------------------------------------------------------------
# Summary Generation (sentence scoring)
# ---------------------------------------------------------------------------

_DATE_PATTERN = re.compile(
    r"\b\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4}\b"
    r"|\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\.?\s+\d{4}\b"
    r"|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\.?\s+\d{1,2},?\s+\d{4}\b",
    re.IGNORECASE,
)

_DEADLINE_PHRASES = ["last date", "due by", "before", "on or before", "submit by", "deadline", "due date"]
_ACTION_VERBS = ["submit", "report", "attend", "register", "pay", "collect", "contact", "download", "fill"]
_GREETINGS = ["dear", "respected", "this is to inform", "kind attention", "sub:"]


def generate_summary(cleaned_text: str, title: str, category: str) -> str:
    """Generate a max-300-char summary by scoring sentences."""
    if not cleaned_text or len(cleaned_text.strip()) < 10:
        return title[:300] if title else ""

    # Split into sentences
    sentences = re.split(r'[.!?\n]+', cleaned_text)
    sentences = [s.strip() for s in sentences if len(s.strip()) > 15]

    if not sentences:
        return title[:300] if title else ""

    categories = _load_categories()
    cat_keywords = []
    for cat in categories:
        if cat["name"] == category:
            cat_keywords = [kw.lower() for kw in cat.get("keywords", [])]
            break

    best_score = -999
    best_sentence = sentences[0]

    for idx, sentence in enumerate(sentences):
        s_lower = sentence.lower()
        score = 0

        # Date pattern: +3
        if _DATE_PATTERN.search(sentence):
            score += 3

        # Deadline phrase: +3
        if any(phrase in s_lower for phrase in _DEADLINE_PHRASES):
            score += 3

        # Action verb: +2
        if any(verb in s_lower for verb in _ACTION_VERBS):
            score += 2

        # Category keyword: +2
        if any(kw in s_lower for kw in cat_keywords):
            score += 2

        # First 3 sentences: +1
        if idx < 3:
            score += 1

        # Greeting: -1
        if any(s_lower.startswith(g) for g in _GREETINGS):
            score -= 1

        if score > best_score:
            best_score = score
            best_sentence = sentence

    # Truncate at 300 chars
    if len(best_sentence) > 300:
        truncated = best_sentence[:297].rsplit(" ", 1)[0]
        return truncated + "..."
    return best_sentence


# ---------------------------------------------------------------------------
# Deadline Detection
# ---------------------------------------------------------------------------

_FULL_DATE_PATTERNS = [
    (re.compile(r"\b(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})\b"), "dmy"),
    (re.compile(r"\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\.?\s+(\d{4})\b", re.IGNORECASE), "dMy"),
    (re.compile(r"\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\.?\s+(\d{1,2}),?\s+(\d{4})\b", re.IGNORECASE), "Mdy"),
]

_MONTH_MAP = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}

_DEADLINE_TRIGGER_PHRASES = [
    "last date", "deadline", "due date", "submit by", "on or before",
    "before", "last day", "closing date", "scheduled on", "registration on",
]


def detect_deadline(text: str) -> tuple[date | None, str | None]:
    """Detect deadline date from text. Returns (parsed_date, raw_phrase) or (None, None)."""
    if not text:
        return None, None

    lines = text.split("\n")
    candidates: list[tuple[date, str]] = []

    for line in lines:
        line_lower = line.lower()
        has_trigger = any(phrase in line_lower for phrase in _DEADLINE_TRIGGER_PHRASES)
        if not has_trigger:
            continue

        # Try each date pattern
        for pattern, fmt in _FULL_DATE_PATTERNS:
            for match in pattern.finditer(line):
                try:
                    parsed = _parse_date_match(match, fmt)
                    if parsed and parsed >= date.today():
                        raw = line.strip()[:100]
                        candidates.append((parsed, raw))
                except (ValueError, IndexError):
                    continue

    if not candidates:
        return None, None

    # Return earliest future date
    candidates.sort(key=lambda x: x[0])
    return candidates[0]


def _parse_date_match(match, fmt: str) -> date | None:
    groups = match.groups()
    if fmt == "dmy":
        day, month, year = int(groups[0]), int(groups[1]), int(groups[2])
    elif fmt == "dMy":
        day = int(groups[0])
        month = _MONTH_MAP.get(groups[1][:3].lower(), 0)
        year = int(groups[2])
    elif fmt == "Mdy":
        month = _MONTH_MAP.get(groups[0][:3].lower(), 0)
        day = int(groups[1])
        year = int(groups[2])
    else:
        return None

    if not (1 <= month <= 12 and 1 <= day <= 31 and 2020 <= year <= 2030):
        return None
    return date(year, month, day)


# ---------------------------------------------------------------------------
# Program Detection (multi-signal)
# ---------------------------------------------------------------------------

_PROGRAM_KEYWORDS = {
    "BBA": ["BBA", "BACHELOR OF BUSINESS"],
    "MBA": ["MBA", "MASTER OF BUSINESS"],
    "B.Tech": ["B.TECH", "BTECH", "B TECH", "ENGINEERING"],
    "M.Tech": ["M.TECH", "MTECH"],
    "BCA": ["BCA"],
    "B.Com": ["BCOM", "B.COM", "B COM"],
    "Law": ["LAW", "LLB", "LL.B"],
    "Architecture": ["ARCHITECTURE", "B.ARCH"],
}


def detect_program(title: str, text: str, source_program: str | None) -> tuple[str | None, float]:
    """
    Multi-signal program detection.
    Returns (target_program, confidence_score) or (None, 0.0) for all-program notices.
    """
    title_upper = (title or "").upper()
    text_upper = (text or "").upper()[:2000]  # limit text scan for performance

    signals: dict[str, float] = {}

    # Signal 1: Title keywords (weight 0.4)
    for prog, keywords in _PROGRAM_KEYWORDS.items():
        for kw in keywords:
            if kw in title_upper:
                signals[prog] = signals.get(prog, 0) + 0.4
                break

    # Signal 2: PDF text keywords (weight 0.4)
    for prog, keywords in _PROGRAM_KEYWORDS.items():
        for kw in keywords:
            if kw in text_upper:
                signals[prog] = signals.get(prog, 0) + 0.4
                break

    # Signal 3: Source program cookie (weight 0.2)
    if source_program:
        for prog, keywords in _PROGRAM_KEYWORDS.items():
            if any(kw in source_program.upper() for kw in keywords):
                signals[prog] = signals.get(prog, 0) + 0.2
                break

    if not signals:
        return None, 0.0

    # If multiple programs detected (e.g. "BBA / B.Tech"), it's for all → None
    if len(signals) > 1:
        values = list(signals.values())
        if max(values) - min(values) < 0.3:
            return None, 0.0

    best_prog = max(signals, key=signals.get)
    confidence = min(signals[best_prog], 1.0)
    return best_prog, round(confidence, 3)


# ---------------------------------------------------------------------------
# Text Cleaning
# ---------------------------------------------------------------------------

def clean_text(raw_text: str) -> str:
    """Normalize whitespace, remove non-printable chars."""
    if not raw_text:
        return ""
    # Remove non-printable (except newline, tab)
    cleaned = re.sub(r'[^\x20-\x7E\n\t]', ' ', raw_text)
    # Normalize whitespace
    cleaned = re.sub(r'[ \t]+', ' ', cleaned)
    # Normalize multiple newlines
    cleaned = re.sub(r'\n{3,}', '\n\n', cleaned)
    return cleaned.strip()


# ---------------------------------------------------------------------------
# Keyword Extraction
# ---------------------------------------------------------------------------

def extract_keywords(title: str, text: str, category: str) -> str:
    """Extract top keywords for search. Returns comma-separated string."""
    combined = ((title or "") + " " + (text or "")[:500]).upper()
    all_keywords = set()

    categories = _load_categories()
    for cat in categories:
        for kw in cat.get("keywords", []):
            if kw.upper() in combined:
                all_keywords.add(kw)

    # Add program keywords found
    for prog, keywords in _PROGRAM_KEYWORDS.items():
        for kw in keywords:
            if kw in combined:
                all_keywords.add(kw)
                break

    return ", ".join(sorted(all_keywords)[:15])
