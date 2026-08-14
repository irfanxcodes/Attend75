# Implementation Plan: Notes Solver

## Overview

Implement the Notes Solver feature — a Notes toggle in the Study workspace where students upload
problem-heavy PDFs/PPTs/DOCs (typed or handwritten). The backend extracts all questions using
Tesseract OCR (with Gemini Vision fallback for illegible pages) plus one LLM call per upload,
stores structured solution steps in the DB, and the frontend teaches students step-by-step on a
canvas with SVG annotations and optional TTS narration.

The implementation follows a bottom-up order: DB migration → ORM models → ingestion service →
router/schemas → frontend API → frontend components → workspace toggle integration.

---

## Tasks

- [x] 1. Database migration
  - [x] 1.1 Create Alembic migration `backend/alembic/versions/YYYYMMDD_XXXX_add_notes_solver_tables.py`
    - Add `upload_type VARCHAR(16) NOT NULL DEFAULT 'chapter'` column to `chapter_uploads`
    - Create `notes_problem_sets` table: `id`, `upload_id` (FK → chapter_uploads), `subject_id`, `chapter_key`, `title`, `problem_count`, `created_at`
    - Create `notes_problems` table: `id`, `problem_set_id` (FK), `sequence_order`, `question_text`, `topic`, `given_values` (TEXT/JSON), `find`, `method`, `difficulty`, `answer`, `created_at`
    - Create `notes_solution_steps` table: `id`, `problem_id` (FK), `sequence_order`, `step_type`, `content`, `voice_text`, `annotation` (TEXT/JSON nullable), `created_at`
    - Add indexes on `notes_problems.problem_set_id` and `notes_solution_steps.problem_id`
    - _Requirements: REQ-5.1, REQ-5.2_

- [x] 2. ORM models
  - [x] 2.1 Create `backend/db/models/notes_problem_set.py` — `NotesProblemSet` model
  - [x] 2.2 Create `backend/db/models/notes_problem.py` — `NotesProblem` model
  - [x] 2.3 Create `backend/db/models/notes_solution_step.py` — `NotesSolutionStep` model
  - [x] 2.4 Export all three from `backend/db/models/__init__.py`
  - _Requirements: REQ-5.2_

- [x] 3. Notes ingestion service
  - [x] 3.1 Create `backend/services/notes_ingestion_service.py`
  - [x] 3.2 Implement `extract_notes_text(file_path, file_ext) -> str`
    - `.pptx`/`.ppt` → existing pptx extractor
    - `.docx`/`.doc` → existing docx extractor
    - `.pdf` → `extract_from_pdf_smart()`
    - _Requirements: REQ-3.1_
  - [x] 3.3 Implement `extract_from_pdf_smart(file_path) -> str`
    - Use `fitz.open()` page-by-page; if `len(page.get_text().strip()) > 100` use it directly
    - Otherwise call `ocr_page(page)`
    - _Requirements: REQ-3.2_
  - [x] 3.4 Implement `ocr_page(page) -> str`
    - Convert page to PIL via `page.get_pixmap(dpi=200)`
    - Run `pytesseract.image_to_data()`, compute mean confidence over non-zero values
    - If confidence ≥ 60 → return `pytesseract.image_to_string()`
    - If confidence < 60 → call `gemini_vision_ocr(pil_image)`
    - _Requirements: REQ-3.2, REQ-3.3, REQ-3.4_
  - [x] 3.5 Implement `gemini_vision_ocr(pil_image) -> str`
    - Send image to Gemini Vision with plain OCR prompt
    - Retry up to 3× with exponential backoff on rate limit errors
    - Return `"[illegible]"` if all retries fail
    - _Requirements: REQ-3.3, REQ-3.4_
  - [x] 3.6 Implement `extract_problems_with_llm(text) -> NotesExtractionResult`
    - Build prompt with extracted text (see design doc)
    - One Gemini call; parse JSON response
    - Validate with `NotesExtractionResult` Pydantic model
    - Skip individual malformed problems with a logged warning — do not fail the whole call
    - _Requirements: REQ-4.1, REQ-4.2, REQ-4.3, REQ-4.5_
  - [x] 3.7 Implement `save_extraction_result(upload_id, result) -> str`
    - Write `NotesProblemSet`, then `NotesProblem` rows (`sequence_order` starts at 1, gapless)
    - For each problem write `NotesSolutionStep` rows
    - Before saving each step annotation: verify `annotation.target_text` is a substring of `question_text` — drop annotation if not
    - Return `problem_set_id`
    - _Requirements: REQ-4.4, REQ-5.2_
  - [x] 3.8 Implement `run_notes_ingestion(upload_id) -> None` (background task entry point)
    - Orchestrate steps 3.2–3.7
    - Set `upload_status = "ready"` on success, `"failed"` with `error_message` on unhandled error
    - Delete uploaded file from disk after successful ingestion
    - _Requirements: REQ-3.5, REQ-5.3_

