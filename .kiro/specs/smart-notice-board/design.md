## Technical Design: Smart Notice Board

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                              │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  NoticesFeed │  │  NoticeCard  │  │  PdfViewerModal  │  │
│  │  (swipeable) │──│  (expandable)│──│  (pdf.js embed)  │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│         │                                      │            │
│  ┌──────────────┐              ┌──────────────────────┐     │
│  │ FilterBar    │              │ noticesApi.js service │     │
│  └──────────────┘              └──────────────────────┘     │
└────────────────────────────────────┬────────────────────────┘
                                     │ HTTP (token auth)
┌────────────────────────────────────┴────────────────────────┐
│                        BACKEND                               │
│                                                              │
│  ┌──────────────────┐   ┌────────────────────────────────┐  │
│  │  routers/notices  │   │  services/notice_service.py    │  │
│  │  (FastAPI router) │───│  (orchestrator)                │  │
│  └──────────────────┘   └────────────────┬───────────────┘  │
│                                          │                   │
│  ┌───────────────────────────────────────┼───────────────┐  │
│  │           Notice Processing Pipeline                   │  │
│  │                                                        │  │
│  │  ┌────────────┐  ┌─────────────┐  ┌───────────────┐   │  │
│  │  │ notice_    │  │ notice_     │  │ notice_       │   │  │
│  │  │ scraper.py │→ │ processor.py│→ │ classifier.py │   │  │
│  │  │            │  │ (pdfplumber)│  │ (category,    │   │  │
│  │  │ (HTML      │  │             │  │  priority,    │   │  │
│  │  │  parsing)  │  │             │  │  summary,     │   │  │
│  │  └────────────┘  └─────────────┘  │  deadline,    │   │  │
│  │                                    │  program)     │   │  │
│  │                                    └───────────────┘   │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────┐   ┌────────────────────────────────┐  │
│  │ notice_scheduler │   │ category_config.json           │  │
│  │ (30-min refresh) │   │ (external keyword config)      │  │
│  └──────────────────┘   └────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                  PostgreSQL                            │   │
│  │  ┌──────────────────┐  ┌────────────────────────┐    │   │
│  │  │    notices        │  │    user_notices         │    │   │
│  │  │ (shared metadata) │  │ (per-user state)       │    │   │
│  │  └──────────────────┘  └────────────────────────┘    │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

## Database Design

### notices table

```sql
CREATE TABLE notices (
    notice_id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    portal_date DATE NOT NULL,
    category VARCHAR(32) NOT NULL DEFAULT 'General',
    category_confidence FLOAT DEFAULT 0.0,
    summary TEXT,
    extracted_text TEXT,
    cleaned_text TEXT,
    keywords TEXT,
    deadline DATE,
    deadline_raw VARCHAR(100),
    priority INTEGER DEFAULT 0 CHECK (priority >= 0 AND priority <= 100),
    is_important BOOLEAN DEFAULT FALSE,
    target_program VARCHAR(255),
    confidence_score FLOAT DEFAULT 0.0,
    viewed_count INTEGER DEFAULT 0,
    pdf_url_path VARCHAR(64) NOT NULL,
    processing_status VARCHAR(16) NOT NULL DEFAULT 'pending',
    processing_version INTEGER DEFAULT 1,
    source_program VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notices_portal_date ON notices(portal_date DESC);
CREATE INDEX idx_notices_category ON notices(category);
CREATE INDEX idx_notices_priority ON notices(priority DESC);
CREATE INDEX idx_notices_target_program ON notices(target_program);
CREATE INDEX idx_notices_processing_status ON notices(processing_status);
```

### user_notices table

```sql
CREATE TABLE user_notices (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(32) NOT NULL,
    notice_id INTEGER NOT NULL REFERENCES notices(notice_id),
    bookmarked BOOLEAN DEFAULT FALSE,
    dismissed BOOLEAN DEFAULT FALSE,
    opened_at TIMESTAMP,
    last_viewed TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, notice_id)
);

CREATE INDEX idx_user_notices_user_id ON user_notices(user_id);
CREATE INDEX idx_user_notices_dismissed ON user_notices(user_id, dismissed);
```

## Backend Components

### 1. Notice Scraper (`services/notice_scraper.py`)

Responsible for fetching `Notice.aspx` and extracting the list of notices.

```python
def scrape_notice_list(scraper: PortalScraper) -> list[dict]:
    """
    Fetches Notice.aspx, parses the table, returns list of:
    {notice_id: int, title: str, portal_date: str, viewed: bool, pdf_url_path: str}
    """

def get_new_notice_ids(scraped: list[dict]) -> list[int]:
    """Compare against DB, return only notice_ids not yet in notices table."""

def trigger_scrape_for_session(token: str) -> dict:
    """Uses the student's existing session to scrape notices."""
```

