# Attend75

A college attendance tracking and study management application for ICFAI / IBS students. Scrapes the college student portal to provide real-time attendance data, consolidated marks, faculty contacts, notice board, and study tools in a modern mobile-first PWA interface.

## Tech Stack

**Frontend:** React 19 · Vite · Tailwind CSS 3 · React Router 7 · Firebase Auth · Lucide Icons · react-pdf · react-katex · vite-plugin-pwa

**Backend:** Python · FastAPI · SQLAlchemy · Alembic · BeautifulSoup4 · pdfplumber · Firebase Admin SDK · Cryptography (Fernet) · pywebpush

**Database:** SQLite (development) · PostgreSQL (production)

**Payments:** PhonePe UPI Autopay (₹19/month)

**Deployment:** Cloudflare Pages (frontend) · Oracle Cloud Free Tier (backend)

---

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   React PWA     │────▶│  FastAPI Backend  │────▶│  College Portal │
│  (Cloudflare    │     │  (Uvicorn/Oracle) │     │  (ASP.NET)      │
│   Pages)        │     └──────────────────┘     └─────────────────┘
└─────────────────┘             │
        │                       ├── PostgreSQL
        │                       ├── In-memory Session Store
        │                       ├── DB-backed Notification Queue
        │                       ├── Firebase Admin SDK
        │                       └── PhonePe Payment Gateway
        │
        ├── Firebase Auth (Google Sign-In)
        └── Web Push API (VAPID, browser service worker)