- [x] 4. Backend router and schemas
  - [x] 4.1 Add Pydantic schemas to `backend/models/schemas.py`
    - Internal: `NotesSolutionStepSchema`, `NotesProblemSchema`, `NotesExtractionResult`
    - API out: `NotesSolutionStepOut`, `NotesProblemOut`, `NotesProblemSetOut`
    - _Requirements: REQ-4.2, REQ-4.3_
  - [x] 4.2 Create `backend/routers/notes.py` with `APIRouter(prefix="/studyme/notes")`
  - [x] 4.3 Implement `POST /upload`
    - Auth, file type (.pdf/.pptx/.ppt/.docx/.doc), and 20MB size validation
    - SHA-256 deduplication — if identical file already processed, return `problem_set_id` immediately
    - Accept `subject_id` (required), `chapter_key` and `title` (optional) form fields
    - Set `upload_type = "notes"` on new `ChapterUpload` row
    - Kick off `run_notes_ingestion` as a `BackgroundTask`
    - _Requirements: REQ-2.1, REQ-2.2, REQ-2.3, REQ-7.1, REQ-8.1, REQ-8.2_
  - [x] 4.4 Implement `GET /{upload_id}/status`
    - Return `{upload_id, status, problem_count}` from `ChapterUpload` + `NotesProblemSet`
    - _Requirements: REQ-2.2_
  - [x] 4.5 Implement `GET /{subject_id}/available`
    - Filter `ChapterUpload` by `subject_id`, `upload_type = "notes"`, `upload_status in ("ready", "ready_low_coverage")`
    - Batch-fetch uploader display names from `StudentRegistry`
    - Return list of `NotesProblemSetOut`
    - _Requirements: REQ-6.1, REQ-7.3_
  - [x] 4.6 Implement `GET /problems/{problem_id}/steps`
    - Return `NotesProblemOut` with steps ordered by `sequence_order`
    - _Requirements: REQ-6.3, REQ-6.4_
  - [x] 4.7 Implement `DELETE /{upload_id}` — soft-delete (own uploads only, same pattern as chapter delete)
    - _Requirements: REQ-2.5_
  - [x] 4.8 Implement `POST /{upload_id}/restore` — undo delete (own uploads only)
    - _Requirements: REQ-2.5_
  - [x] 4.9 Register `notes.router` in `backend/app.py`

- [x] 5. Frontend API functions
  - [x] 5.1 Add to `frontend/src/services/lessonApi.js`:
    - `getNotesForSubject({ token, subjectId })` → GET `/{subject_id}/available`
    - `getNotesStatus({ token, uploadId })` → GET `/{upload_id}/status`
    - `getNotesProblem({ token, problemId })` → GET `/problems/{problem_id}/steps`
    - `uploadNotes({ token, subjectId, chapterKey, title, file })` → POST `/upload`
    - `deleteNotes({ token, uploadId })` → DELETE `/{upload_id}`
    - `restoreNotes({ token, uploadId })` → POST `/{upload_id}/restore`
    - _Requirements: REQ-2.1, REQ-6.1_

