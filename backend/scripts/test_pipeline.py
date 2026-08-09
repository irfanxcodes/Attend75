"""
Pipeline Pilot Test — AI Lesson Player

Tests the full ingestion pipeline on a real FM chapter PDF.
Run from the backend directory:
    source .venv/bin/activate
    python scripts/test_pipeline.py

Steps tested:
  1. PDF parsing  (document_parser)
  2. Concept extraction  (concept_extractor)
  3. Curriculum ordering  (curriculum_compiler)
  4. Coverage scoring
  5. RAG embedding (first 3 chunks only, to test without burning quota)

Output: prints extracted concepts + quality report.
Does NOT write to database — read-only test.
"""

import os
import sys
import json

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# ── Config ────────────────────────────────────────────────────────────────
# Path to a real chapter PDF. Adjust if your FM PDF is elsewhere.
CANDIDATE_PATHS = [
    "../frontend/public/pdfs/ob/ob1.pdf",   # OB Chapter 1 — 20 pages, clean BBA content
    "../frontend/public/pdfs/fm.pdf",
    "../frontend/public/pdfs/FM-4 notes.pdf",
    "../frontend/public/pdfs/ccfa/ccfa_main.pdf",
]

# Also try absolute path relative to backend directory
_BACKEND_DIR = os.path.dirname(os.path.dirname(__file__))
_PROJECT_DIR = os.path.dirname(_BACKEND_DIR)
ABSOLUTE_CANDIDATE_PATHS = [
    os.path.join(_PROJECT_DIR, "frontend", "public", "pdfs", "ob", "ob1.pdf"),
    os.path.join(_PROJECT_DIR, "frontend", "public", "pdfs", "fm.pdf"),
    os.path.join(_PROJECT_DIR, "frontend", "public", "pdfs", "FM-4 notes.pdf"),
    os.path.join(_PROJECT_DIR, "frontend", "public", "pdfs", "ccfa", "ccfa_main.pdf"),
]

MAX_PAGES_TO_TEST = 20  # OB1 is 20 pages — use all of them
TEST_RETRY = False       # Disable retry in test to avoid burning rate limits


def find_pdf() -> str | None:
    base = os.path.dirname(__file__)
    all_paths = ABSOLUTE_CANDIDATE_PATHS + [
        os.path.normpath(os.path.join(base, rel)) for rel in CANDIDATE_PATHS
    ]
    for full in all_paths:
        if os.path.exists(full):
            return full
    return None


def truncate_doc_to_pages(doc, max_pages: int):
    """Limit doc to first N pages for testing."""
    import copy
    d = copy.copy(doc)
    d.pages = doc.pages[:max_pages]
    d.all_headings = []
    full_text_parts = []
    for page in d.pages:
        d.all_headings.extend(page.headings)
        if page.raw_text:
            full_text_parts.append(f"--- Page {page.page_number} ---\n{page.raw_text}")
    d.full_text = "\n\n".join(full_text_parts)
    d.chunks = [c for c in doc.chunks if c["source_page"] <= max_pages]
    return d


