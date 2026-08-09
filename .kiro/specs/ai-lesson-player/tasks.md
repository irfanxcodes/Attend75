# AI Lesson Player — Implementation Tasks

## Task 1: Backend Dependencies & Configuration
- [ ] Add `litellm==1.40.0`, `instructor==1.3.0`, `pymupdf==1.24.0`, `pgvector==0.3.2` to `backend/requirements.txt`
- [ ] Add all provider API key placeholders to `backend/.env` (GEMINI_API_KEY, GROQ_API_KEY, CEREBRAS_API_KEY, OPENROUTER_API_KEY, GITHUB_TOKEN, COHERE_API_KEY, MISTRAL_API_KEY, CLOUDFLARE_API_TOKEN, INGESTION_COVERAGE_THRESHOLD, MAX_UPLOAD_SIZE_MB)
- [ ] Create `backend/services/llm_config.py` with `INGESTION_FALLBACK_CHAIN`, `DOUBT_FALLBACK_CHAIN`, and `EMBEDDING_FALLBACK_CHAIN` constants
- [ ] Create `backend/services/llm_router.py` — wraps LiteLLM with fallback chain execution, logs which provider was used, handles 429 errors gracefully

## Task 2: Database Models & Migration
- [ ] Enable pgvector extension in a new Alembic migration: `CREATE EXTENSION IF NOT EXISTS vector`
- [ ] Create `backend/db/models/chapter_upload.py` — `chapter_uploads` table
- [ ] Create `backend/db/models/ai_concept.py` — `ai_concepts` table
- [ ] Create `backend/db/models/lesson_script.py` — `lesson_scripts` table
- [ ] Create `backend/db/models/lesson_block.py` — `lesson_blocks` table
- [ ] Create `backend/db/models/chapter_chunk.py` — `chapter_chunks` table with `vector(768)` column
- [ ] Create `backend/db/models/student_lesson_progress.py` — `student_lesson_progress` table
- [ ] Create Alembic migration `backend/alembic/versions/YYYYMMDD_0016_create_ai_lesson_tables.py`
- [ ] Run migration and verify all tables and pgvector extension created correctly

## Task 3: Pydantic Schemas
- [ ] Add `FormulaSchema`, `ConceptSchema`, `ChapterConceptList` to `backend/models/schemas.py`
- [ ] Add `LessonBlockOut`, `LessonScriptOut`, `DoubtRequest`, `DoubtResponse`, `ProgressUpdate`, `IngestionStatusOut` schemas

## Task 4: Ingestion Pipeline — PDF Parsing
- [ ] Create `backend/services/lesson_ingestion_service.py` with `IngestionPipeline` class
- [ ] Implement `_parse_pdf()` using pdfplumber for text/tables + PyMuPDF for metadata and heading detection
- [ ] Implement `_chunk_text()` — split extracted text into 400-token chunks with 50-token overlap, preserve source_page and source_heading per chunk
- [ ] Test: run `_parse_pdf()` and `_chunk_text()` on the existing FM chapter PDF, inspect output

## Task 5: RAG Service — Embedding & Indexing
- [ ] Create `backend/services/rag_service.py` with `RAGService` class
- [ ] Implement `_embed(text)` — calls embedding model via LiteLLM embedding fallback chain
- [ ] Implement `index_chapter(upload_id, chunks)` — embeds each chunk, stores in `chapter_chunks` table
- [ ] Implement `retrieve(question, upload_id, top_k=3)` — embeds question, runs pgvector cosine similarity query, returns top-k chunk texts
- [ ] Test: index FM chapter chunks, run 3 sample questions, verify retrieved chunks are relevant

## Task 6: Ingestion Pipeline — Concept Extraction
- [ ] Implement `_extract_concepts()` in `IngestionPipeline` using LiteLLM ingestion chain + instructor
- [ ] Write the extraction prompt (faithful to course material, no summarization, all headings must map to concepts)
- [ ] Test: run extraction on FM Chapter 1 text, inspect concept list quality manually
- [ ] Iterate on prompt until concept coverage is satisfactory (all headings covered, formulas captured with LaTeX)

## Task 7: Curriculum Compiler
- [ ] Create `backend/services/curriculum_compiler.py` with topological sort logic
- [ ] Implement prerequisite resolution — match prerequisite title strings to concept IDs
- [ ] Handle circular dependency gracefully — break cycles by putting the involved concept last
- [ ] Test: verify concepts with no prerequisites come first, dependent concepts come after