- [x] 6. Frontend components
  - [x] 6.1 Create `frontend/src/components/study/notes/SolutionStep.jsx`
    - Renders one step with a coloured type badge: `context` / `given` / `formula` / `calculation` / `result` / `insight`
    - Shows `content` text
    - If `voice_text` is present, plays via Web Speech API `SpeechSynthesisUtterance` when the step is first revealed
    - _Requirements: REQ-6.4, REQ-6.5, REQ-6.8_
  - [x] 6.2 Create `frontend/src/components/study/notes/AnnotationOverlay.jsx`
    - Absolute-positioned SVG covering the `QuestionCard` container
    - Accepts `annotations: [{type, stepId, color}]` and `containerRef`
    - For each annotation: query `[data-annotate="${stepId}"]` span, read `getBoundingClientRect()` relative to `containerRef`
    - `highlight` → semi-transparent `<rect>` (`fillOpacity={0.3}`)
    - `circle` → `<ellipse>` with stroke, no fill, padding 4px
    - `arrow` → `<line>` + `<polygon>` arrowhead pointing at target centre
    - Silently skip if span not found in DOM
    - _Requirements: REQ-6.6, REQ-6.7_
  - [x] 6.3 Create `frontend/src/components/study/notes/QuestionCard.jsx`
    - Renders `question_text` in a styled card
    - Accepts `activeAnnotations` array; for each, wraps the matching `target_text` substring in `<span data-annotate="{stepId}">`
    - Renders `<AnnotationOverlay>` as an absolutely-positioned sibling
    - _Requirements: REQ-6.4, REQ-6.6, REQ-6.7_
  - [x] 6.4 Create `frontend/src/components/study/notes/ProblemSolverCanvas.jsx`
    - Loads full problem via `getNotesProblem()`
    - `revealedCount` state starts at 0; "Start solving" sets it to 1; "Next step" increments it
    - Renders `<QuestionCard>` with `activeAnnotations` = steps with annotation up to `revealedCount`
    - Renders all revealed `<SolutionStep>` components (cumulative, none hidden)
    - After final step: shows answer card with `answer` text + placeholder "Try a similar question" message
    - _Requirements: REQ-6.3, REQ-6.4, REQ-6.5, REQ-6.9_
  - [x] 6.5 Create `frontend/src/components/study/notes/NotesView.jsx`
    - Fetches problem sets via `getNotesForSubject()` on mount
    - Shows upload section: file picker (PDF/PPT/DOC, max 20MB) + chapter name input + submit button + polling (same flow as `ChapterUpload`)
    - Shows list of problem sets with expand/collapse; each expanded set lists problems with difficulty badge and topic tag
    - Tapping a problem renders `<ProblemSolverCanvas problemId={...} />`
    - Own-upload delete with 6s undo toast (same pattern as chapter delete in `ChapterUpload.jsx`)
    - _Requirements: REQ-2.1, REQ-2.4, REQ-2.5, REQ-6.1, REQ-6.2, REQ-6.3_

- [x] 7. Workspace toggle integration
  - [x] 7.1 Add Notes tab to the existing workspace tab bar (Canvas / Source / Resources)
    - Import `PenLine` from lucide-react
    - Tab id: `"notes"`, label: `"Notes"`, icon: `<PenLine size={14} />`
    - When active, render `<NotesView subjectId={subjectId} chapterKey={chapterKey} />`
    - _Requirements: REQ-1.1, REQ-1.2, REQ-1.3_

- [x] 8. Tests
  - [x] 8.1 Unit: `extract_notes_text` with typed PDF fixture — assert text returned without OCR path
  - [x] 8.2 Unit: `extract_from_pdf_smart` with scanned PDF fixture — mock Tesseract, assert OCR called
  - [x] 8.3 Unit: `ocr_page` with mock Tesseract confidence < 60 — assert `gemini_vision_ocr` called
  - [x] 8.4 Unit: `extract_problems_with_llm` with mock Gemini response containing one invalid step — assert valid problems saved, invalid step skipped, no exception raised
  - [x] 8.5 Unit: `save_extraction_result` — annotation with `target_text` not in `question_text` is dropped; step still saved without annotation
  - [x] 8.6 Unit: `save_extraction_result` — `sequence_order` starts at 1 and is gapless for all steps
  - [x] 8.7 Frontend: `AnnotationOverlay` renders `<rect>` for highlight, `<ellipse>` for circle, `<line>` for arrow
  - [x] 8.8 Frontend: `ProblemSolverCanvas` — tapping "Next step" increments revealed count; all previous steps remain visible
  - _Validates: Properties 1–5_

## Notes

- `pytesseract` requires the `tesseract-ocr` system binary: `apt install tesseract-ocr` on server, `brew install tesseract` locally. Add to deployment docs.
- The `annotation` column stores JSON as a TEXT field (no schema change needed for future annotation types).
- Voice narration uses Web Speech API (`window.speechSynthesis`) — no server TTS calls for notes.
- The "Try a similar question" button in step 6.4 is a Phase 2 placeholder — render it disabled with a coming-soon tooltip for now.
- All delete/restore logic copies the exact pattern from `routers/lesson.py` — no new patterns introduced.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "2.2", "2.3", "2.4"] },
    { "id": 2, "tasks": ["3.1", "3.2", "3.3", "3.4", "3.5"] },
    { "id": 3, "tasks": ["3.6", "3.7", "3.8"] },
    { "id": 4, "tasks": ["4.1", "4.2"] },
    { "id": 5, "tasks": ["4.3", "4.4", "4.5", "4.6", "4.7", "4.8", "4.9"] },
    { "id": 6, "tasks": ["5.1"] },
    { "id": 7, "tasks": ["6.1", "6.2", "6.3"] },
    { "id": 8, "tasks": ["6.4"] },
    { "id": 9, "tasks": ["6.5"] },
    { "id": 10, "tasks": ["7.1"] },
    { "id": 11, "tasks": ["8.1", "8.2", "8.3", "8.4", "8.5", "8.6", "8.7", "8.8"] }
  ]
}
```
