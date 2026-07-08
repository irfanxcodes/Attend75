"""
Timetable Service — Parses timetable PDFs and returns personalized schedules.

Finds the latest timetable notice for the student's semester, parses the PDF
table, and filters rows matching the student's enrolled subjects + sections.
"""

import io
import logging
import re
from datetime import datetime

import pdfplumber
from bs4 import BeautifulSoup

from db.models.notice import Notice
from db.session import SessionLocal
from services.session_store import session_store

logger = logging.getLogger(__name__)

# Cache parsed timetables to avoid re-downloading PDFs on every request
_timetable_cache: dict[int, dict] = {}  # notice_id -> {parsed_at, schedule}


def get_personalized_timetable(token: str) -> dict | None:
    """
    Get the student's personalized timetable.
    Returns structured schedule data or None if no timetable available.
    """
    record = session_store.get(token)
    if record is None:
        raise PermissionError("Session expired")

    # 1. Get student's enrolled subjects + sections from attendance
    student_subjects = _get_student_subjects(record)
    if not student_subjects:
        return None

    # 2. Find the latest timetable notice for the student's semester
    semester_id = record.scraper.session.cookies.get("SemesterID", "")
    timetable_notice = _find_latest_timetable_notice(semester_id)
    if not timetable_notice:
        return None

    # 3. Parse the timetable PDF (with caching)
    schedule = _get_parsed_schedule(timetable_notice, record)
    if not schedule:
        return None

    # 4. Filter schedule for this student's subjects + sections
    # Primary match: exact ABBR-SECTION (e.g., OB-N, FM-N)
    lookup = set()
    for subj in student_subjects:
        key = f"{subj['abbr']}-{subj['section']}"
        lookup.add(key.upper())

    # Get student's semester number from primary matches
    primary_matches = [cls for cls in schedule if cls.get("course_key", "").upper() in lookup]
    sem_counts = {}
    for cls in primary_matches:
        s = cls.get("semester", "").strip()
        if s:
            sem_counts[s] = sem_counts.get(s, 0) + 1
    student_sem = max(sem_counts, key=sem_counts.get) if sem_counts else ""

    # For secondary matching, handle LANGUAGE courses.
    # In attendance, languages appear as generic codes: "IMIL", "FML", etc. with a section.
    # In the timetable PDF, the SAME class appears with the specific language abbreviation:
    #   MLH (Hindi), MLT (Telugu), MLS (Sanskrit), MLK (Kannada), MLM (Malayalam), MLE (English)
    # The SECTION letter is consistent between attendance and timetable.
    # So: attendance has IMIL-A → timetable has MLH-A (or MLS-A, MLT-A, etc.)
    # We match timetable entries where:
    #   1. The course starts with a specific language prefix (MLH, MLT, MLS, etc.)
    #   2. The section matches the student's language section from attendance
    #   3. The semester matches

    # Generic language codes that appear in attendance
    GENERIC_LANGUAGE_CODES = {"IMIL", "FML"}
    # Specific language abbreviations that appear in timetable PDFs
    SPECIFIC_LANGUAGE_PREFIXES = ("MLH", "MLT", "MLS", "MLK", "MLM", "MLE")

    # Find the student's language section from their attendance data
    student_language_section = None
    for subj in student_subjects:
        abbr = subj["abbr"].upper()
        if abbr in GENERIC_LANGUAGE_CODES or any(abbr.startswith(p) for p in SPECIFIC_LANGUAGE_PREFIXES):
            student_language_section = subj["section"].upper()
            break

    my_classes = []
    for cls in schedule:
        course_key = cls.get("course_key", "").upper()
        # Primary: exact match on ABBR-SECTION
        if course_key in lookup:
            my_classes.append(cls)
            continue
        # Secondary: match specific language classes by section from attendance.
        # e.g., student has IMIL section A → match MLH-A, MLS-A, MLT-A in timetable
        if student_language_section:
            sem = cls.get("semester", "").strip()
            course_abbr = cls.get("course", "").upper()
            section = cls.get("section", "").upper()
            if (section == student_language_section
                    and sem == student_sem
                    and any(course_abbr.startswith(prefix) for prefix in SPECIFIC_LANGUAGE_PREFIXES)):
                my_classes.append(cls)

    if not my_classes:
        return None

    # 5. Organize by day
    days_order = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
    by_day = {day: [] for day in days_order}
    for cls in my_classes:
        day = cls.get("day", "")
        if day in by_day:
            by_day[day].append(cls)

    # Sort each day by time
    for day in by_day:
        by_day[day].sort(key=lambda c: c.get("time_sort", ""))

    # Remove empty days
    by_day = {day: classes for day, classes in by_day.items() if classes}

    return {
        "noticeTitle": timetable_notice.title,
        "noticeDate": timetable_notice.portal_date.isoformat() if timetable_notice.portal_date else None,
        "noticeId": timetable_notice.notice_id,
        "schedule": by_day,
        "totalClasses": len(my_classes),
        "subjects": [s["abbr"] for s in student_subjects],
    }