## Task 8: Coverage Validation
- [ ] Implement `_validate_coverage()` in `IngestionPipeline`
- [ ] Check: ratio of document headings that map to at least one extracted concept
- [ ] Return score 0.0–1.0, log which specific headings are missing
- [ ] Implement auto-retry once with a more aggressive prompt if score below `INGESTION_COVERAGE_THRESHOLD`
- [ ] If score still low after retry, mark as `ready_low_coverage` and continue (don't block the student)

## Task 9: Lesson Compiler
- [ ] Create `backend/services/lesson_compiler.py`
- [ ] Implement block generation per concept: narration → keyword_highlight → definition (if present) → formula (one per formula) → example (if present) → diagram_spec (if concept has prerequisites worth visualizing) → quiz
- [ ] Add recap block after the final concept in the chapter
- [ ] For `diagram_spec` blocks: generate Mermaid flowchart text from concept title + prerequisite titles (simple box → box format)
- [ ] For `voice_text` on narration blocks: use LLM to convert explanation text to natural spoken language (max 80 words, conversational tone)
- [ ] Save all blocks to `lesson_blocks` table with correct `sequence_order`

## Task 10: Upload Router & Background Task
- [ ] Create `backend/routers/lesson.py` with all new lesson endpoints
- [ ] Implement `POST /studyme/chapters/upload` — validate file size, check if chapter already processed (return existing if so), save temp file, create `chapter_uploads` row with status `pending`, enqueue background task
- [ ] Implement background task that calls `IngestionPipeline.run()` then `RAGService.index_chapter()`
- [ ] Implement `GET /studyme/chapters/:chapter_key/status` — return status, coverage_score, uploader info
- [ ] Implement `GET /studyme/chapters/:subject_id/available` — list all `ready` chapters for a subject with uploader roll number (anonymized as "a classmate")
- [ ] Add cleanup job: reset `processing` jobs older than 30 minutes back to `pending`
- [ ] Register new router in `backend/app.py`

## Task 11: Lesson Script & Doubt Endpoints
- [ ] Implement `GET /studyme/lessons/:lesson_id/script` — return full ordered block list
- [ ] Create `backend/services/doubt_service.py` — calls `RAGService.retrieve()` first, then passes retrieved context + question to LLM via doubt fallback chain, enforces 80-word answer limit
- [ ] Implement `POST /studyme/lessons/:lesson_id/doubt` — call doubt service, return answer text, log doubt to `student_lesson_progress`
- [ ] Implement `POST /studyme/lessons/:lesson_id/progress` — upsert student progress row
- [ ] Implement `GET /studyme/lessons/:lesson_id/progress` — return last_block_index and quiz_results for session restore

## Task 12: Admin Endpoints
- [ ] Add to `backend/routers/admin.py`:
  - `GET /admin/studyme/ingestions` — all uploads with status, uploader, coverage score, block count
  - `POST /admin/studyme/ingestions/:id/reprocess` — delete existing concepts/blocks/chunks, re-run pipeline
  - `PATCH /admin/studyme/ingestions/:id/set-active` — toggle is_active on lesson_script

## Task 13: Frontend Dependencies
- [ ] Add `framer-motion` and `mermaid` to `frontend/package.json`
- [ ] Run `npm install` and verify no conflicts with existing deps

## Task 14: Frontend Hooks & Services
- [ ] Create `frontend/src/services/lessonApi.js` — fetch script, post doubt, save/restore progress, poll ingestion status, fetch available chapters
- [ ] Create `frontend/src/hooks/useLessonPlayer.js` — full state machine with all transitions
- [ ] Create `frontend/src/hooks/useWebSpeech.js` — `speak(text)` using SpeechSynthesis, `listen()` using SpeechRecognition, graceful fallback if unsupported
- [ ] Create `frontend/src/hooks/useLessonProgress.js` — auto-save to backend every 30s and on state change to PAUSED or COMPLETE

## Task 15: Block Renderer Components
- [ ] Create `frontend/src/components/lessonplayer/BlockRenderer.jsx`
- [ ] Create `NarrationBlock.jsx` — words appear one by one (Framer Motion stagger, ~60ms per word), triggers `speak()` with voice_text
- [ ] Create `KeywordHighlight.jsx` — keyword chips with highlight entrance animation
- [ ] Create `FormulaBlock.jsx` — wraps existing `MathFormula.jsx`, slide-in animation
- [ ] Create `DiagramBlock.jsx` — initializes Mermaid.js, renders diagram from spec string
- [ ] Create `QuizBlock.jsx` — shows question, text input + mic button, "Show Answer" reveal, calls `onAnswer` callback
- [ ] Create `ExampleBlock.jsx` — example text with distinct left-border visual treatment

## Task 16: Lesson Player Page & Controls
- [ ] Create `frontend/src/components/lessonplayer/NotebookCanvas.jsx` — scrollable dark canvas, matches existing `#1D183E` theme
- [ ] Create `frontend/src/components/lessonplayer/LessonControls.jsx` — floating bottom bar with Play/Pause and Doubt buttons, minimal design
- [ ] Create `frontend/src/components/lessonplayer/DoubtPanel.jsx` — slide-up sheet, text area + mic button, calls `onDoubtSubmit`
- [ ] Create `frontend/src/components/lessonplayer/LessonSummary.jsx` — end screen: concepts list, formulas seen, doubts asked, "Revisit" button
- [ ] Create `frontend/src/pages/LessonPlayer.jsx` — full page component, hides AppLayout bottom nav, orchestrates all sub-components using hooks

## Task 17: Chapter Upload Page
- [ ] Create `frontend/src/pages/ChapterUpload.jsx`
  - Subject selector (from existing StudyMe subject list)
  - Chapter name input
  - File picker (PDF only, max 20MB)
  - "Check first" section: calls available chapters API, shows if a classmate already uploaded this chapter with a "Use this lesson" button
  - Upload button + progress indicator
  - Status polling after upload (pending → processing → ready)

## Task 18: Route Integration
- [ ] Add `/app/study/:subjectId/:lessonId/play` → `LessonPlayer` (lazy-loaded) to `AppRoutes.jsx`
- [ ] Add `/app/study/:subjectId/upload` → `ChapterUpload` (lazy-loaded) to `AppRoutes.jsx`
- [ ] Update `StudyLessons.jsx` — call available chapters API on mount, show "AI" badge on lessons that have a ready script
- [ ] Update `StudyLessonDetail.jsx` — add "▶ Start AI Lesson" button at top if `hasAiScript` is true; button navigates to `/play`; no other changes to existing functionality

## Task 19: Admin Dashboard Integration
- [ ] Add "AI Lessons" section to existing `AdminDashboard.jsx`
- [ ] Table: subject, chapter, uploaded by, status, coverage score, block count, processed at, actions
- [ ] Reprocess button with confirmation dialog
- [ ] Set Active toggle for multiple versions

## Task 20: End-to-End Validation
- [ ] Upload FM Chapter 1 PDF via `ChapterUpload` page, verify status goes pending → processing → ready
- [ ] Open `LessonPlayer` for that chapter — verify all block types render
- [ ] Verify voice narration plays for narration blocks
- [ ] Verify formula blocks render with KaTeX
- [ ] Verify diagram blocks render with Mermaid
- [ ] Verify quiz block pauses playback and resumes on answer
- [ ] Ask a doubt mid-lesson — verify answer comes back under 3 seconds
- [ ] Verify answer is grounded in chapter content (not generic)
- [ ] Complete lesson — verify summary screen shown
- [ ] Log out, log back in — verify progress restored to last block
- [ ] Log in as a different student — verify they can access the same lesson without uploading
- [ ] Verify original PDF is deleted from server after processing
- [ ] Verify existing `StudyLessonDetail` still works for FM (no regression)
- [ ] Test on mobile — verify player is usable on 390px viewport

## Task 1: Backend Dependencies & Configuration
- [ ] Add `litellm==1.40.0`, `instructor==1.3.0`, `pymupdf==1.24.0`, `google-generativeai==0.7.0` to `backend/requirements.txt`
- [ ] Add `GEMINI_API_KEY`, `GROQ_API_KEY`, `INGESTION_COVERAGE_THRESHOLD`, `MAX_UPLOAD_SIZE_MB` to `backend/.env` (keys only, no values committed)
- [ ] Create `backend/services/llm_config.py` with model routing constants and LiteLLM fallback chain

## Task 2: Database Models & Migration
- [ ] Create `backend/db/models/chapter_upload.py` — `chapter_uploads` table
- [ ] Create `backend/db/models/ai_concept.py` — `ai_concepts` table
- [ ] Create `backend/db/models/lesson_script.py` — `lesson_scripts` table
- [ ] Create `backend/db/models/lesson_block.py` — `lesson_blocks` table
- [ ] Create `backend/db/models/student_lesson_progress.py` — `student_lesson_progress` table
- [ ] Create Alembic migration `backend/alembic/versions/YYYYMMDD_0016_create_ai_lesson_tables.py`
- [ ] Run migration and verify tables created correctly

## Task 3: Pydantic Schemas
- [ ] Add `FormulaSchema`, `ConceptSchema`, `ChapterConceptList` to `backend/models/schemas.py`
- [ ] Add `LessonBlockOut`, `LessonScriptOut`, `DoubtRequest`, `DoubtResponse`, `ProgressUpdate` schemas

## Task 4: Ingestion Pipeline — PDF Parsing
- [ ] Create `backend/services/lesson_ingestion_service.py` with `IngestionPipeline` class
- [ ] Implement `_parse_pdf()` using pdfplumber for text/tables + PyMuPDF for metadata
- [ ] Test: run `_parse_pdf()` on the existing FM chapter PDF and inspect output

## Task 5: Ingestion Pipeline — Concept Extraction
- [ ] Implement `_extract_concepts()` in `IngestionPipeline` using LiteLLM + instructor
- [ ] Write the extraction prompt (faithful to course material, no summarization)
- [ ] Test: run extraction on FM Chapter 1 text, inspect concept list quality
- [ ] Iterate on prompt until concept coverage is satisfactory (all headings covered)

## Task 6: Curriculum Compiler
- [ ] Create `backend/services/curriculum_compiler.py` with topological sort logic
- [ ] Implement prerequisite resolution — match prerequisite titles to concept ids
- [ ] Test: verify concepts are ordered correctly (no-prerequisite concepts first)

## Task 7: Coverage Validation
- [ ] Implement `_validate_coverage()` in `IngestionPipeline`
- [ ] Check: every heading in the raw document maps to at least one concept
- [ ] Check: every table has been referenced somewhere in concepts
- [ ] Return score 0.0–1.0, log which headings are missing
- [ ] Implement auto-retry logic if score below `INGESTION_COVERAGE_THRESHOLD`

## Task 8: Lesson Compiler
- [ ] Create `backend/services/lesson_compiler.py`
- [ ] Implement block generation for each concept: narration, keyword_highlight, definition, formula, example, diagram_spec, quiz, recap
- [ ] For `diagram_spec` blocks: generate Mermaid flowchart text spec from concept relationships (keep simple — box → box)
- [ ] For `voice_text`: use a lightweight LLM call to convert explanation to natural spoken language (max 80 words)
- [ ] Save all blocks to `lesson_blocks` table

## Task 9: Upload Router & Background Task
- [ ] Create `backend/routers/lesson.py` with all new endpoints
- [ ] Implement `POST /studyme/chapters/upload` — validate file, save temp, enqueue background task
- [ ] Implement `GET /studyme/chapters/:chapter_key/status` — return upload status + progress
- [ ] Implement `GET /studyme/chapters/:subject_id/available` — list chapters with ready AI lessons
- [ ] Wire `IngestionPipeline.run()` as a FastAPI `BackgroundTasks` job
- [ ] Register new router in `backend/app.py`

## Task 10: Lesson Script & Doubt Endpoints
- [ ] Implement `GET /studyme/lessons/:lesson_id/script` — return full ordered block list
- [ ] Create `backend/services/doubt_service.py` with Groq doubt answering (80 word limit, context-aware)
- [ ] Implement `POST /studyme/lessons/:lesson_id/doubt` — call doubt service, return answer
- [ ] Implement `POST /studyme/lessons/:lesson_id/progress` — upsert student progress
- [ ] Implement `GET /studyme/lessons/:lesson_id/progress` — restore student progress

## Task 11: Admin Endpoints
- [ ] Add ingestion management endpoints to `backend/routers/admin.py`
- [ ] `GET /admin/studyme/ingestions` — all uploads with status, uploader, coverage score
- [ ] `POST /admin/studyme/ingestions/:id/reprocess` — trigger re-ingestion
- [ ] `PATCH /admin/studyme/ingestions/:id/set-active` — toggle active version

## Task 12: Frontend Dependencies
- [ ] Add `framer-motion` and `mermaid` to `frontend/package.json`
- [ ] Run `npm install` and verify no conflicts

## Task 13: Frontend Hooks & Services
- [ ] Create `frontend/src/services/lessonApi.js` — all API calls for lesson player
- [ ] Create `frontend/src/hooks/useLessonPlayer.js` — player state machine (IDLE → PLAYING → PAUSED → WAITING_QUIZ → DOUBT_OPEN → ANSWERING → COMPLETE)
- [ ] Create `frontend/src/hooks/useWebSpeech.js` — TTS (speak text) + STT (listen, return transcript) using Web Speech API, with graceful fallback if browser doesn't support it
- [ ] Create `frontend/src/hooks/useLessonProgress.js` — auto-save progress to backend every 30 seconds and on pause

## Task 14: Block Renderer Components
- [ ] Create `frontend/src/components/lessonplayer/BlockRenderer.jsx` — switch on block_type, render correct component
- [ ] Create `NarrationBlock.jsx` — animated text appearing word by word (Framer Motion stagger), triggers TTS
- [ ] Create `KeywordHighlight.jsx` — renders keyword chips with highlight animation
- [ ] Create `FormulaBlock.jsx` — wraps existing `MathFormula.jsx` with entrance animation
- [ ] Create `DiagramBlock.jsx` — renders Mermaid.js diagram from spec string
- [ ] Create `QuizBlock.jsx` — shows question, text input + voice option, reveal answer button
- [ ] Create `ExampleBlock.jsx` — shows example with distinct visual treatment

## Task 15: Lesson Player Page
- [ ] Create `frontend/src/components/lessonplayer/NotebookCanvas.jsx` — scrollable canvas area with notebook paper aesthetic matching existing dark theme
- [ ] Create `frontend/src/components/lessonplayer/LessonControls.jsx` — floating play/pause and doubt buttons
- [ ] Create `frontend/src/components/lessonplayer/DoubtPanel.jsx` — slide-up panel with text input + microphone button
- [ ] Create `frontend/src/components/lessonplayer/LessonSummary.jsx` — end screen with concepts covered, formulas, final quiz option
- [ ] Create `frontend/src/pages/LessonPlayer.jsx` — full page, hides bottom nav, orchestrates all components using `useLessonPlayer`

## Task 16: Chapter Upload Page
- [ ] Create `frontend/src/pages/ChapterUpload.jsx` — file picker, subject/chapter selector, upload progress, status polling, shared lesson discovery (shows if another student already uploaded)

## Task 17: Route Integration
- [ ] Add `/app/study/:subjectId/:lessonId/play` → `LessonPlayer` to `AppRoutes.jsx`
- [ ] Add `/app/study/:subjectId/upload` → `ChapterUpload` to `AppRoutes.jsx`
- [ ] Update `StudyLessonDetail.jsx` — add "Start AI Lesson" button if `hasAiScript` flag is true (no other changes)
- [ ] Update `StudyLessons.jsx` — show "AI" badge on lessons with available scripts (fetch from available chapters API)

## Task 18: Admin Dashboard Integration
- [ ] Add ingestion management section to existing `AdminDashboard.jsx`
- [ ] Show table: chapter, subject, uploaded by, status, coverage score, processed at, actions
- [ ] Add reprocess and set-active buttons

## Task 19: End-to-End Test
- [ ] Upload FM Chapter 1 PDF through the new upload page
- [ ] Verify ingestion completes successfully
- [ ] Verify concept graph looks correct (review in admin panel)
- [ ] Open LessonPlayer — verify all block types render correctly
- [ ] Verify voice narration plays
- [ ] Verify pause/resume works
- [ ] Ask a doubt — verify contextual answer returned under 3 seconds
- [ ] Complete lesson — verify summary screen
- [ ] Log out, log in on different session — verify progress restored
- [ ] Verify existing StudyLessonDetail still works for subjects without AI lessons

## Task 20: Cleanup & Polish
- [ ] Verify uploaded PDF is deleted after processing
- [ ] Verify error state shown correctly if ingestion fails
- [ ] Add loading states to all async operations in frontend
- [ ] Test on mobile viewport — ensure lesson player is usable on phone
- [ ] Add the new lesson router to the app.py startup (if not already done in Task 9)
