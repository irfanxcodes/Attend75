# Notes Solver — Technical Design

## Overview

This document describes the technical design for the Notes Solver feature. Students upload
problem-heavy material (PDFs, PPTs, DOCs — typed or handwritten). The system extracts every
question in one LLM call, stores structured solution steps in the DB, and serves a
step-by-step teaching canvas to all students. No R2, no image rendering, no per-session LLM.

---

## Architecture

```
Student uploads notes file (PDF/PPT/DOC)
        ↓
POST /studyme/notes/upload  (returns upload_id immediately)
        ↓
SHA-256 hash check → if duplicate, return existing problem_set_id
        ↓
Background Task: NotesIngestionPipeline
  ├── Step 1: Detect file type
  │     ├── Typed PDF/PPT/DOC → existing text extractor (PyMuPDF / pptx / docx)
  │     └── Scanned PDF → per-page detection
  │           ├── Page has extractable text → use it
  │           ├── Tesseract confidence ≥ 60% → use Tesseract output
  │           └── Tesseract confidence < 60% → Gemini Vision (this page only)
  ├── Step 2: One LLM call → structured JSON of all problems + solution steps
  ├── Step 3: Validate output (Pydantic) → skip unparseable questions
  └── Step 4: Write to DB (NotesProblemSet → NotesProblems → NotesSolutionSteps)
        ↓
GET /studyme/notes/{upload_id}/status  (student polls until ready)
        ↓
Result stored in DB — original file deleted from disk
        ↓
All students in this subject see the problem set in the Notes toggle
        ↓
Student taps a question → GET /studyme/notes/problems/{problem_id}/steps
        ↓
Frontend renders step-by-step canvas (zero LLM calls)
```

---

## Data Models

### New column on existing table

```sql
-- chapter_uploads
ALTER TABLE chapter_uploads ADD COLUMN upload_type VARCHAR(16) NOT NULL DEFAULT 'chapter';
-- values: 'chapter' | 'notes'
```

### New tables

```sql
-- One per processed notes upload
CREATE TABLE notes_problem_sets (
  id            VARCHAR(36) PRIMARY KEY,
  upload_id     VARCHAR(36) NOT NULL REFERENCES chapter_uploads(id),
  subject_id    VARCHAR(64) NOT NULL,
  chapter_key   VARCHAR(128),          -- which chapter these notes relate to (nullable)
  title         VARCHAR(256),          -- human label e.g. "FM Numericals Unit 3"
  problem_count INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMP NOT NULL
);

-- One per extracted question
CREATE TABLE notes_problems (
  id              VARCHAR(36) PRIMARY KEY,
  problem_set_id  VARCHAR(36) NOT NULL REFERENCES notes_problem_sets(id),
  sequence_order  INTEGER NOT NULL,
  question_text   TEXT NOT NULL,
  topic           VARCHAR(256),
  given_values    TEXT,                -- JSON array of strings
  find            TEXT,
  method          VARCHAR(256),
  difficulty      VARCHAR(16),         -- 'easy' | 'medium' | 'hard'
  answer          TEXT,
  created_at      TIMESTAMP NOT NULL
);

-- One per step within a problem
CREATE TABLE notes_solution_steps (
  id              VARCHAR(36) PRIMARY KEY,
  problem_id      VARCHAR(36) NOT NULL REFERENCES notes_problems(id),
  sequence_order  INTEGER NOT NULL,
  step_type       VARCHAR(32) NOT NULL,  -- context|given|formula|calculation|result|insight
  content         TEXT NOT NULL,
  voice_text      TEXT,
  annotation      TEXT,                  -- null or JSON {type, target_text, color}
  created_at      TIMESTAMP NOT NULL
);
```

### Alembic migration

One new migration file covering the `upload_type` column and all three new tables.

---

## Components and Interfaces

### Backend Components

#### `services/notes_ingestion_service.py` (new)

