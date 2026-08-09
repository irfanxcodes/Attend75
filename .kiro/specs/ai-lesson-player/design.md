# AI Lesson Player — Design

## Overview

This document describes the technical design for the AI Lesson Player feature inside Attend75's StudyMe module. The system ingests a chapter PDF once, extracts structured concepts using an LLM, compiles a reusable Teaching Script stored in PostgreSQL, and plays it back to every student without further LLM calls. LLM is only invoked for live student doubts or new uploads. A multi-provider fallback chain across free-tier APIs ensures zero cost at current scale. RAG (Retrieval-Augmented Generation) is used for doubt answering to ground answers in the exact uploaded course material.

## Architecture

```
Student uploads PDF
        ↓
POST /studyme/chapters/upload  (returns job_id immediately)
        ↓
Background Task: IngestionPipeline
  ├── Step 1: pdfplumber + PyMuPDF → RawDocumentModel (text, headings, tables, formulas)
  ├── Step 2: Chunk text → embed with free embedding model → store in pgvector
  ├── Step 3: Gemini Flash via LiteLLM + instructor → ConceptList (validated Pydantic)
  ├── Step 4: CurriculumCompiler → ordered ConceptGraph (deterministic Python)
  ├── Step 5: Coverage Validation → score, auto-retry if below threshold
  └── Step 6: LessonCompiler → TeachingScript (blocks stored in PostgreSQL)
        ↓
GET /studyme/chapters/:id/status  (student polls until ready)
        ↓
Lesson is ready — stored in DB, original PDF deleted
        ↓
All students of this subject see "AI Lesson ready" on lesson card
        ↓
Student clicks "Start AI Lesson"
        ↓
GET /studyme/lessons/:lesson_id/script  (returns full TeachingScript)
        ↓
LessonPlayer.jsx plays blocks sequentially (no more API calls)
        ↓
Student asks doubt → POST /studyme/lessons/:lesson_id/doubt
        ↓
RAG: embed question → retrieve top-3 chunks from pgvector → send to LLM with context
        ↓
LLM (from fallback chain) answers grounded in course material → injected as temp block
        ↓
Lesson resumes
```

```
Student uploads PDF
        ↓
POST /studyme/chapters/upload  (returns job_id immediately)
        ↓
Background Task: IngestionPipeline
  ├── Step 1: pdfplumber → RawDocumentModel (text, headings, tables, formulas)
  ├── Step 2: Gemini Flash via LiteLLM + instructor → ConceptList (validated Pydantic)
  ├── Step 3: CurriculumCompiler → ordered ConceptGraph (deterministic Python)
  ├── Step 4: Coverage Validation → score, auto-retry if below threshold
  └── Step 5: LessonCompiler → TeachingScript (blocks stored in PostgreSQL)
        ↓
GET /studyme/chapters/:id/status  (student polls until ready)
        ↓
Lesson is ready — stored in DB, original PDF deleted
        ↓
All students of this subject see "AI Lesson ready" on lesson card
        ↓
Student clicks "Start AI Lesson"
        ↓
GET /studyme/lessons/:lesson_id/script  (returns full TeachingScript)
        ↓
LessonPlayer.jsx plays blocks sequentially (no more API calls)
        ↓
Student asks doubt → POST /studyme/lessons/:lesson_id/doubt
        ↓
Groq (Llama 3.3 70B) answers in context → injected as temporary block
        ↓
Lesson resumes
```

---

## Components and Interfaces

### Backend Services
- `IngestionPipeline` — orchestrates all ingestion steps, runs as BackgroundTask
- `CurriculumCompiler` — deterministic topological sort, no LLM
- `LessonCompiler` — generates Teaching Script blocks from ordered concepts
- `RAGService` — chunk storage, embedding, and retrieval using pgvector
- `DoubtService` — RAG retrieval + LLM call for live doubt answering
- `LLMRouter` — LiteLLM wrapper with multi-provider fallback chain

### Frontend Components
- `LessonPlayer.jsx` — full-screen page, hides bottom nav
- `NotebookCanvas.jsx` — the writing canvas, dark notebook aesthetic
- `BlockRenderer.jsx` — renders each block type based on `block_type`
- `DoubtPanel.jsx` — slide-up panel, text + Web Speech input
- `useLessonPlayer.js` — state machine hook (IDLE→PLAYING→PAUSED→WAITING_QUIZ→DOUBT_OPEN→ANSWERING→COMPLETE)
- `useWebSpeech.js` — TTS + STT abstraction over Web Speech API