```

### Data Flow

1. User logs in with roll number + password (or Google Sign-In)
2. Backend creates a `PortalScraper` instance, authenticates with the college portal
3. Scraper fetches attendance data and returns it to the frontend
4. A session token is issued; the scraper instance is stored in memory with a 12-hour TTL
5. All subsequent requests (attendance, marks, history, faculty) use the same scraper session
6. Multi-layer caching at the scraper level minimises portal requests
7. Background fetcher periodically refreshes data for Firebase-linked premium users

---

## Features

### Dashboard
- Overall attendance percentage with ring chart
- Subjects ranked by risk with progress bars
- Target prediction (can miss / to attend)
- Semester selection
- Quick metrics: subjects below target, total absents, mails sent
- Mobile-optimised layout with expandable cards

### Attendance History
- Calendar view with date selection and dot indicators
- Timeline view (mobile) with horizontal date scroller
- Day-by-day attendance detail per subject
- Mail Faculty action for absent entries
- Current Streak calculation (consecutive full-attendance days)
- Present/Absent summary statistics

### Consolidated Marks
- Radar chart visualisation across subjects
- Credit-weighted average calculation
- Strongest/weakest subject identification
- Per-subject component breakdown
- Interactive subject selection synced with radar chart

### Mail Faculty
- Compose attendance request emails to faculty
- Auto-fills faculty email, student name, and absence date
- Reason selection (sick, medical, family emergency, etc.)
- Opens native mail client via `mailto:` with pre-filled subject and body
- Tracks compose/send events for analytics

### Notice Board
- Scraped from college portal every 30 minutes
- Category filters: Exam, Fee, Academic, Internship, Event, Guest Lecture, General
- Horizontal card carousel with snap scrolling
- Bookmark and dismiss per notice
- Notice detail modal with summary, deadline, keywords
- PDF proxy — streams portal PDFs without exposing credentials
- Notice stats: unread count, category breakdown

### My Timetable
- Parses the latest regular class timetable notice (PDF → text via pdfplumber + ASCII table)
- Filters to the student's enrolled subjects and sections
- Day selector pills with today highlighted
- Per-class cards: course code, section, time slot, room, faculty
- Language course matching (IMIL/FML ↔ MLH/MLT/MLS etc.)
- Embedded directly in the Notice Board page

### Push Notifications (Premium)
Premium users (₹19/month) receive Web Push notifications via browser service worker:

- **Notice alerts** — new notices filtered by enrolled program and category preferences
- **Deadline reminders** — 3-day and 1-day reminders for notices with deadlines
- **Attendance alerts** — bracket-based dedup: warning at 75–80%, critical below 75%, recovery on climb above 80%
- **Class reminders** — individual push before each class (10/15/30/60 min lead time)
- **Daily digest** — morning summary of today's classes (configurable 6–10 AM IST)
- **Tomorrow preview** — 9 PM preview of next day's schedule with skip-ability info
- **Weekly summary** — Monday morning attendance overview with delta from last week
- **Nudge** — re-engagement push for students inactive 3–14 days
- **Timetable change** — instant push when a new timetable notice is posted

### Premium Subscription
- ₹19/month via PhonePe UPI Autopay mandate
- Gated features: Push Notifications, Background Fetcher, Timetable Reminders
- Grace period after payment failure before access is revoked
- In-app subscription status, cancel, and transaction history

### Notification Settings
- Master toggles per category (notices, attendance, timetable, digest, weekly summary)
- Per-category notice filters (exam, fee, academic, internship, event, etc.)
- Class reminder lead time: 10, 15, 30, or 60 minutes
- Daily digest time: 6–10 AM IST in 30-minute increments
- Notification history with read/unread state

### StudyMe
- Subject-based lesson roadmap
- Per-lesson formulas with LaTeX rendering
- Topic practice questions with worked solutions
- PDF viewer for course materials
- YouTube learning integration
- Community importance voting (mark lessons/topics as important)
- Progress tracking (localStorage)

### Profile
- User info with attendance status badge
- Portal sync status
- Star rating (1-5, persisted to database)
- Share app functionality
- Feedback submission
- Attendance target configuration

### Admin Dashboard
- User analytics with growth charts
- Session and request metrics
- Scraper performance monitoring (success rate, latency, downtime detection)
- Feature usage analytics (mail faculty, marks views, etc.)
- Feedback management with status workflow
- StudyMe analytics
- Broadcast push notifications to all premium users or by program
- Background fetcher health monitoring

---

## Project Structure

```
Attend75/
├── backend/
│   ├── app.py                    # FastAPI application + startup/shutdown lifecycle
│   ├── requirements.txt          # Python dependencies
│   ├── alembic.ini               # Migration config
│   ├── alembic/                  # Database migrations
│   ├── db/
│   │   ├── base.py              # SQLAlchemy Base
│   │   ├── session.py           # Engine + SessionLocal factory
│   │   └── models/
│   │       ├── user.py
│   │       ├── portal_credential.py
│   │       ├── student_registry.py        # Roll/program/last-seen/attendance% index
│   │       ├── feedback_entry.py
│   │       ├── feature_usage_event.py
│   │       ├── studyme_event.py
│   │       ├── studyme_important_vote.py
│   │       ├── user_rating.py
│   │       ├── notice.py                  # Notice board entries + PDF metadata
│   │       ├── user_notice.py             # Per-user bookmark/dismiss state
│   │       ├── premium_subscription.py    # PhonePe subscription + status
│   │       ├── payment_transaction.py     # PhonePe payment history
│   │       ├── push_subscription.py       # Web Push endpoint (encrypted)
│   │       ├── notification_preference.py # Per-user push preferences
│   │       ├── notification_job.py        # DB-backed job queue
│   │       ├── notification_history.py    # Delivered notification log
│   │       ├── attendance_alert_state.py  # Per-subject bracket dedup state
│   │       ├── background_fetch_state.py  # Background fetcher metrics
│   │       ├── college_interest.py
│   │       └── pwa_install.py
│   ├── models/
│   │   └── schemas.py           # Pydantic request/response models
│   ├── routers/
│   │   ├── auth.py              # Attendance, marks, history, streak, ratings
│   │   ├── firebase_auth.py     # Google Sign-In flow
│   │   ├── admin.py             # Admin dashboard + broadcast endpoints
│   │   ├── feedback.py          # User feedback
│   │   ├── studyme.py           # StudyMe events + importance voting
│   │   ├── notices.py           # Notice board + timetable endpoint
│   │   ├── push.py              # Push subscribe/unsubscribe/prefs/history
│   │   └── premium.py           # Premium status/subscribe/cancel/webhook
│   ├── scrapers/
│   │   └── portal_scraper.py    # College portal scraper (~1700 lines)
│   ├── services/
│   │   ├── auth_service.py
│   │   ├── session_store.py
│   │   ├── firebase_auth_service.py
│   │   ├── firebase_user_service.py
│   │   ├── crypto_service.py            # Fernet encryption
│   │   ├── admin_service.py
│   │   ├── admin_analytics_service.py
│   │   ├── feedback_service.py
│   │   ├── feature_usage_event_service.py
│   │   ├── feature_usage_metrics.py
│   │   ├── rating_service.py
│   │   ├── request_metrics.py
│   │   ├── scraper_metrics.py
│   │   ├── student_registry_service.py
│   │   ├── account_deletion_service.py
│   │   ├── notice_scraper.py            # Portal notice list fetcher
│   │   ├── notice_processor.py          # PDF → text → metadata pipeline
│   │   ├── notice_classifier.py         # Category / deadline / priority detection
│   │   ├── notice_service.py            # Notice query + bookmark/dismiss logic
│   │   ├── notice_scheduler.py          # 30-min background scrape loop
│   │   ├── notice_dispatcher.py         # New-notice → push job dispatch
│   │   ├── timetable_service.py         # Timetable parsing + personalisation
│   │   ├── timetable_reminder_engine.py # Daily class reminder + digest scheduler
│   │   ├── premium_service.py           # Premium status / gating
│   │   ├── phonepe_service.py           # UPI Autopay mandate + webhook
│   │   ├── subscription_manager.py      # Push subscription CRUD + encryption
│   │   ├── push_worker.py               # Web Push delivery worker (pywebpush)
│   │   ├── payload_builder.py           # Notification payload builder (4KB cap)
│   │   ├── preference_filter.py         # Should-send checks per preference flag
│   │   ├── notification_queue.py        # DB-backed job enqueue/claim/complete
│   │   ├── notification_history_service.py
│   │   ├── attendance_monitor.py        # Bracket-dedup attendance alert engine
│   │   ├── background_fetcher.py        # 6-hourly portal fetch for Firebase users
│   │   ├── deadline_service.py          # Daily deadline reminder scheduler
│   │   ├── weekly_summary_service.py    # Monday morning summary push
│   │   ├── nudge_service.py             # Inactive-user re-engagement push
│   │   ├── broadcast_service.py         # Admin broadcast push
│   │   ├── marks_notification_service.py
│   │   ├── retention_service.py         # Stale data cleanup scheduler
│   │   └── subject_request_service.py
│   └── scripts/
│       ├── migrate_sqlite_to_postgres.py
│       └── verify_postgres_migration.py
├── frontend/
│   ├── package.json
│   ├── vite.config.js
│   ├── vercel.json              # Deployment + API proxy config
│   ├── index.html
│   └── src/
│       ├── App.jsx
│       ├── main.jsx
│       ├── index.css            # Tailwind + custom animations
│       ├── routes/AppRoutes.jsx # Lazy-loaded routing
│       ├── store/AppStateProvider.jsx  # Context + Reducer state
│       ├── hooks/useAppStore.js
│       ├── pwa/                 # Service worker push handlers
│       ├── pages/               # All page components
│       │   ├── Dashboard.jsx
│       │   ├── History.jsx
│       │   ├── Marks.jsx
│       │   ├── Notices.jsx      # Notice board + timetable section
│       │   ├── Premium.jsx
│       │   ├── NotificationSettings.jsx
│       │   ├── NotificationHistory.jsx
│       │   ├── Profile.jsx
│       │   ├── StudyMe.jsx (+ sub-pages)
│       │   └── admin/
│       ├── components/          # UI components by feature
│       │   ├── notices/         # FilterBar, NoticeCard, NoticeDetail, TimetableView, PdfViewerModal
│       │   └── ...
│       ├── services/            # API clients
│       │   ├── attendanceApi.js
│       │   ├── noticesApi.js    # Notices + timetable fetch
│       │   ├── pushApi.js       # Push subscribe/prefs/history
│       │   ├── premiumApi.js    # Premium status/subscribe/cancel
│       │   ├── adminApi.js
│       │   ├── firebaseAuth.js
│       │   ├── sessionPersistence.js
│       │   ├── offlineQueue.js
│       │   ├── studyMeAnalytics.js
│       │   ├── studyMeImportance.js
│       │   └── studyProgress.js
│       ├── constants/           # StudyMe content, dummy data
│       └── utils/               # Calculations, formatting
└── README.md
```

---

## API Endpoints

### Core

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/login` | Guest login with portal credentials |
| POST | `/attendance` | Fetch attendance for semester |
| POST | `/attendance/history` | Fetch day-by-day history for a date |
| POST | `/attendance/streak` | Calculate current streak |
| POST | `/session/status` | Check session validity |
| POST | `/marks/consolidated` | Fetch consolidated marks |
| POST | `/faculty/contacts` | Fetch faculty emails |
| POST | `/feature-usage/track` | Track feature usage event |
| POST | `/feature-usage/mails-sent` | Get user's mail send count |
| POST | `/rating/submit` | Submit star rating |
| POST | `/rating/get` | Get user's rating |
| POST | `/auth/firebase/login` | Firebase Google sign-in |
| POST | `/auth/firebase/link-credentials` | Link portal credentials to Google account |
| POST | `/feedback` | Submit feedback |
| POST | `/studyme/events` | Track StudyMe events |
| POST | `/studyme/importance/query` | Query importance votes |
| POST | `/studyme/importance/lesson/toggle` | Toggle lesson importance |
| POST | `/studyme/importance/topic/toggle` | Toggle topic importance |

