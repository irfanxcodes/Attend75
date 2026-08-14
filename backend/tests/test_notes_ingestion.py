"""
Notes Ingestion Service — unit test suite.

Run from backend/:
    python -m pytest tests/test_notes_ingestion.py -v

Covers:
  8.1 extract_notes_text with a typed PDF — text returned without OCR path
  8.2 extract_from_pdf_smart with a "scanned" page — OCR path is invoked
  8.3 ocr_page with Tesseract confidence < 60 — gemini_vision_ocr is called
  8.4 extract_problems_with_llm — one invalid problem in LLM output is skipped,
      valid ones are returned, no exception raised
  8.5 save_extraction_result — annotation with target_text not in question_text
      is dropped; the step is still saved (annotation=None)
  8.6 save_extraction_result — sequence_order starts at 1 and is gapless
"""

import json
import sys
import types
import uuid
from io import BytesIO
from unittest.mock import MagicMock, patch, PropertyMock

import pytest

# ---------------------------------------------------------------------------
# Helpers — build minimal fitz Page/Document mocks without importing fitz
# ---------------------------------------------------------------------------

def _make_fitz_page(text="", pixmap_samples=None):
    """Return a mock that looks enough like a fitz.Page for our service."""
    page = MagicMock()
    page.get_text.return_value = text

    pixmap = MagicMock()
    pixmap.width = 100
    pixmap.height = 100
    # samples must be bytes: RGB → 3 bytes per pixel
    pixmap.samples = pixmap_samples or (b"\x80\x80\x80" * 100 * 100)
    page.get_pixmap.return_value = pixmap

    return page


def _make_fitz_doc(pages):
    """Return a mock fitz document that iterates over the given pages."""
    doc = MagicMock()
    doc.__iter__ = lambda self: iter(pages)
    doc.__enter__ = lambda self: self
    doc.__exit__ = MagicMock(return_value=False)
    return doc


# ---------------------------------------------------------------------------
# 8.1 — extract_notes_text: typed PDF returns text without calling ocr_page
# ---------------------------------------------------------------------------

def test_extract_notes_text_typed_pdf(tmp_path, monkeypatch):
    """
    A PDF whose pages all have > 100 chars of extractable text should be
    handled entirely by get_text() — ocr_page must never be called.
    """
    # Write a dummy file so the path exists (content ignored — we mock fitz)
    pdf_path = str(tmp_path / "typed.pdf")
    with open(pdf_path, "wb") as f:
        f.write(b"%PDF-1.4 fake")

    page1 = _make_fitz_page(text="A" * 200)  # well above 100-char threshold
    page2 = _make_fitz_page(text="B" * 150)
    doc   = _make_fitz_doc([page1, page2])

    # Stub out fitz.open so no real PDF is parsed
    fitz_mod = types.ModuleType("fitz")
    fitz_mod.open = MagicMock(return_value=doc)
    monkeypatch.setitem(sys.modules, "fitz", fitz_mod)

    from services import notes_ingestion_service as svc
    # Reload so the module picks up the stubbed fitz
    import importlib
    importlib.reload(svc)

    with patch.object(svc, "ocr_page") as mock_ocr:
        result = svc.extract_notes_text(pdf_path, ".pdf")

    mock_ocr.assert_not_called()
    assert "A" * 200 in result
    assert "B" * 150 in result


# ---------------------------------------------------------------------------
# 8.2 — extract_from_pdf_smart: scanned page triggers ocr_page
# ---------------------------------------------------------------------------

def test_extract_from_pdf_smart_scanned_page(tmp_path, monkeypatch):
    """
    A page that returns fewer than 100 chars from get_text() is treated as
    scanned — ocr_page must be called for that page.
    """
    pdf_path = str(tmp_path / "scanned.pdf")
    with open(pdf_path, "wb") as f:
        f.write(b"%PDF-1.4 fake")

    scanned_page = _make_fitz_page(text="tiny")   # < 100 chars → OCR path
    typed_page   = _make_fitz_page(text="X" * 200)
    doc = _make_fitz_doc([scanned_page, typed_page])

    fitz_mod = types.ModuleType("fitz")
    fitz_mod.open = MagicMock(return_value=doc)
    monkeypatch.setitem(sys.modules, "fitz", fitz_mod)

    import importlib
    from services import notes_ingestion_service as svc
    importlib.reload(svc)

    with patch.object(svc, "ocr_page", return_value="OCR TEXT") as mock_ocr:
        result = svc.extract_from_pdf_smart(pdf_path)

    # ocr_page called once (for the scanned page only)
    mock_ocr.assert_called_once_with(scanned_page)
    assert "OCR TEXT" in result
    assert "X" * 200 in result


# ---------------------------------------------------------------------------
# 8.3 — ocr_page: Tesseract confidence < 60 falls back to gemini_vision_ocr
# ---------------------------------------------------------------------------