### API Surface (New Endpoints)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/studyme/chapters/upload` | Upload PDF, returns job_id |
| GET | `/studyme/chapters/:chapter_key/status` | Poll ingestion status |
| GET | `/studyme/chapters/:subject_id/available` | List chapters with AI lessons |
| GET | `/studyme/lessons/:lesson_id/script` | Fetch Teaching Script blocks |
| POST | `/studyme/lessons/:lesson_id/doubt` | Ask doubt, get RAG-grounded answer |
| POST | `/studyme/lessons/:lesson_id/progress` | Save student progress |
| GET | `/studyme/lessons/:lesson_id/progress` | Restore student progress |

Admin endpoints added to existing `/admin` router:
| GET | `/admin/studyme/ingestions` | All uploads + status + coverage |
| POST | `/admin/studyme/ingestions/:id/reprocess` | Trigger re-ingestion |
| PATCH | `/admin/studyme/ingestions/:id/set-active` | Set active version |

---

## Data Models

### `chapter_uploads`
Tracks uploaded PDFs and their processing state.

```
id                  UUID primary key
subject_id          VARCHAR  -- maps to existing StudyMe subject IDs (fm, qbm, ob, ccfa)
chapter_key         VARCHAR  -- e.g. "fm-chapter-1-working-capital"
uploaded_by         VARCHAR  -- roll number of uploader
upload_status       ENUM     -- pending | processing | ready | failed
coverage_score      FLOAT    -- 0.0-1.0, from validation step
retry_count         INT      -- how many extraction retries were attempted
file_path           VARCHAR  -- temp path, set to NULL after deletion
file_deleted_at     TIMESTAMP
processed_at        TIMESTAMP
error_message       TEXT     -- if failed
created_at          TIMESTAMP
```

### `ai_concepts`
Each extracted teachable concept from a chapter.

```
id                  UUID primary key
upload_id           UUID FK → chapter_uploads
subject_id          VARCHAR
chapter_key         VARCHAR
sequence_order      INT      -- teaching order determined by CurriculumCompiler
title               VARCHAR
explanation         TEXT
definition          TEXT
keywords            JSONB    -- list of strings
formulas            JSONB    -- list of {name, text, latex}
examples            JSONB    -- list of strings
misconceptions      JSONB    -- list of strings
exam_questions      JSONB    -- list of strings
source_page         INT
source_heading      VARCHAR
prerequisites       JSONB    -- list of concept titles (resolved at compile time)
created_at          TIMESTAMP
```

### `lesson_scripts`
One row per chapter upload — the compiled Teaching Script.

```
id                  UUID primary key
upload_id           UUID FK → chapter_uploads
subject_id          VARCHAR
chapter_key         VARCHAR
title               VARCHAR  -- e.g. "Chapter 1: Working Capital Management"
total_blocks        INT
estimated_duration_seconds INT
version             INT      -- incremented on reprocess
is_active           BOOLEAN  -- admin toggles which version is shown
created_at          TIMESTAMP
```

### `lesson_blocks`
Individual blocks of the Teaching Script. One lesson has many blocks.

```
id                  UUID primary key
script_id           UUID FK → lesson_scripts
concept_id          UUID FK → ai_concepts
sequence_order      INT
block_type          ENUM  -- narration | keyword_highlight | definition | formula
                            | example | diagram_spec | quiz | recap
content             TEXT  -- main content (text, mermaid spec, formula LaTeX, question)
voice_text          TEXT  -- what Web Speech reads aloud
expected_answer     TEXT  -- for quiz blocks only
created_at          TIMESTAMP
```

### `student_lesson_progress`
Per-student progress through a lesson. Replaces localStorage progress for AI lessons.

```
id                  UUID primary key
roll_number         VARCHAR
script_id           UUID FK → lesson_scripts
last_block_index    INT      -- where they left off
completed           BOOLEAN
concepts_seen       JSONB    -- list of concept_ids
quiz_results        JSONB    -- {block_id: "correct"|"incorrect"|"skipped"}
doubts_asked        INT
started_at          TIMESTAMP
completed_at        TIMESTAMP
updated_at          TIMESTAMP
```

---

## Backend Services

### `services/lesson_ingestion_service.py`
Owns the full pipeline. Called as a FastAPI BackgroundTask.