### Notice Board

| Method | Path | Description |
|--------|------|-------------|
| GET | `/notices` | List notices (paginated, filterable by category) |
| GET | `/notices/stats` | Unread count + category breakdown |
| GET | `/notices/timetable` | Personalised timetable for current student |
| GET | `/notices/{id}` | Notice detail (summary, keywords, deadline) |
| GET | `/notices/{id}/pdf` | Stream PDF from portal (authenticated proxy) |
| POST | `/notices/{id}/bookmark` | Toggle bookmark |
| POST | `/notices/{id}/dismiss` | Dismiss notice |
| POST | `/notices/refresh` | Trigger immediate portal scrape |

### Push Notifications

| Method | Path | Description |
|--------|------|-------------|
| GET | `/push/vapid-public-key` | VAPID public key for browser subscription |
| POST | `/push/subscribe` | Register Web Push subscription (premium required) |
| DELETE | `/push/subscribe` | Unregister subscription |
| GET | `/push/preferences` | Get notification preferences |
| PUT | `/push/preferences` | Update notification preferences |
| GET | `/push/history` | Notification history + unread count |
| POST | `/push/history/{id}/read` | Mark notification as read |

### Premium

| Method | Path | Description |
|--------|------|-------------|
| GET | `/premium/status` | Subscription status + expiry |
| POST | `/premium/subscribe` | Initiate PhonePe UPI Autopay mandate |
| POST | `/premium/cancel` | Cancel subscription |
| POST | `/premium/webhook` | PhonePe payment callback (HMAC-verified) |
| GET | `/premium/transactions` | Payment transaction history |