def test_ocr_page_low_confidence_calls_gemini(monkeypatch):
    """
    When Tesseract's average confidence is below the threshold (60),
    gemini_vision_ocr must be called with the PIL image.
    """
    page = _make_fitz_page()

    # Stub PIL
    pil_mod = types.ModuleType("PIL")
    image_mod = types.ModuleType("PIL.Image")
    fake_pil_image = MagicMock()
    image_mod.frombytes = MagicMock(return_value=fake_pil_image)
    pil_mod.Image = image_mod
    monkeypatch.setitem(sys.modules, "PIL", pil_mod)
    monkeypatch.setitem(sys.modules, "PIL.Image", image_mod)

    # Stub pytesseract — low confidence data
    pytesseract_mod = types.ModuleType("pytesseract")
    pytesseract_mod.Output = MagicMock()
    pytesseract_mod.Output.DICT = "dict"
    # All confidences are 30 → average = 30 < 60
    pytesseract_mod.image_to_data = MagicMock(return_value={"conf": [30, 30, 30]})
    pytesseract_mod.image_to_string = MagicMock(return_value="should not be used")
    monkeypatch.setitem(sys.modules, "pytesseract", pytesseract_mod)

    # Stub fitz (needed for the import inside ocr_page)
    fitz_mod = types.ModuleType("fitz")
    monkeypatch.setitem(sys.modules, "fitz", fitz_mod)

    import importlib
    from services import notes_ingestion_service as svc
    importlib.reload(svc)

    with patch.object(svc, "gemini_vision_ocr", return_value="GEMINI TEXT") as mock_gemini:
        result = svc.ocr_page(page)

    mock_gemini.assert_called_once_with(fake_pil_image)
    assert result == "GEMINI TEXT"
    pytesseract_mod.image_to_string.assert_not_called()


# ---------------------------------------------------------------------------
# 8.4 — extract_problems_with_llm: one invalid problem is skipped, rest saved
# ---------------------------------------------------------------------------

def test_extract_problems_with_llm_skips_invalid(monkeypatch):
    """
    The LLM returns two problems: one valid, one missing required field
    (question_text). The valid one must be in the result; the invalid one
    must be silently skipped with no exception raised.

    chat_with_fallback is imported *inside* extract_problems_with_llm so we
    inject it via sys.modules before the function runs.
    """
    valid_problem = {
        "question_text": "Calculate NPV given CF=100, r=10%, n=3.",
        "topic": "NPV",
        "given_values": ["CF=100", "r=10%", "n=3"],
        "find": "NPV",
        "method": "Discounted Cash Flow",
        "difficulty": "medium",
        "answer": "248.69",
        "solution_steps": [
            {
                "step_type": "context",
                "content": "We need to find the NPV.",
                "voice_text": "We need to find the NPV.",
                "annotation": None,
            }
        ],
    }
    invalid_problem = {
        # Missing required 'question_text' — Pydantic should reject this
        "topic": "orphan",
        "difficulty": "easy",
        "solution_steps": [],
    }

    llm_response = json.dumps({"problems": [valid_problem, invalid_problem]})

    # chat_with_fallback is imported locally inside the function — inject via sys.modules
    mock_chat = MagicMock(return_value=(llm_response, "gemini-mock"))

    llm_router_mod = types.ModuleType("services.llm_router")
    llm_router_mod.chat_with_fallback = mock_chat
    monkeypatch.setitem(sys.modules, "services.llm_router", llm_router_mod)

    llm_config_mod = types.ModuleType("services.llm_config")
    llm_config_mod.INGESTION_FALLBACK_CHAIN = []
    monkeypatch.setitem(sys.modules, "services.llm_config", llm_config_mod)

    import importlib
    from services import notes_ingestion_service as svc
    importlib.reload(svc)

    result = svc.extract_problems_with_llm("some notes text")

    assert len(result.problems) == 1
    assert result.problems[0].question_text == valid_problem["question_text"]
    assert result.problems[0].topic == "NPV"


# ---------------------------------------------------------------------------
# 8.5 — save_extraction_result: bad annotation dropped, step still saved
# ---------------------------------------------------------------------------

