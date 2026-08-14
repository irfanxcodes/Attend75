"""
StudyMe Admin Analytics Service

Provides all data for the StudyMe Analytics admin page:
  1. Upload counts (handouts vs chapters, by program/semester)
  2. Subject inventory by program/semester
  3. Slide script feedback summary
  4. Failure rate + last errors (with program/semester context)
  5. LLM usage stats from llm_call_log
  6. Live LLM chain status (which models are configured, which are failing)
"""
import logging
import os
from datetime import datetime, timedelta

from sqlalchemy import func, distinct, case

from db.session import SessionLocal

logger = logging.getLogger(__name__)


def _provider_from_model(model: str) -> str:
    return model.split("/")[0].lower() if "/" in model else "unknown"


# ── 1 & 2: Upload counts + subject inventory ─────────────────────────────────

def get_upload_stats() -> dict:
    """
    Returns:
    - handout_uploads: total course handout uploads by program/semester
    - chapter_uploads: total chapter/notes uploads by program/semester/subject
    - subjects_by_program: distinct subjects grouped by program + semester
    - status_breakdown: pending/processing/ready/failed counts
    - recent_failures: last 10 failed uploads with error + program/semester
    """
    from db.models.chapter_upload import ChapterUpload
    from db.models.course_handout import CourseHandout
    from db.models.student_registry import StudentRegistry

    with SessionLocal() as session:

        # ── Handout uploads ────────────────────────────────────────────────
        handout_rows = session.query(
            CourseHandout.uploaded_by,
            CourseHandout.subject_id,
            CourseHandout.subject_name,
            CourseHandout.parse_status,
            CourseHandout.created_at,
        ).all()

        # ── Chapter + Notes uploads ────────────────────────────────────────
        chapter_rows = session.query(
            ChapterUpload.id,
            ChapterUpload.subject_id,
            ChapterUpload.chapter_title,
            ChapterUpload.uploaded_by,
            ChapterUpload.upload_status,
            ChapterUpload.upload_type,
            ChapterUpload.coverage_score,
            ChapterUpload.concept_count,
            ChapterUpload.error_message,
            ChapterUpload.created_at,
        ).all()

        # ── Student registry for program/semester resolution ───────────────
        all_rolls = set()
        for r in handout_rows:
            if r.uploaded_by: all_rolls.add(r.uploaded_by)
        for r in chapter_rows:
            if r.uploaded_by: all_rolls.add(r.uploaded_by)

        registry = {}
        if all_rolls:
            reg_rows = session.query(
                StudentRegistry.roll_number,
                StudentRegistry.program,
                StudentRegistry.current_semester,
                StudentRegistry.display_name,
            ).filter(StudentRegistry.roll_number.in_(all_rolls)).all()
            for rr in reg_rows:
                registry[rr.roll_number] = {
                    "program": rr.program or "Unknown",
                    "semester": rr.current_semester or "Unknown",
                    "name": rr.display_name,
                }

    def _enrich(roll):
        return registry.get(roll, {"program": "Unknown", "semester": "Unknown", "name": None})

    # ── Handout counts ─────────────────────────────────────────────────────
    handout_total = len(handout_rows)
    handout_ready = sum(1 for r in handout_rows if r.parse_status == "ready")
    handout_failed = sum(1 for r in handout_rows if r.parse_status == "failed")

    handout_by_program = {}
    for r in handout_rows:
        info = _enrich(r.uploaded_by)
        key = info["program"]
        handout_by_program[key] = handout_by_program.get(key, 0) + 1

    # ── Chapter counts ─────────────────────────────────────────────────────
    chapter_total = sum(1 for r in chapter_rows if r.upload_type == "chapter")
    notes_total   = sum(1 for r in chapter_rows if r.upload_type == "notes")

    status_breakdown = {"pending": 0, "processing": 0, "ready": 0,
                        "ready_low_coverage": 0, "failed": 0, "deleted": 0}
    for r in chapter_rows:
        s = r.upload_status or "unknown"
        if s in status_breakdown:
            status_breakdown[s] += 1

    chapter_by_program = {}
    for r in chapter_rows:
        info = _enrich(r.uploaded_by)
        key = info["program"]
        chapter_by_program[key] = chapter_by_program.get(key, 0) + 1

    # ── Subject inventory by program + semester ────────────────────────────
    subject_map = {}   # (program, semester, subject_id) → count
    for r in chapter_rows:
        info = _enrich(r.uploaded_by)
        key = (info["program"], info["semester"], r.subject_id.upper())
        subject_map[key] = subject_map.get(key, 0) + 1

    subjects_grouped = {}
    for (prog, sem, subj), cnt in subject_map.items():
        subjects_grouped.setdefault(prog, {}).setdefault(sem, [])
        existing = next((x for x in subjects_grouped[prog][sem] if x["subject"] == subj), None)
        if existing:
            existing["uploads"] += cnt
        else:
            subjects_grouped[prog][sem].append({"subject": subj, "uploads": cnt})

    # Sort each list by upload count desc
    for prog in subjects_grouped:
        for sem in subjects_grouped[prog]:
            subjects_grouped[prog][sem].sort(key=lambda x: -x["uploads"])

    # ── Recent failures ────────────────────────────────────────────────────
    failed_rows = sorted(
        [r for r in chapter_rows if r.upload_status == "failed"],
        key=lambda r: r.created_at or datetime.min,
        reverse=True,
    )[:15]

    recent_failures = []
    for r in failed_rows:
        info = _enrich(r.uploaded_by)
        recent_failures.append({
            "upload_id": r.id,
            "subject_id": r.subject_id.upper(),
            "chapter_title": r.chapter_title,
            "upload_type": r.upload_type,
            "error_message": r.error_message,
            "program": info["program"],
            "semester": info["semester"],
            "uploaded_at": r.created_at.isoformat() if r.created_at else None,
        })

    total_ready = status_breakdown["ready"] + status_breakdown["ready_low_coverage"]
    total_for_rate = chapter_total + notes_total
    failure_rate = round(
        status_breakdown["failed"] / total_for_rate * 100, 1
    ) if total_for_rate > 0 else 0.0

    return {
        "handouts": {
            "total": handout_total,
            "ready": handout_ready,
            "failed": handout_failed,
            "by_program": handout_by_program,
        },
        "chapters": {
            "total": chapter_total,
            "notes": notes_total,
            "by_program": chapter_by_program,
            "status_breakdown": status_breakdown,
            "failure_rate_pct": failure_rate,
        },
        "subjects_by_program": subjects_grouped,
        "recent_failures": recent_failures,
    }