```python
def run_notes_ingestion(upload_id: str) -> None:
    """Entry point for background task. Orchestrates all steps."""

def extract_notes_text(file_path: str, file_ext: str) -> str:
    """Route to correct extractor based on file type."""

def extract_from_pdf_smart(file_path: str) -> str:
    """Per-page detection: typed text → Tesseract → Gemini Vision fallback."""

def ocr_page(page: fitz.Page) -> str:
    """Run Tesseract, check confidence, fall back to Gemini Vision if needed."""

def gemini_vision_ocr(pil_image: Image) -> str:
    """Single-page Gemini Vision call for illegible handwriting."""

def extract_problems_with_llm(text: str) -> NotesExtractionResult:
    """One LLM call. Returns validated Pydantic model."""

def save_extraction_result(upload_id: str, result: NotesExtractionResult) -> str:
    """Write NotesProblemSet + NotesProblems + NotesSolutionSteps to DB. Returns problem_set_id."""
```

#### `routers/notes.py` (new)

```
POST   /studyme/notes/upload
GET    /studyme/notes/{upload_id}/status
GET    /studyme/notes/{subject_id}/available
GET    /studyme/notes/problems/{problem_id}/steps
DELETE /studyme/notes/{upload_id}
POST   /studyme/notes/{upload_id}/restore
```

#### `db/models/` (new files)

```
db/models/notes_problem_set.py   — NotesProblemSet ORM model
db/models/notes_problem.py       — NotesProblem ORM model
db/models/notes_solution_step.py — NotesSolutionStep ORM model
```

#### `models/schemas.py` additions

```python
class NotesSolutionStepOut(BaseModel):
    id: str
    sequence_order: int
    step_type: str
    content: str
    voice_text: str | None
    annotation: dict | None     # {type, target_text, color} or null

class NotesProblemOut(BaseModel):
    id: str
    sequence_order: int
    question_text: str
    topic: str | None
    difficulty: str
    method: str | None
    answer: str | None
    steps: list[NotesSolutionStepOut]

class NotesProblemSetOut(BaseModel):
    upload_id: str
    problem_set_id: str
    subject_id: str
    chapter_key: str | None
    title: str | None
    problem_count: int
    uploaded_by_label: str
    uploaded_by_name: str | None
    is_own_upload: bool
```

### Frontend Components

```
frontend/src/components/study/notes/
  NotesView.jsx          — top-level: problem set list + solver
  ProblemSolverCanvas.jsx — step-by-step teaching view for one problem
  QuestionCard.jsx       — renders question text with annotatable spans
  AnnotationOverlay.jsx  — SVG layer drawn over QuestionCard
  SolutionStep.jsx       — single step card with type badge + narration

frontend/src/services/lessonApi.js  — new functions added:
  getNotesForSubject({ token, subjectId })
  getNotesProblem({ token, problemId })
  uploadNotes({ token, subjectId, chapterKey, title, file })
  deleteNotes({ token, uploadId })
  restoreNotes({ token, uploadId })
```

### Workspace Integration

The existing workspace tab bar receives one new entry:

```jsx
// In WorkspacePlayer or equivalent tab bar component
{ id: 'notes', label: 'Notes', icon: <PenLine size={14} /> }
```

Switching to Notes renders `<NotesView subjectId={...} chapterKey={...} />` in the canvas area.

---

## Annotation Rendering (client-side)

```jsx
// QuestionCard wraps each annotation target_text in a labelled span
<span data-annotate="step-3-highlight">given value text here</span>

// After render, AnnotationOverlay reads positions:
const el = containerRef.current.querySelector(`[data-annotate="${id}"]`)
const rect = el.getBoundingClientRect()
const containerRect = containerRef.current.getBoundingClientRect()
// Draw SVG shape relative to container
// highlight → <rect> fill with opacity 0.3
// circle    → <ellipse> stroke only
// arrow     → <line> + <polygon> arrowhead
```

No coordinates are stored server-side. If `target_text` is not found verbatim in
`question_text`, the annotation is silently skipped — it never breaks the experience.

---

## Step Reveal Flow