def test_save_extraction_result_drops_bad_annotation(tmp_path, monkeypatch):
    """
    A solution step whose annotation.target_text is NOT a substring of
    question_text must be saved with annotation=None — the step itself
    must not be dropped.
    """
    _setup_in_memory_db(tmp_path, monkeypatch)

    import importlib
    from services import notes_ingestion_service as svc
    importlib.reload(svc)

    from services.notes_ingestion_service import (
        NotesExtractionResult,
        NotesProblemSchema,
        NotesSolutionStepSchema,
        save_extraction_result,
    )

    question = "What is the NPV of the investment?"
    bad_annotation = {
        "type": "highlight",
        "target_text": "THIS TEXT IS NOT IN THE QUESTION",  # invalid
        "color": "#FFD700",
    }

    result = NotesExtractionResult(problems=[
        NotesProblemSchema(
            question_text=question,
            difficulty="easy",
            solution_steps=[
                NotesSolutionStepSchema(
                    step_type="context",
                    content="We want to find NPV.",
                    annotation=bad_annotation,
                )
            ],
        )
    ])

    problem_set_id = save_extraction_result(
        upload_id="upload-test-001",
        subject_id="fm",
        chapter_key="ch1",
        title="Test",
        result=result,
    )

    # Verify via DB
    from db.session import SessionLocal
    from db.models.notes_solution_step import NotesSolutionStep

    with SessionLocal() as session:
        steps = session.query(NotesSolutionStep).all()

    assert len(steps) == 1, "Step should be saved"
    assert steps[0].annotation is None, "Bad annotation must be dropped (None)"
    assert steps[0].content == "We want to find NPV."


# ---------------------------------------------------------------------------
# 8.6 — save_extraction_result: sequence_order starts at 1 and is gapless
# ---------------------------------------------------------------------------

def test_save_extraction_result_sequence_order(tmp_path, monkeypatch):
    """
    When 3 problems with 2 steps each are saved, problem sequence_orders
    must be [1, 2, 3] and each problem's step sequence_orders must be [1, 2].
    """
    _setup_in_memory_db(tmp_path, monkeypatch)

    import importlib
    from services import notes_ingestion_service as svc
    importlib.reload(svc)

    from services.notes_ingestion_service import (
        NotesExtractionResult,
        NotesProblemSchema,
        NotesSolutionStepSchema,
        save_extraction_result,
    )

    def _make_problem(n):
        return NotesProblemSchema(
            question_text=f"Question {n}",
            difficulty="easy",
            solution_steps=[
                NotesSolutionStepSchema(step_type="context", content=f"Context {n}"),
                NotesSolutionStepSchema(step_type="result",  content=f"Result {n}"),
            ],
        )

    result = NotesExtractionResult(problems=[_make_problem(i) for i in range(1, 4)])

    save_extraction_result(
        upload_id="upload-seq-test",
        subject_id="fm",
        chapter_key="ch2",
        title="Seq Test",
        result=result,
    )

    from db.session import SessionLocal
    from db.models.notes_problem import NotesProblem
    from db.models.notes_solution_step import NotesSolutionStep

    with SessionLocal() as session:
        problems = session.query(NotesProblem).order_by(NotesProblem.sequence_order).all()
        steps    = session.query(NotesSolutionStep).order_by(
            NotesSolutionStep.problem_id,
            NotesSolutionStep.sequence_order,
        ).all()

    # Problem sequence_orders: [1, 2, 3]
    problem_orders = [p.sequence_order for p in problems]
    assert problem_orders == [1, 2, 3], f"Expected [1,2,3], got {problem_orders}"

    # Each problem must have steps with sequence_orders [1, 2]
    for prob in problems:
        prob_steps = [s for s in steps if s.problem_id == prob.id]
        step_orders = sorted(s.sequence_order for s in prob_steps)
        assert step_orders == [1, 2], (
            f"Problem {prob.sequence_order} steps: expected [1,2], got {step_orders}"
        )


# ---------------------------------------------------------------------------
# Shared fixture helper — in-memory SQLite with notes tables only
# ---------------------------------------------------------------------------

def _setup_in_memory_db(tmp_path, monkeypatch):
    """
    Point db.session at a fresh SQLite DB and create only the notes-specific
    tables (plus chapter_uploads which they FK into).

    We intentionally do NOT call Base.metadata.create_all() because other
    models use PostgreSQL-only JSONB columns that SQLite can't compile.
    """
    db_path = str(tmp_path / "notes_test.db")
    db_url  = f"sqlite:///{db_path}"

    monkeypatch.setenv("DATABASE_URL", db_url)

    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    engine = create_engine(db_url, connect_args={"check_same_thread": False})

    # Import only the models we need — avoid JSONB models entirely
    from db.models.chapter_upload import ChapterUpload
    from db.models.notes_problem_set import NotesProblemSet
    from db.models.notes_problem import NotesProblem
    from db.models.notes_solution_step import NotesSolutionStep

    # Create only the tables required for notes tests
    for model in (ChapterUpload, NotesProblemSet, NotesProblem, NotesSolutionStep):
        model.__table__.create(engine, checkfirst=True)

    Session = sessionmaker(bind=engine)

    import db.session as db_session
    monkeypatch.setattr(db_session, "SessionLocal", Session)
    monkeypatch.setattr(db_session, "engine", engine)
