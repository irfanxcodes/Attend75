"""
StudyMe 2.0 Workspace Router

New endpoints for the Canvas-based learning workspace.
All existing /studyme/* endpoints in lesson.py remain unchanged.

Endpoints:
  GET  /studyme/chapters/:upload_id/curriculum      — ordered concept list with student progress
  GET  /studyme/concepts/:concept_id                — full concept with Canvas sections
  POST /studyme/concepts/:concept_id/progress       — update concept-level mastery
  POST /studyme/tutor                               — persistent tutor (superset of /doubt)
  GET  /studyme/concepts/:concept_id/resources      — Phase 7: contextual resources (lazy)
"""

import json
import logging
import urllib.parse
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from db.session import SessionLocal
from db.models.chapter_upload import ChapterUpload
from db.models.lesson_script import LessonScript
from db.models.ai_concept import AIConcept
from db.models.concept_section import ConceptSection
from db.models.student_concept_progress import StudentConceptProgress
from models.schemas import (
    ConceptOut,
    ConceptProgressUpdate,
    ConceptSectionOut,
    CurriculumConceptItem,
    CurriculumOut,
    TutorRequest,
    TutorResponse,
)
from services.session_store import session_store

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/studyme", tags=["workspace"])


def _get_db():
    with SessionLocal() as session:
        yield session


def _resolve_roll_number(token: str) -> str | None:
    record = session_store.get(token)
    return record.roll_number if record else None


def _get_subject_name(subject_id: str, upload: ChapterUpload | None = None) -> str:
    """
    Derive a friendly subject name without hardcoded maps.
    Priority: upload chapter_title → subject_id formatted nicely.
    """
    if upload and upload.chapter_title:
        return upload.chapter_title
    # Format subject_id as friendly name: "fm" → "FM", "management-accounting" → "Management Accounting"
    return subject_id.replace("-", " ").replace("_", " ").title()


# ── Curriculum ────────────────────────────────────────────────────────────────

@router.get("/chapters/{upload_id}/curriculum", response_model=CurriculumOut)
def get_curriculum(
    upload_id: str,
    token: str,
    db: Session = Depends(_get_db),
):
    """
    Get the ordered concept curriculum for a chapter.
    Includes per-student mastery status for each concept.
    Used by ConceptNav and the chapter overview screen.
    """
    roll_number = _resolve_roll_number(token)
    if not roll_number:
        raise HTTPException(status_code=401, detail="Invalid session token")

    upload = db.get(ChapterUpload, upload_id)
    if not upload:
        raise HTTPException(status_code=404, detail="Chapter not found")

    # Get active lesson script for legacy script_id
    script = db.query(LessonScript).filter(
        LessonScript.upload_id == upload_id,
        LessonScript.is_active == True,
    ).first()

    # Get all concepts ordered by sequence
    concepts = (
        db.query(AIConcept)
        .filter(AIConcept.upload_id == upload_id)
        .order_by(AIConcept.sequence_order)
        .all()
    )

    if not concepts:
        raise HTTPException(status_code=404, detail="No concepts found for this chapter")

    # Get student progress for all concepts in one query
    concept_ids = [c.id for c in concepts]
    progress_rows = (
        db.query(StudentConceptProgress)
        .filter(
            StudentConceptProgress.roll_number == roll_number,
            StudentConceptProgress.concept_id.in_(concept_ids),
        )
        .all()
    )
    progress_map = {p.concept_id: p.status for p in progress_rows}

    # Check which concepts have Canvas sections (StudyMe 2.0)
    # One DB call — get distinct concept_ids that have sections
    section_concept_ids = set(
        row[0] for row in
        db.query(ConceptSection.concept_id)
        .filter(ConceptSection.upload_id == upload_id)
        .distinct()
        .all()
    )

    curriculum_items = [
        CurriculumConceptItem(
            id=str(c.id),
            title=c.title,
            sequence_order=c.sequence_order,
            content_type=getattr(c, 'content_type', 'theory') or 'theory',
            source_heading=c.source_heading,
            prerequisites=c.prerequisites or [],
            has_sections=str(c.id) in section_concept_ids,
            student_status=progress_map.get(str(c.id), "unseen"),
        )
        for c in concepts
    ]

    chapter_title = (
        script.title if script
        else (upload.chapter_title or upload.chapter_key.replace("-", " ").title())
    )

    return CurriculumOut(
        upload_id=upload_id,
        chapter_key=upload.chapter_key,
        chapter_title=chapter_title,
        subject_id=upload.subject_id,
        concepts=curriculum_items,
        total_concepts=len(curriculum_items),
        script_id=str(script.id) if script else None,
    )