# ── 3: Slide feedback summary ─────────────────────────────────────────────────

def get_slide_feedback_summary() -> dict:
    from db.models.slide_script_feedback import SlideScriptFeedback
    from db.models.chapter_upload import ChapterUpload
    from db.models.student_registry import StudentRegistry

    with SessionLocal() as session:
        rows = session.query(SlideScriptFeedback).all()

        if not rows:
            return {
                "total": 0, "thumbs_up": 0, "thumbs_down": 0,
                "positive_rate_pct": 0.0, "reason_breakdown": {},
                "worst_uploads": [],
            }

        total = len(rows)
        thumbs_up   = sum(1 for r in rows if r.rating == 1)
        thumbs_down = sum(1 for r in rows if r.rating == -1)

        reason_breakdown = {}
        for r in rows:
            if r.rating == -1 and r.reason:
                reason_breakdown[r.reason] = reason_breakdown.get(r.reason, 0) + 1

        # Per-upload negative rate
        upload_counts: dict[str, dict] = {}
        for r in rows:
            d = upload_counts.setdefault(r.upload_id, {"up": 0, "down": 0})
            if r.rating == 1:  d["up"] += 1
            else:              d["down"] += 1

        worst = sorted(
            [
                {
                    "upload_id": uid,
                    "thumbs_up": v["up"],
                    "thumbs_down": v["down"],
                    "total": v["up"] + v["down"],
                    "negative_rate_pct": round(v["down"] / (v["up"] + v["down"]) * 100, 1),
                }
                for uid, v in upload_counts.items()
                if v["down"] > 0
            ],
            key=lambda x: -x["negative_rate_pct"],
        )[:10]

        # Enrich worst with subject/chapter info
        upload_ids = [w["upload_id"] for w in worst]
        upload_info = {}
        if upload_ids:
            for cu in session.query(ChapterUpload).filter(ChapterUpload.id.in_(upload_ids)).all():
                upload_info[cu.id] = {
                    "subject_id": cu.subject_id.upper(),
                    "chapter_title": cu.chapter_title,
                }
        for w in worst:
            info = upload_info.get(w["upload_id"], {})
            w["subject_id"] = info.get("subject_id", "?")
            w["chapter_title"] = info.get("chapter_title")

    return {
        "total": total,
        "thumbs_up": thumbs_up,
        "thumbs_down": thumbs_down,
        "positive_rate_pct": round(thumbs_up / total * 100, 1) if total else 0.0,
        "reason_breakdown": dict(sorted(reason_breakdown.items(), key=lambda x: -x[1])),
        "worst_uploads": worst,
    }


