"""
Career Compass — Service Layer

Orchestrates LLM calls + knowledge base lookups to build personalised
career roadmaps for students.

Design principles:
  - Knowledge base does the heavy lifting (scoring, filtering)
  - LLM adds personalisation: skill-gap analysis, cert recommendations,
    quick wins — things that require understanding the student's context
  - One LLM call per roadmap (not per track) — cheap + fast
  - Results are cached in career_profiles table to avoid repeat calls
"""

from __future__ import annotations

import json
import logging
from datetime import datetime

logger = logging.getLogger(__name__)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _strip_fences(text: str) -> str:
    """Strip markdown code fences from LLM output."""
    text = text.strip()
    if text.startswith("```"):
        parts = text.split("```")
        text = parts[1] if len(parts) > 1 else text
        if text.startswith("json"):
            text = text[4:]
    if text.endswith("```"):
        text = text[:text.rfind("```")]
    return text.strip()


def _resolve_student_profile(token: str, program_override: str | None, semester_override: str | None) -> dict:
    """
    Resolve the student's degree programme and semester.
    Priority: explicit override → StudentRegistry lookup → sensible defaults.
    """
    from db.session import SessionLocal
    from db.models.student_registry import StudentRegistry
    from services.session_store import session_store

    program = (program_override or "").strip()
    semester = (semester_override or "").strip()

    if not program or not semester:
        record = session_store.get(token)
        if record:
            roll = record.roll_number
            with SessionLocal() as session:
                reg = session.get(StudentRegistry, roll)
                if reg:
                    if not program:
                        program = (reg.program or "").strip()
                    if not semester:
                        semester = (reg.current_semester or "").strip()

    return {
        "program": program or "BBA",
        "semester": semester or "Semester I",
    }


# ── Roadmap generation ────────────────────────────────────────────────────────

def generate_roadmap(
    token: str,
    program_override: str | None,
    semester_override: str | None,
    subjects: list[str],
) -> dict:
    """
    Build a personalised career roadmap for the student.
    Returns a dict matching RoadmapResponse.
    """
    from career.knowledge_base import (
        resolve_degree_profile,
        score_tracks_for_profile,
        CAREER_TRACKS,
    )
    from services.llm_router import chat_with_fallback
    from services.llm_config import DOUBT_FALLBACK_CHAIN

    profile = _resolve_student_profile(token, program_override, semester_override)
    program = profile["program"]
    semester = profile["semester"]

    # Score all tracks against student's profile
    ranked_tracks = score_tracks_for_profile(program, subjects)
    top3 = ranked_tracks[:3]

    # Build concise track summaries for the LLM prompt
    track_summaries = []
    for t in top3:
        track_summaries.append({
            "slug": t["slug"],
            "label": t["label"],
            "relevant_subjects": t["relevant_subjects"],
            "top_skills": t["top_skills"],
            "top_certs": t["top_certs"],
            "timeline_months": t["timeline_months"],
            "salary_range": t["salary_range_inr"],
            "fit_score": t["fit_score"],
        })

    subjects_str = ", ".join(subjects) if subjects else "not specified"
    semester_num = _extract_semester_number(semester)

    prompt = f"""You are a career counsellor for Indian college students. Be specific, practical, and India-focused.

Student profile:
- Degree: {program}
- Current semester: {semester} (semester {semester_num} of ~6)
- Subjects this semester: {subjects_str}

Top 3 career tracks identified for this student (pre-scored by our system):
{json.dumps(track_summaries, indent=2)}

Your task: For EACH of the 3 tracks, provide personalised enrichment:
1. Which of the student's CURRENT SUBJECTS are directly useful for this track
2. The 3 most important skills to learn NOW (given their semester)
3. The single best certification to start with (must be free or low-cost)
4. One specific quick action they can take this week
5. A one-line honest assessment of how realistic this track is for them RIGHT NOW

Also provide:
- 5 "quick wins" — concrete actions the student should do THIS WEEK regardless of which track they choose
  (e.g. "Create a LinkedIn profile", "Open a free Coursera account", "Add your subjects to your resume")

Return ONLY valid JSON in this exact format:
{{
  "tracks": [
    {{
      "slug": "...",
      "relevant_current_subjects": ["...", "..."],
      "priority_skills": [
        {{"name": "...", "level": "start_now", "why": "one line reason"}},
        {{"name": "...", "level": "start_now", "why": "..."}},
        {{"name": "...", "level": "before_graduation", "why": "..."}}
      ],
      "best_cert_now": {{
        "name": "...",
        "provider": "...",
        "free": true,
        "url": "https://...",
        "timeline_weeks": 6
      }},
      "this_week_action": "...",
      "realism_note": "..."
    }}
  ],
  "quick_wins": ["...", "...", "...", "...", "..."]
}}"""

    try:
        raw, model_used = chat_with_fallback(
            messages=[
                {"role": "system", "content": "Return only valid JSON. No markdown. No explanation."},
                {"role": "user", "content": prompt},
            ],
            chain=DOUBT_FALLBACK_CHAIN,
            max_tokens=2048,
            temperature=0.2,
            call_type="career_roadmap",
        )
        enrichment = json.loads(_strip_fences(raw))
    except Exception as exc:
        logger.warning("[CareerService] LLM enrichment failed, using fallback: %s", exc)
        enrichment = _build_fallback_enrichment(top3)
        model_used = "fallback"

    # Merge LLM enrichment with knowledge base data
    enriched_tracks = []
    enrichment_map = {e["slug"]: e for e in enrichment.get("tracks", [])}

    for track in top3:
        slug = track["slug"]
        llm_data = enrichment_map.get(slug, {})

        # Build skills list — merge LLM priority skills with KB data
        skills = []
        for skill in llm_data.get("priority_skills", []):
            skills.append({
                "name": skill.get("name", ""),
                "level": skill.get("level", "start_now"),
                "why": skill.get("why", ""),
            })
        # Pad with KB skills if LLM returned fewer than 3
        for kb_skill in track.get("top_skills", []):
            if len(skills) >= 5:
                break
            if not any(s["name"].lower() == kb_skill.lower() for s in skills):
                skills.append({"name": kb_skill, "level": "before_graduation", "why": "Core skill for this track"})

        # Certifications — use LLM best_cert_now as first entry
        certs = []
        best_cert = llm_data.get("best_cert_now")
        if best_cert:
            certs.append({
                "name": best_cert.get("name", ""),
                "provider": best_cert.get("provider", ""),
                "free": best_cert.get("free", True),
                "url": best_cert.get("url"),
                "timeline_weeks": best_cert.get("timeline_weeks", 6),
            })
        # Add remaining KB certs
        for kb_cert in track.get("top_certs", []):
            if len(certs) >= 3:
                break
            if not any(c["name"].lower() == kb_cert["name"].lower() for c in certs):
                certs.append({
                    "name": kb_cert["name"],
                    "provider": kb_cert["provider"],
                    "free": kb_cert.get("free", True),
                    "url": None,
                    "timeline_weeks": kb_cert.get("weeks", 6),
                })

        enriched_tracks.append({
            "slug": slug,
            "label": track["label"],
            "description": track["description"],
            "relevant_subjects": llm_data.get("relevant_current_subjects", track.get("relevant_subjects", [])),
            "entry_role": track["entry_role"],
            "salary_range_inr": track["salary_range_inr"],
            "demand_trend": track["demand_trend"],
            "skills": skills,
            "certifications": certs,
            "timeline_months": track["timeline_months"],
            "fit_score": track["fit_score"],
            "this_week_action": llm_data.get("this_week_action", ""),
            "realism_note": llm_data.get("realism_note", ""),
        })

    quick_wins = enrichment.get("quick_wins", _default_quick_wins())

    return {
        "program": program,
        "semester": semester,
        "top_tracks": enriched_tracks,
        "quick_wins": quick_wins[:5],
        "model_used": model_used,
        "cached": False,
    }