# ── Concept detail ────────────────────────────────────────────────────────────

@router.get("/concepts/{concept_id}", response_model=ConceptOut)
def get_concept(
    concept_id: str,
    token: str,
    db: Session = Depends(_get_db),
):
    """
    Get full concept data including Canvas sections.
    Called when student navigates to a concept in the Canvas.
    """
    if not _resolve_roll_number(token):
        raise HTTPException(status_code=401, detail="Invalid session token")

    concept = db.get(AIConcept, concept_id)
    if not concept:
        raise HTTPException(status_code=404, detail="Concept not found")

    # Get Canvas sections for this concept
    sections = (
        db.query(ConceptSection)
        .filter(ConceptSection.concept_id == concept_id)
        .order_by(ConceptSection.sequence_order)
        .all()
    )

    sections_out = [
        ConceptSectionOut(
            id=str(s.id),
            section_type=s.section_type,
            sequence_order=s.sequence_order,
            content=s.content or {},
            source_references=s.source_references or [],
            voice_text=s.voice_text,
        )
        for s in sections
    ]

    return ConceptOut(
        id=str(concept.id),
        title=concept.title,
        explanation=concept.explanation,
        definition=concept.definition,
        keywords=concept.keywords or [],
        formulas=concept.formulas or [],
        examples=concept.examples or [],
        misconceptions=concept.misconceptions or [],
        exam_questions=concept.exam_questions or [],
        source_page=concept.source_page,
        source_heading=concept.source_heading,
        prerequisites=concept.prerequisites or [],
        content_type=getattr(concept, 'content_type', 'theory') or 'theory',
        worked_examples=getattr(concept, 'worked_examples', None) or [],
        source_elements=getattr(concept, 'source_elements', None) or [],
        sequence_order=concept.sequence_order,
        sections=sections_out,
    )


# ── Concept progress ──────────────────────────────────────────────────────────

@router.post("/concepts/{concept_id}/progress")
def update_concept_progress(
    concept_id: str,
    body: ConceptProgressUpdate,
    db: Session = Depends(_get_db),
):
    """
    Update a student's mastery state for a specific concept.
    Called when student answers a question, marks for review, etc.
    """
    roll_number = _resolve_roll_number(body.token)
    if not roll_number:
        raise HTTPException(status_code=401, detail="Invalid session token")

    concept = db.get(AIConcept, concept_id)
    if not concept:
        raise HTTPException(status_code=404, detail="Concept not found")

    now = datetime.utcnow()

    existing = db.query(StudentConceptProgress).filter(
        StudentConceptProgress.roll_number == roll_number,
        StudentConceptProgress.concept_id == concept_id,
    ).first()

    if existing:
        existing.status = body.status
        existing.attempts = max(existing.attempts, body.attempts)
        existing.correct_attempts = max(existing.correct_attempts, body.correct_attempts)
        existing.last_seen_at = now
        existing.updated_at = now
        # Simple confidence: correct / total attempts
        if body.attempts > 0:
            existing.confidence = round(body.correct_attempts / body.attempts, 2)
    else:
        confidence = round(body.correct_attempts / body.attempts, 2) if body.attempts > 0 else None
        row = StudentConceptProgress(
            id=str(uuid.uuid4()),
            roll_number=roll_number,
            concept_id=concept_id,
            upload_id=str(concept.upload_id),
            status=body.status,
            attempts=body.attempts,
            correct_attempts=body.correct_attempts,
            confidence=confidence,
            last_seen_at=now,
            updated_at=now,
        )
        db.add(row)

    db.commit()
    return {"saved": True, "status": body.status}