```python
class IngestionPipeline:
    def run(upload_id: str) -> None
    def _parse_pdf(file_path: str) -> RawDocumentModel
    def _extract_concepts(raw: RawDocumentModel) -> list[ConceptSchema]
    def _compile_curriculum(concepts: list[ConceptSchema]) -> list[ConceptSchema]  # ordered
    def _validate_coverage(concepts: list, raw: RawDocumentModel) -> float  # score 0-1
    def _compile_lesson(concepts: list[ConceptSchema], upload_id: str) -> str  # returns script_id
    def _delete_pdf(file_path: str) -> None
```

### `services/curriculum_compiler.py`
Deterministic Python. No LLM.

```python
class CurriculumCompiler:
    def compile(concepts: list[ConceptSchema]) -> list[ConceptSchema]:
        # Topological sort based on prerequisite relationships
        # Concepts with no prerequisites come first
        # Returns ordered list
```

### `services/lesson_compiler.py`
Takes ordered concepts, generates Teaching Script blocks. Calls LLM once for voice_text generation.

```python
class LessonCompiler:
    def compile(concepts: list[ConceptSchema], script_id: str) -> list[LessonBlock]:
        # For each concept, generate blocks:
        # 1. narration block (concept explanation, simplified)
        # 2. keyword_highlight block (keywords list)
        # 3. definition block (if definition exists)
        # 4. formula block (if formulas exist, one block per formula)
        # 5. example block (if examples exist)
        # 6. diagram_spec block (if concept has relationships worth visualizing)
        # 7. quiz block (one recall question from exam_questions list)
        # For last concept in chapter: recap block
```

### `services/doubt_service.py`
Handles live student doubts during playback.

```python
def answer_doubt(
    question: str,
    current_concept: ConceptSchema,
    chapter_context: str,  # abbreviated concept titles for context window
    roll_number: str,
    script_id: str
) -> str:  # answer text
    # Calls Groq via LiteLLM with tight prompt:
    # "You are a university professor teaching {subject}. 
    #  The student is currently studying: {current_concept.title}.
    #  Chapter context: {chapter_context}
    #  Student question: {question}
    #  Answer in max 80 words. Stay faithful to the course material."
```

---

## LLM Configuration — Multi-Provider Fallback Chain

LiteLLM handles all routing. We configure two independent fallback chains — one for ingestion (heavy, structured extraction, called once per chapter) and one for doubts (light, fast, called live).

If a provider returns a rate-limit error (HTTP 429) or quota exhaustion, LiteLLM automatically tries the next provider in the chain. No manual switching needed.

```python
# backend/services/llm_config.py

# ── INGESTION CHAIN (extraction + lesson compilation) ──────────────────────
# Called once per chapter upload. Needs large context window + structured output.
# Priority: best free model first, smallest/fastest last.
INGESTION_FALLBACK_CHAIN = [
    "gemini/gemini-1.5-flash",           # Google AI Studio — 1M tokens/day free, 1M context
    "gemini/gemini-1.5-flash-8b",        # Fallback: smaller Gemini, same free quota
    "openrouter/mistralai/mistral-7b-instruct:free",  # OpenRouter free tier
    "groq/llama-3.1-70b-versatile",      # Groq — fast, generous free tier
    "cerebras/llama3.1-70b",             # Cerebras — very fast inference, free tier
    "github/gpt-4o-mini",               # GitHub Models — free with GitHub account
    "cloudflare/@cf/meta/llama-3.1-8b-instruct",  # Cloudflare Workers AI free
]

# ── DOUBT CHAIN (live student questions during lesson) ─────────────────────
# Called per doubt. Needs low latency (<2s). Context is small (retrieved chunks only).
DOUBT_FALLBACK_CHAIN = [
    "groq/llama-3.3-70b-versatile",      # Groq — fastest inference, free tier
    "cerebras/llama3.3-70b",             # Cerebras — near-instant, free tier
    "groq/llama-3.1-70b-versatile",      # Groq fallback model
    "gemini/gemini-1.5-flash",           # Google AI Studio fallback
    "openrouter/mistralai/mistral-7b-instruct:free",
    "cloudflare/@cf/meta/llama-3.1-8b-instruct",
]

# ── EMBEDDING CHAIN (for RAG chunk indexing) ──────────────────────────────
# Used once per chunk during ingestion to generate embeddings for pgvector.
EMBEDDING_FALLBACK_CHAIN = [
    "gemini/text-embedding-004",         # Google AI Studio — free, 768 dimensions
    "cohere/embed-multilingual-light-v3.0",  # Cohere free tier
    "mistral/mistral-embed",             # Mistral AI Studio free tier
]
```