def main():
    print("\n" + "=" * 65)
    print("  AI Lesson Player — Pipeline Pilot Test")
    print("=" * 65)

    # ── Step 1: Find PDF ──────────────────────────────────────────────────
    pdf_path = find_pdf()
    if not pdf_path:
        print("\n✗  No PDF found. Looked in:")
        for p in CANDIDATE_PATHS:
            print(f"   {p}")
        print("\nPlace a chapter PDF in one of these locations and retry.")
        return

    print(f"\n✓  Found PDF: {os.path.basename(pdf_path)}")

    # ── Step 2: Parse PDF ─────────────────────────────────────────────────
    print("\n── Step 1: Parsing PDF ──")
    from services.document_parser import parse_pdf
    doc = parse_pdf(pdf_path)

    print(f"   Pages: {doc.total_pages}")
    print(f"   Title: {doc.title}")
    print(f"   Headings found: {len(doc.all_headings)}")
    print(f"   Total text chars: {len(doc.full_text):,}")
    print(f"   Chunks created: {len(doc.chunks)}")
    if doc.all_headings:
        print(f"   First 5 headings: {doc.all_headings[:5]}")

    # Limit to first N pages for the extraction test
    doc_limited = truncate_doc_to_pages(doc, MAX_PAGES_TO_TEST)
    print(f"\n   (Using first {MAX_PAGES_TO_TEST} pages: {len(doc_limited.all_headings)} headings, {len(doc_limited.full_text):,} chars)")

    # ── Step 3: Extract Concepts ──────────────────────────────────────────
    print("\n── Step 2: Extracting Concepts (LLM call) ──")
    print("   This may take 15-30 seconds...")

    from services.concept_extractor import extract_concepts
    from services.llm_config import INGESTION_COVERAGE_THRESHOLD

    try:
        concept_list, coverage_score, model_used = extract_concepts(
            doc_limited,
            retry_if_below=0.0 if not TEST_RETRY else INGESTION_COVERAGE_THRESHOLD
        )
        print(f"   ✓  Model used: {model_used}")
        print(f"   ✓  Concepts extracted: {len(concept_list.concepts)}")
        print(f"   ✓  Coverage score: {coverage_score:.1%}")
        print(f"   ✓  Chapter title: {concept_list.chapter_title}")
    except Exception as e:
        print(f"   ✗  Extraction FAILED: {e}")
        return

    # ── Step 4: Show Concepts ─────────────────────────────────────────────
    print("\n── Step 3: Extracted Concepts ──")
    for i, c in enumerate(concept_list.concepts, 1):
        kw = ", ".join(c.keywords[:4]) if c.keywords else "none"
        formulas = len(c.formulas)
        examples = len(c.examples)
        exam_q = len(c.exam_questions)
        prereqs = ", ".join(c.prerequisites[:2]) if c.prerequisites else "none"
        print(f"   {i:2}. {c.title}")
        print(f"       page={c.source_page} | keywords={kw}")
        print(f"       formulas={formulas} | examples={examples} | exam_q={exam_q} | prereqs={prereqs}")
        if c.definition:
            print(f"       definition: {c.definition[:80]}...")
        print()

    # ── Step 5: Curriculum Ordering ───────────────────────────────────────
    print("── Step 4: Curriculum Ordering ──")
    from services import curriculum_compiler

    ordered = curriculum_compiler.compile(concept_list.concepts)
    print(f"   Ordered {len(ordered)} concepts:")
    for i, c in enumerate(ordered, 1):
        prereqs = f" ← {c.prerequisites[:1]}" if c.prerequisites else ""
        print(f"   {i:2}. {c.title}{prereqs}")

    # ── Step 6: RAG Embedding Test (first 3 chunks only) ──────────────────
    print("\n── Step 5: RAG Embedding Test (3 chunks) ──")
    from services.llm_router import embed_with_fallback

    test_chunks = doc_limited.chunks[:3]
    if not test_chunks:
        print("   No chunks available for embedding test")
    else:
        for chunk in test_chunks:
            try:
                vector, model = embed_with_fallback(chunk["text"][:500])
                print(f"   ✓  Chunk {chunk['chunk_index']} embedded: {len(vector)} dims via {model}")
            except Exception as e:
                print(f"   ✗  Chunk {chunk['chunk_index']} embedding FAILED: {e}")

    # ── Summary ───────────────────────────────────────────────────────────
    print("\n" + "=" * 65)
    status = "✓  PASS" if len(concept_list.concepts) >= 3 else "✗  FAIL — too few concepts"
    print(f"  {status}")
    print(f"  Concepts: {len(concept_list.concepts)} | Coverage: {coverage_score:.1%} | Model: {model_used}")
    if coverage_score < INGESTION_COVERAGE_THRESHOLD:
        print(f"  ⚠  Coverage below threshold ({INGESTION_COVERAGE_THRESHOLD:.0%}) — prompt may need tuning")
    else:
        print(f"  ✓  Coverage above threshold — pipeline ready")
    print("=" * 65 + "\n")


if __name__ == "__main__":
    main()