### Admin

| Method | Path | Description |
|--------|------|-------------|
| POST | `/admin/auth/login` | Admin login |
| POST | `/admin/auth/logout` | Admin logout |
| GET | `/admin/overview` | Dashboard data (users, sessions, scraper metrics) |
| GET | `/admin/feedback` | Feedback log |
| PATCH | `/admin/feedback/{id}/status` | Update feedback status |

---

## Background Schedulers

All schedulers run as `threading.Timer` daemon threads started at app startup.

| Scheduler | Trigger | Purpose |
|-----------|---------|---------|
| `NoticeScheduler` | Every 30 min | Scrape portal for new notices, process PDFs, dispatch push jobs |
| `TimetableReminderScheduler` | Daily 5:30 AM IST | Schedule per-class reminders + daily digest for premium students |
| `TimetableReminderScheduler` (evening) | Daily 9:00 PM IST | Send tomorrow's schedule preview |
| `DeadlineScheduler` | Daily 7:00 AM IST | 3-day and 1-day deadline reminders for notice deadlines |
| `WeeklySummaryScheduler` | Monday 9:00 AM IST | Weekly attendance summary push |
| `NudgeScheduler` | Daily 10:00 AM IST | Re-engagement push for inactive students (3–14 days) |
| `BackgroundFetchScheduler` | Every 6 hours | Portal attendance fetch for Firebase-linked premium users |
| `RetentionScheduler` | Daily | Clean up stale sessions and old data |
| `PushWorker` | Continuous (10 threads) | Dequeue `push_send` jobs and deliver via pywebpush |

---

## Notification Queue

All notifications flow through a database-backed job queue (`notification_jobs` table) — no Redis or external broker required.

```
Event Source (notice scraper / attendance monitor / timetable engine / admin)
       │
       ▼
notification_queue.enqueue("push_send", payload, target_roll, scheduled_at)
       │
       ▼
notification_jobs table  (status: pending → processing → done/failed/retry)
       │
       ▼
PushWorker (10 threads, pywebpush, VAPID auth)
       │
       ▼
Browser Push Service  →  Service Worker  →  Notification
       │
       ▼
notification_history row (delivery_status: sent/failed)
```

Retry backoff: 30s → 120s → 480s (3 max attempts). HTTP 410 from push service triggers automatic subscription removal.

---

## Caching Architecture

