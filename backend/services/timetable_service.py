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


def get_personalized_timetable(token: str, semester_id: str | None = None) -> dict | None:
    """
    Get the student's personalized timetable.
    Returns structured schedule data or None if no timetable available.
    """
    record = session_store.get(token)
    if record is None:
        raise PermissionError("Session expired")

    # 1. First pass: resolve subjects using cached data (no portal needed).
    #    We try with whatever cached_subjects we have to find a matching notice.
    initial_subjects = record.cached_subjects or []

    # 2. Find the timetable notice that best matches the student.
    #    If we have no subjects yet, grab any timetable notice so we can build
    #    the lookup and then fetch attendance properly.
    matched_notice = (
        _find_latest_timetable_notice(initial_subjects)
        if initial_subjects
        else _find_any_timetable_notice()
    )
    if not matched_notice:
        logger.warning("Timetable: no timetable notice found in DB")
        return None

    # 3. Build abbr lookup from the matched notice's embedded subject table.
    #    This maps course codes/full names → short timetable abbrs.
    abbr_lookup = _build_abbr_lookup(matched_notice.cleaned_text or "")
    logger.info("Timetable: notice=%d lookup_size=%d semester_id=%s",
                matched_notice.notice_id, len(abbr_lookup), semester_id)

    # 4. Resolve student subjects — tries cached raw rows first, then portal fetch,
    #    then falls back to existing cached_subjects.
    student_subjects = _resolve_subjects(record, semester_id, abbr_lookup)
    logger.info("Timetable: resolved %d subjects: %s",
                len(student_subjects), [s['abbr'] for s in student_subjects])
    if not student_subjects:
        return None

    # 5. Re-find the best matching notice now that we have resolved subjects.
    #    This is important when the initial notice was a fallback (e.g. wrong semester).
    best_notice = _find_latest_timetable_notice(student_subjects) or matched_notice

    # If the best notice changed, rebuild the lookup with the correct notice.
    if best_notice.notice_id != matched_notice.notice_id:
        abbr_lookup = _build_abbr_lookup(best_notice.cleaned_text or "")
        if abbr_lookup:
            resolved = _resolve_subjects(record, semester_id, abbr_lookup)
            if resolved:
                student_subjects = resolved

    # 6. Parse the timetable schedule from stored text (no network needed)
    schedule = _get_parsed_schedule(best_notice, record)
    if not schedule:
        logger.warning("Timetable: failed to parse schedule from notice %d", best_notice.notice_id)
        return None

    my_classes = _match_student_classes(schedule, student_subjects)
    logger.info("Timetable: matched %d classes from %d schedule entries",
                len(my_classes), len(schedule))

    # 7. If we got a partial match (incomplete subjects from stale session),
    #    infer the full subject set from the timetable using section + semester.
    #    Always attempt augmentation when matched classes seem incomplete
    #    (a typical semester has 5-8 subjects, so fewer than expected suggests gaps).
    if my_classes:
        augmented = _infer_full_subjects_from_schedule(schedule, my_classes)
        if len(augmented) > len(student_subjects):
            logger.info("Timetable: augmented %s → %s via schedule inference",
                        [s['abbr'] for s in student_subjects],
                        [s['abbr'] for s in augmented])
            student_subjects = augmented
            my_classes = _match_student_classes(schedule, student_subjects)
            logger.info("Timetable: after augmentation matched %d classes", len(my_classes))

    if not my_classes:
        return None

    # 7. Organise by day
    days_order = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
    by_day = {day: [] for day in days_order}
    for cls in my_classes:
        day = cls.get("day", "")
        if day in by_day:
            by_day[day].append(cls)

    for day in by_day:
        by_day[day].sort(key=lambda c: c.get("time_sort", ""))

    by_day = {day: classes for day, classes in by_day.items() if classes}
    if not by_day:
        return None

    # Persist student's resolved subjects for background scheduler use
    try:
        import json
        from db.models.push_subscription import PushSubscription
        subjects_json = json.dumps(student_subjects)
        with SessionLocal() as db_sess:
            db_sess.query(PushSubscription).filter(
                PushSubscription.roll_number == record.roll_number
            ).update({"cached_subjects_json": subjects_json, "has_timetable": True})
            db_sess.commit()
    except Exception:
        pass  # Non-critical — don't fail timetable response

    return {
        "noticeTitle": matched_notice.title,
        "noticeDate": matched_notice.portal_date.isoformat() if matched_notice.portal_date else None,
        "noticeId": matched_notice.notice_id,
        "schedule": by_day,
        "totalClasses": len(my_classes),
        "subjects": [s["abbr"] for s in student_subjects],
    }


