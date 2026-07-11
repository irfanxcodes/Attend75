"""
Timetable Service — Parses timetable notices and returns personalized schedules.

Finds the latest timetable notice, parses the stored text into a structured
schedule, and filters rows matching the student's enrolled subjects.
"""

import io
import logging
import re
from datetime import datetime

import pdfplumber

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

    # 1. Find the latest timetable notice
    timetable_notice = _find_latest_timetable_notice()
    if not timetable_notice:
        return None

    # 2. Parse the timetable from stored text (no network needed)
    schedule = _get_parsed_schedule(timetable_notice, record)
    if not schedule:
        return None

    # 3. Get student subjects and filter
    student_subjects = record.cached_subjects
    if not student_subjects:
        # Subjects not cached yet (race condition on first load). Fetch inline.
        try:
            data = record.scraper.fetch_attendance_for_semester()
            attendance_rows = data.get("attendance", [])
            subjects = []
            for item in attendance_rows:
                abbr = str(item.get("course_abbr", "")).strip().upper()
                section = str(item.get("section", "")).strip().upper()
                if abbr and section:
                    subjects.append({"abbr": abbr, "section": section})
            if subjects:
                record.cached_subjects = subjects
                student_subjects = subjects
        except Exception:
            pass

    if not student_subjects:
        return None

    my_classes = _match_student_classes(schedule, student_subjects)

    if not my_classes:
        return None

    # 4. Organize by day
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

    if not by_day:
        return None

    return {
        "noticeTitle": timetable_notice.title,
        "noticeDate": timetable_notice.portal_date.isoformat() if timetable_notice.portal_date else None,
        "noticeId": timetable_notice.notice_id,
        "schedule": by_day,
        "totalClasses": len(my_classes),
        "subjects": [s["abbr"] for s in student_subjects],
    }


def _match_student_classes(schedule: list[dict], student_subjects: list[dict]) -> list[dict]:
    """Match schedule entries to student's enrolled subjects."""
    if not student_subjects:
        return []

    # Build lookup: exact ABBR-SECTION keys
    lookup = set()
    for subj in student_subjects:
        key = f"{subj['abbr']}-{subj['section']}".upper()
        lookup.add(key)

    # Primary match
    my_classes = [cls for cls in schedule if cls.get("course_key", "").upper() in lookup]

    # If primary match works, also try language course matching
    if my_classes:
        # Detect student's semester from matched classes
        sem_counts = {}
        for cls in my_classes:
            s = cls.get("semester", "").strip()
            if s:
                sem_counts[s] = sem_counts.get(s, 0) + 1
        student_sem = max(sem_counts, key=sem_counts.get) if sem_counts else ""

        # Language matching: IMIL/FML in attendance → MLH/MLT/MLS etc. in timetable
        GENERIC_LANGUAGE_CODES = {"IMIL", "FML"}
        SPECIFIC_LANGUAGE_PREFIXES = ("MLH", "MLT", "MLS", "MLK", "MLM", "MLE")

        student_language_section = None
        for subj in student_subjects:
            if subj["abbr"].upper() in GENERIC_LANGUAGE_CODES:
                student_language_section = subj["section"].upper()
                break

        if student_language_section and student_sem:
            for cls in schedule:
                if cls.get("course_key", "").upper() in lookup:
                    continue  # already matched
                course = cls.get("course", "").upper()
                section = cls.get("section", "").upper()
                sem = cls.get("semester", "").strip()
                if (section == student_language_section
                        and sem == student_sem
                        and any(course.startswith(p) for p in SPECIFIC_LANGUAGE_PREFIXES)):
                    my_classes.append(cls)

    return my_classes

def _find_latest_timetable_notice() -> Notice | None:
    """Find the most recent regular class timetable notice."""
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
            # Skip exam timetables
            if "EXAM TIMETABLE" in title_upper or "EXAM SCHEDULE" in title_upper:
                continue
            # Skip special/summer/remedial timetables
            if "SPECIAL" in title_upper:
                continue
            if "SUMMER" in title_upper:
                continue
            if "REMEDIAL" in title_upper:
                continue
            # This looks like a regular class timetable
            return notice

    return None


def _get_parsed_schedule(notice: Notice, record) -> list[dict] | None:
    """Parse timetable into structured class list. Uses stored text first, falls back to PDF download."""
    notice_id = notice.notice_id

    # Check cache
    if notice_id in _timetable_cache:
        cached = _timetable_cache[notice_id]
        # Cache for 1 hour
        if (datetime.utcnow() - cached["parsed_at"]).seconds < 3600:
            return cached["schedule"]

    # Try parsing from stored text (no network needed)
    if notice.cleaned_text and len(notice.cleaned_text) > 100:
        schedule = _parse_timetable_from_text(notice.cleaned_text)
        if schedule:
            _timetable_cache[notice_id] = {"parsed_at": datetime.utcnow(), "schedule": schedule}
            return schedule

    # Fallback: download and parse PDF (requires live portal session)
    try:
        scraper = record.scraper
        pdf_url = f"{scraper.base_url.rstrip('/')}/{notice.pdf_url_path}"

        with record.scraper_lock:
            r = scraper.session.get(pdf_url, timeout=20)

        if r.status_code != 200:
            logger.warning("Timetable PDF download failed (notice %d): HTTP %d", notice_id, r.status_code)
            return None

        schedule = _parse_timetable_pdf(io.BytesIO(r.content))
        if schedule:
            _timetable_cache[notice_id] = {"parsed_at": datetime.utcnow(), "schedule": schedule}
        return schedule
    except Exception as exc:
        logger.warning("Failed to parse timetable PDF (notice %d): %s", notice_id, exc)
        return None


