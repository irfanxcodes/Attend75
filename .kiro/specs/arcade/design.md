# Design Document: Arcade

## Overview

The Arcade feature adds a gamification section to Attend75 where students can play quick browser-based mini games between checking their attendance. It integrates with the existing authenticated app shell, adds a new navigation entry, and introduces a backend leaderboard system for score persistence and competitive ranking.

The system follows a pluggable architecture: new games are added by creating a React component and a registry entry. All games run client-side with no network communication during gameplay — only a single score submission occurs after each session ends.

### Key Design Decisions

1. **Client-side game execution** — Games run entirely in the browser using HTML5 Canvas/JS. This keeps latency at zero during gameplay and removes server load concerns.
2. **Full score history** — Every score is stored (not just personal bests), enabling future features like weekly resets, streaks, and trend analysis.
3. **Game registry pattern** — A declarative registry object maps game slugs to metadata and lazy-loaded components, making new game additions a single-file change.
4. **Shared GameLayout wrapper** — Common UI (back button, title, score display, leaderboard access) lives in a shared wrapper, keeping game components focused on gameplay logic only.

## Architecture

```mermaid
graph TB
    subgraph Frontend
        Nav[Navigation / Dashboard Banner]
        ArcadeHome[Arcade Home Screen]
        GameLayout[GameLayout Wrapper]
        GameEngine[Game Component e.g. FlappyGame]
        LeaderboardUI[Leaderboard View]
        ArcadeService[arcadeApi.js Service]
    end

    subgraph Backend
        ArcadeRouter[arcade router]
        ArcadeServiceBE[arcade_service.py]
        ScoreValidator[Score Validator]
        DB[(game_scores table)]
        SessionStore[Session Store]
    end

    Nav --> ArcadeHome
    ArcadeHome --> GameLayout
    GameLayout --> GameEngine
    GameLayout --> LeaderboardUI
    GameEngine -->|onGameEnd callback| ArcadeService
    ArcadeService -->|POST /api/arcade/{game}/score| ArcadeRouter
    ArcadeService -->|GET /api/arcade/{game}/leaderboard| ArcadeRouter
    ArcadeRouter --> SessionStore
    ArcadeRouter --> ScoreValidator
    ArcadeRouter --> ArcadeServiceBE
    ArcadeServiceBE --> DB
```

### Data Flow

1. User navigates to `/app/arcade` → Arcade home renders Game_Cards from registry
2. User taps "Play" → navigates to `/app/arcade/{slug}` → GameLayout wraps the lazy-loaded game component
3. Game runs client-side (Canvas, requestAnimationFrame loop, delta-time physics)
4. Game ends → `onGameEnd(score)` callback fires → `arcadeApi.submitScore()` POSTs to backend
5. Backend validates token → validates score → persists → returns score + personal_best + rank
6. User views leaderboard → `arcadeApi.getLeaderboard()` GETs from backend → renders ranked list

## Components and Interfaces

### Frontend Component Hierarchy

```
/app/arcade (route)
├── ArcadeHome.jsx
│   ├── ArcadeBanner (hero section)
│   └── GameCard[] (mapped from gameRegistry)
│
/app/arcade/:gameSlug (route)
├── ArcadeGamePage.jsx (resolves slug → component)
│   └── GameLayout.jsx (shared wrapper)
│       ├── GameHeader (back button, title)
│       ├── {GameComponent} (lazy-loaded game)
│       ├── ScoreOverlay (game-over state)
│       └── LeaderboardPanel (inline or modal)
```

### Game Registry

```javascript
// frontend/src/components/arcade/gameRegistry.js
import { lazy } from 'react'

const gameRegistry = {
  flappy: {
    slug: 'flappy',
    title: 'Flappy Bird',
    description: 'Tap to fly through pipes!',
    thumbnail: '/assets/arcade/flappy-thumb.webp',
    maxScore: 999,
    component: lazy(() => import('./games/FlappyGame')),
  },
  // Future games added here
}

export default gameRegistry
```

