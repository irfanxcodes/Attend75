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

# Increment this whenever the parser logic changes so stale cache entries are dropped.
_PARSER_VERSION = 10


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

    # 8. Section-based fallback — when subject matching is incomplete (e.g. portal
    #    abbreviations differ from timetable codes, or partial attendance data),
    #    show ALL classes for the student's section so no classes are hidden.
    if student_subjects:
        sections = set(s.get('section', '').upper() for s in student_subjects if s.get('section'))
        if sections:
            student_section = max(
                sections,
                key=lambda s: sum(1 for subj in student_subjects
                                  if subj.get('section', '').upper() == s)
            )
            # Collect all schedule entries that belong to the student's section.
            # Use _btech_section_matches for smart matching (handles "ACC"→"A", etc.)
            section_classes = [
                cls for cls in schedule
                if _btech_section_matches(cls.get('section', ''), student_section)
            ]

            # If multiple semesters appear for this section (multi-sem timetable notice),
            # narrow to the student's semester using already-matched classes as reference,
            # or by checking which semester the student's subjects actually belong to.
            if section_classes:
                # Try to determine student's semester from matched classes first,
                # then fall back to the semester ID hint passed by the caller.
                from collections import Counter as _Counter
                best_sem = None

                if my_classes:
                    sem_counts = _Counter(
                        c.get('semester', '') for c in my_classes if c.get('semester')
                    )
                    if sem_counts:
                        best_sem = sem_counts.most_common(1)[0][0]

                # If we still don't know, try to infer from the student's known semester
                # (semester_id passed by the caller, or selected_semester_label from session,
                # or the semester embedded in the cached_attendance_rows).
                # This is critical for programs like BBA where a single timetable notice
                # contains multiple semesters for the same sections (Sem 1 + 3 + 5 under A/B/C/D/E).
                # Picking the HIGHEST semester (old behaviour) was showing Sem 5 classes to
                # Sem 1 students when subject-matching failed.
                if not best_sem:
                    # 1. Try semester_id passed directly by the caller (e.g. "3" or "2024_odd_3")
                    if semester_id:
                        m = re.search(r'\b(\d{1,2})\b', semester_id)
                        if m:
                            best_sem = m.group(1)

                if not best_sem:
                    # 2. Try selected_semester_label from session (e.g. "Semester 3" → "3")
                    sem_label = getattr(record, 'selected_semester_label', None) or ""
                    if sem_label:
                        m = re.search(r'\b(\d{1,2})\b', sem_label)
                        if m:
                            best_sem = m.group(1)

                if not best_sem:
                    # 3. Try to infer from cached_attendance_rows semester fields
                    cached_rows = getattr(record, 'cached_attendance_rows', None) or []
                    row_sems = [
                        str(r.get('semester', r.get('sem', ''))).strip()
                        for r in cached_rows
                        if r.get('semester') or r.get('sem')
                    ]
                    if row_sems:
                        from collections import Counter as _RowSemCounter
                        most_common = _RowSemCounter(row_sems).most_common(1)
                        if most_common:
                            best_sem = most_common[0][0]

                if not best_sem:
                    # 4. Last resort: pick the lowest semester present for this section
                    # (BBA notices are issued per active semester batch, so the target
                    # students are usually in the earlier semesters, not the highest).
                    all_sems = set(c.get('semester', '') for c in section_classes if c.get('semester'))
                    if len(all_sems) > 1:
                        def _sem_sort_key(s: str) -> int:
                            try:
                                return int(s)
                            except ValueError:
                                # Roman numerals: I=1, III=3, V=5, VII=7, etc.
                                roman = {'I': 1, 'II': 2, 'III': 3, 'IV': 4,
                                         'V': 5, 'VI': 6, 'VII': 7, 'VIII': 8}
                                return roman.get(s.upper(), 0)
                        best_sem = min(all_sems, key=_sem_sort_key)

                if best_sem:
                    # Include exact-semester matches + blank-semester entries
                    # for courses the student is already confirmed to have
                    # (handles garbled PDF semester cells for known subjects).
                    confirmed_courses = {m.get('course', '').upper() for m in my_classes}
                    sem_filtered = [
                        c for c in section_classes
                        if c.get('semester', '') == best_sem
                        or (not c.get('semester', '')
                            and c.get('course', '').upper() in confirmed_courses)
                    ]
                    if sem_filtered:
                        section_classes = sem_filtered

            if len(section_classes) > len(my_classes):
                logger.info(
                    "Timetable: section fallback expanded %d → %d classes for section=%s",
                    len(my_classes), len(section_classes), student_section,
                )
                my_classes = section_classes
                # Update subjects to reflect the full section
                inferred_subjects = [
                    {'abbr': c['course'], 'section': c['section']}
                    for c in my_classes
                ]
                student_subjects = list(
                    {f"{s['abbr']}-{s['section']}": s
                     for s in inferred_subjects}.values()
                )

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
        # Primary: exact semester match
        inferred = sorted(set(
            e['course'] for e in schedule
            if e['section'] == student_section and e['semester'] == student_sem
        ))
        # Also include entries with blank semester (garbled PDF cell) for this
        # section — but ONLY if the course is in the student's known subjects
        # (i.e. portal confirmed the student takes it) to avoid pulling in
        # unrelated courses whose semester was also garbled.
        known_abbrs = {e['course'].upper() for e in matched_classes}
        blank_sem_courses = sorted(set(
            e['course'] for e in schedule
            if e['section'] == student_section
            and not e['semester']
            and e['course'].upper() in known_abbrs
        ))
        if blank_sem_courses:
            inferred = sorted(set(inferred) | set(blank_sem_courses))
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

    # Secondary match: abbr matches + section fuzzy match using _btech_section_matches
    # This handles cases like student="ACC" vs timetable="A (G-16)"
    matched_abbrs = set(cls.get("course", "").upper() for cls in my_classes)
    unmatched_abbrs = abbr_set - matched_abbrs

    if unmatched_abbrs:
        for cls in schedule:
            course = cls.get("course", "").upper()
            if course not in unmatched_abbrs:
                continue
            cls_section = cls.get("section", "")
            # Use smart section matching — handles "ACC"→"A (G-16)", "CSE-A"→"A", etc.
            if any(_btech_section_matches(cls_section, s) for s in section_set):
                my_classes.append(cls)

    # If exact + smart section match fails, try abbr-only but ONLY if sections
    # also match across the full abbr_set (prevents cross-section contamination)
    if not my_classes:
        # Find which schedule sections contain ANY of the student's abbrs
        section_abbr_counts = {}
        for cls in schedule:
            course = cls.get("course", "").upper()
            sec = cls.get("section", "")
            if course in abbr_set:
                key = sec
                section_abbr_counts[key] = section_abbr_counts.get(key, 0) + 1

        if section_abbr_counts:
            # Pick the section with the most abbr matches (best candidate)
            best_section = max(section_abbr_counts, key=section_abbr_counts.get)
            best_count = section_abbr_counts[best_section]

            # Only use abbr-only if we matched at least half the student's abbrs
            # AND the best section matches via _btech_section_matches
            if (best_count >= max(1, len(abbr_set) // 2) and
                    any(_btech_section_matches(best_section, s) for s in section_set)):
                my_classes = [
                    cls for cls in schedule
                    if cls.get("course", "").upper() in abbr_set
                    and cls.get("section", "") == best_section
                ]

    # Language course matching (for BBA/B.Com — IMIL/FML → MLH/MLT/MLS etc.)
    if my_classes:
        sem_counts: dict[str, int] = {}
        for cls in my_classes:
            s = cls.get("semester", "").strip()
            if s:
                sem_counts[s] = sem_counts.get(s, 0) + 1
        student_sem = max(sem_counts, key=sem_counts.get) if sem_counts else ""

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
                    continue
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


def _parse_schedule_from_notice_text(text: str) -> list[dict]:
    """
    Parse a schedule from a notice's stored cleaned_text, trying all known formats.

    _parse_timetable_from_text handles BBA/B.Com pipe-delimited ASCII tables.
    _parse_btech_timetable handles B.Tech/BCA/B.Sc Section:-header + S1–S9 slot format.
    _parse_law_timetable handles Law/Session-based format.

    This unified helper is used wherever we need to probe whether a notice contains
    a parseable class timetable (notice discovery, candidate listing, cache check).
    """
    # Fast path: BBA/B.Com ASCII table format
    result = _parse_timetable_from_text(text)
    if result:
        return result

    # B.Tech / BCA / B.Sc: Section: headers + S1–S9 slot rows
    if re.search(r'\bSection\s*[:\-]', text, re.IGNORECASE) and re.search(r'\bS\s*1\b', text):
        result = _parse_btech_timetable([], text, student_section=None)
        if result:
            return result

    # Law / Session format: SESSION 1 column headers + (FacultyName) cells
    if re.search(r'\bSESSION\s*\d\b', text, re.IGNORECASE) and re.search(r'\([A-Z][a-z]', text):
        result = _parse_law_timetable([], text, student_section=None)
        if result:
            return result

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
                    schedule = _parse_schedule_from_notice_text(notice.cleaned_text)
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
                schedule = _parse_schedule_from_notice_text(notice.cleaned_text)
                if not schedule:
                    continue

                # Primary: subject-based match
                if _match_student_classes(schedule, student_subjects):
                    return notice

                # Secondary: section-based match — the notice has entries for the
                # student's section even if the abbreviations don't align yet.
                # This ensures the latest timetable is always preferred over older ones.
                student_sections = set(
                    s.get('section', '').upper()
                    for s in student_subjects if s.get('section')
                )
                if student_sections:
                    has_section = any(
                        _btech_section_matches(cls.get('section', ''), sec)
                        for cls in schedule
                        for sec in student_sections
                    )
                    if has_section:
                        return notice

                # No match for this notice — remember as fallback
                if fallback_candidate is None:
                    fallback_candidate = notice
                continue

            # No subject matching requested — return this notice only if it has
            # parseable content. Skip empty/unparseable notices so we don't
            # return a blank notice as "latest".
            if notice.cleaned_text and len(notice.cleaned_text) > 100:
                schedule = _parse_schedule_from_notice_text(notice.cleaned_text)
                if schedule:
                    return notice
                # Has text but unparseable — try next notice
                continue
            # Empty cleaned_text — PDF not yet processed, skip and try next

        if fallback_candidate is not None:
            return fallback_candidate

    return None


def _get_parsed_schedule(notice: Notice, record) -> list[dict] | None:
    """Parse timetable into structured class list. Uses stored text first, falls back to PDF download."""
    notice_id = notice.notice_id

    # Check cache
    if notice_id in _timetable_cache:
        cached = _timetable_cache[notice_id]
        # Invalidate if the cached schedule has any old incorrect time strings,
        # or if it was built by an older parser version.
        OLD_WRONG_TIMES = {"3:10 – 4:00 PM", "3:50 – 4:40 PM", "12:15 – 1:05 PM",
                           "2:00 – 2:50 PM", "2:55 – 3:45 PM"}
        has_old_time = any(
            e.get("time") in OLD_WRONG_TIMES
            for e in cached.get("schedule", [])
        )
        is_stale_version = cached.get("parser_version", 1) < _PARSER_VERSION
        # Cache for 1 hour
        if (not has_old_time and not is_stale_version
                and (datetime.utcnow() - cached["parsed_at"]).seconds < 3600):
            return cached["schedule"]

    # Try parsing from stored text (no network needed)
    if notice.cleaned_text and len(notice.cleaned_text) > 100:
        schedule = _parse_schedule_from_notice_text(notice.cleaned_text)
        if schedule:
            _timetable_cache[notice_id] = {
                "parsed_at": datetime.utcnow(),
                "schedule": schedule,
                "parser_version": _PARSER_VERSION,
            }
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
            _timetable_cache[notice_id] = {
                "parsed_at": datetime.utcnow(),
                "schedule": schedule,
                "parser_version": _PARSER_VERSION,
            }
        return schedule
    except Exception as exc:
        logger.warning("Failed to parse timetable PDF (notice %d): %s", notice_id, exc)
        return None


def _parse_timetable_from_text(text: str) -> list[dict]:
    """
    Parse timetable from the stored ASCII-table text produced by notice_processor's
    _rows_to_ascii_table().

    Supports two layouts:

    Layout A — Old format (one combined table, TIME in first column):
      [0] TIME  [1..3] Mon(Course|Faculty|Sem) ... [16] Room

    Layout B — BBA/B.Com multi-page format (this is the current PDF format):
      Each PDF page = one time slot.  The page's non-table text contains the time
      string, e.g.  "09.30 AM to 10.20 AM".  The table itself has NO time column:
        [0] Course  [1] Faculty Name  [2] Sem  ... [15] Room
      Columns repeat: 3 data columns per day × 5 days = 15 data cols + 1 room col.
      The header row contains "Course" and "Faculty Name" but NOT "TIME".

    Subject-lookup lines (pages 8–10 of the PDF):
      | 1 | EEC | SHAE403 | Effective English... | BBA |
      These are NOT class entries — they're parsed by _build_abbr_lookup separately
      and must be skipped here to avoid polluting the schedule.
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

    # Map raw time strings from non-table text → slot index
    # Handles "09.30 AM to 10.20 AM", "10.25 AM to 11.15 AM", etc.
    _TIME_TEXT_TO_SLOT = [
        (re.compile(r'9[.:]30', re.IGNORECASE), 0),
        (re.compile(r'10[.:]25', re.IGNORECASE), 1),
        (re.compile(r'11[.:]20', re.IGNORECASE), 2),
        (re.compile(r'12[.:]20', re.IGNORECASE), 3),
        (re.compile(r'(?:1[.:]15|13[.:]15)', re.IGNORECASE), 4),
        (re.compile(r'(?:2[.:]10|14[.:]10)', re.IGNORECASE), 5),
        (re.compile(r'(?:3[.:]10|15[.:]10)', re.IGNORECASE), 6),
    ]

    course_pattern = re.compile(r'^([A-Z][A-Z0-9]{1,6})-([A-Z0-9]{1,4})$')
    ROOM_PREFIXES = {'BB', 'CR', 'LT', 'LH', 'CL', 'SH', 'FR'}

    def _clean_sem(sem_raw: str) -> str:
        """Extract a valid semester string (digit or Roman numeral) from a raw cell."""
        if not sem_raw:
            return ""
        digit_match = re.match(r'^(\d{1,2})', sem_raw)
        roman_match = re.match(r'^(I{1,3}V?|IV|VI{0,3}|VIII?)(?:\b|$)', sem_raw, re.IGNORECASE)
        if digit_match:
            return digit_match.group(1)
        if roman_match:
            return roman_match.group(1).upper()
        return ""

    def _extract_course(course_raw: str) -> tuple[str, str] | None:
        """
        Parse 'COURSE-SECTION' from a cell value.
        Returns (course, section) or None if it doesn't look like a class entry.
        """
        if not course_raw:
            return None
        m = course_pattern.match(course_raw)
        if not m:
            m = re.search(r'\b([A-Z][A-Z0-9]{1,6})-([A-Z0-9]{1,4})\b', course_raw)
        if not m:
            return None
        course, section = m.group(1), m.group(2)
        # Reject room codes masquerading as course-section (BB-4, CR-17, etc.)
        if course in ROOM_PREFIXES and re.match(r'^\d+$', section):
            return None
        return course, section

    # ── ASCII table parser ──────────────────────────────────────────────────────
    if "|" not in text:
        # No ASCII table — jump straight to plain-text fallback
        pass
    else:
        all_classes = []
        slot_idx = -1   # index into PAGE_TIME_SLOTS
        in_bba_mode = False   # True once we detect the BBA no-TIME-column format

        lines = text.split('\n')
        line_no = 0
        while line_no < len(lines):
            line = lines[line_no]
            line_no += 1

            # ── Non-table text: look for time-slot labels (BBA format) ──────
            # The notice_processor writes non-table page text before the table.
            # For BBA PDFs this contains e.g. "09.30 AM to 10.20 AM".
            if not line.startswith("|"):
                for pat, idx in _TIME_TEXT_TO_SLOT:
                    if pat.search(line):
                        slot_idx = idx
                        in_bba_mode = True
                        break
                continue

            # ── Pipe-delimited table row ─────────────────────────────────────
            cells = [c.strip() for c in line.split("|")[1:-1]]
            if not cells:
                continue

            joined = " ".join(cells).upper()

            # ── Header detection ─────────────────────────────────────────────
            # Layout A header: contains "TIME" AND ("COURSE" OR "FACULTY")
            # Layout B header: contains "COURSE" AND "FACULTY NAME" but NOT "TIME"
            has_time_col = "TIME" in joined
            has_course_col = "COURSE" in joined
            has_faculty_col = "FACULTY" in joined or "FACULTY NAME" in joined

            # Skip the subject-lookup table rows (Sem | Sname | Code | Course | Program)
            # These appear on pages 8-10 and look like: | 1 | EEC | SHAE403 | ... | BBA |
            # Detect: first cell is a pure number (semester), second cell is a short abbr (2-5 chars)
            if (len(cells) >= 5
                    and re.match(r'^\d{1,2}$', cells[0])
                    and re.match(r'^[A-Z][A-Z0-9]{1,6}$', cells[1])
                    and len(cells[2]) >= 6  # course code like SHAE403
                    and not re.search(r'-[A-Z]$', cells[1])):  # not a COURSE-SECTION
                continue

            if has_time_col and (has_course_col or has_faculty_col):
                # Layout A: old format — each header marks a new slot
                slot_idx += 1
                in_bba_mode = False
                continue

            if (not has_time_col) and has_course_col and has_faculty_col:
                # Layout B: BBA format header — slot_idx already set from non-table text
                # If we haven't seen a time label yet, increment as fallback counter
                if not in_bba_mode:
                    slot_idx += 1
                continue  # skip header row — don't parse it as data

            # ── Data row ─────────────────────────────────────────────────────
            if slot_idx < 0:
                continue  # no slot established yet

            time_slot = PAGE_TIME_SLOTS[slot_idx] if slot_idx < len(PAGE_TIME_SLOTS) else f"Period {slot_idx + 1}"
            time_sort = f"{slot_idx:02d}"

            # Detect Layout A (first cell is a time value or blank) vs Layout B
            first_cell = cells[0] if cells else ""
            time_in_first = re.search(r'\d{1,2}[:.]\d{2}', first_cell)

            if time_in_first:
                # Layout A, time-keyed row: first cell IS the time
                raw_time = first_cell
                for pat, idx in _TIME_TEXT_TO_SLOT:
                    if pat.search(raw_time):
                        slot_idx = idx
                        break
                time_slot = PAGE_TIME_SLOTS[slot_idx] if slot_idx < len(PAGE_TIME_SLOTS) else first_cell
                time_sort = f"{slot_idx:02d}"
                data_cells = cells[1:]
            elif not first_cell:
                # Layout A, blank TIME cell — data starts at cell[1]
                data_cells = cells[1:]
            else:
                # Layout B: no TIME column at all — all cells are data
                data_cells = list(cells)

            # Room is the last cell if it matches a room code pattern (BB-1, CR-13, LH-2)
            # Room codes: 1–4 alpha chars, hyphen, digits only.
            room = ""
            if data_cells:
                last = data_cells[-1]
                if last and re.match(r'^[A-Z]{1,4}-\d+$', last):
                    room = last
                    data_cells = data_cells[:-1]

            # Pad to a multiple of 3 (5 days × 3 cols = 15 expected)
            while len(data_cells) % 3 != 0:
                data_cells.append("")

            # Parse groups of 3 per day: (course-section, faculty, sem)
            day_idx = 0
            i = 0
            while i < len(data_cells) and day_idx < len(days):
                course_raw = data_cells[i].strip()
                faculty    = data_cells[i + 1].strip() if i + 1 < len(data_cells) else ""
                sem_raw    = data_cells[i + 2].strip() if i + 2 < len(data_cells) else ""
                sem        = _clean_sem(sem_raw)

                parsed = _extract_course(course_raw)
                if parsed:
                    course, section = parsed
                    all_classes.append({
                        "day":        days[day_idx],
                        "time":       time_slot,
                        "time_sort":  time_sort,
                        "course_key": f"{course}-{section}",
                        "course":     course,
                        "section":    section,
                        "faculty":    faculty,
                        "semester":   sem,
                        "room":       room,
                    })

                day_idx += 1
                i += 3

        if all_classes:
            logger.info("Timetable ASCII parser: extracted %d entries (bba_mode=%s)",
                        len(all_classes), in_bba_mode)
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


def _parse_timetable_pdf(pdf_bytes: io.BytesIO, student_section: str | None = None, student_year: str = "", student_dept: str = "") -> list[dict]:
    """
    Parse a timetable PDF and return a flat list of class entries.

    Auto-detects format by inspecting the first parseable table:
      - B.Tech/BCA/B.Sc: "Section: X" header + S1-S9 slot row → _parse_btech_pdf_tables
      - Law/Session: "SESSION 1" column headers → _parse_law_timetable
      - BBA/B.Com: page-per-slot, groups of 3 cols per day → _parse_bba_timetable_pdf

    student_section: portal attendance section (e.g. "A", "ACC", "BCA-A") used to
    filter to only the student's section block.
    """
    with pdfplumber.open(pdf_bytes) as pdf:
        all_tables = []
        all_text_parts = []
        for page in pdf.pages:
            tbls = page.extract_tables()
            all_tables.extend(tbls or [])
            try:
                all_text_parts.append(page.extract_text() or "")
            except Exception:
                pass

    full_text = "\n".join(all_text_parts)

    # ── Format detection ────────────────────────────────────────────────────
    # Law: "SESSION 1" column + "(FacultyName)" in cells
    has_session = bool(re.search(r'\bSESSION\s*\d\b', full_text, re.IGNORECASE))
    has_paren_fac = bool(re.search(r'\([A-Z][a-z]', full_text))

    # B.Tech: "Section:" headers + "S1 S2 S3" slot row
    has_section_header = bool(re.search(r'\bSection\s*[:\-]', full_text, re.IGNORECASE))
    has_slot_row = bool(re.search(r'\bS1\b.*\bS2\b', full_text[:2000]))

    if has_session and has_paren_fac and not has_section_header:
        logger.info("Timetable PDF: Law/Session format")
        return _parse_law_timetable(all_tables, full_text, student_section)

    if has_section_header and (has_slot_row or all_tables):
        logger.info("Timetable PDF: B.Tech/Grid format")
        result = _parse_btech_pdf_tables(all_tables, student_section, student_year=student_year, student_dept=student_dept)
        if result:
            return result

    # BBA-style fallback
    logger.info("Timetable PDF: BBA/legacy format")
    pdf_bytes.seek(0)
    return _parse_bba_timetable_pdf(pdf_bytes, student_section)


def _parse_btech_pdf_tables(
    all_tables: list,
    student_section: str | None = None,
    student_year: str = "",
    student_dept: str = "",
) -> list[dict]:
    """
    Parse B.Tech / BCA / B.Sc timetable from pdfplumber-extracted tables.

    Fixed layout (confirmed from actual PDF inspection):
      Row 0 or 1: Section header in col 0 or col 1
      Slot row:   col 0=blank, col 1=S1, col 2=S2, col 3=S3, col 4=S4,
                  col 5=S5, col 6=S6, col 7=S7, col 8=S8, col 9=S9,
                  col 10=S#, col 11=Course, col 12=Faculty
      Day rows:   col 0=Day, col 1=S1, col 2=S2, col 3=S3, col 4=S4,
                  col 5=LUNCH(L/U/N/C/H), col 6=S5, col 7=S6, col 8=S7, col 9=S8,
                  col 10=S#, col 11=Course, col 12=Faculty
      Faculty:    always at col 10 (S#), col 11 (Course), col 12 (Faculty name)
    """
    # Day slot column → time string (col 5 = LUNCH, skipped)
    COL_TIME: dict[int, tuple[str, str]] = {
        1: ("9:30 – 10:20 AM",     "01"),
        2: ("10:20 – 11:10 AM",    "02"),
        3: ("11:25 AM – 12:15 PM", "03"),
        4: ("12:15 – 1:05 PM",     "04"),
        # col 5 = LUNCH — always skipped
        6: ("1:45 – 2:35 PM",      "05"),
        7: ("2:35 – 3:25 PM",      "06"),
        8: ("3:25 – 4:15 PM",      "07"),
        9: ("4:15 – 5:05 PM",      "08"),
    }

    DAYS_MAP = {
        "MON": "Monday", "TUE": "Tuesday", "WED": "Wednesday",
        "THU": "Thursday", "FRI": "Friday", "SAT": "Saturday",
    }

    NON_CLASS = {
        "", "L", "U", "N", "C", "H", "LUNCH", "BREAK", "TEA",
        "LIBRARY", "PS-1", "PS-2", "PS-III", "PS1", "PS2",
        "-", "—", "ACTIVITY",
    }

    def c(v) -> str:
        return (v or "").strip() if isinstance(v, str) else ("" if v is None else str(v).strip())

    def extract_section(text: str) -> str:
        m = re.search(
            r'Section\s*[:\-]?\s*([A-Z][A-Z0-9.()\-\s]*?)(?:\s+Year|\s+Dept|\s+Room|\s*$)',
            text, re.IGNORECASE
        )
        return m.group(1).strip() if m else ""

    def extract_room(text: str) -> str:
        m = re.search(r'\(([A-Z][A-Z0-9\-]+)\)', text)
        return m.group(1) if m else ""

    def clean_course(raw: str) -> str:
        if not raw:
            return ""
        r = raw.strip()
        if r.startswith('<') or r.endswith('->'):
            return ""
        # Remove lab suffixes first (before any other cleanup):
        # "IMP_BCA B_Lab(213)" → "IMP", "ADBM_LAB(215)" → "ADBM"
        # "ML(R319)" → "ML", "C Project(R317)" → "C PROJECT"
        # Strip lab/room suffixes: "IMP_BCA B_Lab(213)"→"IMP", "ML(R319)"→"ML"
        c_val = re.sub(r'[_\-][A-Z0-9\s]*(?:Lab|LAB|lab|L\d)[^A-Z]*$', '', r, flags=re.IGNORECASE)
        c_val = re.sub(r'_[A-Z].*$', '', c_val)  # strip any remaining _WORD suffix
        c_val = re.sub(r'\([^)]*\)', '', c_val).strip()
        c_val = re.sub(r'\s+\d.*$', '', c_val).strip()  # remove trailing room numbers
        c_val = c_val.upper().strip()
        # Allow valid course chars including & and /
        c_val = re.sub(r'[^A-Z0-9&/\- ]', '', c_val).strip('- ')
        # Collapse spaces (e.g. "C PROJECT" might be a valid subject abbreviation)
        c_val = re.sub(r'\s+', ' ', c_val).strip()
        # Reject multi-word strings that look like room labels
        if len(c_val.split()) > 2:
            return ""
        return c_val

    all_classes: list[dict] = []

    for table in all_tables:
        if not table or len(table) < 3:
            continue

        # ── Find section header row (row 0 or row 1) ────────────────────
        header_text = ""
        for ri in range(min(3, len(table))):
            row = table[ri]
            if not row:
                continue
            # Header can be in col 0 or col 1
            for ci in (0, 1):
                if ci < len(row):
                    v = c(row[ci])
                    if "Section" in v:
                        header_text = v
                        break
            if header_text:
                break

        if not header_text:
            continue

        section_id = extract_section(header_text)
        if not section_id:
            continue
        room = extract_room(header_text)
        # Extract year from header: "Year: II" → "II"
        pdf_year = _extract_pdf_year(header_text)
        # Extract dept: "Dept.:CSE,AI" → "CSE,AI", "Dept:AI&DS" → "AI&DS"
        pdf_dept = _extract_pdf_dept(header_text)

        # ── Apply section filter ─────────────────────────────────────────
        if student_section and not _btech_section_matches(
                section_id, student_section,
                pdf_year=pdf_year, student_year=student_year):
            continue
        # Dept filter — only applied when caller passes student_dept
        if student_dept and not _dept_matches(pdf_dept, student_dept):
            continue

        # ── Find slot header row (first row with S1 in col 1) ───────────
        slot_row_idx = None
        for ri, row in enumerate(table):
            if not row or len(row) < 3:
                continue
            if c(row[1] if len(row) > 1 else "").upper() in ("S1", "S 1"):
                slot_row_idx = ri
                break

        if slot_row_idx is None:
            continue

        # ── Build faculty lookup from col 10/11/12 of each row ──────────
        # Faculty columns are always at fixed positions 10, 11, 12
        FAC_S_COL = 10   # S# column
        FAC_C_COL = 11   # Course column
        FAC_N_COL = 12   # Faculty name column

        faculty_lookup: dict[str, str] = {}
        for row in table:
            if not row or len(row) <= FAC_N_COL:
                continue
            s_num = c(row[FAC_S_COL])
            course_name = c(row[FAC_C_COL]).upper()
            fac_name = c(row[FAC_N_COL])
            if s_num.isdigit() and course_name and fac_name:
                # Clean course name (remove lab noise)
                course_clean = re.sub(r'[^A-Z0-9&/\-]', '', course_name).strip('- ')
                if course_clean:
                    faculty_lookup[course_clean] = fac_name

        # ── Determine column time map based on actual slot count ─────────
        slot_row = table[slot_row_idx]
        slot_col_count = sum(
            1 for ci in range(1, min(10, len(slot_row)))
            if re.match(r'^[Ss]\s*\d+$', c(slot_row[ci]))
        )

        if slot_col_count >= 8:
            # Full format: 9 slots with lunch at col 5
            col_time_map = dict(COL_TIME)
        else:
            # Short format (ECE/ME/some special sections): no fixed lunch col
            times = list(COL_TIME.values())
            col_time_map = {}
            t_i = 0
            for ci in range(1, min(10, len(slot_row))):
                if re.match(r'^[Ss]\s*\d+$', c(slot_row[ci])) and t_i < len(times):
                    col_time_map[ci] = times[t_i]
                    t_i += 1

        # ── Parse day rows ───────────────────────────────────────────────
        for row in table[slot_row_idx + 1:]:
            if not row:
                continue

            day_key = c(row[0]).upper()[:3]
            day_name = DAYS_MAP.get(day_key)
            if not day_name:
                continue

            for col_idx, (time_str, time_sort) in col_time_map.items():
                if col_idx >= len(row):
                    continue

                raw = c(row[col_idx])
                if not raw or raw.upper() in NON_CLASS:
                    continue

                course = clean_course(raw)
                if not course or course in NON_CLASS or len(course) < 2:
                    continue

                fac = faculty_lookup.get(course, "")

                all_classes.append({
                    "day": day_name,
                    "time": time_str,
                    "time_sort": time_sort,
                    "course_key": f"{course}-{section_id.upper()}",
                    "course": course,
                    "section": section_id.upper(),
                    "faculty": fac,
                    "semester": "",
                    "room": room,
                    "pdf_year": pdf_year,
                    "pdf_dept": pdf_dept,
                })

    logger.info(
        "B.Tech PDF parser: %d entries, section_filter=%r",
        len(all_classes), student_section
    )
    return all_classes


def _normalize_pdf_section(raw: str) -> str:
    """
    Extract core section letters from a raw PDF header cell.
    "A (G-16)"  → "A",  "B R-202" → "B",  "BCA-A(AIDS)" → "BCA-A"
    "B.SC (DA)" → "B.SC",  "C (" → "C",  "BSc(Honours)..." → "BSC"
    Also extracts year if present: returns (section, year_roman) via _extract_pdf_section_year.
    """
    s = raw.strip().upper()
    sec_m = re.search(
        r'Section\s*[:\-]?\s*([A-Z][A-Z0-9.()\-\s]*?)(?:\s+Year|\s+Dept|\s+Room|\s*$)',
        s, re.IGNORECASE
    )
    if sec_m:
        s = sec_m.group(1).strip()
    s = re.sub(r'\s*\(.*', '', s).strip()
    s = re.sub(r'\s+[A-Z][-\s]?\d[\w\-]*$', '', s).strip()
    return s.rstrip('.')


def _extract_pdf_year(header_text: str) -> str:
    """Extract Year from header: "Year: II" → "II", "Year:III" → "III"."""
    m = re.search(r'Year\s*[:\-]?\s*(I{1,3}V?|IV|[1-4])', header_text, re.IGNORECASE)
    return m.group(1).strip().upper() if m else ""



def _extract_pdf_dept(header_text: str) -> str:
    """
    Extract and normalize department from timetable header.
    "Dept.:CSE,AI" → "CSE", "Dept:AI&DS" → "AI&DS", "Dept: AI&ML" → "AI&ML"
    Returns the primary department abbreviation (first token before comma/space).
    """
    m = re.search(r'Dept\s*[.:]\s*(.+?)(?:\s*$)', header_text, re.IGNORECASE)
    if not m:
        return ""
    raw = m.group(1).strip().lstrip(':()').strip()
    # Take first meaningful token (before comma, space, or extra chars)
    # e.g. "CSE,AI" → "CSE", "AI&DS" → "AI&DS", "(:R113A))" → ""
    raw = re.sub(r'[^A-Z0-9&,\s]', '', raw, flags=re.IGNORECASE).strip()
    # Split on comma, take all tokens to form a sorted key
    tokens = [t.strip().upper() for t in re.split(r'[,\s]+', raw) if t.strip() and t.strip().isalpha() or '&' in t]
    return ",".join(tokens) if tokens else ""


# Map of user-friendly dept labels → normalized dept strings found in PDFs
_DEPT_LABEL_MAP = {
    # B.Tech departments
    "CSE":          ["CSE"],
    "CSE/AI":       ["CSE,AI", "AI,CSE"],
    "AI":           ["AI"],
    "AI&ML":        ["AI&ML", "AIML"],
    "AI&DS":        ["AI&DS", "AIDS"],
    "ECE":          ["ECE"],
    "ME":           ["ECE,ME", "ME"],
    # B.Sc programs
    "B.Sc DA":      ["B.SC"],
    "B.Sc CS":      ["B.SC"],
    "BSc":          ["B.SC", "BSC"],
    # BCA
    "BCA":          ["BCA"],
    # Generic fallback
    "All":          [],
}


def _dept_matches(pdf_dept: str, student_dept: str) -> bool:
    """
    Check if a PDF dept string matches a student-chosen dept label.
    Strict: "CSE,AI" does NOT match "AI&ML" even though both contain "AI".
    Empty student_dept = match all (no filter).
    """
    if not student_dept or student_dept.upper() == "ALL":
        return True
    if not pdf_dept:
        return True  # unknown dept — don't filter

    pd = re.sub(r'[^A-Z0-9&,]', '', pdf_dept.upper())
    sd = re.sub(r'[^A-Z0-9&,]', '', student_dept.upper())

    if pd == sd:
        return True

    # Check label map first (user-friendly names)
    variants = _DEPT_LABEL_MAP.get(student_dept, [])
    for v in variants:
        vu = re.sub(r'[^A-Z0-9&,]', '', v.upper())
        if vu == pd:
            return True

    # AIML == AI&ML, AIDS == AI&DS (common abbreviation variants)
    pd_norm = pd.replace("&","").replace(",","")
    sd_norm = sd.replace("&","").replace(",","")
    if pd_norm == sd_norm:
        return True

    # Exact token match: student picked "CSE" and PDF has "CSE,AI"
    # Allow if student dept is a subset of PDF dept (not the other way round)
    pd_tokens = set(re.split(r'[,&]+', pd))
    sd_tokens = set(re.split(r'[,&]+', sd))
    # Only match if ALL student tokens exist in PDF tokens (subset match)
    if sd_tokens and sd_tokens.issubset(pd_tokens):
        return True

    return False


def _semester_to_year(semester: str) -> str:
    """Convert semester string to Roman year. "3" or "III" → "III"."""
    if not semester:
        return ""
    s = semester.strip().upper()
    # Already Roman
    if re.match(r'^(I{1,3}V?|IV)$', s):
        return s
    # Numeric
    try:
        n = int(re.search(r'\d+', s).group())
        year_num = (n + 1) // 2  # sem 1-2→1, 3-4→2, 5-6→3, 7-8→4
        return ["I","II","III","IV"][min(year_num - 1, 3)]
    except Exception:
        return ""


def _btech_section_matches(pdf_section: str, student_section: str,
                            pdf_year: str = "", student_year: str = "") -> bool:
    """
    Match PDF section against student portal section.

    Key rules:
    - Strips room codes from PDF section first
    - "BCA-A" NEVER matches plain "A" (different programs in both directions)
    - "ACC" matches "A" (portal dept-code suffix pattern)
    - "CSE-A" matches "A" (portal program-prefix pattern)
    - Year filtering: if both years known and they differ, no match
    """
    ps = _normalize_pdf_section(pdf_section)
    ss = re.sub(r'\s*\(.*', '', student_section).strip().upper()

    if not ps or not ss:
        return False

    # Year filter — if both provided and they differ, never match
    if pdf_year and student_year and pdf_year.upper() != student_year.upper():
        return False

    if ps == ss:
        return True

    def split(s):
        m = re.match(r'^([A-Z]{2,})[.\-_]([A-Z0-9]+)$', s)
        return (m.group(1), m.group(2)) if m else ("", s)

    ps_prog, ps_sec = split(ps)
    ss_prog, ss_sec = split(ss)

    # Both have program prefix → must match exactly
    if ps_prog and ss_prog:
        return ps_prog == ss_prog and ps_sec == ss_sec

    # Either has a program prefix but the other doesn't → different program, no match
    # This correctly handles "BCA-A" (student) vs "A" (PDF) and vice versa
    if ps_prog or ss_prog:
        return False

    # No program prefix on either side — compare directly
    if ps == ss:
        return True

    # "ACC" = section "A" + all-alpha dept suffix ("CC")
    if len(ps) == 1 and ss.startswith(ps) and len(ss) > 1 and ss[1:].isalpha():
        return True
    if len(ss) == 1 and ps.startswith(ss) and len(ps) > 1 and ps[1:].isalpha():
        return True

    # "A1" / "A2" = subsection of section "A" (BBA batch divisions)
    # e.g. timetable has "ETFM-A1" for Section A batch 1, portal returns "A"
    if len(ss) == 1 and len(ps) == 2 and ps[0] == ss[0] and ps[1].isdigit():
        return True
    if len(ps) == 1 and len(ss) == 2 and ss[0] == ps[0] and ss[1].isdigit():
        return True

    return False



# ── BBA legacy parser (original logic, preserved) ──────────────────────────
def _parse_bba_timetable_pdf(pdf_bytes: io.BytesIO, student_section: str | None = None) -> list[dict]:
    """Original BBA timetable parser — one page per time slot, groups of 3 cols per day."""
    all_classes = []
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

    with pdfplumber.open(pdf_bytes) as pdf:
        for page_idx, page in enumerate(pdf.pages):
            tables = page.extract_tables()
            if not tables:
                continue
            table = tables[0]
            if len(table) < 3 or len(table[0]) < 10:
                continue

            time_slot = PAGE_TIME_SLOTS[page_idx] if page_idx < len(PAGE_TIME_SLOTS) else f"Period {page_idx + 1}"
            time_sort = f"{page_idx:02d}"

            for row in table[2:]:
                if not row or len(row) < 10:
                    continue
                room = (row[-1] or "").strip() if row[-1] else ""
                for day_idx, day_name in enumerate(days):
                    col_offset = 1 + (day_idx * 3)
                    if col_offset + 2 >= len(row):
                        continue
                    course_raw = (row[col_offset] or "").strip()
                    faculty = (row[col_offset + 1] or "").strip()
                    sem = (row[col_offset + 2] or "").strip()
                    if not course_raw:
                        continue
                    course = course_raw.split("-")[0] if "-" in course_raw else course_raw
                    section = course_raw.split("-")[1] if "-" in course_raw else ""
                    if student_section and section and not _btech_section_matches(section, student_section):
                        continue
                    all_classes.append({
                        "day": day_name,
                        "time": time_slot,
                        "time_sort": time_sort,
                        "course_key": course_raw.upper(),
                        "course": course,
                        "section": section,
                        "faculty": faculty,
                        "semester": sem,
                        "room": room,
                    })
    return all_classes


# ── B.Tech / BCA / B.Sc parser ──────────────────────────────────────────────
def _parse_btech_timetable(all_tables: list, full_text: str, student_section: str | None = None) -> list[dict]:
    """
    Parse B.Tech / BCA / B.Sc timetable PDFs.

    Format: multiple mini-tables per page.
    Each mini-table:
      - Header row: "Section: X (Room) Year: Y Dept.: Z"  (above the grid)
      - Slot row:    S1  S2  S3  S4  L  S5  S6  S7  S8  S9
      - Day rows:    Mon | course | course | ...
      - Side table:  S# | Course | Faculty

    The slot columns are time slots (S1=9:30, S2=10:20, ...).
    Column 5 (index 4) is the LUNCH break — skip it.
    """
    DAYS_FULL = {
        "MON": "Monday", "TUE": "Tuesday", "WED": "Wednesday",
        "THU": "Thursday", "FRI": "Friday", "SAT": "Saturday",
    }
    # Slot index → time string (S1..S4 morning, S5..S9 afternoon, lunch at col index 4)
    SLOT_TIMES = [
        "9:30 – 10:20 AM",    # S1
        "10:20 – 11:10 AM",   # S2
        "11:25 AM – 12:15 PM", # S3
        "12:15 – 1:05 PM",    # S4
        # index 4 = LUNCH — skipped
        "1:45 – 2:35 PM",     # S5
        "2:35 – 3:25 PM",     # S6
        "3:25 – 4:15 PM",     # S7
    ]
    # Words that indicate a cell is NOT a real class
    NON_CLASS = {"L", "U", "N", "C", "H", "LUNCH", "BREAK", "TEA", "LIBRARY", "PS-1", "PS-2",
                 "PS-III", "", "-", "—", "SP1", "SP-1"}

    all_classes = []

    # We parse the full_text line by line to find "Section:" blocks,
    # then extract the grid for each section.
    # Each section block looks like:
    #   Section: A (G-16)  Year: II  Dept.:CSE,AI
    #   S1 S2 S3 S4 S5 S6 S7 S8 S9   <- slot header
    #   Mon  ICP  AI  ...             <- day rows
    #   ...
    #   S# Course  Name of Faculty    <- faculty table header
    #   1  ICP   Dr. Rohini
    #   ...

    lines = [l.strip() for l in full_text.split("\n")]

    i = 0
    while i < len(lines):
        line = lines[i]

        # Detect section header
        sec_match = re.search(r'Section\s*:\s*([A-Z0-9\-]+)', line, re.IGNORECASE)
        if not sec_match:
            i += 1
            continue

        section_id = sec_match.group(1).strip().upper()

        # If student_section provided, skip sections that don't match
        if student_section:
            # Normalize: "A", "B", "BCA-A" etc.
            if not (section_id == student_section.upper()
                    or section_id.startswith(student_section.upper())
                    or student_section.upper().startswith(section_id)):
                i += 1
                continue

        # Scan forward to find slot header row (contains S1 S2 or Slot-1)
        slot_header_idx = None
        for j in range(i + 1, min(i + 8, len(lines))):
            if re.search(r'\bS\s*1\b|\bSlot.?1\b', lines[j], re.IGNORECASE):
                slot_header_idx = j
                break
        if slot_header_idx is None:
            i += 1
            continue

        # Parse slot columns from header row — count actual slot columns
        slot_row = lines[slot_header_idx]
        # Extract slot names in order: S1, S2, ... (skip L/U/N/C/H)
        slot_tokens = re.findall(r'\bS\s*\d+\b|\bSlot-?\s*\d+\b', slot_row, re.IGNORECASE)
        num_slots = len(slot_tokens)

        # Determine lunch column position by looking for L/U/N/C/H in slot row
        # In most PDFs the slot row text has "L U N C H" between S4 and S5
        lunch_col_offset = None
        slot_row_upper = slot_row.upper()
        # Find position of "L" that's surrounded by slot names
        lunch_match = re.search(r'\b(L|LUNCH)\b', slot_row_upper)
        if lunch_match:
            # Estimate column index by character position ratio
            # We'll handle this differently — just skip column at index 4 when parsing
            lunch_col_offset = 4  # always column index 4 in this timetable format

        # Collect day rows (Mon, Tue, Wed, Thu, Fri, Sat)
        day_rows = {}  # day_name -> list of slot cell values
        faculty_lookup = {}  # course_abbr.upper() -> faculty_name

        j = slot_header_idx + 1
        in_faculty_table = False
        while j < min(slot_header_idx + 20, len(lines)):
            row_line = lines[j].strip()

            # Detect faculty table header: "S# Course Name of the Faculty"
            if re.search(r'S#\s*Course', row_line, re.IGNORECASE):
                in_faculty_table = True
                j += 1
                continue

            if in_faculty_table:
                # Faculty rows: "1  ICP  Dr. Rohini" or "2  DBMS  Dr T Bharat Kumar"
                fac_match = re.match(r'^\d+\s+([A-Z][A-Z0-9&/\-]{0,8})\s+(.+)$', row_line)
                if fac_match:
                    course_abbr = fac_match.group(1).strip().upper()
                    faculty_name = fac_match.group(2).strip()
                    # Clean trailing noise
                    faculty_name = re.sub(r'\s{2,}.*$', '', faculty_name).strip()
                    faculty_lookup[course_abbr] = faculty_name
                j += 1
                continue

            # Check if this is a day row
            day_key = None
            for abbr, full_day in DAYS_FULL.items():
                if row_line.upper().startswith(abbr):
                    day_key = full_day
                    break

            if day_key:
                # Extract slot cells from this row
                # Remove the day prefix, then split on whitespace
                row_content = re.sub(r'^(Mon|Tue|Wed|Thu|Fri|Sat)\b', '', row_line, flags=re.IGNORECASE).strip()
                # Split into tokens — each token is a course abbr or special marker
                tokens = row_content.split()
                day_rows[day_key] = tokens

            j += 1

        # Build class entries for this section
        for day_name, tokens in day_rows.items():
            # Map token index → slot index (skipping the lunch marker)
            slot_idx = 0  # logical slot index (0-based, skipping lunch)
            physical_idx = 0  # position in tokens list

            for token in tokens:
                token_upper = token.strip().upper()

                # Skip lab span markers like <-OOPS-A_a_L1->
                if token.startswith('<') or token.startswith('->'):
                    continue

                # Skip known non-class markers
                if token_upper in NON_CLASS:
                    # Advance physical index but check if this is the lunch column
                    physical_idx += 1
                    slot_idx += 1
                    continue

                # Map slot_idx → time (account for lunch gap at physical position 4)
                # After S4 (physical index 3), physical index 4 is LUNCH which we skip
                if slot_idx >= 4:
                    time_idx = slot_idx  # maps to SLOT_TIMES index directly (lunch already skipped)
                else:
                    time_idx = slot_idx

                if time_idx < len(SLOT_TIMES):
                    time_str = SLOT_TIMES[time_idx]
                    time_sort = f"{time_idx:02d}"
                else:
                    time_str = f"Period {time_idx + 1}"
                    time_sort = f"{time_idx:02d}"

                # Clean lab notation: <-OOPS-A_a_L1-> → OOPS
                course_clean = re.sub(r'[-_][A-Z0-9_]+$', '', token_upper)
                course_clean = re.sub(r'[^A-Z0-9&/]', '', course_clean)

                if course_clean and course_clean not in NON_CLASS and len(course_clean) >= 2:
                    faculty = faculty_lookup.get(course_clean, "")
                    all_classes.append({
                        "day": day_name,
                        "time": time_str,
                        "time_sort": time_sort,
                        "course_key": f"{course_clean}-{section_id}",
                        "course": course_clean,
                        "section": section_id,
                        "faculty": faculty,
                        "semester": "",
                        "room": "",
                    })

                slot_idx += 1
                physical_idx += 1

        i = slot_header_idx + 1

    if all_classes:
        logger.info("B.Tech parser: extracted %d entries for section=%s", len(all_classes), student_section or "all")
    return all_classes


# ── Law / Session-based parser ──────────────────────────────────────────────
def _parse_law_timetable(all_tables: list, full_text: str, student_section: str | None = None) -> list[dict]:
    """
    Parse Law / BBA LL.B timetable PDFs.

    Format:
      - Title row: "B.B.A.LL.B. SEMESTER V"
      - Section row: "SECTION A"
      - Header row: DAY | SESSION 1 | SESSION 2 | ... | LUNCH | SESSION 4 | ...
      - Time row: (optional) 9:40-10:30 | 10:40-11:30 | ...
      - Day rows: MONDAY | CPC (Ms.Barkha) | IHC (Dr.Arpita) | LIBRARY | BREAK | ...

    Each cell contains "COURSE_CODE\n(Faculty Name)" or just the course code.
    LUNCH, LIBRARY, ACTIVITY, BREAK cells are non-class and skipped.
    """
    DAYS_MAP = {
        "MONDAY": "Monday", "TUESDAY": "Tuesday", "WEDNESDAY": "Wednesday",
        "THURSDAY": "Thursday", "FRIDAY": "Friday", "SATURDAY": "Saturday",
    }
    NON_CLASS = {"LUNCH", "LIBRARY", "BREAK", "ACTIVITY", "", "-", "—",
                 "PRAYER", "ASSEMBLY", "SPORTS", "FREE"}

    # Session time slots — try to extract from PDF, fallback to these
    DEFAULT_SESSION_TIMES = [
        "9:40 – 10:30 AM",
        "10:40 – 11:30 AM",
        "11:40 AM – 12:30 PM",
        # LUNCH
        "1:20 – 2:10 PM",
        "2:20 – 3:10 PM",
        "3:20 – 4:10 PM",
    ]

    all_classes = []

    # Parse each table extracted from the PDF
    for table in all_tables:
        if not table or len(table) < 3:
            continue

        # Detect if this table has session-based headers
        header_row = None
        time_row = None
        day_start_row = None

        for row_idx, row in enumerate(table):
            row_text = " ".join((cell or "").upper() for cell in row)
            if "SESSION" in row_text and "DAY" in row_text:
                header_row = row_idx
            elif header_row is not None and re.search(r'\d{1,2}[:.]\d{2}', row_text):
                time_row = row_idx
            elif header_row is not None and any(
                (cell or "").upper().strip() in DAYS_MAP
                for cell in row
            ):
                day_start_row = row_idx
                break

        if header_row is None or day_start_row is None:
            continue

        # Extract session column indices (skip DAY col, skip LUNCH col)
        header = table[header_row]
        session_cols = []  # list of (col_index, session_label, time_string)

        # Extract times from time_row if present
        time_strings = []
        if time_row is not None:
            time_strings = [
                re.sub(r'\s+', ' ', (cell or "").strip())
                for cell in table[time_row]
            ]

        for col_idx, cell in enumerate(header):
            cell_upper = (cell or "").strip().upper()
            if cell_upper in ("DAY", ""):
                continue
            if cell_upper in ("LUNCH", "BREAK", ""):
                continue
            if re.search(r'SESSION\s*\d+', cell_upper):
                # Get time from time_row if available
                t = ""
                if time_strings and col_idx < len(time_strings):
                    raw_t = time_strings[col_idx]
                    # Format like "9:40 - 10:30" → "9:40 – 10:30 AM/PM"
                    t = _format_law_time(raw_t)
                if not t and len(session_cols) < len(DEFAULT_SESSION_TIMES):
                    t = DEFAULT_SESSION_TIMES[len(session_cols)]
                session_cols.append((col_idx, cell_upper, t, len(session_cols)))

        if not session_cols:
            continue

        # Detect section from table context (look above the table in full_text)
        # For now use student_section as-is since Law has one section per table usually
        section_id = student_section or "A"

        # Parse day rows
        for row_idx in range(day_start_row, len(table)):
            row = table[row_idx]
            if not row:
                continue

            # First cell is the day
            day_raw = (row[0] or "").strip().upper()
            day_name = DAYS_MAP.get(day_raw)
            if not day_name:
                continue

            for col_idx, session_label, time_str, slot_order in session_cols:
                if col_idx >= len(row):
                    continue
                cell_raw = (row[col_idx] or "").strip()
                if not cell_raw:
                    continue

                cell_upper = cell_raw.upper()
                # Skip non-class cells
                if cell_upper in NON_CLASS or cell_upper.startswith("BREAK"):
                    continue

                # Parse "COURSE CODE\n(Faculty Name)" or "COURSE (Faculty)"
                # Law cells look like: "CPC\n(Ms.Barkha)" or "CPC (Ms.Barkha)"
                course_code = cell_raw
                faculty = ""

                # Try newline split first
                parts = cell_raw.split("\n")
                if len(parts) >= 2:
                    course_code = parts[0].strip()
                    # Faculty is in parentheses in subsequent parts
                    fac_parts = " ".join(parts[1:])
                    fac_match = re.search(r'\((.+?)\)', fac_parts)
                    if fac_match:
                        faculty = fac_match.group(1).strip()
                    else:
                        faculty = fac_parts.strip("() ")
                else:
                    # Try inline parentheses: "CPC (Ms.Barkha)"
                    inline_match = re.match(r'^([A-Z][A-Z0-9\s\-/&]{0,20}?)\s*\((.+?)\)\s*$', cell_raw.strip())
                    if inline_match:
                        course_code = inline_match.group(1).strip()
                        faculty = inline_match.group(2).strip()

                # Clean up course code
                course_code = re.sub(r'\s+', ' ', course_code).strip()
                # Remove any lingering faculty info that leaked into course
                course_code = re.sub(r'\([^)]*\)', '', course_code).strip()

                # Skip if still non-class after cleaning
                if not course_code or course_code.upper() in NON_CLASS:
                    continue
                # Skip pure noise
                if re.match(r'^[\s\-—]+$', course_code):
                    continue

                all_classes.append({
                    "day": day_name,
                    "time": time_str,
                    "time_sort": f"{slot_order:02d}",
                    "course_key": f"{course_code.upper()}-{section_id.upper()}",
                    "course": course_code.upper(),
                    "section": section_id.upper(),
                    "faculty": faculty,
                    "semester": "",
                    "room": "",
                })

    if all_classes:
        logger.info("Law parser: extracted %d entries for section=%s", len(all_classes), student_section or "all")
    return all_classes


def _format_law_time(raw: str) -> str:
    """
    Convert raw time string like '1:20 - 2:10' or '9:40 - 10:30' to
    '1:20 PM – 2:10 PM' or '9:40 AM – 10:30 AM'.

    Rule: hours 1–7 are treated as PM (afternoon), 8–11 as AM, 12 as PM.
    This matches how a typical school/college timetable works — no class at 1 AM.
    """
    if not raw:
        return ""
    if "AM" in raw.upper() or "PM" in raw.upper():
        return raw.strip()

    times = re.findall(r'(\d{1,2})[:.:](\d{2})', raw)
    if len(times) >= 2:
        h1, m1 = int(times[0][0]), int(times[0][1])
        h2, m2 = int(times[1][0]), int(times[1][1])

        def fmt(h: int, m: int) -> str:
            # 1–7 → PM (afternoon), 8–11 → AM, 12 → PM, 0 → 12 AM
            if h == 0:
                return f"12:{m:02d} AM"
            elif 1 <= h <= 7:
                return f"{h}:{m:02d} PM"
            elif h < 12:
                return f"{h}:{m:02d} AM"
            elif h == 12:
                return f"12:{m:02d} PM"
            else:
                return f"{h - 12}:{m:02d} PM"

        return f"{fmt(h1, m1)} – {fmt(h2, m2)}"
    return raw.strip()


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
