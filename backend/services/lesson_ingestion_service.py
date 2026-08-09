"""
Lesson Ingestion Service — AI Lesson Player

Orchestrates the full pipeline for processing an uploaded chapter PDF:

  PDF file
    ↓ document_parser       → RawDocumentModel
    ↓ concept_extractor     → ChapterConceptList (LLM, once)
    ↓ curriculum_compiler   → ordered concepts (deterministic)
    ↓ coverage validation   → score + auto-retry
    ↓ save ai_concepts      → DB
    ↓ lesson_compiler       → Teaching Script blocks (LLM, once per concept for voice)
    ↓ save lesson_script    → DB
    ↓ save lesson_blocks    → DB
    ↓ rag_service.index     → embed chunks into pgvector
    ↓ delete original PDF

Called as a FastAPI BackgroundTask — returns immediately to student,
processes async and updates upload_status in DB.
"""

import hashlib
import logging
import os
import uuid
from datetime import datetime
from pathlib import Path

from services.llm_config import INGESTION_COVERAGE_THRESHOLD

logger = logging.getLogger(__name__)


def compute_file_hash(file_path: str) -> str:
    """SHA-256 hash of file content — used to detect duplicate uploads."""
    sha256 = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            sha256.update(chunk)
    return sha256.hexdigest()