### 2. Notice Processor (`services/notice_processor.py`)

Downloads PDFs, extracts text, runs the metadata pipeline.

```python
def process_notice(notice_id: int, scraper: PortalScraper) -> None:
    """
    1. Download PDF to memory (io.BytesIO)
    2. Extract text via pdfplumber
    3. Clean text (normalize whitespace, remove non-printable)
    4. Run category classifier
    5. Run priority scorer
    6. Run summary generator
    7. Run deadline detector
    8. Run program detector
    9. Store all metadata in notices table
    10. Discard PDF bytes
    """

def process_batch(notice_ids: list[int], scraper: PortalScraper, max_workers: int = 4) -> None:
    """Process multiple notices using ThreadPoolExecutor."""
```

### 3. Category Classifier (`services/notice_classifier.py`)

```python
def classify(title: str, text: str) -> tuple[str, float]:
    """
    Returns (category_name, confidence_score).
    Loads keywords from category_config.json.
    Title keywords weighted 2x vs PDF text keywords.
    """

def score_priority(title: str, text: str, deadline: date | None) -> int:
    """
    Additive scoring:
    - Hall Ticket: +40
    - Deadline detected & ≤3 days: +30
    - Mandatory/Compulsory: +15
    - Today's date in text: +20
    - Exam keyword: +25
    - Fee keyword: +15
    - Submission keyword: +10
    Clamp to 0-100.
    """

def generate_summary(cleaned_text: str, title: str, category: str) -> str:
    """
    Score each sentence, return highest-scoring one (max 300 chars).
    Scoring: date +3, deadline phrase +3, action verb +2, category keyword +2,
    first-3-sentences +1, greeting -1.
    """

def detect_deadline(text: str) -> tuple[date | None, str | None]:
    """
    Regex for date patterns near deadline phrases.
    Returns (parsed_date, raw_phrase) or (None, None).
    """

def detect_program(title: str, text: str, source_program: str | None) -> tuple[str | None, float]:
    """
    Multi-signal: keywords in title (weight 0.4), keywords in text (weight 0.4),
    source_program cookie (weight 0.2).
    Returns (target_program, confidence_score).
    Program keywords: BBA, MBA, B.Tech, M.Tech, BCA, Law, Architecture.
    """
```

### 4. Notice Scheduler (`services/notice_scheduler.py`)

```python
# Uses BackgroundTasks or threading.Timer for 30-min refresh
class NoticeScheduler:
    def __init__(self):
        self._running = False
        self._interval_seconds = 1800  # 30 minutes

    def start(self):
        """Start the periodic scrape loop (called on app startup)."""

    def stop(self):
        """Stop the scheduler gracefully."""

    def _run_cycle(self):
        """
        1. Pick an available session from session_store
        2. Scrape notice list
        3. Find new IDs
        4. Process new notices
        """
```

### 5. Notice Router (`routers/notices.py`)

```python
router = APIRouter(prefix="/notices", tags=["notices"])

@router.get("")           # GET /notices?limit=10&offset=0&category=Exam&include_dismissed=false&q=
@router.get("/stats")     # GET /notices/stats
@router.get("/{id}")      # GET /notices/{id}
@router.get("/{id}/pdf")  # GET /notices/{id}/pdf (streaming proxy)
@router.post("/{id}/bookmark")  # POST /notices/{id}/bookmark
@router.post("/{id}/dismiss")   # POST /notices/{id}/dismiss
@router.post("/refresh")        # POST /notices/refresh
```

### 6. Category Config (`backend/category_config.json`)

```json
{
  "version": 1,
  "categories": [
    {
      "name": "Exam",
      "color": "#FF5B5B",
      "priority_rank": 1,
      "keywords": ["EXAM", "TIMETABLE", "SEATING ARRANGEMENT", "HALL TICKET", ...]
    },
    ...
  ]
}
```

## Frontend Components

### 1. NoticesFeed Page (`pages/Notices.jsx`)

- Main container for the notice board feature
- Manages state: notices list, active filter, loading, pagination
- Calls `GET /notices` on mount and handles "Load More"
- Passes data to child components

### 2. NoticeCard Component (`components/notices/NoticeCard.jsx`)

- Renders a single swipeable card with:
  - Category chip (colored dot + label)
  - Priority badge (🔥 if priority > 60)
  - Title (bold, large)
  - Summary (2 lines, grey)
  - Deadline pill (red, "Due Jul 2") if applicable
  - Relative date ("3d ago")
  - "NEW" dot if unread
- Touch handlers for swipe left/right gestures
- Tap to expand into full detail view

### 3. NoticeDetail Component (`components/notices/NoticeDetail.jsx`)

- Expanded view with full summary, extracted text, all metadata
- "View PDF" button → opens PdfViewerModal
- Triggers PDF prefetch on mount