# ── Persistent Tutor ──────────────────────────────────────────────────────────

@router.post("/tutor", response_model=TutorResponse)
def ask_tutor(
    body: TutorRequest,
    db: Session = Depends(_get_db),
):
    """
    Persistent tutor endpoint — superset of /doubt.
    Understands current concept context, conversation history, and tutor mode.

    Modes:
      answer   — direct answer grounded in RAG
      socratic — guided questioning instead of revealing answer
      hint     — single hint toward the answer
      quiz     — tutor asks a question about the current concept
    """
    roll_number = _resolve_roll_number(body.token)
    if not roll_number:
        raise HTTPException(status_code=401, detail="Invalid session token")

    # Resolve context
    current_concept_title = "the current topic"
    upload_id_for_rag = body.upload_id

    if body.concept_id:
        concept = db.get(AIConcept, body.concept_id)
        if concept:
            current_concept_title = concept.title
            if not upload_id_for_rag:
                upload_id_for_rag = str(concept.upload_id)

    # Derive subject name without hardcoded map
    subject_name = "the subject"
    if body.script_id:
        script = db.get(LessonScript, body.script_id)
        if script:
            subject_name = script.subject_id.replace("-", " ").replace("_", " ").title()
    elif upload_id_for_rag:
        upload = db.get(ChapterUpload, upload_id_for_rag)
        if upload:
            subject_name = upload.subject_id.replace("-", " ").replace("_", " ").title()

    from services.tutor_service import answer_tutor
    answer, model_used, suggested_action = answer_tutor(
        question=body.question,
        upload_id=upload_id_for_rag or "",
        current_concept_title=current_concept_title,
        subject_name=subject_name,
        conversation=body.conversation,
        mode=body.mode,
    )

    return TutorResponse(
        answer=answer,
        model_used=model_used,
        mode=body.mode,
        suggested_action=suggested_action,
    )


# ── Source Map (Phase 3) ──────────────────────────────────────────────────────

@router.get("/chapters/{upload_id}/source-map")
def get_source_map(
    upload_id: str,
    token: str,
    db: Session = Depends(_get_db),
):
    """
    Get the slide/page structure of the original uploaded document.
    Used by the Source viewer in WorkspacePlayer.

    Returns list of:
      {number, title, body_preview, full_text, element_type, concepts?}

    Works with: PPTX, PDF.
    Falls back to concept metadata reconstruction if file was deleted.
    """
    if not _resolve_roll_number(token):
        raise HTTPException(status_code=401, detail="Invalid session token")

    upload = db.get(ChapterUpload, upload_id)
    if not upload:
        raise HTTPException(status_code=404, detail="Chapter not found")

    # Check access: chapter must be ready
    if upload.upload_status not in ("ready", "ready_low_coverage"):
        raise HTTPException(status_code=404, detail="Chapter not ready")

    from services.source_map_service import build_source_map
    slides = build_source_map(upload_id)

    # Enrich each slide with which concepts map to it
    # Build concept-to-page map from ai_concepts
    concepts = (
        db.query(AIConcept.id, AIConcept.title, AIConcept.source_page)
        .filter(AIConcept.upload_id == upload_id)
        .all()
    )
    page_to_concepts: dict[int, list[dict]] = {}
    for c_id, c_title, c_page in concepts:
        if c_page:
            if c_page not in page_to_concepts:
                page_to_concepts[c_page] = []
            page_to_concepts[c_page].append({"id": str(c_id), "title": c_title})

    # Attach concept list to each slide
    for slide in slides:
        slide["concepts"] = page_to_concepts.get(slide["number"], [])

    return {
        "upload_id": upload_id,
        "chapter_key": upload.chapter_key,
        "total": len(slides),
        "element_type": slides[0]["element_type"] if slides else "page",
        "slides": slides,
    }


# ── Quiz (Phase 5) ────────────────────────────────────────────────────────────

from models.schemas import ConceptProgressUpdate  # already imported above

class QuizGenerateRequest(BaseModel):
    token: str
    concept_id: str
    existing_questions: list[str] = Field(default_factory=list)

