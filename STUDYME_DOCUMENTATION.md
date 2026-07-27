# StudyMe Feature — Complete Documentation

> A full breakdown of what we built, how we built it, and where we can improve.

---

## 1. What is StudyMe?

StudyMe is a **study material delivery and practice system** embedded inside the Attend75 PWA. It gives students structured lessons, formulas (rendered with LaTeX), in-app PDF textbook viewing, YouTube video integration, solved examples with step-by-step walkthroughs, practice questions, and a crowd-sourced importance voting system.

The core idea: a student opens StudyMe, sees subjects mapped to their actual semester, picks a lesson, and can learn theory, view formulas, read the PDF pages relevant to that topic, copy AI-ready prompts, or practice numericals — all in one place.

---

## 2. Approach & Architecture

### Philosophy

- **Content lives client-side** — All study material (lessons, formulas, topics, numericals, solved examples) are stored as JavaScript constants in the frontend. No server-side content fetching for study material.
- **Server handles interaction data** — The backend only manages analytics events, importance voting, and subject request tracking.
- **Offline-first progress** — Lesson progress is stored in `localStorage` (not synced to server), so students can track completion even without internet.
- **Subject mapping** — A student's portal attendance data (course codes) is mapped to available StudyMe content, so each student sees subjects relevant to their semester.

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React (Vite), React Router, Tailwind CSS, KaTeX (math rendering), react-pdf |
| Backend | FastAPI (Python), SQLAlchemy, PostgreSQL |
| Hosting | PWA (installable), served as static + API |

---

## 3. Content Data Structure

Each subject is a large JS constant file. The hierarchy:

```
Subject
├── id, title, description, pdfPath, contentType
├── lessons[]
│   ├── id, lessonNumber, title, covers, pageRange, tags
│   ├── formulas[] / formulaSections[]
│   │   └── { name, formula (text), latex, notation: { symbol: meaning } }
│   ├── topics[]
│   │   ├── id, title, summary, subtopics[], pageRange
│   │   ├── definitions[], concepts[], studyGuide{}
│   │   ├── solvedExamples[], practiceQuestions[], mistakeNotes[]
│   │   └── hasNumericals, hasExamples
│   └── numericals[]
│       └── { id, topicId, type, title, difficulty, question, steps[], answer }
```

### Content Types

- **Theory subjects** (e.g., OB, CCFA): Heavy on definitions, concepts, study guides, comparison tables
- **Numerical subjects** (e.g., FM, QBM): Heavy on formulas (LaTeX), solved examples with step-by-step solutions, practice problems

---

## 4. Pages & User Flow

### Page Hierarchy

```
/study                          → StudyMe.jsx (landing page)
/study/:subjectId               → StudyLessons.jsx (all lessons in a subject)
/study/:subjectId/:lessonId     → StudyLessonDetail.jsx (lesson content)
/study/:subjectId/:lessonId/pdf → StudyPdfViewer.jsx (embedded PDF)
/study/:subjectId/:lessonId/youtube → StudyLessonYoutube.jsx (video links)
/study/:subjectId/:lessonId/practice → StudyTopicPractice.jsx (practice mode)
/study/:subjectId/:lessonId/practice/:topicId → StudyTopicPractice.jsx (topic-scoped)
```

### Page Breakdown

#### 4.1 StudyMe Landing (`StudyMe.jsx`)
- Shows subject cards relevant to the student's semester
- Progress rings (circular SVG) showing % completion per subject
- "Pick up where you left off" card with a continue button
- Guest users see popular subjects + CTA to log in
- "Coming soon" subjects with a **Request** button (sends request to backend, shows live request count)

#### 4.2 Study Lessons List (`StudyLessons.jsx`)
- Lists all lessons in a subject with lesson numbers, tags, and progress status
- Progress bar at the top (X/Y lessons completed)
- Importance indicators fetched from backend
- Start/Review button per lesson

#### 4.3 Lesson Detail (`StudyLessonDetail.jsx`)
- The main learning hub. Collapsible sections for:
  - **Formulas** — rendered with KaTeX, with notation breakdown
  - **Topics** — each topic has summary, subtopics, definitions, concepts, study guide
  - **AI Prompts** — pre-built prompts students can copy to ChatGPT
  - **Comparison Tables** — side-by-side concept comparisons
  - **Definitions** — term/description pairs