def _resolve_subjects(record, semester_id: str | None, abbr_lookup: dict[str, str]) -> list[dict]:
    """
    Return the student's (abbr, section) pairs, applying abbr_lookup to resolve
    blank or code-based abbreviations.

    Resolution order:
    1. Re-resolve from cached raw attendance rows (no network — works even with stale session)
    2. Fetch fresh attendance from portal (catches semester switches, populates rows cache)
    3. Return existing cached_subjects as-is (last resort)
    """
    # Re-resolve from cached raw rows — fastest path, no network needed.
    # Uses getattr so old in-memory sessions (missing the field) degrade gracefully.
    cached_rows = getattr(record, "cached_attendance_rows", None) or []
    logger.info("Timetable _resolve_subjects: cached_rows=%d cached_subjects=%d semester_id=%s",
                len(cached_rows), len(record.cached_subjects), semester_id)
    if cached_rows:
        subjects = _extract_subjects(cached_rows, abbr_lookup)
        if subjects:
            record.cached_subjects = subjects
            return subjects

    # No cached rows (old session or first request) — fetch from portal.
    fetch_sem = semester_id  # try requested semester first, then default
    for sem in [fetch_sem, None] if fetch_sem else [None]:
        try:
            data = record.scraper.fetch_attendance_for_semester(semester_id=sem)
            rows = data.get("attendance", [])
            if rows:
                record.cached_attendance_rows = list(rows)
                subjects = _extract_subjects(rows, abbr_lookup)
                if subjects:
                    record.cached_subjects = subjects
                    return subjects
        except Exception:
            pass

    # Last resort: cached_subjects as-is (may have incomplete abbrs from login)
    if record.cached_subjects:
        return record.cached_subjects

    return []


def _infer_full_subjects_from_schedule(schedule: list[dict], matched_classes: list[dict]) -> list[dict]:
    """
    When the attendance data only gave us a partial subject list (e.g. only one subject),
    use the timetable itself to infer the full subject set.

    Strategy: from the matched classes, determine the student's section (and semester
    if available), then collect ALL unique courses for that section from the schedule.
    Works even when the semester field is blank (older PDF format).
    """
    if not matched_classes:
        return []

    from collections import Counter
    sem_counts = Counter(c['semester'] for c in matched_classes if c['semester'])
    section_counts = Counter(c['section'] for c in matched_classes if c['section'])

    if not section_counts:
        return []

    student_section = max(section_counts, key=section_counts.get)
    student_sem = max(sem_counts, key=sem_counts.get) if sem_counts else ""

    # Collect all unique courses for this section (+ semester if available)
    if student_sem:
        inferred = sorted(set(
            e['course'] for e in schedule
            if e['section'] == student_section and e['semester'] == student_sem
        ))
    else:
        # No semester info in this notice format — match by section alone.
        # Cap at 10 to avoid returning every course in the timetable for
        # multi-semester notices that don't have a semester column.
        all_for_section = sorted(set(
            e['course'] for e in schedule
            if e['section'] == student_section
        ))
        # If there are too many (>10), this notice likely combines multiple
        # semesters with the same section labels — skip inference to avoid
        # showing wrong classes. The user will need to have attendance data.
        if len(all_for_section) > 10:
            return []
        inferred = all_for_section

    if not inferred:
        return []

    return [{'abbr': course, 'section': student_section} for course in inferred]