### Provider API Keys (all free tiers)
```
GEMINI_API_KEY=          # aistudio.google.com — free 1M tokens/day
GROQ_API_KEY=            # console.groq.com — free tier
CEREBRAS_API_KEY=        # cloud.cerebras.ai — free tier
OPENROUTER_API_KEY=      # openrouter.ai — free models available
GITHUB_TOKEN=            # github.com settings — free with account
COHERE_API_KEY=          # dashboard.cohere.com — free trial
MISTRAL_API_KEY=         # console.mistral.ai — free tier
CLOUDFLARE_API_TOKEN=    # cloudflare workers AI — free 10k requests/day
```

LiteLLM reads these from environment variables automatically. No code changes needed when adding a new provider — just add the key and update the fallback list.

---

## RAG Design (Retrieval-Augmented Generation)

RAG is used **only for doubt answering**, not during ingestion or lesson playback.

### Why RAG for doubts?
When a student asks a doubt mid-lesson, we want the answer to be grounded in the exact uploaded course material — not general LLM knowledge. Without RAG, the LLM might contradict the textbook. With RAG, it retrieves the exact relevant passages and answers from them.

### How it works

```
Ingestion (once per chapter):
  PDF text
    ↓ split into chunks (400 tokens, 50 token overlap)
    ↓ embed each chunk using free embedding model
    ↓ store (chunk_text, embedding_vector, chunk_metadata) in pgvector

Doubt answering (per question):
  Student question
    ↓ embed the question using same embedding model
    ↓ pgvector similarity search → top 3 most relevant chunks
    ↓ assemble context: [chunk1_text + chunk2_text + chunk3_text]
    ↓ call LLM via fallback chain with:
        "Answer based only on this course material: {context}
         Question: {question}
         Answer in max 80 words."
    ↓ return answer
```

### pgvector Setup
pgvector is a PostgreSQL extension — no new database or service needed.

```sql
-- Enable extension (once, in migration)
CREATE EXTENSION IF NOT EXISTS vector;
```

### New Table: `chapter_chunks`
```
id                  UUID primary key
upload_id           UUID FK → chapter_uploads
chunk_index         INT           -- position in document
chunk_text          TEXT          -- raw text of this chunk
embedding           vector(768)   -- from text-embedding-004 (768 dims)
source_page         INT
source_heading      VARCHAR
created_at          TIMESTAMP
```

### RAG Service
```python
# backend/services/rag_service.py

class RAGService:
    def index_chapter(upload_id: str, chunks: list[TextChunk]) -> None:
        # embed each chunk, store in chapter_chunks table
        
    def retrieve(question: str, upload_id: str, top_k: int = 3) -> list[str]:
        # embed question, run pgvector cosine similarity search
        # return top_k chunk texts
        
    def _embed(text: str) -> list[float]:
        # calls embedding model via LiteLLM fallback chain
        # returns 768-dim vector
```

Similarity query (PostgreSQL):
```sql
SELECT chunk_text
FROM chapter_chunks
WHERE upload_id = :upload_id
ORDER BY embedding <=> :query_embedding  -- pgvector cosine distance operator
LIMIT 3;
```

---

## Concept Extraction Prompt (Pydantic + instructor)

```python
class FormulaSchema(BaseModel):
    name: str
    text: str           # plain text version
    latex: str | None   # LaTeX version if mathematical

class ConceptSchema(BaseModel):
    title: str
    explanation: str    # max 150 words, simple language
    definition: str | None
    keywords: list[str]
    formulas: list[FormulaSchema]
    examples: list[str]
    misconceptions: list[str]
    exam_questions: list[str]
    source_page: int
    source_heading: str
    prerequisites: list[str]  # titles of other concepts this depends on

class ChapterConceptList(BaseModel):
    chapter_title: str
    concepts: list[ConceptSchema]  # ordered is fine, we'll reorder via compiler
```

Prompt template:
```
You are an educational content architect working with Indian university BBA course material.

Extract every teachable concept from this chapter. 

Rules:
- Every heading and sub-heading must map to at least one concept
- Every definition must be captured exactly as written
- Every formula must be captured with LaTeX if it is mathematical
- Explanations must be simplified but faithful to the source material
- Do NOT add concepts from outside this document
- Do NOT summarize — extract everything

Chapter text:
{chapter_text}
```