def test_full_pipeline_with_db():
    """
    Test the full pipeline including database writes.
    Uses ob1.pdf — creates real rows in all 5 tables.
    Cleans up after itself.
    """
    print("\n" + "=" * 65)
    print("  Full Pipeline + DB Test")
    print("=" * 65)

    pdf_path = find_pdf()
    if not pdf_path:
        print("✗  No PDF found")
        return

    import uuid, shutil
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
    from db.session import SessionLocal, init_database
    from db.models.chapter_upload import ChapterUpload
    from db.models.lesson_script import LessonScript
    from db.models.lesson_block import LessonBlock
    from db.models.ai_concept import AIConcept
    from sqlalchemy import text
    from datetime import datetime

    init_database()

    # Copy PDF to a temp location (ingestion deletes the original)
    temp_pdf = pdf_path.replace(".pdf", "_test_copy.pdf")
    shutil.copy2(pdf_path, temp_pdf)
    print(f"✓  Test PDF copy: {os.path.basename(temp_pdf)}")

    upload_id = str(uuid.uuid4())
    chapter_key = "ob-ch1-test-pipeline"
    subject_id = "ob"

    # Create upload row
    with SessionLocal() as session:
        row = ChapterUpload(
            id=upload_id,
            subject_id=subject_id,
            chapter_key=chapter_key,
            chapter_title="Foundation for OB (Test)",
            uploaded_by="TEST_USER",
            upload_status="pending",
            file_path=temp_pdf,
            original_filename="ob1.pdf",
            file_size_bytes=os.path.getsize(temp_pdf),
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        session.add(row)
        session.commit()
        print(f"✓  Created chapter_uploads row: {upload_id[:8]}...")

    # Run pipeline — disable retry threshold for testing (retry needs multiple providers)
    print("\nRunning ingestion pipeline (this takes ~30-60 seconds)...")
    from services.lesson_ingestion_service import run_ingestion
    # Override coverage threshold to 0 so retry never fires during test
    import services.llm_config as llm_cfg
    original_threshold = llm_cfg.INGESTION_COVERAGE_THRESHOLD
    llm_cfg.INGESTION_COVERAGE_THRESHOLD = 0.0
    try:
        run_ingestion(upload_id)
    finally:
        llm_cfg.INGESTION_COVERAGE_THRESHOLD = original_threshold

    # Check results
    with SessionLocal() as session:
        upload = session.get(ChapterUpload, upload_id)
        print(f"\nUpload status: {upload.upload_status}")
        print(f"Coverage score: {upload.coverage_score}")
        print(f"Concepts: {upload.concept_count}")
        print(f"Blocks: {upload.block_count}")

        if upload.error_message:
            print(f"Error: {upload.error_message[:200]}")

        concepts = session.query(AIConcept).filter_by(upload_id=upload_id).count()
        scripts = session.query(LessonScript).filter_by(upload_id=upload_id).count()
        blocks = session.query(LessonBlock).join(
            LessonScript, LessonBlock.script_id == LessonScript.id
        ).filter(LessonScript.upload_id == upload_id).count()

        print(f"\nDB rows created:")
        print(f"  ai_concepts:    {concepts}")
        print(f"  lesson_scripts: {scripts}")
        print(f"  lesson_blocks:  {blocks}")

        # Show first 3 blocks
        first_blocks = session.query(LessonBlock).join(
            LessonScript, LessonBlock.script_id == LessonScript.id
        ).filter(LessonScript.upload_id == upload_id).order_by(LessonBlock.sequence_order).limit(5).all()

        print(f"\nFirst 5 blocks:")
        for b in first_blocks:
            print(f"  [{b.sequence_order}] {b.block_type:<20} {b.content[:60]}...")

    # Cleanup
    print("\nCleaning up test data...")
    with SessionLocal() as session:
        # Delete in FK order
        script = session.query(LessonScript).filter_by(upload_id=upload_id).first()
        if script:
            session.query(LessonBlock).filter_by(script_id=str(script.id)).delete()
            session.delete(script)
        session.query(AIConcept).filter_by(upload_id=upload_id).delete()
        session.execute(text("DELETE FROM chapter_chunks WHERE upload_id = :uid"), {"uid": upload_id})
        upload_row = session.get(ChapterUpload, upload_id)
        if upload_row:
            session.delete(upload_row)
        session.commit()
        print("✓  Test data cleaned up")

    # Clean up temp PDF if still exists
    if os.path.exists(temp_pdf):
        os.remove(temp_pdf)

    print("=" * 65 + "\n")


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "--full":
        # Run full DB test: python scripts/test_pipeline.py --full
        test_full_pipeline_with_db()
    else:
        main()