def _match_student_classes(schedule: list[dict], student_subjects: list[dict]) -> list[dict]:
    """Match schedule entries to student's enrolled subjects."""
    if not student_subjects:
        return []

    # Build lookup: exact ABBR-SECTION keys
    lookup = set()
    abbr_set = set()
    section_set = set()
    for subj in student_subjects:
        key = f"{subj['abbr']}-{subj['section']}".upper()
        lookup.add(key)
        abbr_set.add(subj['abbr'].upper())
        section_set.add(subj['section'].upper())

    # Primary match: exact ABBR-SECTION
    my_classes = [cls for cls in schedule if cls.get("course_key", "").upper() in lookup]

    # Secondary match: for subjects that didn't match exactly, try flexible section matching.
    # This catches cases like attendance="A" but timetable="A1", or "J" vs "J1"
    matched_abbrs = set(cls.get("course", "").upper() for cls in my_classes)
    unmatched_abbrs = abbr_set - matched_abbrs

    if unmatched_abbrs:
        for cls in schedule:
            course = cls.get("course", "").upper()
            if course not in unmatched_abbrs:
                continue
            cls_section = cls.get("section", "").upper()
            # Flexible section matching: prefix overlap
            if cls_section and any(
                cls_section.startswith(s) or s.startswith(cls_section)
                for s in section_set
            ):
                my_classes.append(cls)

    # If exact + flexible match still fails entirely, try abbr-only matching
    if not my_classes:
        abbr_matched = [cls for cls in schedule if cls.get("course", "").upper() in abbr_set]
        if abbr_matched:
            # Accept classes whose section has any prefix overlap with student sections
            for cls in abbr_matched:
                cls_section = cls.get("section", "").upper()
                if cls_section and any(
                    cls_section.startswith(s) or s.startswith(cls_section)
                    for s in section_set
                ):
                    my_classes.append(cls)

            # If prefix matching also fails, use abbr-matched if significant overlap
            if not my_classes and len(set(cls.get("course", "").upper() for cls in abbr_matched)) >= min(2, len(abbr_set)):
                my_classes = abbr_matched

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


def _load_student_subjects(record, semester_id: str | None = None) -> list[dict]:
    """Return cached subjects, refreshing from the requested semester when provided."""
    if semester_id:
        try:
            data = record.scraper.fetch_attendance_for_semester(semester_id=semester_id)
            subjects = _extract_subjects(data.get("attendance", []))
            if subjects:
                record.cached_subjects = subjects
                return subjects
        except Exception:
            pass

    if record.cached_subjects:
        return record.cached_subjects

    # Subjects not cached yet (race condition on first load). Fetch inline.
    try:
        data = record.scraper.fetch_attendance_for_semester()
        subjects = _extract_subjects(data.get("attendance", []))
        if subjects:
            record.cached_subjects = subjects
            return subjects
    except Exception:
        pass

    return []


def _extract_subjects(attendance_rows: list[dict], abbr_lookup: dict[str, str] | None = None) -> list[dict]:
    """
    Extract (abbr, section) pairs from attendance rows.

    The portal's attendance table sometimes returns a course code (e.g. 'SHIS460')
    or full course name in the course_abbr column instead of the short timetable
    abbreviation (e.g. 'CSCL').  When abbr_lookup is provided (built from the
    timetable notice's subject table), it is used to resolve codes/names → abbrs.
    """
    subjects = []
    for item in attendance_rows:
        raw_abbr = str(item.get("course_abbr", "")).strip().upper()
        section = str(item.get("section", "")).strip().upper()
        if not section:
            continue

        abbr = raw_abbr

        # Always attempt lookup resolution when abbr_lookup is available.
        # The portal may return abbreviations that differ from the timetable's
        # short names (e.g. attendance says "BE" but timetable uses "BEE", or
        # attendance returns a course code like "SHIS460" instead of "CSCL").
        if abbr_lookup:
            # Try raw_abbr as a key, then the full subject name, then the course code
            resolved = (
                abbr_lookup.get(abbr)
                or abbr_lookup.get(str(item.get("subject", "")).strip().upper())
                or abbr_lookup.get(str(item.get("code", "")).strip().upper())
            )
            if resolved:
                abbr = resolved

        if abbr and section:
            subjects.append({"abbr": abbr, "section": section})
    return subjects


