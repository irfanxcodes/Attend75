# Implementation Plan: Arcade

## Overview

Implement the Arcade feature for Attend75 — a gamification section with mini games, leaderboards, and score persistence. The implementation follows a bottom-up approach: backend database and services first, then frontend service layer, shared components, game integration, and finally navigation/dashboard wiring.

## Tasks

- [x] 1. Backend database model and migration
  - [x] 1.1 Create the GameScore SQLAlchemy model
    - Create `backend/db/models/game_score.py` with the `GameScore` model
    - Columns: id (PK), user_id (FK to users.id), game_name (String(50)), score (Integer), created_at (DateTime)
    - Add composite indexes: `ix_game_scores_leaderboard` on (game_name, score DESC) and `ix_game_scores_personal` on (user_id, game_name)
    - Register the model import in `backend/db/session.py` `init_database()`
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

  - [x] 1.2 Create the Alembic migration for game_scores table
    - Create migration file `backend/alembic/versions/YYYYMMDD_0010_create_game_scores.py`
    - Include table creation with all columns and both indexes
    - _Requirements: 10.1, 10.2, 10.3_

- [x] 2. Backend service layer
  - [x] 2.1 Implement the score validator
    - Create `backend/services/score_validator.py`
    - Define `REGISTERED_GAMES` set and `GAME_MAX_SCORES` dict with flappy: 999
    - Define `DUPLICATE_WINDOW_SECONDS = 5` and `HOURLY_RATE_LIMIT = 60`
    - Implement `validate_score(user_id, game_name, score, db_session)` that checks: game existence (404), score threshold/non-positive (422), duplicate timing (429), hourly rate limit (429)
    - Raise `ScoreValidationError(status_code, error_code, message)` on failure
    - Validation priority: threshold/non-positive before duplicate timing before rate limit
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [x]* 2.2 Write property tests for score validator (Hypothesis)
    - **Property 4: Invalid score rejection** — generate out-of-range values (non-positive and above max), verify 422 rejection and no DB record created
    - **Property 5: Duplicate timing rejection** — generate time-close submission pairs, verify second rejected with 429
    - **Validates: Requirements 7.1, 7.2, 7.4**

  - [x] 2.3 Implement the arcade service
    - Create `backend/services/arcade_service.py`
    - Implement `submit_score(user_id, game_name, score, db_session)` → returns `{score, personal_best, rank}`
    - Implement `get_leaderboard(game_name, user_id=None, db_session)` → returns top 50 entries sorted by each user's highest score, plus optional user_entry and metadata dict
    - Implement `get_personal_best(user_id, game_name, db_session)` → returns `{score, rank}` or None
    - _Requirements: 6.2, 6.3, 8.1, 8.2, 8.3, 16.1, 16.3_

  - [x]* 2.4 Write property tests for arcade service (Hypothesis)
    - **Property 2: Score submission response correctness** — generate random scores and leaderboard states, verify response contains correct personal_best and rank
    - **Property 3: Full history persistence** — generate submission sequences, verify all records persisted with correct count and values
    - **Property 6: Leaderboard sort/cap correctness** — generate random score sets, verify descending sort by user best, capped at 50, with required fields
    - **Property 7: Authenticated user rank inclusion** — generate leaderboard + user scores, verify user_entry present with correct rank
    - **Validates: Requirements 6.2, 6.3, 8.1, 8.2, 8.3, 10.4**

- [x] 3. Backend API router
  - [x] 3.1 Create the arcade router with score submission endpoint
    - Create `backend/routers/arcade.py` with `APIRouter(prefix="/api/arcade", tags=["arcade"])`
    - Implement `POST /{game}/score` — validate session token, call score_validator, call arcade_service.submit_score, return ScoreSubmitResponse
    - Handle ScoreValidationError and return appropriate HTTP error responses
    - _Requirements: 6.1, 6.3, 6.4, 7.1, 7.2, 7.3, 7.4_

  - [x] 3.2 Add leaderboard and personal-best endpoints
    - Implement `GET /{game}/leaderboard` with optional `token` query param — check game existence (404), call arcade_service.get_leaderboard, return LeaderboardResponse
    - Implement `GET /{game}/personal-best` with required `token` query param — validate token, call arcade_service.get_personal_best
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [x] 3.3 Register arcade router in app.py and add Pydantic schemas
    - Add `ScoreSubmitRequest`, `ScoreSubmitResponse`, `LeaderboardEntry`, `LeaderboardResponse` to `backend/models/schemas.py`
    - Import and register the arcade router in `backend/app.py` via `app.include_router()`
    - _Requirements: 6.1, 6.3, 8.1, 16.3_