### 4. PdfViewerModal (`components/notices/PdfViewerModal.jsx`)

- Full-screen modal with pdf.js rendering
- Loads from `/notices/{id}/pdf` proxy
- Loading spinner while fetching
- Error state with retry button
- Close button to dismiss

### 5. FilterBar (`components/notices/FilterBar.jsx`)

- Horizontal scrollable chips: All · Exam · Fee · Academic · Internship · Event · Guest Lecture · General
- Each chip shows category color dot
- Active state styling

### 6. Frontend API Service (`services/noticesApi.js`)

```javascript
export async function fetchNotices({ token, limit, offset, category, includeDismissed })
export async function fetchNoticeDetail({ token, noticeId })
export async function fetchNoticeStats({ token })
export async function bookmarkNotice({ token, noticeId })
export async function dismissNotice({ token, noticeId })
export async function refreshNotices({ token })
export function getNoticePdfUrl(noticeId) // returns proxy URL for pdf.js
```

## Data Flow

### Scrape Cycle (every 30 min)

```
1. Scheduler picks an active session from session_store
2. GET Notice.aspx → parse HTML table → list of {id, title, date, pdf_path}
3. Compare against notices table → find new IDs
4. For each new notice:
   a. Download Notice/{id}.pdf into io.BytesIO
   b. pdfplumber.open(bytes) → extract all page text
   c. Clean text (whitespace, non-printable)
   d. Run classifier pipeline (category, priority, summary, deadline, program)
   e. INSERT into notices table with processing_status='done'
   f. Discard PDF bytes
5. Log: "{N} new notices processed in {T}ms"
```

### User Request Flow

```
1. Student opens Notices page
2. Frontend: GET /notices?limit=10&offset=0 (with token header)
3. Backend:
   a. Validate token → get roll_number
   b. Look up program from student_registry
   c. Query notices WHERE target_program = student_program OR target_program IS NULL
   d. LEFT JOIN user_notices to get bookmark/dismiss/read status
   e. Exclude dismissed (unless include_dismissed=true)
   f. ORDER BY priority DESC, portal_date DESC
   g. LIMIT/OFFSET pagination
4. Return JSON array of notice cards
```

### PDF Viewing Flow

```
1. Student taps "View PDF" on expanded card
2. Frontend: pdf.js loads from /notices/{id}/pdf
3. Backend:
   a. Validate token → get session record
   b. Look up notice → get pdf_url_path
   c. Use scraper session → GET http://portal/sz/Notice/{id}.pdf
   d. Stream response bytes with Content-Type: application/pdf
4. pdf.js renders the streamed PDF in-app
```

## Key Design Decisions

1. **User's session for scraping** — No service account needed. The scheduler picks any active session from the session_store. If no sessions are active, scraping waits.

2. **30-min refresh is safe** — Notice.aspx fetch is only 0.06s and ~430KB. This doesn't strain the portal.

3. **ThreadPoolExecutor for PDF batch** — Up to 4 concurrent PDF downloads. Total time for 10 new notices ≈ 2s.

4. **No PDF disk storage** — PDFs exist only in memory during extraction. Only text + metadata persists.

5. **pdf.js for embedded viewing** — Using `pdfjs-dist` npm package. Renders in a canvas element within a modal.

6. **Category config as JSON file** — Hot-reloadable without server restart. Categories can be tuned by editing one file.

7. **Additive priority scoring** — Easy to tune. Add new signals by adding a single line. No ML, no training data needed.

8. **Program filtering via student_registry** — No extra portal call needed. Program is already stored on login.

## File Structure

```
backend/
├── routers/notices.py              # API endpoints
├── services/
│   ├── notice_service.py           # Orchestrator
│   ├── notice_scraper.py           # HTML parsing
│   ├── notice_processor.py         # PDF extraction + pipeline
│   ├── notice_classifier.py        # Category, priority, summary, deadline, program
│   └── notice_scheduler.py         # 30-min background loop
├── db/models/
│   ├── notice.py                   # SQLAlchemy model
│   └── user_notice.py              # SQLAlchemy model
├── alembic/versions/
│   └── XXXX_create_notices_tables.py
└── category_config.json            # External keyword config

frontend/src/
├── pages/Notices.jsx               # Main page
├── components/notices/
│   ├── NoticeCard.jsx              # Swipeable card
│   ├── NoticeDetail.jsx            # Expanded view
│   ├── PdfViewerModal.jsx          # pdf.js viewer
│   └── FilterBar.jsx               # Category filter
└── services/noticesApi.js          # API calls
```

## Dependencies (new)

**Backend:**
- `pdfplumber` — PDF text extraction (already tested, 100% success rate)

**Frontend:**
- `pdfjs-dist` — PDF rendering in browser canvas
- Touch gesture handling via CSS transforms + pointer events (no external lib needed)
