# Requirements Document

## Introduction

Many BCA and B.Tech students in Attend75 do not receive a formal course handout document, so they cannot use the existing PDF/DOCX upload flow to build the chapter index needed to unlock the AI workspace. This feature adds a "Don't have a handout?" escape hatch to the existing handout upload screen. Tapping it opens a two-path flow: **Paste Syllabus** (AI-extracts structure from pasted text) and **Build Manually** (student types subject name + chapter list). Both paths produce a `CourseHandout` record with a structured syllabus identical in shape to one produced by a file upload, so the rest of the StudyMe workspace works without any changes.

---

## Glossary

- **Handout_Upload_Screen**: The existing React screen shown in `SubjectDetail.jsx` when no active, ready `CourseHandout` exists for a subject. Renders the dashed upload card.
- **Manual_Builder**: The new two-path modal/screen that students reach by tapping "Don't have a handout?" on the Handout_Upload_Screen.
- **Paste_Path**: Path 1 of the Manual_Builder — student pastes raw syllabus text, AI extracts module/chapter structure.
- **Manual_Path**: Path 2 of the Manual_Builder — student types a subject name and a chapter list; structure is derived deterministically without an LLM call.
- **Syllabus_Extractor**: The backend AI component (reuses `parse_syllabus_with_llm` from `handout_parser.py`) responsible for extracting structured syllabus from pasted text on the Paste_Path.
- **Index_Builder**: The backend component that transforms the student-typed chapter list into a structured syllabus on the Manual_Path.
- **Structured_Syllabus**: A JSON object with the schema `{ subject_name, modules: [{ number, title, chapters: [{ title }] }] }` — the same shape stored in `CourseHandout.structured_syllabus`.
- **Chapter_Index**: The complete list of chapters extracted from a Structured_Syllabus; its existence unlocks the AI workspace per chapter, identical to what a file upload produces.
- **Review_Screen**: The intermediate screen presented to the student after extraction or parsing, where chapters can be edited and reordered before the Chapter_Index is confirmed.
- **Module**: A top-level grouping of chapters within a Structured_Syllabus (e.g. "Module 1 — Introduction").
- **AI_Workspace**: The per-chapter study environment in StudyMe that becomes accessible once a Chapter_Index exists for a subject.

---

## Requirements

### Requirement 1: Entry Point on Handout Upload Screen

**User Story:** As a student without a formal course handout, I want a clearly visible alternative option on the upload screen, so that I know I can still set up my subject without a file.

#### Acceptance Criteria

1. THE Handout_Upload_Screen SHALL display a "Don't have a handout?" link below the existing file upload card when no active `CourseHandout` exists for the subject.
2. WHEN the student taps "Don't have a handout?", THE Handout_Upload_Screen SHALL navigate to the Manual_Builder without uploading any file.
3. THE Manual_Builder SHALL present two clearly labelled options: "Paste syllabus text" (Paste_Path) and "Build manually" (Manual_Path).
4. THE Manual_Builder SHALL allow the student to return to the Handout_Upload_Screen without losing any progress on the current path selection.

---

### Requirement 2: Paste Path — Syllabus Text Input

**User Story:** As a student, I want to paste my university syllabus text (copied from a portal, WhatsApp, or PDF) into a text area and have the AI extract the chapter structure for me, so that I don't have to type every chapter name myself.

#### Acceptance Criteria

1. THE Manual_Builder SHALL provide a multi-line textarea on the Paste_Path that accepts up to 15 000 characters of plain text.
2. WHEN the student submits the pasted text, THE Syllabus_Extractor SHALL send the text to the AI extraction pipeline (reusing `parse_syllabus_with_llm`) and return a Structured_Syllabus.
3. WHILE extraction is in progress, THE Manual_Builder SHALL display a loading indicator and prevent duplicate submissions.
4. IF the pasted text contains fewer than 50 characters, THEN THE Manual_Builder SHALL display an inline validation error and SHALL NOT call the Syllabus_Extractor.
5. IF the Syllabus_Extractor returns an error or produces zero chapters, THEN THE Manual_Builder SHALL display a descriptive error message and allow the student to edit the pasted text and retry.
6. WHEN extraction succeeds, THE Manual_Builder SHALL navigate the student to the Review_Screen populated with the extracted Structured_Syllabus.

---

### Requirement 3: Manual Path — Subject and Chapter Entry

**User Story:** As a student, I want to type my subject name and paste or type my chapter list (one per line), so that I can build a chapter index quickly without needing a handout or syllabus document.

#### Acceptance Criteria

1. THE Manual_Builder SHALL provide a subject name input field and a multi-line chapter list textarea on the Manual_Path.
2. THE Manual_Builder SHALL accept one chapter title per line in the chapter list textarea, supporting up to 100 lines.
3. WHEN the student submits the Manual_Path form, THE Index_Builder SHALL auto-number the entered chapters sequentially and group them into one or more modules based on blank-line separators (a blank line starts a new module group).
4. IF the subject name field is empty, THEN THE Manual_Builder SHALL display an inline validation error and SHALL NOT invoke the Index_Builder.
5. IF the chapter list contains fewer than 1 non-empty line after trimming, THEN THE Manual_Builder SHALL display an inline validation error and SHALL NOT invoke the Index_Builder.
6. WHEN the Index_Builder produces a Structured_Syllabus, THE Manual_Builder SHALL navigate the student to the Review_Screen populated with the result.
7. THE Index_Builder SHALL produce a Structured_Syllabus synchronously on the backend without an AI/LLM call, so no loading state beyond a brief button spinner is required.