def _build_abbr_lookup(notice_text: str) -> dict[str, str]:
    """
    Parse the subject lookup table embedded in timetable notice text.

    The table has 5 columns: Semester | Sname (abbr) | Code | Course name | Program
    Returns a dict mapping both code.upper() and name.upper() → abbr.upper()
    so attendance data (which may have a subject code or full name) can be
    resolved to the short timetable abbreviation.
    """
    lookup: dict[str, str] = {}
    if "|" not in notice_text:
        return lookup

    for line in notice_text.split("\n"):
        if not line.startswith("|"):
            continue
        cells = [c.strip() for c in line.split("|")[1:-1]]
        if len(cells) != 5:
            continue
        sem, abbr, code, name, _program = cells
        if not sem.isdigit() or not abbr:
            continue
        abbr_upper = abbr.strip().upper()
        if code.strip():
            lookup[code.strip().upper()] = abbr_upper
        if name.strip():
            lookup[name.strip().upper()] = abbr_upper
    return lookup

def _load_student_subjects_with_lookup(record, semester_id: str | None, abbr_lookup: dict[str, str]) -> list[dict]:
    """
    Fetch attendance and resolve abbrs using the provided lookup.
    Always re-fetches from the portal (or attendance cache) — does not return
    stale cached_subjects as-is, because those may be incomplete.
    """
    # Try the specific requested semester first
    if semester_id:
        try:
            data = record.scraper.fetch_attendance_for_semester(semester_id=semester_id)
            subjects = _extract_subjects(data.get("attendance", []), abbr_lookup)
            if subjects:
                record.cached_subjects = subjects
                return subjects
        except Exception:
            pass

    # Fall back to default semester fetch with lookup applied
    try:
        data = record.scraper.fetch_attendance_for_semester()
        subjects = _extract_subjects(data.get("attendance", []), abbr_lookup)
        if subjects:
            record.cached_subjects = subjects
            return subjects
    except Exception:
        pass

    return []


def _find_any_timetable_notice() -> Notice | None:
    """Return the most recent regular class timetable notice without subject matching."""
    return _find_latest_timetable_notice(student_subjects=None)


def _find_latest_timetable_notice(student_subjects: list[dict] | None = None) -> Notice | None:
    """Find the most recent regular class timetable notice.

    When student_subjects are provided, prefer the newest timetable notice that
    actually matches the student's enrolled subjects.
    """
    with SessionLocal() as session:
        notices = (
            session.query(Notice)
            .filter(Notice.processing_status == "done")
            .filter(Notice.title.isnot(None))
            .order_by(Notice.portal_date.desc(), Notice.notice_id.desc())
            .limit(300)
            .all()
        )

        fallback_candidate = None
        for notice in notices:
            title_upper = (notice.title or "").upper()
            # Must contain TIMETABLE or TIME TABLE
            if "TIMETABLE" not in title_upper and "TIME TABLE" not in title_upper:
                if fallback_candidate is None and notice.cleaned_text and len(notice.cleaned_text) > 100:
                    schedule = _parse_timetable_from_text(notice.cleaned_text)
                    if schedule:
                        fallback_candidate = notice
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

            if student_subjects and notice.cleaned_text and len(notice.cleaned_text) > 100:
                schedule = _parse_timetable_from_text(notice.cleaned_text)
                if schedule and _match_student_classes(schedule, student_subjects):
                    return notice
                # No match for this notice — remember it as a fallback timetable
                # in case none of the notices match the raw portal abbreviations.
                if fallback_candidate is None and schedule:
                    fallback_candidate = notice
                continue
            # This looks like a regular class timetable
            return notice

        if fallback_candidate is not None:
            return fallback_candidate

    return None


