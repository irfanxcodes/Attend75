# Requirements Document

## Introduction

Smart Notice Board transforms the college portal's plain HTML table of 459+ notices into an intelligent, swipeable card-based notification feed within Attend75. The system scrapes notices using students' authenticated sessions, downloads PDFs into memory, extracts text via pdfplumber, generates metadata (category, summary, deadline, priority), stores only metadata and extracted text, and serves notices through a modern card UI with embedded PDF viewing. Notices are shared across students in the same program and semester (processed once per unique notice), while personalization (bookmarks, dismissals, read status) is per-user. Category keywords are stored in an external configuration file for easy modification without code changes.

## Glossary

- **Notice_Scraper**: The backend service that authenticates against the college portal and scrapes the notice list HTML table from Notice.aspx
- **PDF_Processor**: The backend component that downloads notice PDFs into memory, extracts text using pdfplumber, and discards the PDF bytes after extraction
- **Metadata_Generator**: The backend component that analyzes extracted text to produce category, summary, deadline, priority score, and target program
- **Notice_API**: The set of REST endpoints that serve processed notice data to the frontend
- **PDF_Proxy**: The backend endpoint that streams original PDF files from the college portal to the frontend using the system's authenticated session
- **Card_Feed**: The frontend swipeable card-based UI that displays notices to students
- **Category_Classifier**: The component that assigns one of seven categories (Exam, Fee, Academic, Internship, Event, Guest Lecture, General) to each notice based on keyword matching against an external configuration file
- **Category_Config**: An external JSON/YAML configuration file that stores category names, colors, and associated keywords; modifiable without code changes or redeployment
- **Priority_Scorer**: The component that calculates an additive priority score (0–100) for each notice based on content signals
- **Program_Detector**: The component that determines which academic program a notice targets, or marks it as relevant to all programs
- **Summary_Algorithm**: A deterministic, rule-based algorithm that scores and selects the most informative sentence from cleaned text based on keyword weighting, deadline presence, and action-item detection
- **Processing_Version**: A version identifier stored per notice indicating which pipeline version was used to generate its metadata, enabling selective reprocessing on algorithm upgrades
- **Student**: An authenticated Attend75 user identified by roll number
- **Portal_Session**: An authenticated HTTP session against the college portal (111.93.16.209)
- **Notice_Card**: A single UI card representing one notice, displaying category chip, priority badge, title, summary, deadline, and actions

## Requirements

### Requirement 1: Notice List Scraping

**User Story:** As a student, I want the app to automatically fetch notices from my college portal, so that I always see the latest notices without manually checking the portal.

#### Acceptance Criteria

1. WHEN a scrape cycle is triggered, THE Notice_Scraper SHALL authenticate against the college portal using stored student credentials and retrieve the HTML table from Notice.aspx
2. WHEN the Notice_Scraper retrieves the HTML table, THE Notice_Scraper SHALL parse each row to extract notice_id, title, viewed status, date (DD/MM/YYYY), and PDF link for every notice in the table
3. WHEN a notice_id from the scraped list does not exist in the database, THE Notice_Scraper SHALL mark that notice for PDF processing
4. WHEN a notice_id from the scraped list already exists in the database with processing_status "done", THE Notice_Scraper SHALL skip PDF processing for that notice
5. IF the portal returns an authentication error during scraping, THEN THE Notice_Scraper SHALL log the failure and retry with fresh credentials on the next cycle
6. IF the portal is unreachable or returns an HTTP error, THEN THE Notice_Scraper SHALL log the error and serve previously cached notices from the database

### Requirement 2: Scheduled Auto-Refresh

**User Story:** As a student, I want notices to refresh automatically, so that I see new notices without manual action.

#### Acceptance Criteria

1. THE Notice_Scraper SHALL execute a notice list scrape every 30 minutes
2. WHEN the 30-minute scrape cycle runs, THE Notice_Scraper SHALL only fetch the Notice.aspx HTML page to check for new notice IDs
3. WHEN new notice IDs are detected during a scheduled scrape, THE Notice_Scraper SHALL enqueue those notices for PDF processing
4. WHEN a student calls POST /notices/refresh, THE Notice_Scraper SHALL execute an immediate scrape cycle for that student's portal session
5. WHILE a scrape cycle is already in progress, THE Notice_Scraper SHALL reject additional refresh requests and return a "scrape in progress" status

### Requirement 3: PDF Text Extraction

**User Story:** As a student, I want notice content extracted from PDFs, so that I can read summaries without opening the PDF.

#### Acceptance Criteria

