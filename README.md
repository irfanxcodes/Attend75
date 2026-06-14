# Attend75

A college attendance tracking and study management application for ICFAI / IBS students. Scrapes the college student portal to provide real-time attendance data, consolidated marks, faculty contacts, and study tools in a modern mobile-first interface.

## Tech Stack

**Frontend:** React 19 · Vite 8 · Tailwind CSS 3 · React Router 7 · Firebase Auth · Lucide Icons · react-pdf · react-katex

**Backend:** Python · FastAPI · SQLAlchemy · Alembic · BeautifulSoup4 · Firebase Admin SDK · Cryptography (Fernet)

**Database:** SQLite (development) · PostgreSQL (production)

**Deployment:** Vercel (frontend) · DigitalOcean (backend)

---

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   React SPA     │────▶│  FastAPI Backend  │────▶│  College Portal │
│   (Vite/Vercel) │     │  (Uvicorn)       │     │  (ASP.NET)      │
└─────────────────┘     └──────────────────┘     └─────────────────┘
        │                       │
        │                       ├── SQLite/PostgreSQL
        │                       ├── In-memory Session Store
        │                       └── Firebase Admin SDK
        │
        └── Firebase Auth (Google Sign-In)
```

### Data Flow

1. User logs in with roll number + password (or Google Sign-In)
2. Backend creates a `PortalScraper` instance, authenticates with the college portal
3. Scraper fetches attendance data and returns it to the frontend
4. A session token is issued; the scraper instance is stored in memory with a 12-hour TTL
5. All subsequent requests (attendance, marks, history, faculty) use the same scraper session
6. Multi-layer caching at the scraper level minimizes portal requests

---

## Features

### Dashboard
- Overall attendance percentage with ring chart
- Subjects ranked by risk with progress bars
- Target prediction (can miss / to attend)
- Semester selection
- Quick metrics: subjects below target, total absents, mails sent
- Mobile-optimized layout with expandable cards

### Attendance History
- Calendar view with date selection and dot indicators
- Timeline view (mobile) with horizontal date scroller
- Day-by-day attendance detail per subject
- Mail Faculty action for absent entries
- Current Streak calculation (consecutive full-attendance days)
- Present/Absent summary statistics

### Consolidated Marks
- Radar chart visualization across subjects
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

---

## Project Structure

```
Attend75/
├── backend/
│   ├── app.py                    # FastAPI application entry point
│   ├── requirements.txt          # Python dependencies
│   ├── alembic.ini               # Migration config
│   ├── alembic/                  # Database migrations
│   ├── db/
│   │   ├── base.py              # SQLAlchemy Base
│   │   ├── session.py           # Engine + SessionLocal factory
│   │   └── models/
│   │       ├── user.py
│   │       ├── portal_credential.py
│   │       ├── feedback_entry.py
│   │       ├── feature_usage_event.py
│   │       ├── studyme_event.py
│   │       ├── studyme_important_vote.py
│   │       └── user_rating.py
│   ├── models/
│   │   └── schemas.py           # Pydantic request/response models
│   ├── routers/
│   │   ├── auth.py              # Attendance, marks, history, streak, ratings
│   │   ├── firebase_auth.py     # Google Sign-In flow
│   │   ├── admin.py             # Admin dashboard endpoints
│   │   ├── feedback.py          # User feedback
│   │   └── studyme.py           # StudyMe events + importance voting
│   ├── scrapers/
│   │   └── portal_scraper.py    # College portal scraper (~1700 lines)
│   ├── services/
│   │   ├── auth_service.py      # Login, attendance, streak orchestration
│   │   ├── session_store.py     # In-memory session management
│   │   ├── firebase_auth_service.py
│   │   ├── firebase_user_service.py
│   │   ├── crypto_service.py    # Fernet encryption for credentials
│   │   ├── admin_service.py     # Admin overview aggregation
│   │   ├── feedback_service.py
│   │   ├── feature_usage_event_service.py
│   │   ├── rating_service.py
│   │   ├── request_metrics.py   # Request telemetry
│   │   └── scraper_metrics.py   # Scraper observability
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
│       ├── pages/               # All page components
│       ├── components/          # UI components by feature
│       ├── services/            # API clients
│       ├── constants/           # StudyMe content, dummy data
│       └── utils/               # Calculations, formatting
└── README.md
```

---

## API Endpoints

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
| POST | `/admin/auth/login` | Admin login |
| POST | `/admin/auth/logout` | Admin logout |
| GET | `/admin/overview` | Admin dashboard data |
| GET | `/admin/feedback` | Admin feedback log |
| PATCH | `/admin/feedback/{id}/status` | Update feedback status |

---

## Caching Architecture

| Cache | Location | TTL | Scope |
|-------|----------|-----|-------|
| Attendance | Scraper memory | 20s | Per session |
| Marks | Scraper memory | 45s | Per session |
| Faculty | Scraper memory | 60s | Per session |
| History | Scraper memory | Session lifetime (no TTL) | Per session |
| Session | Backend memory | 12 hours | Global |
| Streak | Frontend localStorage | 1 day | Per device |
| Study progress | Frontend localStorage | Permanent | Per device |

### History + Streak Optimization

The `/attendance/streak` endpoint triggers the same history fetch as clicking a date. It calls `fetch_subject_attendance_history(date=None)` which:
1. First call: scrapes all subject history pages (6 HTTP requests, one per subject) and caches the full semester history
2. Subsequent calls: returns from cache (0 HTTP requests)

After the streak endpoint populates the history cache, all date clicks on the History page are served from the same cache with zero additional portal requests.

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

---

## Deployment

### Frontend (Vercel)
- `vercel.json` rewrites `/api/*` to backend server
- Static assets served from Vite build output

### Backend (DigitalOcean)
- Production server at `64.227.133.71:8000`
- Run with: `uvicorn app:app --host 0.0.0.0 --port 8000`
- Set `DATABASE_URL` to PostgreSQL connection string
- Set `CREDENTIAL_ENCRYPTION_KEY` to a secure Fernet key
- Set `FIREBASE_SERVICE_ACCOUNT_FILE` to credentials path
- Set `ADMIN_PASSWORD_HASH` for admin access

---

## Database Models

| Table | Purpose |
|-------|---------|
| `users` | Firebase-authenticated users (UID, email, name) |
| `portal_credentials` | Encrypted portal passwords linked to users |
| `feedback_entries` | User feedback with status workflow |
| `feature_usage_events` | Feature interaction analytics |
| `studyme_events` | Study session analytics |
| `studyme_important_votes` | Community importance votes |
| `user_ratings` | App star ratings (1-5) |

---

## Key Design Decisions

1. **In-memory sessions over JWTs** — Each session holds a live HTTP scraper session with the portal. Cannot be stateless.
2. **Scraper-per-session** — Portal requires authenticated sessions with cookies. Each user gets their own scraper instance.
3. **Full history on first fetch** — The portal's subject history pages contain all dates. One scrape gets everything, eliminating per-date requests.
4. **Encrypted credential storage** — Firebase users' portal passwords are Fernet-encrypted in the database for persistent sign-in.
5. **Frontend-only study progress** — StudyMe lesson completion is stored in localStorage. No backend persistence needed for this feature.
6. **Separate mobile/desktop layouts** — Dashboard and History pages render completely different UI for mobile vs desktop using Tailwind breakpoints.