def _get_parsed_schedule(notice: Notice, record) -> list[dict] | None:
    """Parse timetable into structured class list. Uses stored text first, falls back to PDF download."""
    notice_id = notice.notice_id

    # Check cache
    if notice_id in _timetable_cache:
        cached = _timetable_cache[notice_id]
        # Invalidate if the cached schedule has any old incorrect time strings
        OLD_WRONG_TIMES = {"3:10 – 4:00 PM", "3:50 – 4:40 PM", "12:15 – 1:05 PM",
                           "2:00 – 2:50 PM", "2:55 – 3:45 PM"}
        has_old_time = any(
            e.get("time") in OLD_WRONG_TIMES
            for e in cached.get("schedule", [])
        )
        # Cache for 1 hour
        if not has_old_time and (datetime.utcnow() - cached["parsed_at"]).seconds < 3600:
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
    Parse timetable from the stored ASCII-table text produced by notice_processor's
    _rows_to_ascii_table(). Each PDF page → one table; each table row has 16 columns:
      [0] TIME  [1..3] Monday(course,faculty,sem) [4..6] Tue [7..9] Wed
      [10..12] Thu [13..15] Fri  [16] Room (optional)

    Rows look like:
      | 9:30 – 10:20 AM | ABCD-A1 | John Doe | 2 | ... | LT-01 |

    Falls back to a plain-text heuristic when the ASCII table format is not detected.
    """
    days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
    PAGE_TIME_SLOTS = [
        "9:30 – 10:20 AM",
        "10:25 – 11:15 AM",
        "11:20 AM – 12:10 PM",
        "12:20 – 1:10 PM",
        "1:15 – 2:05 PM",
        "2:10 – 3:00 PM",
        "3:10 – 4:00 PM",
    ]

    course_pattern = re.compile(r'^([A-Z][A-Z0-9]{1,6})-([A-Z0-9]{1,4})$')

    # ── ASCII table parser (primary path) ──────────────────────────────────────
    # notice_processor stores tables as pipe-delimited ASCII: | cell | cell | ...
    if "|" in text:
        all_classes = []
        slot_idx = -1

        for line in text.split('\n'):
            # Skip separator lines like +---+---+
            if not line.startswith("|"):
                continue

            cells = [c.strip() for c in line.split("|")[1:-1]]
            if not cells:
                continue

            # Detect header row (contains TIME/COURSE/FACULTY)
            joined = " ".join(cells).upper()
            if "TIME" in joined and ("COURSE" in joined or "FACULTY" in joined):
                slot_idx += 1
                continue

            # Skip rows with no useful course pattern in them
            first_cell = cells[0] if cells else ""

            # Determine time slot from first cell or use counter
            time_slot = PAGE_TIME_SLOTS[slot_idx] if 0 <= slot_idx < len(PAGE_TIME_SLOTS) else f"Period {slot_idx + 1}"
            time_sort = f"{max(slot_idx, 0):02d}"

            # Detect if first cell is a time value → this is a time-keyed row format
            time_match = re.search(r'\d{1,2}[:.]\d{2}', first_cell)
            if time_match:
                # First column is the time value — map it to the fixed slot index
                raw_time = first_cell
                if re.search(r'9[:.:]?30|9\.30', raw_time):
                    slot_idx = 0
                elif re.search(r'10[:.:]?25|10\.25', raw_time):
                    slot_idx = 1
                elif re.search(r'11[:.:]?20|11\.20', raw_time):
                    slot_idx = 2
                elif re.search(r'12[:.:]?20|12\.20', raw_time):
                    slot_idx = 3
                elif re.search(r'1[:.:]?15|13[:.:]?15|13\.15', raw_time):
                    slot_idx = 4
                elif re.search(r'2[:.:]?10|14[:.:]?10|14\.10', raw_time):
                    slot_idx = 5
                elif re.search(r'3[:.:]?10|15[:.:]?10|15\.10', raw_time):
                    slot_idx = 6
                # else: unrecognised time — leave slot_idx as-is (previous value)
                time_slot = PAGE_TIME_SLOTS[slot_idx] if 0 <= slot_idx < len(PAGE_TIME_SLOTS) else first_cell
                time_sort = f"{max(slot_idx, 0):02d}"
                data_cells = cells[1:]
            elif not first_cell:
                # TIME column is blank (most PDFs) — data starts at cell[1]
                if slot_idx < 0:
                    continue  # haven't seen a header yet, skip
                data_cells = cells[1:]
            else:
                # Non-empty, non-time first cell (e.g. artifact text) — skip row
                continue

            # Room is the last cell if it's a pure-digit section (BB-1, CR-13, LH-2)
            # Course sections always contain letters (OM-A, HRM-B, ETFM-A1)
            room = ""
            if data_cells:
                last = data_cells[-1]
                if last and re.match(r'^[A-Z]{1,4}-\d+$', last):
                    room = last
                    data_cells = data_cells[:-1]

            # Now parse groups of 3 per day: (course-section, faculty, sem)
            day_idx = 0
            i = 0
            while i < len(data_cells) and day_idx < len(days):
                course_raw = data_cells[i].strip()
                faculty = data_cells[i + 1].strip() if i + 1 < len(data_cells) else ""
                sem = data_cells[i + 2].strip() if i + 2 < len(data_cells) else ""

                m = course_pattern.match(course_raw)
                if m:
                    course, section = m.group(1), m.group(2)
                    all_classes.append({
                        "day": days[day_idx],
                        "time": time_slot,
                        "time_sort": time_sort,
                        "course_key": f"{course}-{section}",
                        "course": course,
                        "section": section,
                        "faculty": faculty,
                        "semester": sem,
                        "room": room,
                    })

                day_idx += 1
                i += 3  # advance by 3 columns per day

        if all_classes:
            logger.info("Timetable ASCII parser: extracted %d entries", len(all_classes))
            return all_classes

    # ── Plain-text fallback (when ASCII table not present) ─────────────────────
    # Some notices may store timetable as plain multi-space-aligned text.
    all_classes = []
    slot_idx = -1
    broad_course_pat = re.compile(r'\b([A-Z][A-Z0-9]{1,6})-([A-Z0-9]{1,4})\b')
    room_prefixes = ('LT', 'CR', 'BB', 'CL', 'SH', 'FR', 'SR', 'FEC', 'BEC', 'LH')

    for line in text.split('\n'):
        line = line.strip()
        if not line:
            continue
        line_upper = line.upper()

        if ("TIME" in line_upper or "PERIOD" in line_upper) and ("COURSE" in line_upper or "FACULTY" in line_upper):
            slot_idx += 1
            continue

        if slot_idx < 0:
            continue
        if "TIMETABLE" in line_upper or "TIME TABLE" in line_upper:
            continue

        matches = broad_course_pat.findall(line)
        course_matches = [(c, s) for c, s in matches
                          if not (c in room_prefixes and (s.isdigit() or len(s) <= 2))]
        if len(course_matches) < 2:
            continue

        room = ""
        if matches:
            last_c, last_s = matches[-1]
            if last_c in room_prefixes:
                room = f"{last_c}-{last_s}"

        time_slot = PAGE_TIME_SLOTS[slot_idx] if slot_idx < len(PAGE_TIME_SLOTS) else f"Period {slot_idx + 1}"
        time_sort = f"{slot_idx:02d}"

        for day_idx, (course, section) in enumerate(course_matches[:5]):
            if day_idx >= len(days):
                break
            all_classes.append({
                "day": days[day_idx],
                "time": time_slot,
                "time_sort": time_sort,
                "course_key": f"{course}-{section}",
                "course": course,
                "section": section,
                "faculty": "",
                "semester": "",
                "room": room,
            })

    logger.info("Timetable plain-text fallback: extracted %d entries across %d slots", len(all_classes), slot_idx + 1)
    return all_classes


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
        "12:20 – 1:10 PM",
        "1:15 – 2:05 PM",
        "2:10 – 3:00 PM",
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