- Buttons to navigate to PDF viewer, YouTube, Practice mode
- Importance voting toggle (per lesson & per topic)
- Mark as completed toggle
- Analytics events fire on open, completion, AI copy, etc.

#### 4.4 PDF Viewer (`StudyPdfViewer.jsx`)
- Uses `react-pdf` library to render actual textbook PDFs in-app
- Features:
  - Auto-opens to the relevant page (based on lesson/topic `pageRange`)
  - Page navigation (next/prev/jump)
  - Pinch-to-zoom on mobile
  - Swipe gestures for page turning
  - Fullscreen mode
  - Topic selector dropdown to jump between topic page ranges
- PDFs are stored in `/public/pdfs/` folder, organized by subject

#### 4.5 YouTube Learning (`StudyLessonYoutube.jsx`)
- Curated YouTube videos organized by method/variant
- Each video has a label and direct YouTube URL
- Rendered as method cards (`YoutubeMethodCard` component)
- Currently available for select QBM lessons (Transportation, Assignment, Queuing)

#### 4.6 Practice Mode (`StudyTopicPractice.jsx`)
- Three modes: **Learn**, **Practice**, **Mistakes**
- Sources problems from:
  - `lesson.numericals[]` (scoped by topicId)
  - `topic.solvedExamples[]`
  - `topic.practiceQuestions[]`
  - `topic.mistakeNotes[]`
- Each problem shows: question, difficulty badge, question type
- Expandable step-by-step solutions
- Formula lookup integration (links formula names to their definitions)
- Math rendering for questions/answers with LaTeX

---

## 5. Concepts & Features We Built

### 5.1 Subject Mapping System (`subjectMapping.js`)
Maps portal course codes (e.g., `SHFI468`) to StudyMe content IDs (e.g., `financial-management`). Supports:
- Primary lookup by portal code (`SUBJECT_REGISTRY`)
- Fallback lookup by abbreviation (`ABBREVIATION_MAP`)
- `resolveStudentSubjects()` determines what each student sees

### 5.2 Progress Tracking (`studyProgress.js`)
- Stored in `localStorage` under key `attend75.studyme.progress.v1`
- States: `not_started` → `in_progress` → `completed`
- Tracks per subject: which lessons are complete, last opened lesson
- Drives progress bars and "continue" feature

### 5.3 Importance Voting System
- **Crowd-sourced** — any user can mark a lesson or topic as "important"
- Toggle on/off (one vote per user per entity)
- Shows total vote count
- "Hot" badge when a lesson/topic reaches ≥12 votes
- Backend stores in `studyme_important_votes` table with unique constraint per user+entity

### 5.4 Analytics & Event Tracking
Fires events for everything:
- `studyme_opened`, `studyme_subject_opened`, `studyme_lesson_opened`
- `studyme_topic_opened`, `studyme_pdf_opened`
- `studyme_pdf_page_next`, `studyme_pdf_page_prev`
- `studyme_lesson_ai_opened`, `studyme_lesson_ai_copied`
- `studyme_topic_prompt_copied`, `studyme_lesson_completed`
- `studyme_lesson_important_toggled`, `studyme_topic_important_toggled`

Admin dashboard aggregates these into funnel analysis, per-lesson engagement, AI usage insights, and PDF engagement stats.

### 5.5 LaTeX Math Rendering
- Uses **KaTeX** library for fast math formula rendering
- Both display mode (block formulas) and inline mode
- Formulas stored with both plain text (`formula`) and LaTeX (`latex`) versions
- Notation breakdowns show what each symbol means
- Utility helpers: `normalizeLatex()`, `shouldRenderAsMath()`, `latexFallbackText()`

### 5.6 AI Prompt Integration
- Pre-built prompts for each topic that students can copy to paste into ChatGPT
- Events track when prompts are opened and copied
- Designed to help students get AI explanations tailored to their exact syllabus

### 5.7 Subject Request System
- Students can request subjects not yet in StudyMe
- Backend tracks requests per subject code
- Live request counts shown on the "coming soon" cards
- Helps prioritize which subjects to add next

---

## 6. PDFs — How We Handle Them

### Storage
- PDFs are stored in `frontend/public/pdfs/`
- Organized by subject folder: `/pdfs/fm.pdf`, `/pdfs/qbm/qbm1.pdf`, `/pdfs/ccfa/ccfa_main.pdf`, `/pdfs/ob/ob1.pdf`, etc.
- Some subjects have one PDF per lesson, others have one shared PDF