---

### Requirement 4: Review Screen — Preview and Edit Before Confirming

**User Story:** As a student, I want to review, reorder, and edit the extracted or manually built chapters before they are saved, so that I can correct any mistakes before unlocking my AI workspace.

#### Acceptance Criteria

1. THE Review_Screen SHALL display the full Chapter_Index grouped by module, showing each chapter title and its sequential number.
2. THE Review_Screen SHALL allow the student to edit any individual chapter title inline.
3. THE Review_Screen SHALL allow the student to delete any individual chapter from the list.
4. THE Review_Screen SHALL allow the student to add a new chapter at the end of any module.
5. THE Review_Screen SHALL allow the student to reorder chapters within a module using drag-and-drop or up/down controls.
6. THE Review_Screen SHALL display the subject name and allow the student to edit it before confirming.
7. WHEN the student confirms the Chapter_Index, THE Review_Screen SHALL submit the finalised Structured_Syllabus to the backend for storage.
8. IF the confirmed Chapter_Index contains fewer than 1 chapter after edits, THEN THE Review_Screen SHALL display an error and SHALL NOT submit to the backend.
9. WHEN submission succeeds, THE Review_Screen SHALL navigate the student to the subject detail screen (equivalent to `SubjectDetail`) and display the newly created Chapter_Index, identical in appearance to one produced by a file upload.

---

### Requirement 5: Backend — Manual Handout Creation Endpoint

**User Story:** As the StudyMe system, I need a backend API endpoint to accept a manually constructed Structured_Syllabus and store it as a `CourseHandout` record, so that all downstream AI workspace features work without modification.

#### Acceptance Criteria

1. THE Backend SHALL expose a `POST /studyme/handouts/manual` endpoint that accepts `token`, `subject_id`, and a Structured_Syllabus payload (JSON body).
2. WHEN a valid request is received, THE Backend SHALL validate that `subject_name` is non-empty and `modules` contains at least one module with at least one chapter.
3. WHEN validation passes, THE Backend SHALL mark any existing active `CourseHandout` for the same `subject_id` as inactive (matching the behaviour of the file upload endpoint).
4. WHEN validation passes, THE Backend SHALL create a new `CourseHandout` row with `parse_status = "ready"` and `is_active = "1"` immediately, without requiring a background task.
5. IF the authenticated session token is invalid, THEN THE Backend SHALL return HTTP 401.
6. IF the request body fails validation, THEN THE Backend SHALL return HTTP 422 with a descriptive error.
7. THE Backend SHALL expose a `POST /studyme/handouts/extract-text` endpoint that accepts `token`, `subject_id`, and a `text` field (the raw pasted syllabus) and returns a Structured_Syllabus by invoking the Syllabus_Extractor.
8. WHILE the Syllabus_Extractor is running on `/extract-text`, THE Backend SHALL enforce a 60-second request timeout and return HTTP 504 if exceeded.

---

### Requirement 6: Data Consistency — Identical Output Shape

**User Story:** As the StudyMe system, I need handouts created via the Manual_Builder to be indistinguishable from file-uploaded handouts in all downstream features, so that no other part of the system requires changes.

#### Acceptance Criteria

1. THE Backend SHALL ensure that every `CourseHandout` row created via `POST /studyme/handouts/manual` contains a `structured_syllabus` JSON field whose `modules` array satisfies the same schema as one produced by `handout_parser.parse_handout` (each module has `number`, `title`, `chapters` with at least `title` per chapter).
2. THE Backend SHALL populate `subject_name` on the `CourseHandout` row from the submitted Structured_Syllabus `subject_name` field.
3. THE Backend SHALL set `raw_text` to `null` for manually created handouts (no source file exists).
4. FOR ALL Structured_Syllabus objects produced by the Paste_Path or the Manual_Path, the `GET /studyme/handouts/{subject_id}` response shape SHALL be identical to one produced by a file upload, so no changes are required to `SubjectDetail.jsx` or any other consumer.

---

### Requirement 7: Source Attribution in UI

**User Story:** As a student viewing the subject detail screen, I want to know whether the chapter index was uploaded from a file or built manually, so that I understand its origin and can replace it if needed.

#### Acceptance Criteria

1. THE Handout_Upload_Screen SHALL display a "Built manually by You" badge (in place of "Handout by You") on the subject detail screen when the active `CourseHandout` was created via the Manual_Builder.
2. WHEN the student taps "Upload different handout version" after a manually built handout exists, THE Handout_Upload_Screen SHALL allow the student to replace it with a file upload or rebuild it manually, following the same replacement logic used for file-uploaded handouts.
3. THE Backend SHALL include a `source` field in the `GET /studyme/handouts/{subject_id}` response with value `"file"` for file uploads and `"manual"` for manually built handouts, so the frontend can render the correct badge.