| Cache | Location | TTL | Scope |
|-------|----------|-----|-------|
| Attendance | Scraper memory | 20s | Per session |
| Marks | Scraper memory | 45s | Per session |
| Faculty | Scraper memory | 60s | Per session |
| History | Scraper memory | Session lifetime | Per session |
| Timetable parse | `timetable_service` memory | 1 hour | Global (per notice_id) |
| Session | Backend memory | 12 hours | Global |
| Streak | Frontend localStorage | 1 day | Per device |
| Study progress | Frontend localStorage | Permanent | Per device |

### History + Streak Optimisation

The `/attendance/streak` endpoint calls `fetch_subject_attendance_history(date=None)` which:
1. First call: scrapes all subject history pages (6 HTTP requests) and caches the full semester history
2. Subsequent calls: returns from cache (0 HTTP requests)

After the streak endpoint populates the history cache, all date clicks on the History page are served from cache with zero additional portal requests.

---

## Authentication

### Guest Login
1. Frontend sends roll number + password to `POST /login`
2. Backend authenticates with the college portal via form POST
3. Returns session token + attendance data
4. Token stored in frontend state (not localStorage)

### Firebase (Google Sign-In)
1. Frontend initiates Google Sign-In popup via Firebase SDK
2. Obtains Firebase ID token
3. Sends token to `POST /auth/firebase/login`
4. Backend verifies token with Firebase Admin SDK
5. If linked credentials exist: auto-login with stored (encrypted) portal credentials
6. If not linked: prompts user to enter portal credentials once
7. Credentials encrypted with Fernet and stored in database

### Session Management
- In-memory session store (not database-persisted)
- Each session holds a `PortalScraper` instance with an HTTP session
- Thread-safe via `threading.RLock` per session
- 12-hour TTL with LRU eviction at 5000 sessions
- Sessions are lost on backend restart

---

## Environment Variables

### Backend

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `sqlite:///attend75.db` | Database connection string |
| `CREDENTIAL_ENCRYPTION_KEY` | Dev fallback key | Fernet key for portal password encryption |
| `FIREBASE_SERVICE_ACCOUNT_FILE` | None | Path to Firebase Admin credentials JSON |
| `PORTAL_BASE_URL` | `http://111.93.16.209/sz` | College portal base URL |
| `PORTAL_REQUEST_TIMEOUT_SECONDS` | `15` | HTTP request timeout |
| `PORTAL_ATTENDANCE_CACHE_TTL_SECONDS` | `20` | Attendance cache TTL |
| `PORTAL_MARKS_CACHE_TTL_SECONDS` | `45` | Marks cache TTL |
| `PORTAL_FACULTY_CACHE_TTL_SECONDS` | `60` | Faculty cache TTL |
| `PORTAL_OPERATION_RETRY_ATTEMPTS` | `2` | Network retry count |
| `SESSION_STORE_MAX_SESSIONS` | `5000` | Maximum concurrent sessions |
| `SESSION_STORE_TTL_SECONDS` | `43200` | Session lifetime (12h) |
| `ADMIN_USERNAME` | `admin` | Admin login username |
| `ADMIN_PASSWORD_HASH` | None | PBKDF2 SHA256 hash for admin password |
| `CORS_ALLOW_ORIGINS` | `localhost:5173` | Allowed CORS origins |
| `VAPID_PUBLIC_KEY` | None | VAPID public key for Web Push |
| `VAPID_PRIVATE_KEY` | None | VAPID private key for Web Push |
| `VAPID_CONTACT_EMAIL` | None | VAPID contact email (mailto:) |
| `PHONEPE_MERCHANT_ID` | None | PhonePe merchant ID |
| `PHONEPE_SALT_KEY` | None | PhonePe salt key for HMAC verification |
| `PHONEPE_SALT_INDEX` | `1` | PhonePe salt key index |
| `PHONEPE_ENV` | `production` | `production` or `sandbox` |

### Frontend

| Variable | Description |
|----------|-------------|
| `VITE_FIREBASE_API_KEY` | Firebase API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase auth domain |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID |
| `VITE_FIREBASE_APP_ID` | Firebase app ID |
| `VITE_API_BASE_URL` | Backend API URL (auto-resolved if not set) |

---

## Development Setup

### Prerequisites
- Python 3.11+
- Node.js 18+
- npm or pnpm

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --reload
```

Backend runs at `http://127.0.0.1:8000`

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at `http://127.0.0.1:5173`