### Integration
- Each lesson/topic specifies a `pageRange: { start, end }`
- PDF viewer opens directly to the correct page
- Topic selector lets students jump between topics within the same PDF
- Page navigation (buttons + swipe) with bounds checking

### Why this approach?
- College textbook PDFs are the canonical source material
- Students get the exact pages they need for each topic
- No need to manually transcribe full textbook content

---

## 7. Styling & UI Design

### Color Palette (Dark Theme)
| Token | Color | Usage |
|-------|-------|-------|
| Background | `#1D183E` → `#302A52` | Page backgrounds |
| Card surface | `#3D3660`, `#4A466A`, `#4F487A` | Cards, sections |
| Primary text | `#F7F4FF`, `#F4F1FF` | Headings, body |
| Secondary text | `#9F9AB5`, `#D8D4E7`, `#CFC5E8` | Labels, metadata |
| Accent blue | `#6CB4FF` | Links, in-progress |
| Accent green | `#4EF0A0` | Completed, success |
| Accent orange | `#FF916C`, `#FFAA8D` | CTA buttons, warmth |
| Accent red | `#FF6B6B` | Warnings, hot badges |
| Formula bg | `#241C45` | KaTeX formula blocks |
| Formula border | `#A8D8FF/25` | Formula containers |

### UI Patterns
- **Card-based layout** with rounded corners (`rounded-2xl`, `rounded-3xl`)
- **Ring borders** (`ring-1 ring-white/5`) for subtle depth
- **Gradient backgrounds** on hero/continue cards
- **Progress indicators**: circular SVG rings on landing, horizontal bars on lessons
- **Tags**: small rounded pills for lesson types (theory-heavy, formula-heavy, practice-heavy)
- **Mobile-first**: full touch support, swipe gestures, responsive text sizing
- **Transitions**: hover scale, card elevation, progress bar animations

---

## 8. Current Subjects Available

| Subject | ID | Content Type | Lessons | PDFs |
|---------|-----|-------------|---------|------|
| Financial Management | `financial-management` | Numerical | Multi-lesson | `/pdfs/fm.pdf` (shared) |
| Quantitative Business Methods | `qbm` | Numerical | 7 lessons | `/pdfs/qbm/qbm1-7.pdf` (per lesson) |
| Cloud Computing Foundations & Applications | `ccfa` | Theory | Multi-lesson | `/pdfs/ccfa/ccfa_main.pdf` + per-lesson |
| Organizational Behavior | `ob` | Theory | 11 lessons | `/pdfs/ob/ob1-11.pdf` (per lesson) |

---

## 9. Backend API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/studyme/events` | Track user engagement events |
| POST | `/studyme/importance/query` | Fetch importance votes for lessons/topics |
| POST | `/studyme/importance/lesson/toggle` | Toggle lesson importance vote |
| POST | `/studyme/importance/topic/toggle` | Toggle topic importance vote |
| POST | `/studyme/subject-request` | Student requests a new subject |
| POST | `/studyme/subject-request/counts` | Get request counts for all subjects |

---

## 10. File Map (Key Files)

### Frontend
```
src/
├── pages/
│   ├── StudyMe.jsx                    # Landing page
│   ├── StudyLessons.jsx               # Subject lesson list
│   ├── StudyLessonDetail.jsx          # Lesson content hub
│   ├── StudyPdfViewer.jsx             # In-app PDF reader
│   ├── StudyLessonYoutube.jsx         # YouTube video links
│   └── StudyTopicPractice.jsx         # Practice mode
├── components/
│   ├── common/
│   │   ├── StudyBackButton.jsx        # Reusable back navigation
│   │   ├── MathFormula.jsx            # KaTeX formula renderer
│   │   └── CollapsibleSection.jsx     # Expandable content sections
│   └── studyme/
│       └── YoutubeMethodCard.jsx      # YouTube video card
├── constants/studyMe/
│   ├── index.js                       # Subject aggregator + lookup helpers
│   ├── subjectMapping.js             # Portal code → StudyMe ID mapping
│   ├── youtubeLearning.js            # YouTube video configs
│   └── subjects/
│       ├── fm.js                      # Financial Management content
│       ├── qbm.js                     # Quantitative Business Methods content
│       ├── ccfa.js                    # Cloud Computing content
│       └── ob.js                      # Organizational Behavior content
├── services/
│   ├── studyProgress.js              # localStorage progress tracking
│   ├── studyMeAnalytics.js           # Event tracking API calls
│   └── studyMeImportance.js          # Importance voting API calls
└── utils/
    └── mathLatex.js                   # LaTeX helpers
```