def _get_student_subjects(record) -> list[dict]:
    """Get student's enrolled subjects + sections from attendance scraping."""
    try:
        scraper = record.scraper
        attendance_url = scraper._build_url("CommonS.aspx?qs=ap")

        with record.scraper_lock:
            r = scraper.session.get(attendance_url, timeout=15, headers={"Referer": scraper._build_url("Index.aspx")})

        if scraper._looks_like_login_page(r.text):
            logger.warning("Timetable: attendance page returned login (session expired)")
            return []

        soup = BeautifulSoup(r.text, "html.parser")
        
        # Try the standard attendance table
        table = soup.find("table", {"id": "table"})
        if not table:
            # Try any table
            for t in soup.find_all("table"):
                headers = [th.get_text(strip=True).lower() for th in t.find_all("th")]
                if any("section" in h for h in headers):
                    table = t
                    break

        if not table:
            logger.warning("Timetable: no attendance table found")
            return []

        # Find column indices
        headers = [th.get_text(strip=True).lower() for th in table.find_all("th")]
        abbr_idx = None
        section_idx = None
        for i, h in enumerate(headers):
            if "abbr" in h or "courseabbr" in h.replace(" ", ""):
                abbr_idx = i
            if "section" in h:
                section_idx = i

        # Fallback to known positions
        if abbr_idx is None:
            abbr_idx = 2
        if section_idx is None:
            section_idx = 4

        subjects = []
        for row in table.find_all("tr")[1:]:
            cells = row.find_all("td")
            if len(cells) <= max(abbr_idx, section_idx):
                continue
            abbr = cells[abbr_idx].get_text(strip=True).strip().upper()
            section = cells[section_idx].get_text(strip=True).strip().upper()
            if abbr and section:
                subjects.append({"abbr": abbr, "section": section})

        logger.info("Timetable: found %d subjects for student", len(subjects))
        return subjects
    except Exception as exc:
        logger.warning("Failed to get student subjects for timetable: %s", exc)
        return []


def _find_latest_timetable_notice(semester_id: str) -> Notice | None:
    """Find the most recent class timetable notice (not exam schedule, not summer)."""
    with SessionLocal() as session:
        notices = (
            session.query(Notice)
            .filter(Notice.processing_status == "done")
            .filter(Notice.title.isnot(None))
            .order_by(Notice.notice_id.desc())
            .limit(300)
            .all()
        )

        for notice in notices:
            title_upper = (notice.title or "").upper()
            # Must contain TIMETABLE or TIME TABLE
            if "TIMETABLE" not in title_upper and "TIME TABLE" not in title_upper:
                continue
            # Skip exam schedules
            if "EXAM SCHEDULE" in title_upper:
                continue
            # Skip summer/special term (not regular class timetable)
            if "SUMMER" in title_upper and "SPECIAL" in title_upper:
                continue
            if "EXAM TIMETABLE" in title_upper:
                continue
            # This looks like a regular class timetable
            return notice

    return None


def _get_parsed_schedule(notice: Notice, record) -> list[dict] | None:
    """Parse timetable PDF into structured class list. Cached by notice_id."""
    notice_id = notice.notice_id

    # Check cache
    if notice_id in _timetable_cache:
        cached = _timetable_cache[notice_id]
        # Cache for 1 hour
        if (datetime.utcnow() - cached["parsed_at"]).seconds < 3600:
            return cached["schedule"]

    # Download PDF
    try:
        scraper = record.scraper
        pdf_url = f"{scraper.base_url.rstrip('/')}/{notice.pdf_url_path}"

        with record.scraper_lock:
            r = scraper.session.get(pdf_url, timeout=20)

        if r.status_code != 200:
            return None

        schedule = _parse_timetable_pdf(io.BytesIO(r.content))
        if schedule:
            _timetable_cache[notice_id] = {"parsed_at": datetime.utcnow(), "schedule": schedule}
        return schedule
    except Exception as exc:
        logger.warning("Failed to parse timetable PDF (notice %d): %s", notice_id, exc)
        return None


