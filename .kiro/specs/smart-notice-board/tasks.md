# Implementation Tasks: Smart Notice Board

## Task 1: Database Models & Migration
- [x] Create `backend/db/models/notice.py` — SQLAlchemy model for `notices` table with all columns (notice_id PK, title, portal_date, category, category_confidence, summary, extracted_text, cleaned_text, keywords, deadline, deadline_raw, priority, is_important, target_program, confidence_score, viewed_count, pdf_url_path, processing_status, processing_version, source_program, created_at, updated_at)
- [x] Create `backend/db/models/user_notice.py` — SQLAlchemy model for `user_notices` table (id PK, user_id, notice_id FK, bookmarked, dismissed, opened_at, last_viewed, created_at, unique constraint on user_id+notice_id)
- [x] Create Alembic migration to create both tables with indexes (portal_date DESC, category, priority DESC, target_program, processing_status, user_id, user_id+dismissed)
- [x] Register models in `db/models/__init__.py`
- [x] Run migration locally and verify schema

**Requirements:** 15, 16

## Task 2: Category Config File
- [x] Create `backend/category_config.json` with all 7 categories (Exam, Fee, Academic, Internship, Event, Guest Lecture, General), each having name, color, priority_rank, and keywords array
- [x] Implement config loader in `services/notice_classifier.py` that reads the JSON file at startup and provides a `get_categories()` function
- [x] Add fallback to hardcoded defaults if config file is missing/malformed (with warning log)

**Requirements:** 4

## Task 3: Notice Scraper Service
- [ ] Create `backend/services/notice_scraper.py` with `scrape_notice_list(scraper: PortalScraper) -> list[dict]` that fetches `Notice.aspx` and parses the HTML table
- [ ] Implement `get_new_notice_ids(scraped_notices: list[dict]) -> list[int]` that compares against DB to find unprocessed notices
- [ ] Handle auth errors and portal unreachable gracefully (log + return empty list)
- [ ] Add `pdfplumber` to `backend/requirements.txt`

**Requirements:** 1, 2, 3

## Task 4: Notice Processor — PDF Extraction & Metadata Pipeline
- [ ] Create `backend/services/notice_processor.py` with `process_notice(notice_id, scraper)` function
- [ ] Implement PDF download to `io.BytesIO`, text extraction via `pdfplumber`, and byte discard
- [ ] Implement text cleaning: normalize whitespace, remove non-printable chars, store as `cleaned_text`
- [ ] Implement `process_batch(notice_ids, scraper, max_workers=4)` using `ThreadPoolExecutor`
- [ ] Set `processing_status` to "done" on success, "failed" on any error

**Requirements:** 3

## Task 5: Category Classification Engine
- [ ] Implement `classify(title, text) -> (category, confidence)` in `notice_classifier.py`
- [ ] Match keywords case-insensitively against title (2x weight) and PDF text
- [ ] When multiple categories match, pick highest priority_rank from config
- [ ] Calculate confidence as matched_keywords / total_keywords for winning category, clamped to 1.0
- [ ] Default to "General" if no match

**Requirements:** 4

## Task 6: Priority Scoring Engine
- [ ] Implement `score_priority(title, text, deadline) -> int` in `notice_classifier.py`
- [ ] Additive signals: Hall Ticket (+40), Deadline ≤3 days (+30), Mandatory (+15), Today (+20), Exam (+25), Fee (+15), Submission (+10)
- [ ] Clamp result to 0–100
- [ ] Set `is_important = True` when score > 60

**Requirements:** 5

## Task 7: Summary Generation Algorithm
- [ ] Implement `generate_summary(cleaned_text, title, category) -> str` in `notice_classifier.py`
- [ ] Sentence scoring: date pattern +3, deadline phrase +3, action verb +2, category keyword +2, first-3 sentences +1, greeting -1
- [ ] Select highest-scoring sentence, truncate at 300 chars (word boundary + "...")
- [ ] Fallback to title if cleaned_text < 10 chars

**Requirements:** 6

## Task 8: Deadline Detection
- [ ] Implement `detect_deadline(text) -> (date|None, str|None)` in `notice_classifier.py`
- [ ] Regex patterns: DD/MM/YYYY, DD-MM-YYYY, "DD Month YYYY", "Month DD, YYYY"
- [ ] Trigger phrases: "last date", "due by", "before", "on or before", "submit by", "deadline", "scheduled on"
- [ ] Pick earliest future date when multiple found

**Requirements:** 7

## Task 9: Program Detection
- [ ] Implement `detect_program(title, text, source_program) -> (str|None, float)` in `notice_classifier.py`
- [ ] Multi-signal: title keywords (0.4 weight), PDF text keywords (0.4), source_program cookie (0.2)
- [ ] Program keywords: BBA, MBA, B.Tech, M.Tech, BCA, BCom, Law, Architecture
- [ ] Return None for target_program when notice is genuinely for all programs
- [ ] Return confidence_score 0.0–1.0

**Requirements:** 8

## Task 10: Notice Scheduler (30-min Auto-Refresh)
- [ ] Create `backend/services/notice_scheduler.py` with `NoticeScheduler` class
- [ ] Implement 30-minute background loop using `threading.Timer`
- [ ] Pick an available session from `session_store` for scraping
- [ ] Start scheduler in `app.py` on_startup, stop on shutdown
- [ ] Add lock to prevent concurrent scrape cycles

**Requirements:** 2