### Game Component Interface

Every game component must implement this interface:

```javascript
// Props contract for all game components
{
  onGameEnd: (score: number) => void,  // Called when game session ends
  onScoreUpdate: (score: number) => void, // Called on score change during gameplay
  isActive: boolean, // Controls pause/resume from parent
}
```

### GameLayout Component

```jsx
// frontend/src/components/arcade/GameLayout.jsx
function GameLayout({ gameSlug, children }) {
  // Provides: back navigation, game title from registry,
  // score display, game-over overlay with "Play Again" + leaderboard access
}
```

### Frontend Service Layer

```javascript
// frontend/src/services/arcadeApi.js
export async function submitScore(token, gameSlug, score) {
  // POST /api/arcade/{gameSlug}/score
  // Body: { token, score }
  // Returns: { score, personal_best, rank }
}

export async function getLeaderboard(gameSlug, token = null) {
  // GET /api/arcade/{gameSlug}/leaderboard?token={token}
  // Returns: { entries: [...], user_entry?: {...}, metadata: {} }
}

export async function getPersonalBest(token, gameSlug) {
  // GET /api/arcade/{gameSlug}/personal-best?token={token}
  // Returns: { score, rank } or null
}
```

### Backend Router

```python
# backend/routers/arcade.py
router = APIRouter(prefix="/api/arcade", tags=["arcade"])

@router.post("/{game}/score")       # Submit score
@router.get("/{game}/leaderboard")  # Get leaderboard
@router.get("/{game}/personal-best") # Get personal best
```

### Backend Service

```python
# backend/services/arcade_service.py
def submit_score(user_id: int, game_name: str, score: int) -> dict
def get_leaderboard(game_name: str, user_id: int | None = None) -> dict
def get_personal_best(user_id: int, game_name: str) -> dict | None
```

### Score Validator

```python
# backend/services/score_validator.py
GAME_MAX_SCORES = {
    "flappy": 999,
}
DUPLICATE_WINDOW_SECONDS = 5
HOURLY_RATE_LIMIT = 60

def validate_score(user_id: int, game_name: str, score: int) -> None
    # Raises ScoreValidationError(status_code, error_code, message)
```

## Data Models

### GameScore (SQLAlchemy Model)

```python
# backend/db/models/game_score.py
from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column
from db.base import Base

class GameScore(Base):
    __tablename__ = "game_scores"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    game_name: Mapped[str] = mapped_column(String(50), nullable=False)
    score: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (
        Index("ix_game_scores_leaderboard", "game_name", score.desc()),
        Index("ix_game_scores_personal", "user_id", "game_name"),
    )
```

### API Request/Response Schemas

```python
# Added to backend/models/schemas.py

class ScoreSubmitRequest(BaseModel):
    token: str = Field(..., description="Session token")
    score: int = Field(..., description="Game score")

class ScoreSubmitResponse(BaseModel):
    score: int
    personal_best: int
    rank: int

class LeaderboardEntry(BaseModel):
    rank: int
    username: str
    score: int

class LeaderboardResponse(BaseModel):
    entries: list[LeaderboardEntry]
    user_entry: LeaderboardEntry | None = None
    metadata: dict = Field(default_factory=dict)
```

### Database Migration

```python
# backend/alembic/versions/YYYYMMDD_XXXX_create_game_scores.py
# - Creates game_scores table
# - Adds ix_game_scores_leaderboard index (game_name, score DESC)
# - Adds ix_game_scores_personal index (user_id, game_name)
```

### Registered Games (Backend Config)