class QuizEvaluateRequest(BaseModel):
    token: str
    concept_id: str
    question: str
    student_answer: str
    expected_answer: str = ""  # optional override; service will fetch from concept if empty


class QuizEvaluateResponse(BaseModel):
    verdict: str          # 'correct' | 'partial' | 'incorrect' | 'error'
    is_correct: bool
    feedback: str
    hint: str | None = None
    model_used: str


@router.post("/quiz/generate")
def generate_quiz_question(
    body: QuizGenerateRequest,
    db: Session = Depends(_get_db),
):
    """
    Generate a fresh quiz question for a concept.
    Called by AdaptiveQuiz when the student starts a quiz session.
    """
    roll_number = _resolve_roll_number(body.token)
    if not roll_number:
        raise HTTPException(status_code=401, detail="Invalid session token")

    concept = db.get(AIConcept, body.concept_id)
    if not concept:
        raise HTTPException(status_code=404, detail="Concept not found")

    upload = db.get(ChapterUpload, str(concept.upload_id))
    subject_name = _get_subject_name(concept.subject_id, upload)

    from services.quiz_service import generate_question
    result = generate_question(
        concept_title=concept.title,
        upload_id=str(concept.upload_id),
        subject_name=subject_name,
        existing_questions=body.existing_questions,
    )

    # Also provide the expected answer from the concept definition
    expected = concept.definition or concept.explanation[:300] or ""

    return {
        "concept_id": body.concept_id,
        "concept_title": concept.title,
        "question": result["question"],
        "expected_answer": expected,
        "model_used": result["model_used"],
    }


@router.post("/quiz/evaluate", response_model=QuizEvaluateResponse)
def evaluate_quiz_answer(
    body: QuizEvaluateRequest,
    db: Session = Depends(_get_db),
):
    """
    Evaluate a student's answer to a quiz question using LLM + RAG.
    Updates concept-level mastery based on verdict.
    """
    roll_number = _resolve_roll_number(body.token)
    if not roll_number:
        raise HTTPException(status_code=401, detail="Invalid session token")

    concept = db.get(AIConcept, body.concept_id)
    if not concept:
        raise HTTPException(status_code=404, detail="Concept not found")

    upload = db.get(ChapterUpload, str(concept.upload_id))
    subject_name = _get_subject_name(concept.subject_id, upload)

    # Use provided expected_answer or fall back to concept definition
    expected = body.expected_answer or concept.definition or concept.explanation[:300] or ""

    from services.quiz_service import evaluate_answer
    result = evaluate_answer(
        question=body.question,
        student_answer=body.student_answer,
        expected_answer=expected,
        concept_title=concept.title,
        upload_id=str(concept.upload_id),
        subject_name=subject_name,
    )

    # Auto-update concept progress based on verdict
    _auto_update_concept_progress(
        db=db,
        roll_number=roll_number,
        concept=concept,
        is_correct=result["is_correct"],
        verdict=result["verdict"],
    )

    return QuizEvaluateResponse(**result)


def _auto_update_concept_progress(db, roll_number, concept, is_correct, verdict):
    """Update student_concept_progress after a quiz attempt."""
    from datetime import datetime

    concept_id = str(concept.id)
    now = datetime.utcnow()

    existing = db.query(StudentConceptProgress).filter(
        StudentConceptProgress.roll_number == roll_number,
        StudentConceptProgress.concept_id == concept_id,
    ).first()

    if existing:
        existing.attempts += 1
        if is_correct:
            existing.correct_attempts += 1
        # Update status based on performance
        existing.status = _compute_status(existing.attempts, existing.correct_attempts, verdict)
        if existing.attempts > 0:
            existing.confidence = round(existing.correct_attempts / existing.attempts, 2)
        existing.last_seen_at = now
        existing.updated_at = now
        # Schedule review if struggling
        if existing.status == 'struggling':
            from datetime import timedelta
            existing.next_review_at = now + timedelta(hours=24)
    else:
        status = 'understood' if is_correct else 'struggling'
        row = StudentConceptProgress(
            id=str(uuid.uuid4()),
            roll_number=roll_number,
            concept_id=concept_id,
            upload_id=str(concept.upload_id),
            status=status,
            attempts=1,
            correct_attempts=1 if is_correct else 0,
            confidence=1.0 if is_correct else 0.0,
            last_seen_at=now,
            updated_at=now,
        )
        db.add(row)

    db.commit()