## Task 11: Notice Service (Orchestrator)
- [ ] Create `backend/services/notice_service.py` as the main orchestrator
- [ ] `fetch_notices_for_user(token, limit, offset, category, include_dismissed)` — queries DB with program filter + pagination
- [ ] `get_notice_detail(token, notice_id)` — returns full notice + updates user_notices
- [ ] `get_notice_stats(token)` — returns unread/critical/bookmarked/dismissed/total counts
- [ ] `toggle_bookmark(token, notice_id)` — toggles bookmarked in user_notices
- [ ] `dismiss_notice(token, notice_id)` — sets dismissed=True in user_notices
- [ ] `trigger_refresh(token)` — runs immediate scrape using student's session

**Requirements:** 9, 10, 11

## Task 12: Notice API Router
- [ ] Create `backend/routers/notices.py` with FastAPI router
- [ ] `GET /notices` — paginated list (limit, offset, category, include_dismissed, q params)
- [ ] `GET /notices/stats` — stats endpoint
- [ ] `GET /notices/{id}` — notice detail
- [ ] `GET /notices/{id}/pdf` — streaming PDF proxy (StreamingResponse)
- [ ] `POST /notices/{id}/bookmark` — toggle bookmark
- [ ] `POST /notices/{id}/dismiss` — dismiss
- [ ] `POST /notices/refresh` — force refresh
- [ ] Register router in `app.py`
- [ ] All endpoints require valid session token (401 if missing)
- [ ] `q` param returns 501 Not Implemented in V1

**Requirements:** 9, 10, 11, 12, 17, 19

## Task 13: PDF Proxy Endpoint
- [ ] Implement `GET /notices/{id}/pdf` in the router
- [ ] Validate token, look up notice's `pdf_url_path`
- [ ] Use student's scraper session to download the PDF from portal
- [ ] Return as `StreamingResponse` with Content-Type: application/pdf
- [ ] Never expose portal URL or credentials in response
- [ ] Return 404 if PDF unavailable

**Requirements:** 12, 17

## Task 14: Frontend — Notices API Service
- [ ] Create `frontend/src/services/noticesApi.js`
- [ ] `fetchNotices({ token, limit, offset, category, includeDismissed })`
- [ ] `fetchNoticeDetail({ token, noticeId })`
- [ ] `fetchNoticeStats({ token })`
- [ ] `bookmarkNotice({ token, noticeId })`
- [ ] `dismissNotice({ token, noticeId })`
- [ ] `refreshNotices({ token })`
- [ ] `getNoticePdfUrl(noticeId)` — returns the proxy URL string

**Requirements:** 9, 10, 11, 12

## Task 15: Frontend — NoticeCard Component (Swipeable)
- [ ] Create `frontend/src/components/notices/NoticeCard.jsx`
- [ ] Render: category chip (colored), priority badge (🔥 if >60), title, summary (2 lines), deadline pill, relative date, "NEW" dot
- [ ] Implement swipe gestures using pointer events + CSS transforms
- [ ] Swipe right → dismiss (call API + remove from list)
- [ ] Swipe left → bookmark (call API + update state)
- [ ] Tap → expand (call parent onExpand)
- [ ] Smooth animation on swipe/dismiss

**Requirements:** 13

## Task 16: Frontend — NoticesFeed Page
- [ ] Create `frontend/src/pages/Notices.jsx`
- [ ] Fetch notices on mount (limit=10)
- [ ] Manage state: notices array, loading, offset, activeFilter, showDismissed
- [ ] Render FilterBar + list of NoticeCard components
- [ ] "Load More" button at bottom (increment offset, append results)
- [ ] "Show dismissed" toggle → re-fetch with include_dismissed=true
- [ ] Handle expand → show NoticeDetail
- [ ] Add route `/app/notices` in AppRoutes.jsx
- [ ] Add "Notices" tab in navigation

**Requirements:** 13, 11

## Task 17: Frontend — FilterBar Component
- [ ] Create `frontend/src/components/notices/FilterBar.jsx`
- [ ] Horizontal scrollable row of category chips: All, Exam, Fee, Academic, Internship, Event, Guest Lecture, General
- [ ] Each chip shows category color dot + label
- [ ] Active chip highlighted
- [ ] On select → parent re-fetches with category filter

**Requirements:** 13

## Task 18: Frontend — NoticeDetail & PDF Viewer
- [ ] Create `frontend/src/components/notices/NoticeDetail.jsx` — expanded card with full info
- [ ] Create `frontend/src/components/notices/PdfViewerModal.jsx` — full-screen pdf.js viewer
- [ ] Install `pdfjs-dist` npm package
- [ ] PdfViewerModal loads PDF from `/notices/{id}/pdf` proxy URL
- [ ] Loading spinner while fetching, error state with retry
- [ ] PDF prefetch: start downloading when card expands (before user taps "View PDF")
- [ ] Skip prefetch on metered connections (Network Information API check)
- [ ] Close button to dismiss viewer

**Requirements:** 14, 18

## Task 19: Integration & Deployment
- [ ] Add `pdfplumber` to `backend/requirements.txt`
- [ ] Run Alembic migration on production server
- [ ] Install `pdfplumber` in production venv
- [ ] Install `pdfjs-dist` in frontend (npm)
- [ ] Deploy backend (restart service)
- [ ] Verify health check
- [ ] Test with real student login: scrape → process → view feed → open PDF

**Requirements:** All

## Task 20: Testing & Hardening
- [ ] Test with multiple students from different programs (BBA, B.Tech, BCA)
- [ ] Verify program filtering (BBA student doesn't see B.Tech-only notices)
- [ ] Test scheduler running 30-min cycle without errors
- [ ] Test PDF proxy streaming for large PDFs (>500KB)
- [ ] Test concurrent scrape rejection (only one cycle at a time)
- [ ] Verify no PDF bytes persisted on disk (check /tmp, process memory)
- [ ] Test edge cases: empty PDF, scanned image PDF, portal down
- [ ] Verify stats endpoint returns correct counts

**Requirements:** All