```
Initial: question card rendered, "Start solving" button visible

Tap "Next step":
  → reveal next SolutionStep (cumulative, previous steps stay visible)
  → if annotation present → add to activeAnnotations → SVG redraws
  → if voice_text present → play via TTS (existing service) or Web Speech fallback

After last step:
  → reveal AnswerReveal card showing `answer` field
  → "Try a similar question" placeholder (Phase 2)
```

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| LLM returns malformed JSON | Log warning, mark upload as `failed` with error message |
| LLM skips a question (ambiguous) | Silently omitted — other questions still saved |
| Tesseract not installed on server | Caught at startup, logged; falls back to Gemini Vision for all scanned pages |
| Gemini Vision rate limited | Retry with exponential backoff (max 3 attempts); mark page text as `[illegible]` if all fail |
| annotation `target_text` not found in DOM | Silently skip — step still renders without annotation |
| Upload file deleted before ingestion completes | Mark upload as `failed`; user can re-upload |
| Duplicate upload (same hash) | Return existing `problem_set_id` immediately, status 200 |

---

## Correctness Properties

### Property 1: Ready uploads always have problems
A notes upload with `upload_status = 'ready'` always has at least one `NotesProblem` row linked to its `NotesProblemSet`.

**Validates: Requirements REQ-4.1, REQ-4.5**

### Property 2: Step sequence order is gapless
`sequence_order` within a problem's steps starts at 1 and has no gaps — ensured at write time by enumerating the LLM output list.

**Validates: Requirements REQ-4.3**

### Property 3: Annotation target is always a substring
`annotation.target_text` is verified as a substring of the parent problem's `question_text` before writing. If not, the annotation is dropped and the step is saved without it.

**Validates: Requirements REQ-4.4, REQ-6.7**

### Property 4: Deleted uploads never appear in listings
Uploads with `upload_status = 'deleted'` are excluded from all `/available` endpoints — the query filters for `ready` and `ready_low_coverage` statuses only.

**Validates: Requirements REQ-2.5, REQ-7.1**

### Property 5: No server-side TTS for notes
Voice narration for notes steps is handled entirely on the frontend (Web Speech API or existing block audio). The notes ingestion pipeline never calls the TTS service.

**Validates: Requirements REQ-8.5, REQ-8.6**

---

## Testing Strategy

- **Unit**: `extract_notes_text` with typed PDF fixture, scanned PDF fixture, PPTX fixture
- **Unit**: `extract_problems_with_llm` with a mock LLM response; verify Pydantic validation rejects bad steps
- **Unit**: annotation `target_text` substring check at write time
- **Integration**: full ingestion pipeline with a real typed PDF containing 3 questions
- **Frontend**: `AnnotationOverlay` renders correct SVG shapes for each annotation type
- **Frontend**: step reveal advances correctly and cumulative display works

---

## Dependencies — New Only

| Dependency | Purpose | Status |
|---|---|---|
| `pytesseract` | OCR for scanned PDF pages | New — `pip install pytesseract` |
| `Pillow` | PDF page → image for Tesseract | Likely already present |
| `PyMuPDF (fitz)` | PDF page pixmap extraction | ✅ Already used |
| `tesseract-ocr` binary | System package for Tesseract | `apt install tesseract-ocr` on server / `brew install tesseract` locally |

---

## Migration Plan

1. Alembic migration: `upload_type` column + 3 new tables
2. `services/notes_ingestion_service.py`
3. `routers/notes.py` registered in `app.py`
4. 3 new ORM model files in `db/models/`
5. Schema additions in `models/schemas.py`
6. 5 new frontend components under `components/study/notes/`
7. Notes toggle added to workspace tab bar
8. New API functions in `lessonApi.js`


---

## Architecture

```
Student uploads notes file (PDF/PPT/DOC)
        ↓
POST /studyme/notes/upload  (returns upload_id immediately)
        ↓
SHA-256 hash check → if duplicate, return existing problem_set_id
        ↓
Background Task: NotesIngestionPipeline
  ├── Step 1: Detect file type
  │     ├── Typed PDF/PPT/DOC → existing text extractor (PyMuPDF / pptx / docx)
  │     └── Scanned PDF → per-page detection
  │           ├── Page has extractable text → use it
  │           ├── Tesseract confidence ≥ 60% → use Tesseract output
  │           └── Tesseract confidence < 60% → Gemini Vision (this page only)
  ├── Step 2: One LLM call → structured JSON of all problems + solution steps
  ├── Step 3: Validate output (Pydantic) → skip unparseable questions
  └── Step 4: Write to DB (NotesProblemSet → NotesProblems → NotesSolutionSteps)
        ↓
GET /studyme/notes/{upload_id}/status  (student polls until ready)
        ↓
Result stored in DB — original file deleted from disk
        ↓
All students in this subject see the problem set in the Notes toggle
        ↓
Student taps a question → GET /studyme/notes/problems/{problem_id}/steps
        ↓
Frontend renders step-by-step canvas (zero LLM calls)
```