---

## Frontend Architecture

### New Files

```
frontend/src/
├── pages/
│   ├── LessonPlayer.jsx              # Main AI lesson player page
│   └── ChapterUpload.jsx             # PDF upload page (linked from StudyLessons)
├── components/lessonplayer/
│   ├── NotebookCanvas.jsx            # The writing canvas area
│   ├── BlockRenderer.jsx             # Renders each block type
│   ├── NarrationBlock.jsx            # Animated text + voice
│   ├── FormulaBlock.jsx              # KaTeX renderer (reuses MathFormula.jsx)
│   ├── DiagramBlock.jsx              # Mermaid.js renderer
│   ├── QuizBlock.jsx                 # Pause + question + answer reveal
│   ├── KeywordHighlight.jsx          # Highlighted keyword chips
│   ├── DoubtPanel.jsx                # Slide-up doubt input (text + voice)
│   ├── LessonControls.jsx            # Play/Pause/Doubt floating buttons
│   └── LessonSummary.jsx             # End-of-chapter summary screen
├── hooks/
│   ├── useLessonPlayer.js            # Player state machine
│   ├── useWebSpeech.js               # TTS + STT abstraction
│   └── useLessonProgress.js          # Progress sync to backend
└── services/
    └── lessonApi.js                  # API calls for lesson script, doubts, progress
```

### Player State Machine (`useLessonPlayer.js`)

```
States:
  IDLE          → lesson loaded, not started
  PLAYING       → blocks playing sequentially
  PAUSED        → student paused
  WAITING_QUIZ  → quiz block shown, waiting for student response
  DOUBT_OPEN    → student opened doubt panel
  ANSWERING     → doubt submitted, waiting for API response
  COMPLETE      → all blocks done, summary shown

Transitions:
  IDLE → PLAYING          : student taps Start
  PLAYING → PAUSED        : student taps Pause
  PAUSED → PLAYING        : student taps Resume
  PLAYING → WAITING_QUIZ  : block_type === 'quiz' reached
  WAITING_QUIZ → PLAYING  : student submits answer (any)
  PLAYING → DOUBT_OPEN    : student taps Doubt button
  PAUSED → DOUBT_OPEN     : student taps Doubt button
  DOUBT_OPEN → ANSWERING  : student submits doubt
  ANSWERING → PLAYING     : answer received, injected as temp block
  PLAYING → COMPLETE      : last block reached
```

### Route Changes (`AppRoutes.jsx`)

Add two new routes inside `/app`:
```
/app/study/:subjectId/:lessonId/play    → LessonPlayer
/app/study/:subjectId/upload            → ChapterUpload
```

`StudyLessonDetail.jsx` gains a new "Start AI Lesson" button if `lesson.hasAiScript === true`. Clicking it navigates to `/play`. No other changes to existing pages.

---

## API Endpoints (New)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/studyme/chapters/upload` | Upload chapter PDF, returns job_id |
| GET | `/studyme/chapters/:chapter_key/status` | Poll ingestion status |
| GET | `/studyme/chapters/:subject_id/available` | List chapters with AI lessons for a subject |
| GET | `/studyme/lessons/:lesson_id/script` | Fetch full Teaching Script (blocks) |
| POST | `/studyme/lessons/:lesson_id/doubt` | Ask a doubt, returns answer text |
| POST | `/studyme/lessons/:lesson_id/progress` | Save student progress |
| GET | `/studyme/lessons/:lesson_id/progress` | Restore student progress |

Admin endpoints (added to existing `/admin` router):
| GET | `/admin/studyme/ingestions` | All chapter uploads + status |
| POST | `/admin/studyme/ingestions/:id/reprocess` | Trigger reprocessing |
| PATCH | `/admin/studyme/ingestions/:id/set-active` | Mark a version as active |

---

## New Dependencies

### Backend (`requirements.txt` additions)
```
litellm==1.40.0        # LLM gateway — routes to all providers with fallback
instructor==1.3.0      # Structured LLM output with Pydantic validation
pymupdf==1.24.0        # PDF table/image detection alongside pdfplumber
pgvector==0.3.2        # pgvector Python client for SQLAlchemy integration
```

