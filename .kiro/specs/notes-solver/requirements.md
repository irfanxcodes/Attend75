# Requirements Document

## Introduction

### Overview

A **Notes** toggle added to the existing Study workspace (alongside Canvas / Source / Resources).
Students upload problem-heavy material — typed or handwritten PDFs, PPTs, DOCs — and the AI
extracts every question, then teaches them how to solve each one step by step on a canvas,
rather than just showing the answer.

Uploads are **processed once and shared** with all students in the subject (same deduplication
model as chapter uploads). Any student can still add new notes files to the pool.

No R2, no image rendering, no new nav tab.

### Goals

- Teach students *how* to solve problems, not just show them the answer
- Reuse existing upload, TTS, auth, and canvas infrastructure
- Keep LLM usage minimal — one call per unique upload, never per session
- Support both typed and handwritten PDFs without adding heavy infrastructure

### Non-Goals

- No new navigation tab or sidebar entry
- No rendering of uploaded pages as images
- No R2 or object storage
- No per-student or per-session LLM calls during the study experience

---

## Requirements

### 1. Notes Toggle in Workspace

**REQ-1.1** The workspace tab bar (Canvas / Source / Resources) gains a new **Notes** toggle button.

**REQ-1.2** Tapping Notes switches the canvas area to the Notes view without navigating away.

**REQ-1.3** The toggle is only visible when at least one processed notes file exists for the chapter,
OR when the current student has upload permission (always true for now).

---

### 2. Upload

**REQ-2.1** Students can upload a notes file (PDF, PPTX, PPT, DOCX, DOC) up to 20 MB.

**REQ-2.2** The upload UI follows the same pattern as chapter upload:
- File picker
- Chapter/topic label (which chapter these notes belong to)
- Submit → background processing → result shown when ready

**REQ-2.3** Before processing, the system checks if an identical file (SHA-256 hash) has already
been processed. If yes, return the existing result immediately.

**REQ-2.4** Multiple different notes files can exist for the same chapter. All processed sets are
shown in the Notes view.

**REQ-2.5** A student can delete their own upload (same soft-delete + undo pattern as chapter uploads).

---

### 3. Text Extraction (pre-LLM)

**REQ-3.1** For **typed PDFs / PPTs / DOCs**: extract text using the existing parser pipeline
(PyMuPDF / python-pptx / python-docx). No vision model needed.

**REQ-3.2** For **scanned / handwritten PDFs**: detect whether a PDF page contains extractable
text (character count threshold). If not, run **Tesseract OCR** on that page.

**REQ-3.3** If Tesseract confidence on a page is below a configurable threshold (default 60%),
fall back to **Gemini Vision** for that page only.

**REQ-3.4** The fallback to Gemini Vision is **per page**, not per file, to minimise API usage.

**REQ-3.5** The extracted plain text (from any of the three paths above) is passed to the LLM
as a single structured prompt — one LLM call per notes upload.

---

### 4. Question Extraction (LLM)

**REQ-4.1** The system makes **one LLM call per notes upload** to extract all questions.

**REQ-4.2** The LLM output is a structured JSON list of problems. Each problem contains:
- `question_text` — the full question as written
- `topic` — which concept/chapter topic it belongs to
- `given_values` — list of what is given in the question
- `find` — what needs to be solved
- `method` — which formula or approach to use
- `difficulty` — easy / medium / hard
- `answer` — the final answer
- `solution_steps` — ordered list of teaching steps (see REQ-4.3)

**REQ-4.3** Each solution step contains:
- `sequence_order`
- `step_type` — one of: `context | given | formula | calculation | result | insight`
- `content` — explanation text for this step
- `voice_text` — text for TTS narration (may be same as content)
- `annotation` — optional: `{ type: "highlight" | "circle" | "arrow", target_text: "...", color: "#..." }`
  where `target_text` is a substring of `question_text` to annotate

**REQ-4.4** The annotation references **text in the question**, not pixel coordinates.
The frontend locates the text in the rendered card and draws the overlay around it.

**REQ-4.5** If the LLM cannot confidently extract a question (ambiguous or illegible), it skips
it and logs a warning — it does not fail the whole upload.

---

### 5. Data Storage

**REQ-5.1** A new `upload_type` column on `chapter_uploads` distinguishes notes uploads
(`"notes"`) from chapter uploads (`"chapter"`). Default remains `"chapter"`.