---

## Data Model

### New column on existing table

```sql
-- chapter_uploads
ALTER TABLE chapter_uploads ADD COLUMN upload_type VARCHAR(16) NOT NULL DEFAULT 'chapter';
-- values: 'chapter' | 'notes'
```

### New tables

```sql
-- One per processed notes upload
CREATE TABLE notes_problem_sets (
  id            VARCHAR(36) PRIMARY KEY,
  upload_id     VARCHAR(36) NOT NULL REFERENCES chapter_uploads(id),
  subject_id    VARCHAR(64) NOT NULL,
  chapter_key   VARCHAR(128),          -- which chapter these notes relate to (nullable)
  title         VARCHAR(256),          -- human label e.g. "FM Numericals Unit 3"
  problem_count INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMP NOT NULL
);

-- One per extracted question
CREATE TABLE notes_problems (
  id              VARCHAR(36) PRIMARY KEY,
  problem_set_id  VARCHAR(36) NOT NULL REFERENCES notes_problem_sets(id),
  sequence_order  INTEGER NOT NULL,
  question_text   TEXT NOT NULL,
  topic           VARCHAR(256),        -- concept/topic this question belongs to
  given_values    TEXT,                -- JSON array of strings e.g. ["P = 1000", "r = 10%"]
  find            TEXT,                -- what to solve for
  method          VARCHAR(256),        -- formula/approach name
  difficulty      VARCHAR(16),         -- 'easy' | 'medium' | 'hard'
  answer          TEXT,                -- final answer string
  created_at      TIMESTAMP NOT NULL
);

-- One per step within a problem
CREATE TABLE notes_solution_steps (
  id              VARCHAR(36) PRIMARY KEY,
  problem_id      VARCHAR(36) NOT NULL REFERENCES notes_problems(id),
  sequence_order  INTEGER NOT NULL,
  step_type       VARCHAR(32) NOT NULL,  -- context|given|formula|calculation|result|insight
  content         TEXT NOT NULL,
  voice_text      TEXT,
  -- annotation: null, or JSON {type, target_text, color}
  -- type: 'highlight' | 'circle' | 'arrow'
  -- target_text: substring of question_text to annotate
  -- color: hex string e.g. '#FFD700'
  annotation      TEXT,
  created_at      TIMESTAMP NOT NULL
);
```

### Alembic migration

One new migration file covering:
- `upload_type` column on `chapter_uploads`
- Three new tables above

---

## Backend — New Endpoints

All under the existing `/studyme` router prefix.

```
POST   /studyme/notes/upload
GET    /studyme/notes/{upload_id}/status
GET    /studyme/notes/{subject_id}/available        -- list problem sets for a subject
GET    /studyme/notes/problems/{problem_id}/steps   -- full problem + steps
DELETE /studyme/notes/{upload_id}                   -- soft-delete (own uploads only)
POST   /studyme/notes/{upload_id}/restore           -- undo delete
```

### POST /studyme/notes/upload

- Same auth, file type, and size validation as chapter upload
- SHA-256 deduplication (file-level, not chapter_key-level)
- Requires `subject_id` and optional `chapter_key` + `title` form fields
- Returns `{upload_id, status: "pending"}`

### Background: NotesIngestionPipeline

```python
def run_notes_ingestion(upload_id: str):
    # 1. Load upload record
    # 2. Extract text (see Text Extraction below)
    # 3. Call LLM once → get structured problems JSON
    # 4. Validate with Pydantic
    # 5. Write NotesProblemSet + NotesProblems + NotesSolutionSteps
    # 6. Update upload status to "ready"
    # 7. Delete file from disk
```