# ── Resources (Phase 7) ───────────────────────────────────────────────────────

@router.get("/concepts/{concept_id}/resources")
def get_concept_resources(
    concept_id: str,
    token: str,
    db: Session = Depends(_get_db),
):
    """
    Get contextual resources for a concept — Phase 7 lazy discovery.

    Uses LLM (chat_doubt — fast chain) to generate relevant YouTube search
    queries. Returns them as search URLs so we never hallucinate video IDs.
    Also returns source document references if the concept has source_page metadata.

    This endpoint is NEVER called during ingestion — only when the student opens
    the Resources tab.
    """
    roll_number = _resolve_roll_number(token)
    if not roll_number:
        raise HTTPException(status_code=401, detail="Invalid session token")

    concept = db.get(AIConcept, concept_id)
    if not concept:
        raise HTTPException(status_code=404, detail="Concept not found")

    upload = db.get(ChapterUpload, str(concept.upload_id))
    subject_name = _get_subject_name(str(concept.subject_id), upload)

    # ── Ask LLM for YouTube search queries ──────────────────────────────────
    keywords_snippet = ", ".join((concept.keywords or [])[:8])
    prompt = f"""You are a study resource curator for university students.

Concept: {concept.title}
Subject: {subject_name}
Keywords: {keywords_snippet}

Generate exactly 4 YouTube search queries that would help a student understand this concept.
These should be specific, educational search terms a professor would recommend.
For numerical/calculation concepts, include at least one worked example search.

Return ONLY a JSON array of strings, nothing else. Example format:
["query 1", "query 2", "query 3", "query 4"]"""

    queries: list[str] = []
    try:
        from services.llm_router import chat_doubt
        raw, _ = chat_doubt(
            messages=[{"role": "user", "content": prompt}],
            max_tokens=256,
        )
        # Strip markdown code fences if present
        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        raw = raw.strip()
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            queries = [str(q) for q in parsed if q][:4]
    except Exception:
        logger.warning("[resources] LLM query generation failed for concept %s — using fallback", concept_id)

    # Fallback: construct basic queries from concept title and subject
    if not queries:
        title = concept.title
        queries = [
            f"{title} explained",
            f"{title} {subject_name} lecture",
            f"{title} examples university",
            f"{title} tutorial",
        ]

    # ── Build YouTube search resource cards ─────────────────────────────────
    resources = []
    for query in queries[:4]:
        search_url = "https://www.youtube.com/results?search_query=" + urllib.parse.quote_plus(query)
        resources.append({
            "type": "youtube_search",
            "title": "Search YouTube",
            "query": query,
            "search_url": search_url,
            "description": "Video explanations of this concept",
        })

    # ── Source document reference (if available) ─────────────────────────────
    source_references = []
    if concept.source_page or concept.source_heading:
        source_references.append({
            "type": "source_doc",
            "title": "View in Source",
            "slide_or_page": concept.source_page,
            "heading": concept.source_heading or concept.title,
        })

    return {
        "concept_id": concept_id,
        "concept_title": concept.title,
        "subject_name": subject_name,
        "resources": resources,
        "source_references": source_references,
    }


def _compute_status(attempts: int, correct: int, verdict: str) -> str:
    """Determine concept mastery status from attempt history."""
    if attempts == 0:
        return 'unseen'
    rate = correct / attempts
    if rate >= 0.8:
        return 'understood'
    elif rate >= 0.5 or verdict == 'partial':
        return 'learning'
    else:
        return 'struggling'


# ── Review System (Phase 8) ───────────────────────────────────────────────────

class ReviewCompleteRequest(BaseModel):
    token: str
    score: float = Field(..., ge=0.0, le=1.0, description="Fraction correct: correct/total")