def _extract_semester_number(semester_str: str) -> int:
    """'Semester III' → 3, 'Semester 5' → 5"""
    roman = {"I": 1, "II": 2, "III": 3, "IV": 4, "V": 5, "VI": 6, "VII": 7, "VIII": 8}
    s = (semester_str or "").strip().upper()
    for roman_numeral, value in roman.items():
        if roman_numeral in s.split():
            return value
    # Try to find a digit
    import re
    digits = re.findall(r"\d+", s)
    return int(digits[0]) if digits else 1


def _build_fallback_enrichment(tracks: list[dict]) -> dict:
    """Fallback enrichment when LLM is unavailable."""
    fallback_tracks = []
    for t in tracks:
        skills = t.get("top_skills", [])[:3]
        fallback_tracks.append({
            "slug": t["slug"],
            "relevant_current_subjects": t.get("relevant_subjects", [])[:3],
            "priority_skills": [
                {"name": skills[0] if skills else "Excel", "level": "start_now", "why": "Essential for this role"},
                {"name": skills[1] if len(skills) > 1 else "Communication", "level": "start_now", "why": "Highly valued by employers"},
                {"name": skills[2] if len(skills) > 2 else "LinkedIn", "level": "before_graduation", "why": "Build your professional network"},
            ],
            "best_cert_now": t.get("top_certs", [{}])[0] if t.get("top_certs") else None,
            "this_week_action": f"Research top 5 companies hiring for {t['label']} roles on LinkedIn",
            "realism_note": f"Good fit for your degree. Start building skills in {t.get('top_skills', ['Excel'])[0]}.",
        })
    return {"tracks": fallback_tracks, "quick_wins": _default_quick_wins()}


def _default_quick_wins() -> list[str]:
    return [
        "Create or update your LinkedIn profile with your education and current semester",
        "Open a free Coursera account and browse career-relevant courses",
        "Draft a one-page resume with your education, subjects, and any projects",
        "Follow 5 companies you want to work for on LinkedIn",
        "Set a Google Alert for 'campus placement [your college name]' to stay updated",
    ]


# ── Career profile persistence ────────────────────────────────────────────────

def save_chosen_track(token: str, track_slug: str, track_label: str) -> bool:
    """Save the student's chosen career track to the DB."""
    from services.session_store import session_store
    from db.session import SessionLocal
    from db.models.career_profile import CareerProfile

    record = session_store.get(token)
    if not record:
        return False

    roll = record.roll_number
    now = datetime.utcnow()

    with SessionLocal() as db:
        existing = db.get(CareerProfile, roll)
        if existing:
            existing.chosen_track_slug = track_slug
            existing.chosen_track_label = track_label
            existing.updated_at = now
        else:
            db.add(CareerProfile(
                roll_number=roll,
                chosen_track_slug=track_slug,
                chosen_track_label=track_label,
                created_at=now,
                updated_at=now,
            ))
        db.commit()

    return True


def get_career_profile(token: str) -> dict | None:
    """Retrieve the student's saved career profile."""
    from services.session_store import session_store
    from db.session import SessionLocal
    from db.models.career_profile import CareerProfile

    record = session_store.get(token)
    if not record:
        return None

    with SessionLocal() as db:
        profile = db.get(CareerProfile, record.roll_number)
        if not profile:
            return None
        return {
            "roll_number": profile.roll_number,
            "chosen_track_slug": profile.chosen_track_slug,
            "chosen_track_label": profile.chosen_track_label,
            "roadmap_generated_at": profile.updated_at.isoformat() if profile.updated_at else None,
        }