---

## Text Extraction Strategy

```python
def extract_notes_text(file_path: str, file_ext: str) -> str:
    if file_ext in ('.pptx', '.ppt'):
        return extract_from_pptx(file_path)      # existing parser
    if file_ext in ('.docx', '.doc'):
        return extract_from_docx(file_path)      # existing parser
    if file_ext == '.pdf':
        return extract_from_pdf_smart(file_path) # new, see below

def extract_from_pdf_smart(file_path: str) -> str:
    doc = fitz.open(file_path)
    pages_text = []
    for page in doc:
        text = page.get_text().strip()
        if len(text) > 100:
            pages_text.append(text)              # typed page — use directly
        else:
            pages_text.append(ocr_page(page))    # scanned page — run OCR

def ocr_page(page) -> str:
    img = page.get_pixmap(dpi=200)
    pil_img = Image.frombytes("RGB", [img.width, img.height], img.samples)
    result = pytesseract.image_to_data(pil_img, output_type=Output.DICT)
    confidence = mean of non-zero conf values
    if confidence >= 60:
        return pytesseract.image_to_string(pil_img)
    else:
        return gemini_vision_ocr(pil_img)        # one Gemini call for this page only
```

---

## LLM Extraction Prompt (one call per upload)

The extracted text is sent to Gemini with a structured prompt:

```
You are an expert at extracting and teaching mathematical/accounting problems.

Given the following text extracted from student notes or a question bank,
extract EVERY question or numerical problem you can find.

For each problem return:
- question_text: the full question exactly as written
- topic: which concept this belongs to (e.g. "Working Capital", "Cost of Debt")
- given_values: list of values/information provided in the question
- find: what the student needs to calculate or answer
- method: which formula or approach to use (name it)
- difficulty: easy | medium | hard
- answer: the final answer if present in the material, else null
- solution_steps: ordered list of teaching steps, each with:
    - step_type: context | given | formula | calculation | result | insight
    - content: explanation text (teach, don't just state)
    - voice_text: how a teacher would say this out loud
    - annotation: null OR {type: highlight|circle|arrow, target_text: "...", color: "#..."}
      where target_text is an exact substring of question_text

If a question is ambiguous or illegible, skip it.
Return valid JSON only.

TEXT:
{extracted_text}
```

Output is validated against a Pydantic schema. Invalid items are skipped, not rejected wholesale.

---

## Pydantic Schemas (backend)

```python
class NotesSolutionStepSchema(BaseModel):
    step_type: Literal["context","given","formula","calculation","result","insight"]
    content: str
    voice_text: str | None = None
    annotation: dict | None = None  # {type, target_text, color}

class NotesProblemSchema(BaseModel):
    question_text: str
    topic: str | None = None
    given_values: list[str] = []
    find: str | None = None
    method: str | None = None
    difficulty: Literal["easy","medium","hard"] = "medium"
    answer: str | None = None
    solution_steps: list[NotesSolutionStepSchema] = []

class NotesExtractionResult(BaseModel):
    problems: list[NotesProblemSchema]
```

---

## API Response Schemas

```python
class NotesProblemSetOut(BaseModel):
    upload_id: str
    problem_set_id: str
    subject_id: str
    chapter_key: str | None
    title: str | None
    problem_count: int
    uploaded_by_label: str      # "you" | "a classmate"
    uploaded_by_name: str | None

class NotesProblemOut(BaseModel):
    id: str
    sequence_order: int
    question_text: str
    topic: str | None
    difficulty: str
    method: str | None
    answer: str | None          # revealed after final step on frontend
    steps: list[NotesSolutionStepOut]

class NotesSolutionStepOut(BaseModel):
    id: str
    sequence_order: int
    step_type: str
    content: str
    voice_text: str | None
    annotation: dict | None     # {type, target_text, color} or null
```

---

## Frontend — Component Structure