1. WHEN a notice is marked for processing, THE PDF_Processor SHALL download the PDF from the portal URL (Notice/{id}.pdf) into memory using an authenticated session
2. WHEN the PDF is downloaded into memory, THE PDF_Processor SHALL extract all text content using pdfplumber
3. WHEN text extraction completes, THE PDF_Processor SHALL discard the PDF bytes from memory and retain only the extracted text
4. THE PDF_Processor SHALL store both the raw extracted_text and a cleaned_text version (whitespace normalized, non-printable characters removed) in the notices table
5. WHEN text extraction succeeds, THE PDF_Processor SHALL set processing_status to "done" for that notice
6. IF pdfplumber fails to extract text from a PDF, THEN THE PDF_Processor SHALL set processing_status to "failed" and store an empty extracted_text
7. IF the PDF download fails or times out, THEN THE PDF_Processor SHALL set processing_status to "failed" and log the error with the notice_id

### Requirement 4: Category Classification

**User Story:** As a student, I want notices auto-categorized, so that I can quickly filter by topic.

#### Acceptance Criteria

1. WHEN a notice is processed, THE Category_Classifier SHALL assign exactly one category from the categories defined in the Category_Config file
2. THE Category_Classifier SHALL load category names, colors, priority order, and associated keywords from the Category_Config file at startup and when the file is modified
3. WHEN classifying a notice, THE Category_Classifier SHALL match keywords case-insensitively against both the notice title and the extracted PDF text
4. WHEN a notice matches keywords from multiple categories, THE Category_Classifier SHALL assign the category with the highest priority rank as defined in the Category_Config file (default order: Exam > Fee > Academic > Internship > Event > Guest Lecture > General)
5. WHEN a notice does not match any specific category keywords, THE Category_Classifier SHALL assign category "General"
6. WHEN a category is assigned, THE Category_Classifier SHALL store a category_confidence score between 0.0 and 1.0, calculated as: (number of matched keywords for the winning category) / (total keywords defined for that category), clamped to 1.0
7. THE Category_Config file SHALL contain the following default categories and keywords:
   - Exam (Red): EXAM, TIMETABLE, SEATING ARRANGEMENT, HALL TICKET, RECHECK, MIDTERM, MID-TERM, END EXAM, ELIGIBILITY LIST, NCP-1, TEST-1, MAKEUP, GRADE SHEET
   - Fee (Yellow): FEE, DEMAND, INSTALLMENT, DUES, LOAN
   - Academic (Blue): CLASS, SUMMER, REMEDIAL, HOLIDAY, ATTENDANCE, TIME TABLE, REGISTRATION, ID CARD, DIWALI, DUSSEHRA, SANKRANTHI, RAMZAN
   - Internship (Purple): INTERNSHIP, SIP, TRAINING, PLACEMENT, PMIS, GDPI
   - Event (Green): SEMINAR, WORKSHOP, FEST, COMPETITION, ESPERANZA, THRITI, TRITHI, FAREWELL, FRESHER, ORIENTATION, CLUB, CELEBRATE, FAIR
   - Guest Lecture (Brown): THRIIVE, WISDOM, LEADER, INNOVATION, TALK (plus pattern: mixed lowercase+UPPERCASE indicating lecture-style titles)
   - General (Grey): LOST, FOUND, BUS, TRANSPORT, MESS, HOSTEL, ROOM CHANGE, EMAIL ID, WISHES, DRESS CODE, UNIFORM
8. IF the Category_Config file is missing or malformed, THEN THE Category_Classifier SHALL fall back to hardcoded default keywords and log a warning

### Requirement 5: Priority Scoring

**User Story:** As a student, I want the most important notices surfaced first, so that I never miss critical deadlines.

#### Acceptance Criteria

1. WHEN a notice is processed, THE Priority_Scorer SHALL calculate a priority score using additive scoring: Hall Ticket (+40), Deadline detected (+30), Mandatory keyword (+15), Today's date match (+20), Exam keyword (+25)
2. THE Priority_Scorer SHALL clamp the final priority score to a range of 0 to 100
3. WHEN the priority score exceeds 60, THE Priority_Scorer SHALL set is_important to true for that notice
4. WHEN multiple scoring signals apply to a single notice, THE Priority_Scorer SHALL sum all applicable signal values before clamping

### Requirement 6: Summary Generation

**User Story:** As a student, I want a concise summary of each notice, so that I can understand the content at a glance.

#### Acceptance Criteria