def run_ingestion(upload_id: str) -> None:
    """
    Main ingestion pipeline. Called as a background task.
    Updates chapter_uploads.upload_status throughout.
    Never raises — all errors are caught and stored in error_message.
    """
    from db.session import SessionLocal
    from db.models.chapter_upload import ChapterUpload
    from db.models.ai_concept import AIConcept
    from db.models.lesson_script import LessonScript
    from db.models.lesson_block import LessonBlock

    logger.info("[Ingestion] Starting pipeline for upload_id=%s", upload_id)

    with SessionLocal() as session:
        upload = session.get(ChapterUpload, upload_id)
        if not upload:
            logger.error("[Ingestion] Upload not found: %s", upload_id)
            return

        file_path = upload.file_path
        subject_id = upload.subject_id
        chapter_key = upload.chapter_key

        # Mark as processing
        upload.upload_status = "processing"
        upload.updated_at = datetime.utcnow()
        session.commit()

    try:
        # ── Step 1: Parse document ────────────────────────────────────────
        logger.info("[Ingestion] Step 1: Parsing document...")
        from services.document_parser import parse_document
        doc = parse_document(file_path)

        # ── Step 2: Extract Concepts ──────────────────────────────────────
        logger.info("[Ingestion] Step 2: Extracting concepts...")
        from services.concept_extractor import extract_concepts
        concept_list, coverage_score, model_used = extract_concepts(
            doc, retry_if_below=INGESTION_COVERAGE_THRESHOLD
        )

        if not concept_list.concepts:
            raise ValueError("LLM extraction produced zero concepts — PDF may be image-based or unreadable")

        # ── Step 3: Order Concepts ────────────────────────────────────────
        logger.info("[Ingestion] Step 3: Ordering concepts...")
        from services import curriculum_compiler
        ordered_concepts = curriculum_compiler.compile(concept_list.concepts)

        # ── Step 4: Save Concepts to DB ───────────────────────────────────
        logger.info("[Ingestion] Step 4: Saving %d concepts to DB...", len(ordered_concepts))
        concept_id_map: dict[str, str] = {}  # title → DB UUID

        with SessionLocal() as session:
            now = datetime.utcnow()
            for idx, concept in enumerate(ordered_concepts):
                concept_db_id = str(uuid.uuid4())
                concept_id_map[concept.title] = concept_db_id

                # Safely extract StudyMe 2.0 fields (may not be present on older extractions)
                worked_examples_data = []
                if hasattr(concept, 'worked_examples') and concept.worked_examples:
                    worked_examples_data = [
                        we.model_dump() if hasattr(we, 'model_dump') else dict(we)
                        for we in concept.worked_examples
                    ]

                source_elements_data = []
                if hasattr(concept, 'source_elements') and concept.source_elements:
                    source_elements_data = [
                        se.model_dump() if hasattr(se, 'model_dump') else dict(se)
                        for se in concept.source_elements
                    ]

                content_type = getattr(concept, 'content_type', 'theory') or 'theory'

                row = AIConcept(
                    id=concept_db_id,
                    upload_id=upload_id,
                    subject_id=subject_id,
                    chapter_key=chapter_key,
                    sequence_order=idx,
                    title=concept.title,
                    explanation=concept.explanation,
                    definition=concept.definition,
                    keywords=concept.keywords,
                    formulas=[f.model_dump() for f in concept.formulas],
                    examples=concept.examples,
                    misconceptions=concept.misconceptions,
                    exam_questions=concept.exam_questions,
                    source_page=concept.source_page,
                    source_heading=concept.source_heading,
                    prerequisites=concept.prerequisites,
                    content_type=content_type,
                    worked_examples=worked_examples_data,
                    source_elements=source_elements_data,
                    created_at=now,
                )
                session.add(row)
            session.commit()
            logger.info("[Ingestion] Saved %d concepts", len(ordered_concepts))

        # ── Step 5: Create Lesson Script row ──────────────────────────────
        script_id = str(uuid.uuid4())
        with SessionLocal() as session:
            script = LessonScript(
                id=script_id,
                upload_id=upload_id,
                subject_id=subject_id,
                chapter_key=chapter_key,
                title=concept_list.chapter_title,
                total_blocks=0,           # updated after blocks are saved
                estimated_duration_seconds=0,
                concept_count=len(ordered_concepts),
                version=1,
                is_active=True,
                created_at=datetime.utcnow(),
            )
            session.add(script)
            session.commit()
            logger.info("[Ingestion] Created LessonScript id=%s", script_id)

        # ── Step 6: Compile Lesson Blocks ─────────────────────────────────
        logger.info("[Ingestion] Step 6: Compiling lesson blocks (LLM voice generation)...")
        from services.lesson_compiler import compile_lesson
        blocks, estimated_duration = compile_lesson(
            concepts=ordered_concepts,
            script_id=script_id,
            subject_id=subject_id,
            chapter_key=chapter_key,
            upload_id=upload_id,
            concept_id_map=concept_id_map,
        )

        # ── Step 7: Save Lesson Blocks to DB ─────────────────────────────
        logger.info("[Ingestion] Step 7: Saving %d blocks to DB...", len(blocks))
        with SessionLocal() as session:
            for block_data in blocks:
                row = LessonBlock(
                    id=block_data["id"],
                    script_id=block_data["script_id"],
                    concept_id=block_data.get("concept_id"),
                    sequence_order=block_data["sequence_order"],
                    block_type=block_data["block_type"],
                    content=block_data["content"],
                    voice_text=block_data.get("voice_text"),
                    expected_answer=block_data.get("expected_answer"),
                    created_at=block_data["created_at"],
                )
                session.add(row)

            # Update lesson script with final block count
            script_row = session.get(LessonScript, script_id)
            if script_row:
                script_row.total_blocks = len(blocks)
                script_row.estimated_duration_seconds = estimated_duration
            session.commit()
            logger.info("[Ingestion] Saved %d blocks", len(blocks))

        # ── Step 8: Index Chunks for RAG ──────────────────────────────────
        logger.info("[Ingestion] Step 8: Indexing %d chunks for RAG...", len(doc.chunks))
        from services import rag_service
        indexed = rag_service.index_chapter(
            upload_id=upload_id,
            chunks=doc.chunks,
            subject_id=subject_id,
            chapter_key=chapter_key,
        )
        logger.info("[Ingestion] RAG indexed %d chunks", indexed)

        # ── Step 9: Pre-generate TTS Audio ────────────────────────────────
        logger.info("[Ingestion] Step 9: Pre-generating TTS audio for lesson blocks...")
        from services.tts_service import generate_for_script
        audio_count = generate_for_script(script_id=script_id, blocks=blocks)
        logger.info("[Ingestion] TTS generated %d audio files", audio_count)

        # ── Step 10: Update Upload Status ─────────────────────────────────
        final_status = "ready" if coverage_score >= INGESTION_COVERAGE_THRESHOLD else "ready_low_coverage"
        with SessionLocal() as session:
            upload = session.get(ChapterUpload, upload_id)
            if upload:
                upload.upload_status = final_status
                upload.coverage_score = coverage_score
                upload.concept_count = len(ordered_concepts)
                upload.block_count = len(blocks)
                upload.processed_at = datetime.utcnow()
                upload.updated_at = datetime.utcnow()
                session.commit()

        logger.info(
            "[Ingestion] ✓ Complete: upload_id=%s status=%s coverage=%.1f%% blocks=%d",
            upload_id, final_status, coverage_score * 100, len(blocks)
        )

        # ── Step 10: Delete Original PDF ─────────────────────────────────
        _delete_pdf_safely(upload_id, file_path)

    except Exception as exc:
        logger.error("[Ingestion] Pipeline failed for upload_id=%s: %s", upload_id, exc, exc_info=True)
        _mark_failed(upload_id, str(exc))


def _delete_pdf_safely(upload_id: str, file_path: str | None) -> None:
    """Delete the original PDF and record deletion timestamp."""
    if not file_path:
        return
    try:
        path = Path(file_path)
        if path.exists():
            path.unlink()
            logger.info("[Ingestion] Deleted PDF: %s", file_path)
        from db.session import SessionLocal
        from db.models.chapter_upload import ChapterUpload
        with SessionLocal() as session:
            upload = session.get(ChapterUpload, upload_id)
            if upload:
                upload.file_path = None
                upload.file_deleted_at = datetime.utcnow()
                session.commit()
    except Exception as exc:
        logger.warning("[Ingestion] Could not delete PDF '%s': %s", file_path, exc)


def _mark_failed(upload_id: str, error_message: str) -> None:
    """Mark upload as failed with error message."""
    try:
        from db.session import SessionLocal
        from db.models.chapter_upload import ChapterUpload
        with SessionLocal() as session:
            upload = session.get(ChapterUpload, upload_id)
            if upload:
                upload.upload_status = "failed"
                upload.error_message = error_message[:1000]
                upload.updated_at = datetime.utcnow()
                session.commit()
    except Exception as exc:
        logger.error("[Ingestion] Could not mark upload as failed: %s", exc)