```
WorkspacePlayer (existing)
  └── Tab bar: Canvas | Source | Resources | Notes  ← new toggle added here
        └── NotesView  (new)
              ├── NotesProblemSetList  — list of uploaded problem sets
              │     └── NotesProblemRow  — question preview + difficulty badge
              └── ProblemSolverCanvas  — main teaching view
                    ├── QuestionCard  — renders question_text with annotation target spans
                    │     └── AnnotationOverlay (SVG)  — draws highlights/circles/arrows
                    ├── StepRevealList  — cumulative step-by-step reveal
                    │     └── SolutionStep  — step card with type badge + narration
                    └── AnswerReveal  — shown after last step
```

### New files

```
frontend/src/components/study/notes/
  NotesView.jsx
  NotesProblemSetList.jsx
  ProblemSolverCanvas.jsx
  QuestionCard.jsx
  AnnotationOverlay.jsx
  SolutionStep.jsx
```

### New API calls in lessonApi.js

```js
getNotesForSubject({ token, subjectId })
getNotesProblem({ token, problemId })
uploadNotes({ token, subjectId, chapterKey, title, file })
deleteNotes({ token, uploadId })
restoreNotes({ token, uploadId })
```

---

## Annotation Rendering (client-side, no coordinates stored)

```jsx
// QuestionCard.jsx — finds target_text in rendered question and wraps it
function QuestionCard({ question, activeAnnotations }) {
  // Split question_text around annotation target_text substrings
  // Wrap each target in a <span data-annotate-id="...">
  // After render, AnnotationOverlay reads getBoundingClientRect() of each span
  // and draws SVG shapes relative to the card container
}

// AnnotationOverlay.jsx
function AnnotationOverlay({ annotations, containerRef }) {
  // Absolute-positioned SVG covering the QuestionCard
  // For each annotation:
  //   highlight → <rect> with fill opacity 0.3
  //   circle    → <ellipse> with stroke, no fill
  //   arrow     → <line> + <polygon> arrowhead
}
```

No pixel coordinates are stored on the server. All positioning happens at render time using
the DOM. If the target_text is not found verbatim, the annotation is silently skipped.

---

## Step Reveal Flow

```
Initial state: show question card + "Start solving" button

On "Next step" tap:
  → reveal next SolutionStep
  → if step has annotation → add to activeAnnotations → AnnotationOverlay redraws
  → if step has voice_text → play TTS (reuse existing getBlockAudioUrl or Web Speech fallback)
  → previous steps remain visible

After last step:
  → reveal AnswerReveal card
  → "Try a similar question" placeholder (Phase 2)
```

---

## Deduplication Logic

- **File-level** (SHA-256): same bytes = same result, return immediately regardless of uploader
- **No chapter_key dedup**: multiple different notes files for same chapter all coexist
- `is_public` flag does not apply to notes uploads

---

## What is Reused (no changes needed)

| Component | Reused as-is |
|---|---|
| `chapter_uploads` table | ✅ + one new column |
| Upload endpoint pattern | ✅ new endpoint, same structure |
| SHA-256 deduplication | ✅ copy pattern |
| Soft-delete + restore | ✅ copy pattern |
| TTS service | ✅ no changes |
| Session/auth (`_resolve_roll_number`) | ✅ no changes |
| Text extractors (PyMuPDF, pptx, docx) | ✅ no changes |
| Gemini LLM client | ✅ new prompt, same client |
| `StudentRegistry` display name lookup | ✅ no changes |

---

## Dependencies — New Only

| Dependency | Purpose | Already installed? |
|---|---|---|
| `pytesseract` | OCR for scanned PDF pages | Likely not — one pip install |
| `Pillow` | Convert PDF page to image for Tesseract | Likely yes (common dep) |
| `PyMuPDF (fitz)` | PDF page pixmap for OCR | ✅ Already used |

Tesseract binary must be installed on the server (`apt install tesseract-ocr`).
On the development machine: `brew install tesseract`.

---

## Migration Plan

1. New Alembic migration: `upload_type` column + 3 new tables
2. New ingestion service: `services/notes_ingestion_service.py`
3. New router: `routers/notes.py` (registered in `app.py`)
4. New frontend components under `components/study/notes/`
5. Notes toggle added to existing workspace tab bar
6. New API functions added to `lessonApi.js`