```python
# backend/services/score_validator.py
REGISTERED_GAMES = {"flappy"}  # Set of valid game slugs
GAME_MAX_SCORES = {"flappy": 999}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Game Card renders all required metadata fields

*For any* valid game metadata object (containing title, description, thumbnail, and score), rendering a Game_Card component SHALL produce output containing all provided metadata fields.

**Validates: Requirements 3.2**

### Property 2: Score submission response correctness

*For any* valid score submission against any leaderboard state, the response SHALL contain the submitted score value, the user's correct all-time personal best (maximum of all their scores for that game), and the user's correct rank position (count of distinct users with higher personal bests + 1).

**Validates: Requirements 6.3**

### Property 3: Full history persistence

*For any* sequence of valid score submissions by the same user for the same game, all submissions SHALL be persisted as individual records (record count equals submission count), preserving exact score values and timestamps.

**Validates: Requirements 6.2, 10.4**

### Property 4: Invalid score rejection

*For any* score value that is either non-positive (≤ 0) or exceeds the configured maximum threshold for the game, the Score_Validator SHALL reject the submission with HTTP 422, and no Game_Score record SHALL be created.

**Validates: Requirements 7.1, 7.4**

### Property 5: Duplicate timing rejection

*For any* two score submissions from the same user for the same game where the second submission occurs within 5 seconds of the first, and both scores are individually valid, the second submission SHALL be rejected with HTTP 429.

**Validates: Requirements 7.2**

### Property 6: Leaderboard query returns correctly sorted, capped entries with required fields

*For any* set of Game_Score records for a given game, the leaderboard response SHALL return entries sorted in descending order by each user's highest score, capped at 50 entries, where each entry contains a rank position, username (display_name), and score value.

**Validates: Requirements 8.1, 8.2**

### Property 7: Authenticated user rank inclusion

*For any* leaderboard query with a valid session token where the user has at least one score for the game, the response SHALL include a `user_entry` with the user's correct rank and highest score, regardless of whether the user is in the top 50.

**Validates: Requirements 8.3**

### Property 8: Game physics — tap produces jump, absence produces gravity

*For any* game state where the bird is within play boundaries, applying a tap input SHALL increase the bird's upward velocity, and advancing a frame without input SHALL decrease the bird's vertical position (gravity pulls down).

**Validates: Requirements 13.2**

### Property 9: Collision detection ends game

*For any* game state where the bird's bounding box overlaps with a pipe obstacle, the ground plane, or exits the defined play area boundaries, the game SHALL transition to the ended state and report the current score.

**Validates: Requirements 13.3**

### Property 10: Game restart resets to initial state

*For any* game-over state (with any score, bird position, or pipe configuration), triggering restart SHALL produce a game state equivalent to the initial state: bird at starting position, score at zero, pipes cleared/regenerated, game active.

**Validates: Requirements 13.5**

### Property 11: Delta-time proportional movement

*For any* game state and any two positive delta-time values dt1 and dt2, the bird's vertical displacement SHALL be proportional to the delta time (displacement with dt2 ≈ displacement with dt1 × dt2/dt1), ensuring frame-rate-independent physics.

**Validates: Requirements 15.2**

### Property 12: Viewport resize preserves gameplay state

*For any* active game state (bird position, score, pipe positions), triggering a viewport resize SHALL not alter the bird position, current score, or pipe positions — only the canvas rendering scale changes.

**Validates: Requirements 15.7**

### Property 13: Unregistered game slug redirect

*For any* URL path `/app/arcade/{slug}` where `slug` is not present in the game registry, navigation SHALL redirect to `/app/arcade`.

**Validates: Requirements 14.3**

## Error Handling

### Frontend Errors

| Scenario | Handling |
|----------|----------|
| Score submission fails (network) | Show toast "Score couldn't be saved" with retry button; cache score locally for retry |
| Score submission returns 401 | Redirect to login (session expired) |
| Score submission returns 422 | Show "Invalid score" message (likely client bug) |
| Score submission returns 429 | Silently ignore (anti-cheat triggered) |
| Leaderboard fetch fails | Show "Unable to load leaderboard" with retry button |
| Game asset preload fails | Show error state with "Retry" button instead of game canvas |
| Invalid game slug in URL | Redirect to `/app/arcade` |

### Backend Errors

| Scenario | HTTP Code | Error Code | Response |
|----------|-----------|------------|----------|
| Invalid/expired token | 401 | SESSION_EXPIRED | `{"status": "error", "error_code": "SESSION_EXPIRED", "message": "..."}` |
| Score exceeds max threshold | 422 | SCORE_TOO_HIGH | `{"status": "error", "error_code": "SCORE_TOO_HIGH", "message": "..."}` |
| Non-positive score | 422 | INVALID_SCORE | `{"status": "error", "error_code": "INVALID_SCORE", "message": "..."}` |
| Duplicate within 5s | 429 | DUPLICATE_SUBMISSION | `{"status": "error", "error_code": "DUPLICATE_SUBMISSION", "message": "..."}` |
| Hourly rate limit exceeded | 429 | RATE_LIMIT_EXCEEDED | `{"status": "error", "error_code": "RATE_LIMIT_EXCEEDED", "message": "..."}` |
| Unregistered game slug | 404 | GAME_NOT_FOUND | `{"status": "error", "error_code": "GAME_NOT_FOUND", "message": "..."}` |
| DB write failure | 500 | INTERNAL_ERROR | `{"status": "error", "error_code": "INTERNAL_ERROR", "message": "..."}` |

### Score Validation Priority

When multiple validation rules could trigger for the same submission:
1. Token validation (401) — checked first
2. Game existence check (404) — checked second
3. Score threshold / non-positive check (422) — checked third
4. Duplicate timing check (429) — checked fourth
5. Hourly rate limit (429) — checked last

## Testing Strategy

### Property-Based Tests (using fast-check for frontend, Hypothesis for backend)

Property-based testing is highly applicable to this feature because:
- The score validation logic is a pure function with clear input/output behavior
- The leaderboard query has universal sort/cap/field invariants
- The game physics engine has mathematical properties (proportionality, state transitions)

**Configuration:**
- Minimum 100 iterations per property test
- Each test tagged with: `Feature: arcade, Property {N}: {description}`

**Backend PBT (Hypothesis):**
- Property 2: Score response correctness (generate random scores + leaderboard states)
- Property 3: Full history persistence (generate submission sequences)
- Property 4: Invalid score rejection (generate out-of-range values)
- Property 5: Duplicate timing rejection (generate time-close pairs)
- Property 6: Leaderboard sort/cap correctness (generate random score sets)
- Property 7: Authenticated user rank (generate leaderboard + user scores)

**Frontend PBT (fast-check):**
- Property 1: Game_Card rendering (generate random game metadata)
- Property 8: Tap/gravity physics (generate random game states + inputs)
- Property 9: Collision detection (generate overlapping positions)
- Property 10: Restart state reset (generate random game-over states)
- Property 11: Delta-time proportionality (generate random dt pairs)
- Property 12: Resize state preservation (generate random active states)
- Property 13: Invalid slug redirect (generate random non-registry strings)

### Unit Tests (Example-Based)

- Navigation item renders for authenticated users (1.1)
- Dashboard banner renders with correct elements (2.1–2.3)
- GameLayout renders back button, title, and score area (4.2)
- Score callback fires on game end (5.4)
- Game restart without page reload (5.5)
- Frontend submits correct POST on game end (6.1)
- 401 on expired token (6.4)
- 404 on unregistered game (8.4)
- Leaderboard UI highlights current user (9.3)
- Pinned footer for out-of-top-50 users (9.4)
- Browser back/forward navigation works (14.4)
- Pause on tab blur, resume on focus (15.5)
- Memory cleanup on unmount (15.8)
- API response includes metadata field (16.3)

### Integration Tests

- Full flow: authenticate → play game → submit score → verify in DB → verify in leaderboard
- Rate limit enforcement (submit 61 scores in sequence)
- Hourly rate limit boundary (7.3)

### Smoke Tests

- Database schema has correct columns (10.1)
- Indexes exist (10.2, 10.3)
- Game components use React.lazy (11.2)
- Asset bundles under 500KB (11.4)
- Routes registered under /app prefix (14.1)
