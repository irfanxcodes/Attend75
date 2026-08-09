# AI Lesson Player — Requirements

## Overview

An AI-powered lesson experience embedded inside the existing StudyMe feature of Attend75. When a student opens a chapter, instead of seeing static cards with formulas and definitions, they experience an immersive digital notebook where an AI teacher explains the chapter concept by concept — with animated text, keyword highlights, simple diagrams, and voice narration.

The system processes a PDF once when uploaded and stores structured lessons permanently. Every student who studies that chapter learns from the same stored lesson — no LLM is called during playback. LLM is only called when a student asks a new doubt.

---

## Core Philosophy

- One student uploads a chapter PDF → it gets processed once → all students benefit
- LLM does heavy work exactly once per chapter upload (ingestion)
- During lesson playback, zero LLM calls — everything served from database
- LLM wakes up only for live student doubts or new PDF uploads
- The experience must feel like a teacher explaining, not like reading a document

---

## Requirements

### R1 — PDF Upload & Shared Lesson Discovery

**R1.1** Any authenticated student can upload a chapter PDF for a subject they are enrolled in.

**R1.2** When a PDF is uploaded, the system shows the student a processing status indicator (pending → processing → ready).

**R1.3** If another student has already uploaded and processed a PDF for the same chapter of the same subject, the system must NOT reprocess it. It must show the existing processed lesson to all students of that subject.

**R1.4** On the lesson list page, chapters that have an AI lesson available must show a visual indicator (e.g. "AI Lesson ready") along with which student uploaded it (anonymous roll number or "a classmate").

**R1.5** Students who have not uploaded anything can access any available AI lesson for their subject without needing to upload.

**R1.6** A student may upload an alternative version of a chapter PDF if they believe their version is more complete. The admin can choose which version is active.

**R1.7** The original uploaded PDF must be deleted from storage after processing is complete, unless the student explicitly requests retention. Processed concept data and lesson scripts are kept permanently.

---

### R2 — Ingestion Pipeline

**R2.1** When a PDF is uploaded, the backend must extract all text content using pdfplumber, preserving headings, paragraphs, tables, and formulas.

**R2.2** The extracted text must be sent to Gemini 1.5 Flash (via LiteLLM) with a structured extraction prompt. The LLM must return a list of concepts in a validated Pydantic schema (using the `instructor` library).

**R2.3** Each extracted concept must contain: `concept_id`, `title`, `explanation`, `definition` (if present), `keywords` (list), `formulas` (list, with LaTeX if applicable), `examples` (list), `misconceptions` (list), `exam_questions` (list), `source_page` (int), `source_heading` (str), `prerequisites` (list of concept titles).

**R2.4** The Curriculum Compiler must determine teaching order from the concept list — concepts with no prerequisites come first, concepts that depend on others come later. This logic must be deterministic Python code, not LLM-decided.

**R2.5** The Lesson Compiler must take the ordered concept list and compile it into a Teaching Script — a sequential list of typed blocks stored in the database.

**R2.6** Each Teaching Script block must have: `type` (one of: `narration`, `keyword_highlight`, `definition`, `formula`, `example`, `diagram_spec`, `quiz`, `recap`), `content` (text), `voice_text` (what gets spoken aloud), `concept_id` (which concept this belongs to), `sequence_order` (int).

**R2.7** Ingestion must run as a background task — the upload endpoint returns immediately with a job ID, and the student polls for status.

**R2.8** If the coverage score of extracted concepts falls below a configurable threshold (default: 70% of headings covered), the system must automatically retry extraction once before marking the job as failed.

**R2.9** After processing completes successfully, the uploaded PDF file must be deleted from the server.

---

### R3 — Lesson Player Experience

**R3.1** When a student clicks "Start AI Lesson" on a chapter that has a processed lesson, the interface must transition to a full-screen immersive player — the existing bottom navigation bar must be hidden.

**R3.2** The lesson player must display a digital notebook canvas that fills most of the screen.

**R3.3** Lesson blocks must play sequentially. Each narration block's `voice_text` must be read aloud using the Web Speech Synthesis API. Text must animate onto the canvas as if being written.

**R3.4** Keyword highlight blocks must visually emphasize keywords on the canvas (bold, colored text, or underline animation).

**R3.5** Formula blocks must render using KaTeX (already available in the frontend).

**R3.6** Diagram spec blocks must render a simple Mermaid.js diagram from a text specification stored in the block.

**R3.7** Quiz blocks must pause playback, display a recall question, wait for the student to respond (text or voice), then show the expected answer and continue.

**R3.8** The student must be able to pause the lesson at any time using a clearly visible but unobtrusive button.

**R3.9** The student must be able to ask a doubt at any time. Tapping the doubt button pauses the lesson and opens a minimal input (text or voice via Web Speech Recognition API).

**R3.10** When a doubt is submitted, it must be sent to the backend. The backend must call Groq (Llama 3.3 70B via LiteLLM) with the current concept context and return an answer. The answer must be injected into the lesson as a temporary response block and read aloud. The lesson then resumes from where it paused.

**R3.11** After all blocks in a chapter are played, the player must show a chapter summary screen with key concepts covered, formulas seen, and a final quiz option.

**R3.12** The student's progress (which concepts they have seen, quiz results, doubts asked) must be saved to the backend — not localStorage — so it persists across devices.

---

### R4 — Integration with Existing StudyMe

**R4.1** The new AI lesson player must replace the existing `StudyLessonDetail.jsx` page for chapters that have a processed AI lesson available.

**R4.2** For chapters with no AI lesson yet (no upload, or processing failed), the existing `StudyLessonDetail.jsx` must continue to work exactly as before — no regression.

**R4.3** The existing StudyMe landing page and lesson list pages must show an "AI" badge on lessons that have the new player available.

**R4.4** The existing progress tracking, importance voting, and analytics must continue to work alongside the new system.

---

### R5 — Admin Controls

**R5.1** The admin dashboard must show a list of all uploaded chapter PDFs, their processing status, coverage scores, and which student uploaded them.

**R5.2** Admin must be able to manually trigger reprocessing of any chapter.

**R5.3** Admin must be able to mark one version of a chapter lesson as the "active" version shown to all students.

**R5.4** Admin must be able to view the generated concept graph and Teaching Script for any processed chapter.

---

### R6 — What We Are NOT Building in Phase 1

The following are explicitly out of scope for Phase 1 to keep the build focused:

- Diagram auto-generation from scratch (Mermaid specs are stored as text, basic templates only)
- Student-facing spaced repetition scheduler
- Collaborative notes or study groups
- Voice cloning or custom AI voices (Web Speech API only)
- Student upload of alternative PDF versions (R1.6 is Phase 2)
- Offline lesson playback
- Mobile-specific gesture controls beyond tap

---

## Success Criteria

A successful Phase 1 means:
- One FM chapter PDF can be uploaded and produces a playable AI lesson within 2 minutes
- The lesson plays end-to-end with voice, animated text, and at least one quiz block
- A student can ask a doubt mid-lesson and get a contextual answer in under 3 seconds
- All other students of the same subject can access the lesson without uploading anything
- The existing StudyMe pages are completely unaffected for subjects without AI lessons