1. WHEN a notice is processed, THE Summary_Algorithm SHALL produce a summary of no more than 300 characters from the cleaned_text
2. THE Summary_Algorithm SHALL score each sentence in the cleaned_text using the following deterministic rules:
   - +3 points: sentence contains a date pattern (DD/MM/YYYY, DD-MM-YYYY, or month name + day)
   - +3 points: sentence contains a deadline phrase ("last date", "due by", "before", "on or before", "submit by", "deadline")
   - +2 points: sentence contains an action verb ("submit", "report", "attend", "register", "pay", "collect", "contact")
   - +2 points: sentence contains keywords matching the assigned category
   - +1 point: sentence is in the first 3 sentences of the document
   - -1 point: sentence is a greeting or salutation (starts with "Dear", "Respected", "This is to inform")
3. THE Summary_Algorithm SHALL select the highest-scoring sentence as the summary
4. WHEN multiple sentences have the same score, THE Summary_Algorithm SHALL select the sentence that appears earliest in the text
5. WHEN the selected sentence exceeds 300 characters, THE Summary_Algorithm SHALL truncate at the last word boundary before 297 characters and append "..."
6. IF the cleaned_text is empty or contains fewer than 10 characters, THEN THE Summary_Algorithm SHALL use the notice title as the summary

### Requirement 7: Deadline Detection

**User Story:** As a student, I want to know if a notice has a deadline, so that I can plan accordingly.

#### Acceptance Criteria

1. WHEN processing a notice, THE Metadata_Generator SHALL scan the cleaned_text for date patterns and deadline-indicating phrases (e.g., "last date", "due by", "before", "on or before", "submit by")
2. WHEN a deadline is detected, THE Metadata_Generator SHALL store the parsed date in the deadline field (DATE format) and the original text in deadline_raw (VARCHAR 100)
3. WHEN multiple potential deadlines exist in a notice, THE Metadata_Generator SHALL select the earliest future date as the primary deadline
4. IF no deadline-indicating phrase is found in the text, THEN THE Metadata_Generator SHALL leave the deadline field as null

### Requirement 8: Program-Specific Filtering

**User Story:** As a student, I want to see only notices relevant to my program, so that I'm not overwhelmed by irrelevant information.

#### Acceptance Criteria

1. WHEN processing a notice, THE Program_Detector SHALL analyze the title and extracted text for program-specific keywords (e.g., BBA, MBA, B.Tech, M.Tech)
2. WHEN a notice targets a specific program, THE Program_Detector SHALL store that program identifier in the target_program field
3. WHEN a notice is genuinely relevant to all programs, THE Program_Detector SHALL leave target_program as null (indicating "all programs")
4. WHEN a student requests notices via GET /notices, THE Notice_API SHALL return only notices where target_program matches the student's enrolled program OR target_program is null
5. THE Program_Detector SHALL combine multiple signals (keywords in title, keywords in PDF text, portal source context) to determine target_program with a confidence_score between 0.0 and 1.0
6. THE Notice_API SHALL determine the student's program from the student_registry table (program field populated at login) without requiring additional portal requests
7. WHEN notices are shared across users, THE Notice_API SHALL share processed notice metadata only among students in the same program and semester combination
8. WHEN a student's program is not yet recorded in student_registry, THE Notice_API SHALL return all notices where target_program is null (general notices only) until the program is determined

### Requirement 9: Notice API — List and Detail

**User Story:** As a student, I want to retrieve my notices through the app, so that I can view them on any device.

#### Acceptance Criteria

1. WHEN a student calls GET /notices with limit and offset parameters, THE Notice_API SHALL return a paginated list of notices filtered by the student's program, sorted by priority descending then portal_date descending
2. WHEN a student calls GET /notices without parameters, THE Notice_API SHALL default to limit=10 and offset=0
3. WHEN a student calls GET /notices/{id}, THE Notice_API SHALL return the full notice detail including extracted_text, summary, category, priority, deadline, and keywords
4. WHEN a student views a notice detail, THE Notice_API SHALL update the opened_at and last_viewed timestamps in the user_notices table for that student
5. THE Notice_API SHALL exclude notices that the student has dismissed unless a query parameter include_dismissed=true is provided
6. IF a requested notice_id does not exist, THEN THE Notice_API SHALL return a 404 status with an appropriate error message

### Requirement 10: Notice API — Stats Endpoint

**User Story:** As a student, I want a quick overview of my notice counts, so that I can see how many are unread or critical.

#### Acceptance Criteria