**REQ-5.2** Three new tables are created:
- `notes_problem_sets` — one per processed upload
- `notes_problems` — one per extracted question
- `notes_solution_steps` — one per step within a problem

**REQ-5.3** No files are stored after processing. The uploaded file may be deleted from disk
after ingestion (same as chapter uploads today).

**REQ-5.4** No R2 or object storage is used for this feature.

---

### 6. Notes Canvas View

**REQ-6.1** The Notes view shows a list of problem sets available for the chapter.
Each set shows: uploader label, number of questions, topic/chapter label.

**REQ-6.2** Tapping a problem set expands it to show a list of individual questions
(question number, first line of question text, difficulty badge, topic tag).

**REQ-6.3** Tapping a question opens the **Problem Solver canvas** for that question.

**REQ-6.4** The Problem Solver canvas shows:
- The full question text rendered in a card at the top
- A "Start solving" / "Continue" button
- Step-by-step teaching flow below (one step revealed at a time)
- Each step has a type badge (e.g. "Given", "Formula", "Step 1")

**REQ-6.5** Steps are revealed one at a time. The student taps "Next step" to advance.
All previous steps remain visible (cumulative reveal, not replace).

**REQ-6.6** When a step has an annotation, an SVG overlay is drawn on the question card:
- `highlight` → semi-transparent colored `<rect>` behind the target text
- `circle` → SVG `<ellipse>` around the target text bounding box
- `arrow` → SVG `<line>` with arrowhead pointing at the target text

**REQ-6.7** Annotations are drawn using `getBoundingClientRect()` on the matched text span.
No pixel coordinates are stored on the server — all positioning is client-side.

**REQ-6.8** Voice narration reads `voice_text` for each step using the existing TTS service.
Auto-play is optional (same as existing lesson player behaviour).

**REQ-6.9** After the final step, the canvas shows the **answer** and a "Try similar" prompt
(Phase 2 feature — placeholder for now, can show a static message).

---

### 7. Shared / Deduplication Rules

**REQ-7.1** If two students upload the same file (same SHA-256 hash), the second upload
returns the existing processed result immediately — no reprocessing.

**REQ-7.2** Unlike chapter uploads, notes uploads are **not deduplicated by chapter_key**.
Multiple different notes files for the same chapter are all retained and shown.

**REQ-7.3** The `is_public` flag from chapter uploads does not apply to notes. All processed
notes are visible to all students in the subject.

---

### 8. Constraints

**REQ-8.1** Max file size: 20 MB (same as chapter uploads).

**REQ-8.2** Accepted formats: PDF, PPTX, PPT, DOCX, DOC.

**REQ-8.3** LLM usage is limited to one call per unique notes upload. No per-student or
per-session LLM calls for this feature.

**REQ-8.4** Tesseract OCR is used for scanned pages before falling back to Gemini Vision,
to minimise API usage.

**REQ-8.5** The feature must not require R2, object storage, or image rendering pipelines.

**REQ-8.6** The feature reuses the existing TTS service, session/auth system, upload flow,
and soft-delete pattern without modification to those systems.

---

## Glossary

| Term | Definition |
|---|---|
| **Notes upload** | A PDF/PPT/DOC file uploaded by a student containing practice questions or solved numericals |
| **Problem set** | The structured output from one processed notes upload — a collection of extracted questions |
| **Problem** | One extracted question from a notes upload, with all its metadata and solution steps |
| **Solution step** | One teaching unit within a problem's walkthrough (e.g. "What is given?", "Apply formula") |
| **Annotation** | An SVG overlay drawn on the question card — highlight, circle, or arrow — referencing a text substring |
| **Typed PDF** | A PDF with selectable/extractable text (digital, not scanned) |
| **Handwritten / scanned PDF** | A PDF where pages are images; text must be extracted via OCR |
| **Tesseract** | Open-source OCR engine used as the first-pass text extractor for scanned pages |
| **Gemini Vision** | Gemini 1.5 Flash with vision input, used only when Tesseract confidence is below threshold |
| **Deduplication** | The process of detecting an identical file (SHA-256) and returning the cached result without reprocessing |
| **Canvas** | The main content area in the Study workspace where concepts, source, resources, and now notes are displayed |
| **Toggle** | A tab/button in the workspace tab bar that switches the canvas view |
| **TTS** | Text-to-speech — the existing voice narration service reused for step narration |
| **Soft-delete** | Marking a record as deleted in the DB without removing it, with undo support |