def _parse_timetable_pdf(pdf_bytes: io.BytesIO) -> list[dict]:
    """Parse all pages of a timetable PDF into a flat list of class entries."""
    all_classes = []
    days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]

    # Each page in the PDF represents one time slot.
    # Mapped from the college timetable PDF (7 periods per day):
    PAGE_TIME_SLOTS = [
        "9:30 – 10:20 AM",
        "10:25 – 11:15 AM",
        "11:20 AM – 12:10 PM",
        "12:15 – 1:05 PM",
        "2:00 – 2:50 PM",
        "2:55 – 3:45 PM",
        "3:10 – 4:00 PM",
    ]

    with pdfplumber.open(pdf_bytes) as pdf:
        for page_idx, page in enumerate(pdf.pages):
            tables = page.extract_tables()
            if not tables:
                continue

            table = tables[0]
            if len(table) < 3 or len(table[0]) < 10:
                continue

            # Assign time slot based on page index
            time_slot = PAGE_TIME_SLOTS[page_idx] if page_idx < len(PAGE_TIME_SLOTS) else f"Period {page_idx + 1}"
            time_sort = f"{page_idx:02d}"

            for row in table[2:]:  # Skip header rows
                if not row or len(row) < 10:
                    continue

                room = (row[-1] or "").strip() if row[-1] else ""

                # Each day has 3 columns: course, faculty, sem
                for day_idx, day_name in enumerate(days):
                    col_offset = 1 + (day_idx * 3)
                    if col_offset + 2 >= len(row):
                        continue

                    course_raw = (row[col_offset] or "").strip()
                    faculty = (row[col_offset + 1] or "").strip()
                    sem = (row[col_offset + 2] or "").strip()

                    if not course_raw:
                        continue

                    all_classes.append({
                        "day": day_name,
                        "time": time_slot,
                        "time_sort": time_sort,
                        "course_key": course_raw.upper(),
                        "course": course_raw.split("-")[0] if "-" in course_raw else course_raw,
                        "section": course_raw.split("-")[1] if "-" in course_raw else "",
                        "faculty": faculty,
                        "semester": sem,
                        "room": room,
                    })

    return all_classes


def _clean_time(raw: str) -> str:
    """Clean time string from PDF parsing artifacts."""
    # Remove newlines
    cleaned = re.sub(r'\n', ' ', raw)
    # Remove common artifacts
    cleaned = re.sub(r'\b(MP|MA|ot|not|to)\b', '', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()

    # Try to extract actual time patterns like "09.30" "10.20"
    times = re.findall(r'(\d{1,2})\.(\d{2})', cleaned)
    if len(times) >= 2:
        start_h, start_m = int(times[0][0]), int(times[0][1])
        end_h, end_m = int(times[1][0]), int(times[1][1])
        return f"{_fmt_clock(start_h, start_m)} – {_fmt_clock(end_h, end_m)}"
    elif len(times) == 1:
        h, m = int(times[0][0]), int(times[0][1])
        return _fmt_clock(h, m)

    # Try alternate patterns like "09:30" or "9.30 AM"
    am_pm = re.findall(r'(\d{1,2})[.:](\d{2})\s*(AM|PM)?', cleaned, re.IGNORECASE)
    if len(am_pm) >= 2:
        s = am_pm[0]
        e = am_pm[1]
        start_str = f"{int(s[0])}:{s[1]} {s[2]}".strip() if s[2] else _fmt_clock(int(s[0]), int(s[1]))
        end_str = f"{int(e[0])}:{e[1]} {e[2]}".strip() if e[2] else _fmt_clock(int(e[0]), int(e[1]))
        return f"{start_str} – {end_str}"

    return cleaned if cleaned else ""


def _fmt_clock(h: int, m: int) -> str:
    """Format hour and minute into 12h clock string."""
    if h == 0:
        return f"12:{m:02d} AM"
    elif h < 12:
        return f"{h}:{m:02d} AM"
    elif h == 12:
        return f"12:{m:02d} PM"
    else:
        return f"{h - 12}:{m:02d} PM"


def _time_sort_key(raw: str) -> str:
    """Extract sortable time key from raw time string."""
    times = re.findall(r'(\d{1,2}\.\d{2})', raw.replace('\n', ' '))
    if times:
        return times[0].zfill(5)
    return "99.99"