1. WHEN a student calls GET /notices/stats, THE Notice_API SHALL return counts for: unread, critical (priority > 60), bookmarked, dismissed, and total notices visible to that student
2. THE Notice_API SHALL calculate "unread" as notices where the student has no entry in user_notices or opened_at is null
3. THE Notice_API SHALL calculate "total" as all non-dismissed notices matching the student's program filter

### Requirement 11: Bookmark and Dismiss Actions

**User Story:** As a student, I want to bookmark important notices and dismiss irrelevant ones, so that I can manage my feed.

#### Acceptance Criteria

1. WHEN a student calls POST /notices/{id}/bookmark, THE Notice_API SHALL toggle the bookmarked field in user_notices for that student and notice
2. WHEN a student calls POST /notices/{id}/dismiss, THE Notice_API SHALL set dismissed to true in user_notices for that student and notice
3. WHEN a notice is dismissed, THE Card_Feed SHALL remove that notice from the visible feed immediately
4. WHEN a student activates the "Show dismissed" toggle, THE Card_Feed SHALL display all previously dismissed notices in a separate list

### Requirement 12: PDF Proxy Streaming

**User Story:** As a student, I want to view the original PDF within the app, so that I can see the full document without leaving Attend75.

#### Acceptance Criteria

1. WHEN a student calls GET /notices/{id}/pdf, THE PDF_Proxy SHALL authenticate against the college portal and stream the PDF bytes directly to the client
2. THE PDF_Proxy SHALL set the response Content-Type to application/pdf and stream the file without storing it on disk
3. THE PDF_Proxy SHALL NOT expose the college portal URL or credentials to the client
4. IF the PDF is unavailable on the portal, THEN THE PDF_Proxy SHALL return a 404 status with an appropriate error message
5. WHILE streaming a PDF, THE PDF_Proxy SHALL use the stored pdf_url_path (e.g., Notice/47675.pdf) to construct the download URL

### Requirement 13: Swipeable Card Feed UI

**User Story:** As a student, I want a modern swipeable card interface, so that I can quickly browse and act on notices.

#### Acceptance Criteria

1. THE Card_Feed SHALL display notices as a vertical stack of swipeable cards, each showing: category chip (colored by category), priority badge, title, summary, deadline pill (if applicable), relative date, and a "NEW" dot for unread notices
2. WHEN a student swipes a card to the right, THE Card_Feed SHALL dismiss that notice
3. WHEN a student swipes a card to the left, THE Card_Feed SHALL bookmark that notice
4. WHEN a student taps a card, THE Card_Feed SHALL expand the card to show full detail and the embedded PDF viewer
5. THE Card_Feed SHALL display a filter bar with options: All, Exam, Fee, Academic, Internship, Event, Guest Lecture, General
6. WHEN a student selects a filter, THE Card_Feed SHALL show only notices matching that category
7. THE Card_Feed SHALL load 10 notices initially and provide a "Load More" button to fetch the next page

### Requirement 14: Embedded PDF Viewer

**User Story:** As a student, I want to read the original PDF inside the app, so that I don't need to open a new browser tab.

#### Acceptance Criteria

1. WHEN a student taps "View PDF" on a notice card, THE Card_Feed SHALL render the PDF using pdf.js within an embedded viewer inside the app
2. THE Card_Feed SHALL NOT open PDFs in a new browser tab or window
3. THE Card_Feed SHALL load the PDF from the /notices/{id}/pdf proxy endpoint
4. WHILE a PDF is loading, THE Card_Feed SHALL display a loading indicator
5. IF the PDF fails to load, THEN THE Card_Feed SHALL display an error message with a retry option
6. WHEN a prefetched PDF is available (see Requirement 18), THE Card_Feed SHALL use the prefetched data instead of initiating a new download

### Requirement 15: Database Schema — Notices Table

**User Story:** As a developer, I want a well-structured notices table, so that processed notice metadata is stored efficiently for querying.

#### Acceptance Criteria

1. THE Notice_API SHALL persist each processed notice in a notices table with columns: notice_id (INT PK), title (TEXT), portal_date (DATE), category (VARCHAR 32), category_confidence (FLOAT), summary (TEXT, max 300 chars), extracted_text (TEXT), cleaned_text (TEXT), keywords (TEXT), deadline (DATE nullable), deadline_raw (VARCHAR 100), priority (INT 0–100), is_important (BOOL), target_program (VARCHAR 255 nullable), confidence_score (FLOAT), viewed_count (INT), pdf_url_path (VARCHAR 64), processing_status (VARCHAR 16), processing_version (INT default 1), created_at (DATETIME), updated_at (DATETIME)
2. THE Notice_API SHALL use notice_id as the primary key derived from the portal's NoticeID parameter
3. WHEN a notice is reprocessed, THE Notice_API SHALL update the existing row and set updated_at to the current timestamp
4. THE Notice_API SHALL store the processing_version as an integer that increments when the processing pipeline algorithm changes (category logic, summary algorithm, priority scoring)
5. WHEN a new processing_version is deployed, THE Notice_API SHALL NOT automatically reprocess existing notices; reprocessing is triggered only by explicit admin action or selective criteria