@router.get("/chapters/{upload_id}/review-queue")
def get_review_queue(
    upload_id: str,
    token: str,
    db: Session = Depends(_get_db),
):
    """
    Get concepts due for review in this chapter for the current student.

    Returns concepts where:
      - status == 'struggling', OR
      - status == 'review_due', OR
      - status == 'understood' AND next_review_at <= now (auto-promoted to review_due)

    Ordered by next_review_at ascending (most overdue first, nulls last).
    Returns [] if nothing is due — never 404.
    """
    from datetime import datetime, timedelta

    roll_number = _resolve_roll_number(token)
    if not roll_number:
        raise HTTPException(status_code=401, detail="Invalid session token")

    now = datetime.utcnow()

    rows = (
        db.query(StudentConceptProgress)
        .filter(
            StudentConceptProgress.roll_number == roll_number,
            StudentConceptProgress.upload_id == upload_id,
        )
        .all()
    )

    due_rows = []
    for row in rows:
        is_struggling = row.status == "struggling"
        is_review_due = row.status == "review_due"
        is_overdue_understood = (
            row.status == "understood"
            and row.next_review_at is not None
            and row.next_review_at <= now
        )

        if is_overdue_understood:
            # Promote to review_due
            row.status = "review_due"
            row.updated_at = now
            due_rows.append(row)
        elif is_struggling or is_review_due:
            due_rows.append(row)

    if any(r.status == "review_due" for r in due_rows):
        db.commit()

    # Sort: review_due with next_review_at first (most overdue), then struggling
    due_rows.sort(key=lambda r: (r.next_review_at or datetime.max))

    # Enrich with concept titles
    result = []
    for row in due_rows:
        concept = db.get(AIConcept, str(row.concept_id))
        if not concept:
            continue
        result.append({
            "concept_id": str(row.concept_id),
            "concept_title": concept.title,
            "status": row.status,
            "attempts": row.attempts,
            "correct_attempts": row.correct_attempts,
            "confidence": row.confidence,
            "next_review_at": row.next_review_at.isoformat() if row.next_review_at else None,
            "last_seen_at": row.last_seen_at.isoformat() if row.last_seen_at else None,
        })

    return result


@router.post("/concepts/{concept_id}/review-complete")
def complete_review(
    concept_id: str,
    body: ReviewCompleteRequest,
    db: Session = Depends(_get_db),
):
    """
    Mark a concept review session as complete.
    Updates mastery status and schedules next review based on score.

    score >= 0.8  → mastered   (next review in 7 days)
    0.5 <= s < 0.8 → understood (next review in 3 days)
    score < 0.5   → struggling  (next review in 1 day)
    """
    from datetime import datetime, timedelta

    roll_number = _resolve_roll_number(body.token)
    if not roll_number:
        raise HTTPException(status_code=401, detail="Invalid session token")

    now = datetime.utcnow()
    score = body.score

    if score >= 0.8:
        new_status = "mastered"
        next_review = now + timedelta(days=7)
    elif score >= 0.5:
        new_status = "understood"
        next_review = now + timedelta(days=3)
    else:
        new_status = "struggling"
        next_review = now + timedelta(days=1)

    existing = db.query(StudentConceptProgress).filter(
        StudentConceptProgress.roll_number == roll_number,
        StudentConceptProgress.concept_id == concept_id,
    ).first()

    if existing:
        existing.status = new_status
        existing.next_review_at = next_review
        existing.last_seen_at = now
        existing.updated_at = now
        db.commit()
    else:
        # No prior progress row — create one
        concept = db.get(AIConcept, concept_id)
        if concept:
            row = StudentConceptProgress(
                id=str(uuid.uuid4()),
                roll_number=roll_number,
                concept_id=concept_id,
                upload_id=str(concept.upload_id),
                status=new_status,
                attempts=0,
                correct_attempts=0,
                confidence=score,
                last_seen_at=now,
                next_review_at=next_review,
                updated_at=now,
            )
            db.add(row)
            db.commit()

    return {
        "saved": True,
        "status": new_status,
        "next_review_at": next_review.isoformat(),
    }