### Database

SQLite database is auto-created at `backend/attend75.db` on first startup. For PostgreSQL:

```bash
export DATABASE_URL="postgresql://user:pass@localhost:5432/attend75"
```

Run migrations:
```bash
cd backend
alembic upgrade head
```

### VAPID Keys (Push Notifications)

Generate once and add to `backend/.env`:

```bash
python -c "from py_vapid import Vapid; v = Vapid(); v.generate_keys(); print('Public:', v.public_key); print('Private:', v.private_key)"
```

---

## Deployment

### Frontend (Cloudflare Pages)
- Hosted at https://attend75.xyz via Cloudflare Pages
- Auto-deploys on every push to `main` branch
- Build command: `cd frontend && npm install && npm run build`
- Output directory: `frontend/dist`
- SPA routing via `public/_redirects` (`/* → /index.html 200`)
- Custom headers via `public/_headers` (CSP, cache-control for SW)

### Backend (Oracle Cloud Free Tier)
- Production server at `api.attend75.xyz` (IP: 129.159.239.36)
- Run with systemd: `sudo systemctl restart attend75`
- Set `DATABASE_URL` to PostgreSQL connection string
- Set `CREDENTIAL_ENCRYPTION_KEY` to a secure Fernet key
- Set `FIREBASE_SERVICE_ACCOUNT_FILE` to credentials path
- Set `ADMIN_PASSWORD_HASH` for admin access
- Set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_CONTACT_EMAIL` for push
- Set `PHONEPE_MERCHANT_ID`, `PHONEPE_SALT_KEY` for payments
- Set `CORS_ALLOW_ORIGINS=https://attend75.xyz,https://www.attend75.xyz`

---

## Database Models

| Table | Purpose |
|-------|---------|
| `users` | Firebase-authenticated users (UID, email, name) |
| `portal_credentials` | Encrypted portal passwords linked to users |
| `student_registry` | Roll number index with program, login count, last attendance % |
| `feedback_entries` | User feedback with status workflow |
| `feature_usage_events` | Feature interaction analytics |
| `studyme_events` | Study session analytics |
| `studyme_important_votes` | Community importance votes |
| `user_ratings` | App star ratings (1-5) |
| `notices` | College notice board entries (title, category, summary, deadline, PDF path) |
| `user_notices` | Per-user bookmark and dismiss state |
| `premium_subscriptions` | PhonePe subscription status (active/grace/expired/cancelled) |
| `payment_transactions` | PhonePe payment history |
| `push_subscriptions` | Web Push endpoints (Fernet-encrypted at rest) |
| `notification_preferences` | Per-user push preference flags and timing settings |
| `notification_jobs` | DB-backed job queue (push_send, attendance_fetch, etc.) |
| `notification_history` | Delivered notification log (read/unread state) |
| `attendance_alert_states` | Per-subject bracket state for dedup of attendance alerts |
| `background_fetch_state` | Per-student background fetcher metrics and failure count |

---

## Key Design Decisions

1. **In-memory sessions over JWTs** — Each session holds a live HTTP scraper session with the portal. Cannot be stateless.
2. **Scraper-per-session** — Portal requires authenticated sessions with cookies. Each user gets their own scraper instance.
3. **Full history on first fetch** — The portal's subject history pages contain all dates. One scrape gets everything, eliminating per-date requests.
4. **Encrypted credential storage** — Firebase users' portal passwords are Fernet-encrypted in the database for persistent sign-in.
5. **Frontend-only study progress** — StudyMe lesson completion is stored in localStorage. No backend persistence needed.
6. **Separate mobile/desktop layouts** — Dashboard and History pages render completely different UI for mobile vs desktop using Tailwind breakpoints.
7. **DB-backed notification queue** — No Redis or external broker. `SELECT ... FOR UPDATE SKIP LOCKED` on PostgreSQL gives safe multi-worker dequeue semantics with zero new infrastructure.
8. **Timetable from stored text** — Timetable is parsed from the `cleaned_text` (ASCII table format) stored during PDF processing, avoiding a live portal request on every timetable API call. Falls back to PDF download if text is absent.
9. **Bracket-based attendance dedup** — Attendance alerts use a state machine (below_75 / 75_to_80 / above_80) to avoid repeat notifications when attendance fluctuates within the same bracket.
10. **Background fetcher with spacing** — Portal logins for background fetch are spaced ≥10 seconds apart and capped per cycle to avoid rate-limiting the college portal.