### Requirement 16: Database Schema — User Notices Table

**User Story:** As a developer, I want per-user notice personalization, so that each student's bookmarks and dismissals are independent.

#### Acceptance Criteria

1. THE Notice_API SHALL maintain a user_notices table with columns: id (INT PK auto-increment), user_id (VARCHAR — roll number), notice_id (INT FK), bookmarked (BOOL default False), dismissed (BOOL default False), opened_at (DATETIME nullable), last_viewed (DATETIME nullable), created_at (DATETIME)
2. THE Notice_API SHALL enforce a unique constraint on (user_id, notice_id) to prevent duplicate entries
3. WHEN a student interacts with a notice for the first time, THE Notice_API SHALL create a user_notices row with default values

### Requirement 17: Security and Data Privacy

**User Story:** As a student, I want my portal credentials secure and no permanent PDF storage, so that my data is protected.

#### Acceptance Criteria

1. THE PDF_Processor SHALL NOT persist PDF file bytes to disk or any permanent storage at any point during processing
2. THE PDF_Proxy SHALL NOT include portal authentication credentials in any response header or body sent to the client
3. THE Notice_API SHALL require a valid session token for all notice endpoints
4. IF a request lacks a valid session token, THEN THE Notice_API SHALL return a 401 status
5. THE Notice_Scraper SHALL use the same credential storage mechanism as the existing attendance/marks scraper (encrypted portal credentials)

### Requirement 18: PDF Prefetching

**User Story:** As a student, I want the PDF to open quickly when I tap "View PDF", so that I don't wait for a slow download.

#### Acceptance Criteria

1. WHEN a student expands a notice card (tap to view detail), THE Card_Feed SHALL begin prefetching the PDF for that notice from the /notices/{id}/pdf endpoint in the background
2. WHEN the prefetch completes before the student taps "View PDF", THE Card_Feed SHALL display the PDF instantly from the prefetched data
3. THE Card_Feed SHALL prefetch only the PDF of the currently expanded card and SHALL NOT prefetch PDFs for cards that are not expanded
4. IF a prefetch request fails, THEN THE Card_Feed SHALL attempt a fresh download when the student taps "View PDF" (no error shown during prefetch)
5. WHILE the device is on a metered connection (if detectable via Network Information API), THE Card_Feed SHALL skip prefetching and download only on explicit "View PDF" tap

### Requirement 19: Search-Ready Architecture

**User Story:** As a developer, I want the database and API architecture to support full-text search in a future version, so that adding search does not require schema migrations.

#### Acceptance Criteria

1. THE Notice_API SHALL store cleaned_text as a full TEXT column (not truncated) to enable future full-text search indexing
2. THE Notice_API SHALL store a keywords field (comma-separated extracted keywords) to support future keyword-based filtering
3. THE Notice_API database schema SHALL be compatible with PostgreSQL full-text search (tsvector/tsquery) without requiring column type changes
4. THE Notice_API SHALL accept an optional query parameter "q" on GET /notices that returns a 501 Not Implemented status in V1, reserving the parameter name for future search functionality

### Requirement 20: Shared Notice Processing Scope

**User Story:** As a developer, I want notice processing shared efficiently across students, so that the same notice is not processed multiple times while respecting program boundaries.

#### Acceptance Criteria

1. WHEN a notice has already been processed (processing_status = "done") and exists in the notices table, THE Notice_Scraper SHALL NOT reprocess it regardless of which student triggers the scrape
2. WHEN multiple students in the same program and semester trigger scrapes, THE Notice_Scraper SHALL reuse the already-processed notice metadata for all of them
3. THE Notice_Scraper SHALL use the first available authenticated session (from any student in the same program) to process new notices
4. WHEN a notice is scraped by one student and later requested by another student in the same program, THE Notice_API SHALL serve the pre-processed metadata without additional portal requests
5. IF the portal returns different notice lists for different programs, THEN THE Notice_Scraper SHALL track which program-session discovered each notice and store that as the source_program context for the Program_Detector