### Backend
```
backend/
├── routers/
│   └── studyme.py                    # All StudyMe API routes
├── services/
│   ├── studyme_event_service.py      # Event recording + analytics aggregation
│   └── studyme_importance_service.py # Vote toggling + query logic
├── db/models/
│   ├── studyme_event.py              # StudyMeEvent ORM model
│   └── studyme_important_vote.py     # StudyMeImportantVote ORM model
└── alembic/versions/
    ├── 20260503_0002_create_studyme_important_votes.py
    └── (events table in earlier migration)
```

---

## 11. What We Can Improve

### Content & Learning

| Area | Current State | Improvement |
|------|--------------|-------------|
| Content updates | Manual JS edits needed | Move content to a CMS or JSON API so non-devs can update |
| Progress sync | localStorage only | Sync progress to backend so students don't lose it on device switch |
| Spaced repetition | No repetition system | Add a review scheduler (like Anki) for formulas/concepts |
| Flashcards | Not implemented | Quick flashcard mode for definitions and formulas |
| Quiz mode | Practice is open-ended | Add timed MCQ quizzes with scoring |
| Search | No search across lessons | Full-text search across all study content |
| Bookmarks | Only importance voting | Personal bookmarks/notes per topic |

### PDF Experience

| Area | Current State | Improvement |
|------|--------------|-------------|
| PDF size | Full textbook PDFs bundled | Split into smaller per-chapter PDFs, lazy-load |
| Annotations | No annotation support | Allow highlighting and note-taking on PDFs |
| Offline PDFs | Relies on cache | Pre-cache critical PDFs via service worker |
| Text search in PDF | Not implemented | Add in-PDF text search |

### AI Integration

| Area | Current State | Improvement |
|------|--------------|-------------|
| AI prompts | Copy-paste to external ChatGPT | Embed AI chat directly in-app |
| Explanations | Static content only | AI-generated explanations on demand |
| Doubt solving | Not available | Let students ask doubts per topic with AI |
| Summary generation | Manual summaries | Auto-generate lesson summaries from PDF content |

### Social & Engagement

| Area | Current State | Improvement |
|------|--------------|-------------|
| Importance voting | Anonymous count only | Show who voted, add comments |
| Study groups | Not implemented | Collaborative study sessions / shared progress |
| Leaderboard | Not for StudyMe | Add study streaks, completion leaderboards |
| Notifications | No study reminders | Push notifications for study reminders / new content |

### Technical

| Area | Current State | Improvement |
|------|--------------|-------------|
| Content size | Large JS bundles per subject | Code-split subject files, lazy-load on navigation |
| YouTube | External links only | Embed YouTube player in-app |
| Testing | No tests for StudyMe | Add component tests for practice mode logic |
| Accessibility | Basic keyboard nav | Full ARIA labels, screen reader support for formulas |
| Analytics | Admin-only dashboard | Student-facing study insights (time spent, topics covered) |

### New Features to Consider

1. **Formula calculator** — Input values into formulas and get results instantly
2. **Past exam papers** — Categorized by topic, with solutions
3. **Voice notes** — Audio explanations attached to complex topics
4. **Collaborative notes** — Students contribute notes per topic
5. **Difficulty rating** — Students rate topic difficulty, helps others prioritize
6. **Study timer** — Pomodoro-style timer with session tracking
7. **Export to PDF** — Generate personalized revision sheets from selected topics

---

## 12. Summary

StudyMe was built with a pragmatic approach: get structured content in front of students fast, with great UX on mobile. The client-side content model means zero latency for content loading and offline access, at the cost of requiring developer effort to add/update content. The importance voting and analytics give us data-driven insights into what students actually use and need.

The biggest wins for the next iteration would be:
1. **Progress sync to backend** (cross-device)
2. **In-app AI chat** (remove the copy-paste friction)
3. **Content CMS** (let contributors add content without code changes)
4. **Spaced repetition** (turn passive reading into active recall)