- [x] 4. Checkpoint — Backend complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Frontend service layer
  - [x] 5.1 Create the arcade API service
    - Create `frontend/src/services/arcadeApi.js`
    - Implement `submitScore(token, gameSlug, score)` — POST to `/api/arcade/{gameSlug}/score`
    - Implement `getLeaderboard(gameSlug, token)` — GET from `/api/arcade/{gameSlug}/leaderboard`
    - Implement `getPersonalBest(token, gameSlug)` — GET from `/api/arcade/{gameSlug}/personal-best`
    - Follow existing service patterns (e.g., attendanceApi.js)
    - _Requirements: 6.1, 8.1_

- [x] 6. Frontend shared Arcade components
  - [x] 6.1 Create the game registry
    - Create `frontend/src/components/arcade/gameRegistry.js`
    - Define registry object with `flappy` entry: slug, title, description, thumbnail path, maxScore (999), and lazy-loaded component reference
    - _Requirements: 4.3_

  - [x] 6.2 Create the GameLayout wrapper component
    - Create `frontend/src/components/arcade/GameLayout.jsx`
    - Render back button (navigate to `/app/arcade`), game title from registry, score display area
    - Handle game-over state: show score overlay with "Play Again" button and leaderboard access
    - Call `arcadeApi.submitScore()` on game end, display personal_best and rank from response
    - Handle error states (network failure toast, 401 redirect, 429 silent ignore)
    - _Requirements: 4.2, 5.4, 5.5, 6.1, 6.3_

  - [x] 6.3 Create the GameCard component
    - Create `frontend/src/components/arcade/GameCard.jsx`
    - Render thumbnail, title, description, personal high score (or "No score yet"), and "Play" button
    - On play button tap, navigate to `/app/arcade/{slug}`
    - Style with Attend75 design system: bg-[#4A466A], rounded corners, hover animation
    - _Requirements: 3.2, 3.3_

  - [x] 6.4 Create the Leaderboard component
    - Create `frontend/src/components/arcade/Leaderboard.jsx`
    - Fetch and render ranked entries: position, username, score
    - Highlight current user's entry with distinct background/border
    - If user is outside top entries, show pinned footer row with user's rank and score
    - Style consistently with Attend75's list patterns
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [x]* 6.5 Write property test for GameCard rendering (fast-check)
    - **Property 1: Game Card renders all required metadata fields** — generate random game metadata objects, verify all fields present in rendered output
    - **Validates: Requirements 3.2**

- [x] 7. Arcade routing and pages
  - [x] 7.1 Create ArcadeHome page
    - Create `frontend/src/pages/ArcadeHome.jsx`
    - Render grid of GameCard components mapped from gameRegistry
    - Fetch personal bests for each game on mount (if authenticated)
    - Responsive grid: 1 column mobile, 2 columns tablet, 3 columns desktop
    - _Requirements: 3.1, 3.4, 12.1_

  - [x] 7.2 Create ArcadeGamePage (slug resolver)
    - Create `frontend/src/pages/ArcadeGamePage.jsx`
    - Read `gameSlug` from URL params, resolve against gameRegistry
    - If slug not found → redirect to `/app/arcade`
    - If found → render GameLayout wrapping the lazy-loaded game component
    - Pass `onGameEnd`, `onScoreUpdate`, `isActive` props to game component
    - _Requirements: 4.1, 14.2, 14.3_

  - [x] 7.3 Register Arcade routes in AppRoutes.jsx
    - Add lazy imports for ArcadeHome and ArcadeGamePage
    - Register `<Route path="arcade" element={<ArcadeHome />} />` under `/app`
    - Register `<Route path="arcade/:gameSlug" element={<ArcadeGamePage />} />` under `/app`
    - _Requirements: 1.2, 14.1, 14.4_

  - [x]* 7.4 Write property test for unregistered slug redirect (fast-check)
    - **Property 13: Unregistered game slug redirect** — generate random strings not in registry, verify redirect to `/app/arcade`
    - **Validates: Requirements 14.3**

- [x] 8. Initial game — Flappy Bird clone
  - [x] 8.1 Implement FlappyGame component with canvas and game loop
    - Create `frontend/src/components/arcade/games/FlappyGame.jsx`
    - Set up HTML5 Canvas with requestAnimationFrame loop
    - Implement delta-time physics: gravity pulls bird down, tap/click/space produces jump
    - Implement pipe generation, scrolling, and gap positioning
    - Implement collision detection: bird vs pipes, ground, and play area boundaries
    - On collision → call `onGameEnd(score)` with pipe-pass count
    - Display current score during gameplay
    - Preload sprites/assets before gameplay starts
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 15.1, 15.2, 15.3_

  - [x] 8.2 Add pause/resume, restart, and cleanup logic
    - Pause game on tab/window blur, resume on focus (use `visibilitychange` event)
    - "Play Again" resets: bird to start position, score to 0, pipes cleared, game active — no page reload
    - Scale canvas to viewport width maintaining aspect ratio
    - Preserve game state during viewport resize/rotation
    - Clean up animation frames, timers, and event listeners on restart and unmount
    - Process input within next animation frame
    - _Requirements: 13.5, 15.4, 15.5, 15.6, 15.7, 15.8_

  - [x] 8.3 Style Flappy Bird game to match Attend75 design system
    - Restyle colors (use Attend75 palette: #5B5878, #4A466A, #F7F4FF accents)
    - Remove any external branding from source reference
    - Ensure game assets (sprites, sounds) total under 500KB
    - _Requirements: 5.1, 5.2, 5.3, 11.4, 12.3_

  - [x]* 8.4 Write property tests for Flappy Bird physics (fast-check)
    - **Property 8: Tap produces jump, absence produces gravity** — generate random game states, verify tap increases upward velocity and no-input decreases position
    - **Property 9: Collision detection ends game** — generate overlapping bounding boxes, verify game ends and score reported
    - **Property 10: Game restart resets to initial state** — generate random game-over states, verify restart produces initial state
    - **Property 11: Delta-time proportional movement** — generate random dt pairs, verify displacement proportionality
    - **Property 12: Viewport resize preserves gameplay state** — generate active states, verify resize doesn't alter position/score/pipes
    - **Validates: Requirements 13.2, 13.3, 13.5, 15.2, 15.7**

- [x] 9. Checkpoint — Game playable end-to-end
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Dashboard banner and navigation entry
  - [x] 10.1 Add Arcade navigation item
    - Add "Arcade" entry to BottomNav and Sidebar components with icon (e.g., Gamepad2 from lucide-react)
    - Link to `/app/arcade`
    - Style consistently with existing nav items
    - _Requirements: 1.1, 1.2, 1.3_

  - [x] 10.2 Create Dashboard Arcade banner
    - Add promotional card to Dashboard page linking to `/app/arcade`
    - Include tagline, visual icon/illustration, and CTA button
    - Style with Attend75 card system: bg-[#4A466A], border-white/10, rounded-2xl
    - On tap → navigate to `/app/arcade`
    - _Requirements: 2.1, 2.2, 2.3_

- [x] 11. Final checkpoint — Full feature integration
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- Backend uses Python (FastAPI + SQLAlchemy + Hypothesis for PBT)
- Frontend uses JavaScript/React (fast-check for PBT)
- Game assets should be placed in `frontend/public/assets/arcade/`
- The game registry pattern means adding future games requires only a new component file + registry entry

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["2.1", "2.3"] },
    { "id": 3, "tasks": ["2.2", "2.4", "3.1"] },
    { "id": 4, "tasks": ["3.2", "3.3"] },
    { "id": 5, "tasks": ["5.1"] },
    { "id": 6, "tasks": ["6.1"] },
    { "id": 7, "tasks": ["6.2", "6.3", "6.4"] },
    { "id": 8, "tasks": ["6.5", "7.1", "7.2"] },
    { "id": 9, "tasks": ["7.3", "7.4"] },
    { "id": 10, "tasks": ["8.1"] },
    { "id": 11, "tasks": ["8.2", "8.3"] },
    { "id": 12, "tasks": ["8.4", "10.1", "10.2"] }
  ]
}
```