def _parse_timetable_from_text(text: str) -> list[dict]:
    """
    Parse timetable from the stored extracted text (no PDF download needed).
    
    Format: Multiple sections (one per time slot), each starting with a title line
    and "TIME Course Faculty Name Sem..." header.
    Each data row has 5 day-columns of "Course-Section Faculty Sem" then Room.
    """
    lines = text.strip().split('\n')
    if len(lines) < 3:
        return []

    days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
    PAGE_TIME_SLOTS = [
        "9:30 – 10:20 AM",
        "10:25 – 11:15 AM",
        "11:20 AM – 12:10 PM",
        "12:15 – 1:05 PM",
        "2:00 – 2:50 PM",
        "2:55 – 3:45 PM",
        "3:10 – 4:00 PM",
    ]

    all_classes = []
    current_slot_idx = -1
    course_pattern = re.compile(r'\b([A-Z][A-Z0-9]{1,6})-([A-Z0-9]{1,3})\b')

    for line in lines:
        line = line.strip()
        if not line:
            continue

        line_upper = line.upper()

        # Detect TIME header (marks start of a new time slot section)
        if line_upper.startswith("TIME ") and "COURSE" in line_upper and "FACULTY" in line_upper:
            current_slot_idx += 1
            continue

        # Skip title lines
        if "TIMETABLE" in line_upper or "TIME TABLE" in line_upper:
            continue

        # Skip standalone day name lines
        if line in days or line in [d.upper() for d in days]:
            continue

        # Skip if we haven't hit the first TIME header yet
        if current_slot_idx < 0:
            continue

        # Parse data rows
        matches = course_pattern.findall(line)
        if not matches or len(matches) < 2:
            continue

        # Filter out room-like matches (LT, CR, BB, etc.)
        room_prefixes = ('LT', 'CR', 'BB', 'CL', 'SH', 'FR', 'SR', 'FEC', 'BEC', 'LH')
        course_matches = [(c, s) for c, s in matches if not (c in room_prefixes and (s.isdigit() or len(s) == 1))]

        # Extract room from end of line
        room = ""
        all_matches_in_line = [(c, s) for c, s in matches]
        if all_matches_in_line:
            last_c, last_s = all_matches_in_line[-1]
            if last_c in room_prefixes:
                room = f"{last_c}-{last_s}"

        if not course_matches:
            continue

        time_slot = PAGE_TIME_SLOTS[current_slot_idx] if current_slot_idx < len(PAGE_TIME_SLOTS) else f"Period {current_slot_idx + 1}"
        time_sort = f"{current_slot_idx:02d}"

        # Each row has 5 course entries (Mon–Fri). If fewer, assign to available days.
        # The text format repeats: Course-Section FacultyName Sem
        # We take up to 5 course matches and map them to days
        for i, (course, section) in enumerate(course_matches[:5]):
            if i >= len(days):
                break

            # Extract faculty and semester from the text between matches
            faculty = _extract_faculty_near(line, course, section)
            sem = _extract_sem_near(line, course, section)

            all_classes.append({
                "day": days[i],
                "time": time_slot,
                "time_sort": time_sort,
                "course_key": f"{course}-{section}",
                "course": course,
                "section": section,
                "faculty": faculty,
                "semester": sem,
                "room": room,
            })

    logger.info("Timetable text parser: extracted %d class entries across %d time slots", len(all_classes), current_slot_idx + 1)
    return all_classes


def _extract_faculty_near(line: str, course: str, section: str) -> str:
    """Extract faculty name after a Course-Section pattern."""
    pattern = f"{course}-{section}"
    pos = line.find(pattern)
    if pos == -1:
        return ""
    after = line[pos + len(pattern):].strip()
    # Faculty: sequence of words (mixed case) before a single digit (semester number)
    match = re.match(r'^[,\s]*([A-Za-z][A-Za-z .,]+?)(?:\s+\d\b)', after)
    if match:
        name = match.group(1).strip().rstrip(',.')
        # Skip if looks like another course code
        if len(name) > 2 and not re.match(r'^[A-Z]{2,6}$', name):
            return name
    return ""


def _extract_sem_near(line: str, course: str, section: str) -> str:
    """Extract semester number after a Course-Section + Faculty pattern."""
    pattern = f"{course}-{section}"
    pos = line.find(pattern)
    if pos == -1:
        return ""
    after = line[pos + len(pattern):].strip()
    # Find single digit (semester) - usually appears after faculty name
    match = re.search(r'\b(\d)\b', after[:80])
    if match:
        return match.group(1)
    return ""


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