### Frontend (`package.json` additions)
```json
"framer-motion": "^11.3.0",
"mermaid": "^10.9.0"
```

### Backend Environment Variables (new)
```
GEMINI_API_KEY=
GROQ_API_KEY=
CEREBRAS_API_KEY=
OPENROUTER_API_KEY=
GITHUB_TOKEN=
COHERE_API_KEY=
MISTRAL_API_KEY=
CLOUDFLARE_API_TOKEN=
INGESTION_COVERAGE_THRESHOLD=0.70
MAX_UPLOAD_SIZE_MB=20
```

---

## Error Handling

| Scenario | Handling |
|----------|----------|
| All LLM providers rate-limited simultaneously | Mark job as `failed`, set `error_message`, notify admin. Student sees "Processing failed, try again later." |
| PDF has no extractable text (scanned image PDF) | PyMuPDF detects this, returns error to student: "This PDF appears to be a scanned image. Please upload a text-based PDF." |
| Concept extraction coverage below threshold | Auto-retry once with a more aggressive prompt. If still below threshold after retry, publish anyway with a warning flag. |
| Embedding API fails during chunk indexing | Log the failure, mark chapter as `ready_no_rag`. Lesson still works but doubts fall back to general LLM without retrieval context. |
| Student asks doubt, all doubt providers fail | Return a graceful message: "I couldn't reach the AI right now. Please try again in a moment." Lesson does not crash. |
| Student uploads same chapter as existing one | Return existing `lesson_id` immediately. No reprocessing. Uploader is noted as secondary uploader. |
| PDF upload exceeds size limit | Reject at upload endpoint with clear message before any processing starts. |
| Background task crashes mid-ingestion | Status stays `processing`. A daily cleanup job resets stuck `processing` jobs older than 30 minutes back to `pending` for retry. |

---

## Testing Strategy

### Pipeline Validation (before any frontend work)
1. Run `IngestionPipeline` as a standalone Python script on FM Chapter 1 PDF
2. Manually inspect the output `ConceptSchema` list — verify all headings are covered
3. Check coverage score output — must be ≥ 0.70
4. Inspect generated `lesson_blocks` — verify narration, quiz, formula blocks are correct
5. Run a test RAG retrieval — ask a question, verify top-3 chunks are relevant

### Backend Unit Tests
- `CurriculumCompiler.compile()` — given concepts with circular deps, verify graceful handling
- `RAGService.retrieve()` — mock pgvector, verify query construction
- `DoubtService.answer_doubt()` — mock LiteLLM, verify prompt construction and 80-word constraint
- Coverage validator — given a raw doc with 5 headings and 3 extracted concepts, verify score = 0.6

### Frontend Integration Tests
- `useLessonPlayer` state machine — verify all transitions fire correctly
- `useWebSpeech` — mock Web Speech API, verify TTS called with correct voice_text per block
- `QuizBlock` — verify playback pauses on quiz block and resumes after answer

### End-to-End Test
- Upload FM Chapter 1 → wait for ready status → open LessonPlayer → play through all blocks → ask one doubt → verify answer → complete lesson → verify progress saved → reload page → verify progress restored

---

## What We Borrow vs What We Own

| Component | Borrowed from | What we own |
|-----------|--------------|-------------|
| Two-stage pipeline idea | OpenMAIC | Our implementation in FastAPI |
| Scene/block lesson structure | OpenTutor block model | Our `lesson_blocks` table schema |
| Multi-agent dialogue inspiration | OpenMAIC | Our `doubt_service.py` |
| Adaptive teaching flow | OpenTutor | Our `useLessonPlayer.js` state machine |
| Whiteboard canvas concept | OpenMAIC | Our `NotebookCanvas.jsx` with Framer Motion |
| Socratic quiz questioning | PingPong inspiration | Our `QuizBlock.jsx` |

We write all code ourselves. We embed nothing. No license issues.

---

## Phase 1 Pilot Plan

Before building everything, validate the pipeline with one test:

1. Take the existing `/public/pdfs/fm.pdf` (Financial Management)
2. Extract pages 1–15 (Chapter 1: Working Capital)
3. Run ingestion pipeline manually as a Python script
4. Inspect the output JSON — are concepts correct? Is coverage good?
5. Test RAG retrieval with 3 sample questions
6. If yes, build the DB models and wire up the API
7. Build the frontend player last

If the concept extraction quality is poor at step 4, fix the prompt before building anything else. The pipeline quality gate comes first.