# ── 5 & 6: LLM usage stats + chain status ────────────────────────────────────

def get_llm_stats() -> dict:
    """
    Returns:
    - usage_by_model: call counts, success/fail, avg duration per model
    - usage_by_type: breakdown by call_type (ingestion/doubt/embedding/etc.)
    - usage_by_provider: aggregated per provider
    - daily_trend: calls per day for the last 14 days
    - chain_status: which models in each chain are configured, healthy, or failing
    - exhausted_models: models with >50% failure rate in last 24h
    """
    from services.llm_config import (
        INGESTION_FALLBACK_CHAIN,
        DOUBT_FALLBACK_CHAIN,
        EMBEDDING_FALLBACK_CHAIN,
    )

    # Check which API keys are configured
    key_map = {
        "gemini":      bool(os.getenv("GEMINI_API_KEY", "").strip()),
        "groq":        bool(os.getenv("GROQ_API_KEY", "").strip()),
        "mistral":     bool(os.getenv("MISTRAL_API_KEY", "").strip()),
        "cohere":      bool(os.getenv("COHERE_API_KEY", "").strip()),
        "openrouter":  bool(os.getenv("OPENROUTER_API_KEY", "").strip()),
        "nvidia":      bool(os.getenv("NVIDIA_API_KEY", "").strip()),
    }

    # Try to read from llm_call_log — may not exist yet if migration hasn't run
    try:
        from db.models.llm_call_log import LlmCallLog
        with SessionLocal() as session:
            all_logs = session.query(LlmCallLog).all()
            recent_cutoff = datetime.utcnow() - timedelta(hours=24)
            recent_logs = [r for r in all_logs if r.created_at and r.created_at >= recent_cutoff]
    except Exception:
        all_logs = []
        recent_logs = []

    # ── Aggregate by model ─────────────────────────────────────────────────
    model_stats: dict[str, dict] = {}
    for r in all_logs:
        s = model_stats.setdefault(r.model, {
            "model": r.model, "provider": r.provider,
            "total": 0, "success": 0, "failed": 0,
            "total_duration_ms": 0, "call_types": set(),
        })
        s["total"] += 1
        if r.success: s["success"] += 1
        else:         s["failed"] += 1
        if r.duration_ms: s["total_duration_ms"] += r.duration_ms
        if r.call_type: s["call_types"].add(r.call_type)

    model_list = []
    for m, s in model_stats.items():
        avg_ms = round(s["total_duration_ms"] / s["total"]) if s["total"] else None
        model_list.append({
            "model": m,
            "provider": s["provider"],
            "total_calls": s["total"],
            "success_calls": s["success"],
            "failed_calls": s["failed"],
            "success_rate_pct": round(s["success"] / s["total"] * 100, 1) if s["total"] else 0.0,
            "avg_duration_ms": avg_ms,
            "call_types": list(s["call_types"]),
        })
    model_list.sort(key=lambda x: -x["total_calls"])

    # ── Aggregate by call type ─────────────────────────────────────────────
    type_stats: dict[str, dict] = {}
    for r in all_logs:
        t = type_stats.setdefault(r.call_type, {"total": 0, "success": 0, "failed": 0})
        t["total"] += 1
        if r.success: t["success"] += 1
        else:         t["failed"] += 1

    # ── Aggregate by provider ──────────────────────────────────────────────
    provider_stats: dict[str, dict] = {}
    for r in all_logs:
        p = provider_stats.setdefault(r.provider, {"total": 0, "success": 0, "failed": 0})
        p["total"] += 1
        if r.success: p["success"] += 1
        else:         p["failed"] += 1

    # ── Daily trend (last 14 days) ─────────────────────────────────────────
    from datetime import date
    daily: dict[str, dict] = {}
    for r in all_logs:
        if not r.created_at: continue
        d = r.created_at.date().isoformat()
        entry = daily.setdefault(d, {"total": 0, "failed": 0})
        entry["total"] += 1
        if not r.success: entry["failed"] += 1

    today = date.today()
    daily_trend = []
    for i in range(14):
        d = (today - timedelta(days=13 - i)).isoformat()
        entry = daily.get(d, {"total": 0, "failed": 0})
        daily_trend.append({"date": d, "total": entry["total"], "failed": entry["failed"]})

    # ── Exhausted models (>50% failure in last 24h, min 2 calls) ──────────
    recent_model: dict[str, dict] = {}
    for r in recent_logs:
        s = recent_model.setdefault(r.model, {"total": 0, "failed": 0})
        s["total"] += 1
        if not r.success: s["failed"] += 1

    exhausted_models = [
        m for m, s in recent_model.items()
        if s["total"] >= 2 and s["failed"] / s["total"] >= 0.5
    ]

    # ── Chain status ───────────────────────────────────────────────────────
    def _chain_status(chain: list[str], name: str) -> dict:
        steps = []
        for idx, model in enumerate(chain):
            provider = _provider_from_model(model)
            key_ok = key_map.get(provider, False)
            is_exhausted = model in exhausted_models
            recent = recent_model.get(model, {})
            steps.append({
                "position": idx,
                "model": model,
                "provider": provider,
                "key_configured": key_ok,
                "is_exhausted": is_exhausted,
                "recent_calls": recent.get("total", 0),
                "recent_failures": recent.get("failed", 0),
                "status": (
                    "exhausted" if is_exhausted else
                    "no_key"    if not key_ok else
                    "healthy"
                ),
            })
        # Current active = first healthy step
        active = next((s for s in steps if s["status"] == "healthy"), steps[0] if steps else None)
        return {"name": name, "steps": steps, "active_model": active["model"] if active else None}

    chains = {
        "ingestion":  _chain_status(INGESTION_FALLBACK_CHAIN,  "Ingestion (concept extraction)"),
        "doubt":      _chain_status(DOUBT_FALLBACK_CHAIN,       "Doubt answering (live)"),
        "embedding":  _chain_status(EMBEDDING_FALLBACK_CHAIN,   "Embeddings (RAG)"),
    }

    return {
        "total_calls": len(all_logs),
        "total_calls_24h": len(recent_logs),
        "by_model": model_list,
        "by_type": type_stats,
        "by_provider": {
            p: {**v, "key_configured": key_map.get(p, False)}
            for p, v in provider_stats.items()
        },
        "daily_trend": daily_trend,
        "exhausted_models": exhausted_models,
        "chains": chains,
        "key_status": key_map,
        "note": "LLM call logging started from this deployment. Historical calls before this are not recorded." if not all_logs else None,
    }


# ── Combined endpoint ─────────────────────────────────────────────────────────

def get_studyme_admin_analytics() -> dict:
    upload_stats   = get_upload_stats()
    feedback       = get_slide_feedback_summary()
    llm_stats      = get_llm_stats()
    return {
        "uploads": upload_stats,
        "slide_feedback": feedback,
        "llm": llm_stats,
    }
