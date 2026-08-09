# Design Document: Rewarded Ads Arcade

## Overview

The Rewarded Ads system adds a voluntary "Continue (Watch Ad)" option to the arcade game-over
overlay. When a player loses a game, they may choose to watch a short rewarded advertisement in
exchange for resuming their run. The feature is provider-agnostic: all ad network operations are
delegated through a defined `AdProvider` interface, so swapping or adding an ad network requires
only a new provider file. A built-in `MockProvider` lets the full flow run in development and CI
without any real ad network dependency.

The module is entirely self-contained under `src/ads/`. `GameLayout` — the existing shared wrapper
in `src/components/arcade/GameLayout.jsx` — gains a single `supportsRewarded` boolean prop that
opts a game into the Continue flow. No game component ever imports ad module code directly.

**Key design decisions:**

- **Singleton AdManager** with dependency injection: `init()` accepts a provider at startup so
  tests can swap in `MockProvider` without patching globals.
- **AdProvider interface** separates `load` (prepare) from `show` (display), mirroring how real ad
  SDKs work and enabling a clean loading-indicator state in the UI.
- **Analytics batching** in the browser (5 s / 10 events) keeps the backend endpoint simple and
  avoids a network round-trip per event.
- **Frequency guardrails** (120 s cooldown, 3 ads/session) are enforced inside `AdManager.isAdReady()`
  so `GameLayout` never needs to reason about timing.

---

## Architecture

### High-Level Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Browser / React App                                                    │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  ArcadeGamePage  (/app/arcade/:gameSlug)                         │   │
│  │                                                                  │   │
│  │  <GameLayout gameSlug="flappy" supportsRewarded={true}>          │   │
│  │     ├─ Header bar                                                │   │
│  │     ├─ <GameComponent ...>   ← render-prop, no ad imports        │   │
│  │     └─ GameOverOverlay   ← ad UI lives here                      │   │
│  │           ├─ "Play Again" (always)                               │   │
│  │           └─ "Continue (Watch Ad)"  (when supportsRewarded &&    │   │
│  │                                      AdManager.isAdReady())      │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                           │ showRewardedAd()                            │
│                           ▼                                             │
│  ┌───────────────────────────────────────────────────────────────┐      │
│  │  src/ads/AdManager.js  (singleton)                            │      │
│  │                                                               │      │
│  │   init({ provider, analytics, gameSlug, adUnitId, sessionId })│      │
│  │   showRewardedAd() → Promise<AdResult>                        │      │
│  │   isAdReady() → boolean   (guardrails + provider.isReady())   │      │
│  │   isProviderReady() → boolean  (provider.isReady() only)      │      │
│  │   onAdEvent(handler)                                          │      │
│  │   setProvider(provider)                                       │      │
│  │                                                               │      │
│  │   Internal: lastShownAt, showCount, currentProvider           │      │
│  └──────────┬────────────────────────────┬───────────────────────┘      │
│             │ delegates                  │ emits AdEvents                │
│             ▼                            ▼                               │
│  ┌─────────────────────┐    ┌───────────────────────────────────┐       │
│  │  AdProvider         │    │  src/ads/Analytics.js             │       │
│  │  interface          │    │                                   │       │
│  │  ─────────────────  │    │  track(event)                     │       │
│  │  load(adUnitId)     │    │  flush() → POST /api/ads/events   │       │
│  │  show()             │    │  Auto-flush: 5s or 10 events      │       │
│  │  isReady()          │    │  Retry failed batches             │       │
│  └──────────┬──────────┘    └───────────────────────────────────┘       │
│             │                                                            │
│    ┌────────┴──────────┐                                                 │
│    │                   │                                                 │
│    ▼                   ▼                                                 │
│  MockProvider      (future)                                             │
│  (dev/test)        GoogleAdMob                                          │
│                    UnityAds, etc.                                       │
└─────────────────────────────────────────────────────────────────────────┘
                            │ HTTP POST
                            ▼
              ┌──────────────────────────────┐
              │  FastAPI Backend             │
              │  POST /api/ads/events        │
              │  → AdEvent model (SQLAlchemy)│
              │  → ad_events table           │
              └──────────────────────────────┘
```

### Continue Flow Data Flow

```
Player taps "Continue (Watch Ad)"
          │
          ▼
GameLayout.handleContinue()
   emit reward_offered via AdManager.onAdEvent
          │
          ▼
AdManager.showRewardedAd()
   1. emit ad_requested
   2. provider.load(adUnitId)   [loading spinner shown in overlay]
   3a. load rejects → emit ad_failed → return {outcome:'failed'}
   3b. load resolves →
          emit ad_loaded
          emit reward_accepted
          provider.show()        [overlay dismissed before ad starts]
          4a. show resolves completed →
                 emit ad_started, ad_completed, reward_granted
                 return {outcome:'completed'}
          4b. show resolves skipped →
                 emit ad_started, ad_completed, reward_declined
                 return {outcome:'skipped'}
          4c. show resolves failed/not_ready →
                 emit ad_failed
                 return {outcome: ...}
          │
          ▼
GameLayout receives AdResult
   completed → close overlay, call handleRestart()
   anything else → show error or fall through to "Play Again"
```

---

## Directory Structure

```
frontend/src/ads/
├── types.js                   # AdResult, AdEvent, AdEventType
├── AdManager.js               # Singleton orchestrator
├── RewardedAd.js              # Thin lifecycle helper (used by AdManager)
├── Analytics.js               # Batching analytics forwarder
└── providers/
    ├── AdProvider.js          # Interface documentation (JSDoc only — no runtime class)
    ├── MockProvider.js        # Dev/test implementation
    └── index.js               # Factory + re-exports

frontend/src/components/arcade/
└── GameLayout.jsx             # Modified: supportsRewarded prop + Continue flow

backend/
├── db/models/ad_event.py      # New SQLAlchemy model
├── routers/ads.py             # New router: POST /api/ads/events
└── alembic/versions/
    └── YYYYMMDD_NNNN_create_ad_events.py
```

---

## Components and Interfaces

### `src/ads/types.js`

```js
/**
 * Outcome variants for a rewarded ad attempt.
 * @typedef {'completed'|'skipped'|'failed'|'not_ready'} AdOutcome
 */

/**
 * @typedef {Object} AdResult
 * @property {AdOutcome} outcome
 * @property {string} [error]   - present when outcome === 'failed'
 */

/**
 * All lifecycle event types emitted by AdManager and MockProvider.
 * @enum {string}
 */
export const AdEventType = Object.freeze({
  AD_REQUESTED:    'ad_requested',
  AD_LOADED:       'ad_loaded',
  AD_FAILED:       'ad_failed',
  AD_STARTED:      'ad_started',
  AD_COMPLETED:    'ad_completed',
  REWARD_OFFERED:  'reward_offered',
  REWARD_ACCEPTED: 'reward_accepted',
  REWARD_GRANTED:  'reward_granted',
  REWARD_DECLINED: 'reward_declined',
})

/**
 * @typedef {Object} AdEvent
 * @property {string} eventType   - one of AdEventType values
 * @property {string} gameSlug    - e.g. 'flappy'
 * @property {string} adUnitId    - ad unit identifier string
 * @property {string} timestamp   - ISO 8601 UTC string
 * @property {string} sessionId   - unique per-session UUID
 */
```

---

### `src/ads/providers/AdProvider.js` (interface specification)

This file is documentation-only (JSDoc). It defines the contract every concrete provider must satisfy.
No runtime base class is needed in JavaScript; providers are duck-typed against this interface.

```js
/**
 * AdProvider interface — every concrete provider must implement these three methods.
 *
 * @interface AdProvider
 */

/**
 * Prepare the ad unit for display. Must be called before show().
 * Resolves when the ad is ready to display. Rejects on network/SDK error.
 *
 * @function
 * @name AdProvider#load
 * @param {string} adUnitId
 * @returns {Promise<void>}
 */

/**
 * Display the ad. Resolves with an AdResult when the user finishes or skips.
 * If called before load() completes, resolves with {outcome:'not_ready'}.
 *
 * @function
 * @name AdProvider#show
 * @returns {Promise<AdResult>}
 */

/**
 * Returns true if load() has completed and show() has not yet been called.
 *
 * @function
 * @name AdProvider#isReady
 * @returns {boolean}
 */
```

---

### `src/ads/providers/MockProvider.js`

```js
/**
 * MockProvider — simulates a rewarded ad provider for dev/test environments.
 *
 * Constructor options:
 *   loadDelay      {number}  ms to wait before resolving load()   (default 500)
 *   viewingDuration{number}  ms to wait before resolving show()   (default 3000)
 *   forceOutcome   {string|null}  'completed'|'skipped'|'failed'|null (default null → 'completed')
 *
 * Additional methods beyond AdProvider interface:
 *   getEventLog()   → AdEvent[]   all events emitted since instantiation / last reset()
 *   reset()         → void        clears event log and internal state (isReady → false)
 *
 * MockProvider emits AdEvents internally so getEventLog() can be used in tests to assert
 * the correct event sequence without a real analytics pipeline.
 */
class MockProvider {
  constructor({ loadDelay = 500, viewingDuration = 3000, forceOutcome = null } = {}) { ... }
  async load(adUnitId) { ... }    // waits loadDelay ms, sets _ready = true
  async show() { ... }            // waits viewingDuration ms, resolves with forceOutcome ?? 'completed'
  isReady() { return this._ready }
  getEventLog() { return [...this._eventLog] }
  reset() { this._ready = false; this._eventLog = [] }
}
```

**Behavioral contract for MockProvider:**

| Method | Before `load()` | After `load()` resolves | After `show()` resolves |
|--------|-----------------|------------------------|------------------------|
| `isReady()` | `false` | `true` | `false` |
| `show()` | returns `{outcome:'not_ready'}` | shows ad | — |

`getEventLog()` returns a snapshot array (not a live reference) so mutations in tests do not
affect the internal log.

---

### `src/ads/providers/index.js`

```js
export { MockProvider } from './MockProvider.js'

/**
 * Factory for creating a provider by type string.
 * Extend this when adding real ad networks.
 *
 * @param {'mock'} type
 * @param {object} config  - passed to the provider constructor
 * @returns {AdProvider}
 */
export function createProvider(type, config = {}) {
  switch (type) {
    case 'mock': return new MockProvider(config)
    default: throw new Error(`Unknown provider type: ${type}`)
  }
}
```

---

### `src/ads/AdManager.js`

```js
/**
 * AdManager — singleton that orchestrates the rewarded ad lifecycle.
 *
 * Initialization (call once, early in app startup or before first game load):
 *   AdManager.init({ provider, analytics, gameSlug, adUnitId, sessionId })
 *
 * Public API:
 *   AdManager.showRewardedAd()    → Promise<AdResult>
 *   AdManager.isAdReady()         → boolean  (guardrails + provider)
 *   AdManager.isProviderReady()   → boolean  (provider only, no side effects)
 *   AdManager.onAdEvent(handler)  → () => void  (returns unsubscribe fn)
 *   AdManager.setProvider(p)      → void
 *
 * Internal state:
 *   _provider        current AdProvider instance
 *   _analytics       Analytics instance
 *   _gameSlug        string
 *   _adUnitId        string
 *   _sessionId       string
 *   _lastShownAt     number | null  (Date.now() of last completed show)
 *   _showCount       number  (shows in current session, resets on init())
 *   _handlers        Set<Function>  (event subscribers)
 *
 * Frequency guardrails (checked inside isAdReady()):
 *   - 120 000 ms cooldown since _lastShownAt
 *   - _showCount < 3
 *   - _provider.isReady() === true
 */
```

**`showRewardedAd()` algorithm (pseudo-code):**

```
showRewardedAd():
  emit ad_requested
  try:
    await provider.load(adUnitId)
    emit ad_loaded
    emit reward_accepted   // user is committed; overlay dismisses now
    result = await provider.show()
    emit ad_started        // fires just before show() returns in mock; real SDK fires separately
    if result.outcome === 'completed':
      _lastShownAt = Date.now()
      _showCount++
      emit ad_completed
      emit reward_granted
    elif result.outcome === 'skipped':
      emit ad_completed
      emit reward_declined
    else:                  // 'failed' | 'not_ready'
      emit ad_failed (error = result.error)
    return result
  catch err:
    emit ad_failed (error = err.message)
    return { outcome: 'failed', error: err.message }
```

**`isAdReady()` algorithm:**

```
isAdReady():
  if _showCount >= 3: return false
  if _lastShownAt && (Date.now() - _lastShownAt) < 120_000: return false
  return _provider.isReady()
```

---

### `src/ads/RewardedAd.js`

`RewardedAd` is a stateless helper that AdManager calls internally. It owns the event-emit
sequencing so AdManager stays focused on state management.

```js
/**
 * Execute a full rewarded ad request.
 *
 * @param {object} opts
 * @param {AdProvider} opts.provider
 * @param {Analytics}  opts.analytics
 * @param {string}     opts.adUnitId
 * @param {string}     opts.gameSlug
 * @param {string}     opts.sessionId
 * @param {Function}   opts.emit     - (eventType: string) => void
 * @returns {Promise<AdResult>}
 */
export async function request({ provider, analytics, adUnitId, gameSlug, sessionId, emit }) { ... }
```

`AdManager.showRewardedAd()` calls `RewardedAd.request()`, passing its own `_emit` helper
that both fires subscriber handlers and calls `analytics.track()`.

---

### `src/ads/Analytics.js`

```js
/**
 * Analytics — batches AdEvents and forwards them to the backend.
 *
 * Configuration (call before first track()):
 *   analytics.setEndpoint(url)     default: '/api/ads/events'
 *   analytics.setBatchSize(n)      default: 10
 *
 * Flush triggers:
 *   - Automatically every 5 000 ms (setInterval)
 *   - Automatically when queue reaches batchSize
 *   - Manually via flush()
 *
 * Failure handling:
 *   If the POST fails (network error or non-2xx), the batch is pushed back
 *   to the front of the queue and retried on the next flush cycle.
 *   Events are never dropped silently.
 *
 * track(event: AdEvent): void
 * flush(): Promise<void>
 */
```

**`flush()` algorithm:**

```
flush():
  if queue is empty: return
  batch = queue.splice(0, batchSize)
  try:
    POST endpoint { events: batch }
    // success — batch discarded
  catch:
    queue.unshift(...batch)  // put back at front for next cycle
```

**HTTP request shape:**
```
POST /api/ads/events
Content-Type: application/json

{
  "events": [
    {
      "eventType": "ad_requested",
      "gameSlug": "flappy",
      "adUnitId": "rewarded/flappy",
      "timestamp": "2025-08-01T12:34:56.789Z",
      "sessionId": "550e8400-e29b-41d4-a716-446655440000"
    },
    ...
  ]
}
```

---

## Data Models

### Frontend: `AdEvent` (in-memory, see `src/ads/types.js`)

| Field | Type | Notes |
|-------|------|-------|
| `eventType` | `string` | One of the 9 `AdEventType` enum values |
| `gameSlug` | `string` | e.g. `'flappy'`, `'pacman'` |
| `adUnitId` | `string` | Ad unit identifier, e.g. `'rewarded/flappy'` |
| `timestamp` | `string` | ISO 8601 UTC, e.g. `'2025-08-01T12:34:56.789Z'` |
| `sessionId` | `string` | UUIDv4, generated once per `AdManager.init()` call |

### Backend: `AdEvent` SQLAlchemy model (`backend/db/models/ad_event.py`)

Follows the exact same pattern as `backend/db/models/game_score.py`:

```python
from datetime import datetime
from sqlalchemy import DateTime, Index, String
from sqlalchemy.orm import Mapped, mapped_column
from db.base import Base

class AdEvent(Base):
    __tablename__ = "ad_events"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    event_type: Mapped[str] = mapped_column(String(30), nullable=False)
    game_slug: Mapped[str] = mapped_column(String(50), nullable=False)
    ad_unit_id: Mapped[str] = mapped_column(String(100), nullable=False)
    # ISO 8601 string forwarded as-is from the client
    timestamp: Mapped[str] = mapped_column(String(35), nullable=False)
    session_id: Mapped[str] = mapped_column(String(36), nullable=False)
    received_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )

    __table_args__ = (
        Index("ix_ad_events_game_slug", "game_slug"),
        Index("ix_ad_events_event_type", "event_type"),
        Index("ix_ad_events_session_id", "session_id"),
    )
```

Alembic migration file: `backend/alembic/versions/YYYYMMDD_NNNN_create_ad_events.py`

---

## GameLayout Changes

### New Prop

```jsx
function GameLayout({ gameSlug, children, supportsRewarded = false }) { ... }
```

`ArcadeGamePage.jsx` already passes `gameSlug` and a render-prop `children`. Adding `supportsRewarded`
is the only call-site change needed for games that want the Continue button.

### New Internal State

```js
const [adState, setAdState] = useState('idle')
// 'idle' | 'loading' | 'showing' | 'completed' | 'failed' | 'dismissed'

const AD_LOAD_TIMEOUT_MS = 8000
```

### `handleContinue` callback

```js
const handleContinue = useCallback(async () => {
  if (!supportsRewarded || !AdManager.isAdReady()) return

  setAdState('loading')
  AdManager.emit(AdEventType.REWARD_OFFERED)  // via onAdEvent subscription

  const loadTimeoutId = setTimeout(() => {
    setAdState('failed')  // 8-second timeout
  }, AD_LOAD_TIMEOUT_MS)

  try {
    const result = await AdManager.showRewardedAd()
    clearTimeout(loadTimeoutId)

    if (result.outcome === 'completed') {
      setAdState('completed')
      handleRestart()  // existing restart logic — closes overlay, resets score
    } else {
      setAdState('failed')
    }
  } catch {
    clearTimeout(loadTimeoutId)
    setAdState('failed')
  }
}, [supportsRewarded, handleRestart])
```

### AdManager initialization in GameLayout

`AdManager.init()` is called inside a `useEffect` when `gameSlug` or `supportsRewarded` changes:

```js
useEffect(() => {
  if (!supportsRewarded) return
  AdManager.init({
    provider: createProvider('mock'),          // swap for real provider in prod
    analytics: new Analytics(),
    gameSlug,
    adUnitId: `rewarded/${gameSlug}`,
    sessionId: crypto.randomUUID(),
  })
}, [gameSlug, supportsRewarded])
```

### GameOverOverlay — Continue button render logic

```jsx
{supportsRewarded && AdManager.isAdReady() && adState === 'idle' && (
  <button onClick={handleContinue} className="...">
    Continue your run — watch a short ad
  </button>
)}

{adState === 'loading' && (
  <div role="status" aria-label="Loading ad">
    <Spinner />
    <p>Loading ad…</p>
  </div>
)}

{adState === 'failed' && (
  <p className="text-sm text-red-400">Ad unavailable. Please try again later.</p>
)}
```

The "Play Again" button is always rendered regardless of `adState`.

---

## GameOverOverlay Behaviour State Machine

```
                  ┌──────┐
                  │ idle │  ← initial state on every game-over
                  └──┬───┘
                     │ player taps "Continue (Watch Ad)"
                     ▼
                ┌─────────┐
                │ loading │  ← spinner shown; 8s timeout starts
                └────┬────┘
          ┌──────────┼──────────────┐
          │          │              │
    load fails   load succeeds    8s elapsed
    (AdManager)   (ad_loaded)     (timeout)
          │          │              │
          ▼          ▼              │
       ┌──────┐  ┌─────────┐       │
       │failed│  │ showing │       │
       └──────┘  └────┬────┘       │
                      │             │
              ┌───────┼───────┐     │
              │               │     │
          completed        skipped  │
          (ad_completed +  (reward  │
           reward_granted) _declined│
              │               │     │
              ▼               ▼     ▼
         ┌──────────┐    ┌──────────────┐
         │completed │    │   failed /   │
         │→ restart │    │  dismissed   │
         └──────────┘    └──────────────┘

  At any point before "showing": player can dismiss overlay → state: dismissed
  dismissed and failed both show the standard "Play Again" button only.
```

---

## Analytics Backend Endpoint

### New Router: `backend/routers/ads.py`

Follows the exact same pattern as `backend/routers/arcade.py` — uses `run_in_threadpool` for
synchronous DB operations and returns `{"status": "success", "data": {...}}`.

```python
from fastapi import APIRouter
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List
from db.session import SessionLocal
from db.models.ad_event import AdEvent

router = APIRouter(prefix="/api/ads", tags=["ads"])

class AdEventPayload(BaseModel):
    eventType: str
    gameSlug: str
    adUnitId: str
    timestamp: str
    sessionId: str

class AdEventsRequest(BaseModel):
    events: List[AdEventPayload]

def _store_events_sync(events: List[AdEventPayload]) -> int:
    db = SessionLocal()
    try:
        rows = [
            AdEvent(
                event_type=e.eventType,
                game_slug=e.gameSlug,
                ad_unit_id=e.adUnitId,
                timestamp=e.timestamp,
                session_id=e.sessionId,
            )
            for e in events
        ]
        db.add_all(rows)
        db.commit()
        return len(rows)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

@router.post("/events")
async def post_ad_events(payload: AdEventsRequest):
    if not payload.events:
        return {"status": "success", "data": {"received": 0}}
    try:
        count = await run_in_threadpool(_store_events_sync, payload.events)
        return {"status": "success", "data": {"received": count}}
    except Exception:
        return JSONResponse(
            status_code=500,
            content={"status": "error", "error_code": "INTERNAL_ERROR",
                     "message": "Failed to store ad events."},
        )
```

Register in `backend/app.py`:
```python
from routers.ads import router as ads_router
app.include_router(ads_router)
```

### Response Shape

```json
// Success
{ "status": "success", "data": { "received": 9 } }

// Error
{ "status": "error", "error_code": "INTERNAL_ERROR", "message": "..." }
```

---

## Event Sequence Diagrams

### Happy Path (completed)

```
Player          GameLayout       AdManager        MockProvider       Analytics
  │                │                │                  │                │
  │─ tap Continue ─▶                │                  │                │
  │                │─ handleContinue▶                  │                │
  │                │                │─ emit reward_offered ────────────▶│
  │                │                │─ emit ad_requested ──────────────▶│
  │                │                │─ load(adUnitId) ──▶               │
  │            [spinner]            │   (500 ms) ◀──────┤               │
  │                │                │◀─ resolves ────────┤               │
  │                │                │─ emit ad_loaded ─────────────────▶│
  │                │                │─ emit reward_accepted ────────────▶│
  │                │                │─ show() ──────────▶               │
  │            [overlay dismissed]  │   (3000 ms) ◀─────┤               │
  │                │                │◀─ {outcome:'completed'} ──────────┤│
  │                │                │─ emit ad_started ────────────────▶│
  │                │                │─ emit ad_completed ──────────────▶│
  │                │                │─ emit reward_granted ─────────────▶│
  │                │◀─ {outcome:'completed'} ─────────────────────────── │
  │                │─ handleRestart()│                  │                │
  │◀── game resumes┤                │                  │                │
                                                     [Analytics auto-flushes every 5s]
```

### Skipped Path

```
Player          GameLayout       AdManager        MockProvider
  │                │                │                  │
  │─ tap Continue ─▶                │                  │
  │                │─ handleContinue▶                  │
  │                │                │─ emit reward_offered
  │                │                │─ emit ad_requested
  │                │                │─ load(adUnitId) ──▶
  │                │                │◀─ resolves ────────┤
  │                │                │─ emit ad_loaded
  │                │                │─ emit reward_accepted
  │                │                │─ show() ──────────▶
  │                │                │◀─ {outcome:'skipped'}
  │                │                │─ emit ad_started
  │                │                │─ emit ad_completed
  │                │                │─ emit reward_declined
  │                │◀─ {outcome:'skipped'} ────────────────
  │                │─ setAdState('failed')
  │◀─ "Play Again" button remains visible
```

### Load Failure Path

```
Player          GameLayout       AdManager        MockProvider
  │                │                │                  │
  │─ tap Continue ─▶                │                  │
  │                │─ handleContinue▶                  │
  │                │                │─ emit ad_requested
  │                │                │─ load(adUnitId) ──▶
  │                │                │◀─ rejects (error) ─┤
  │                │                │─ emit ad_failed(error)
  │                │                │─ return {outcome:'failed', error}
  │                │◀─ {outcome:'failed'} ──────────────
  │                │─ setAdState('failed')
  │◀─ "Ad unavailable. Please try again later." shown
  │◀─ "Play Again" button remains visible
```

### Frequency Guardrail Block (cooldown not elapsed)

```
Player          GameLayout       AdManager
  │                │                │
  │                │  [previous ad shown 30s ago; cooldown = 120s]
  │                │─ isAdReady()? ─▶
  │                │◀─ false ────────┤  (_showCount < 3 but 30s < 120s)
  │                │
  │  [Continue button NOT rendered in overlay]
  │
  │◀─ overlay shows only "Play Again" and "Leaderboard"
```

---

## Integration Guide for New Games

To enable the "Continue (Watch Ad)" option in any current or future arcade game, the only required
change is to add `supportsRewarded={true}` to the `<GameLayout>` call in `ArcadeGamePage.jsx` (or
whichever route renders that game). No code changes are needed inside the game component itself —
the game continues to communicate with `GameLayout` exclusively through the existing render-prop
contract (`onGameEnd`, `onScoreUpdate`, `onRestart`, `isActive`). `GameLayout` handles all ad
module initialization, the Continue button, the loading state, the 8-second timeout, and the
`handleRestart()` call on success. A concrete example: to enable rewarded ads for Flappy Bird,
change `<GameLayout gameSlug="flappy">` to `<GameLayout gameSlug="flappy" supportsRewarded={true}>`.

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a
system — essentially, a formal statement about what the system should do. Properties serve as the
bridge between human-readable specifications and machine-verifiable correctness guarantees.*

---

### Property 1: AdProvider `show()` before `load()` returns `not_ready`

*For any* `MockProvider` instance (regardless of config), calling `show()` before `load()` has
resolved shall return an `AdResult` with `outcome === 'not_ready'`, and `isReady()` shall remain
`false`.

**Validates: Requirements 2.4**

---

### Property 2: `forceOutcome` determines `show()` result

*For any* `MockProvider` configured with `forceOutcome` ∈ `{completed, skipped, failed}`, calling
`show()` after a successful `load()` shall resolve with an `AdResult` whose `outcome` field equals
the configured `forceOutcome`.

**Validates: Requirements 3.4, 3.5, 2.3**

---

### Property 3: Correct event sequence per outcome

*For any* completed ad session with `forceOutcome = 'completed'`, the event log shall contain
exactly the sequence `[ad_requested, ad_loaded, reward_accepted, ad_started, ad_completed,
reward_granted]` in that order. *For any* session with `forceOutcome = 'skipped'`, the final two
events shall be `[ad_completed, reward_declined]`. *For any* session with `forceOutcome = 'failed'`
or a `load()` rejection, the log shall contain `ad_failed` and shall never contain `reward_granted`.

**Validates: Requirements 4.1–4.8, 8.5**

---

### Property 4: Reward only on `completed`

*For any* ad session where `outcome ≠ 'completed'`, the event `reward_granted` shall never appear
in the event log produced by either `MockProvider.getEventLog()` or `AdManager`'s event handlers.

**Validates: Requirements 4.8**

---

### Property 5: AdEvent shape invariant

*For any* `AdEvent` emitted during any ad session, the event object shall contain all five required
fields: `eventType` (string, member of `AdEventType`), `gameSlug` (non-empty string), `adUnitId`
(non-empty string), `timestamp` (valid ISO 8601 UTC string), and `sessionId` (non-empty string).

**Validates: Requirements 7.5**

---

### Property 6: Analytics batching — flush-at-N invariant

*For any* sequence of N events tracked where N < configured batch size, no automatic POST to
`/api/ads/events` shall be triggered. When the N-th event causes the queue length to equal the
batch size, exactly one POST shall fire containing all N events.

**Validates: Requirements 7.2**

---

### Property 7: Analytics retry on failure

*For any* batch of events where the POST request fails, all events in the failed batch shall remain
in the queue after the flush attempt, and the subsequent successful flush shall include those events.
No events shall be silently discarded.

**Validates: Requirements 7.3**

---

### Property 8: Cooldown guardrail

*For any* session where a rewarded ad was shown at time T, `AdManager.isAdReady()` shall return
`false` for all times T' where `T' - T < 120_000 ms`, and shall return `true` (assuming
`_showCount < 3` and `provider.isReady() === true`) at time T'' where `T'' - T ≥ 120_000 ms`.

**Validates: Requirements 9.1, 9.2**

---

### Property 9: Session show-count guardrail

*For any* session where 3 rewarded ads have been shown, `AdManager.isAdReady()` shall return
`false` for all subsequent calls within that session, regardless of elapsed time or provider
readiness.

**Validates: Requirements 9.3, 9.4**

---

### Property 10: Continue button absent when ad unavailable

*For any* render of the `GameOverOverlay` where `AdManager.isAdReady()` returns `false` (for any
reason: cooldown, session cap, or provider not ready), the "Continue (Watch Ad)" button shall be
absent from the rendered output.

**Validates: Requirements 9.5, 6.5**

---

### Property 11: No ad UI when `supportsRewarded` is false

*For any* game session where `GameLayout` is rendered with `supportsRewarded={false}`, the rendered
output shall contain no elements with ad-related copy, the Continue button, or the loading spinner,
regardless of `AdManager` state.

**Validates: Requirements 6.5, 5.1**

---

### Property 12: `isProviderReady()` has no side effects

*For any* `AdManager` state, calling `isProviderReady()` N times shall not emit any events, not
mutate `_lastShownAt`, `_showCount`, or `_provider` state, and shall return the same value each
time (given no other calls between invocations).

**Validates: Requirements 8.4**

---

## Error Handling

### Ad Load Failure
- `AdManager.showRewardedAd()` catches any `provider.load()` rejection, emits `ad_failed`, and
  returns `{ outcome: 'failed', error: err.message }`.
- `GameLayout.handleContinue()` receives this result and sets `adState = 'failed'`, which renders
  the "Ad unavailable" message and keeps "Play Again" accessible.

### 8-Second Timeout
- `GameLayout` starts a `setTimeout(8000)` when `handleContinue` begins.
- If the timeout fires before `showRewardedAd()` resolves, `adState` is set to `'failed'`
  immediately (the UI updates without waiting for the promise). When the promise eventually
  resolves, the result is ignored (guard: check if `adState` is still `'loading'` before acting).

### Analytics Flush Failure
- Failed batches are re-queued at the front of the queue (see `flush()` algorithm above).
- Retries occur on the next auto-flush (5s) or next manual `flush()` call.
- No exponential back-off is needed given the low event volume; this can be added later.
- Events are held in memory only; they do not survive a page reload. This is acceptable for
  analytics (vs. game scores which use `localStorage` offline queue).

### Provider Not Initialized
- If `AdManager.showRewardedAd()` is called before `init()`, it throws an `Error('AdManager not
  initialized')`. `GameLayout.handleContinue()` catches this and sets `adState = 'failed'`.
- `isAdReady()` returns `false` if `_provider` is null, so the button won't be shown.

### Show Count / Session State
- `AdManager.init()` resets `_showCount` to `0` and `_lastShownAt` to `null`. Each new game
  session calls `init()` (via `GameLayout`'s `useEffect`), so guardrail state is per-session.

---

## Testing Strategy

### Unit Tests (`frontend/src/ads/__tests__/`)

Use **Vitest** (already the project's test runner via Vite) with `vi.useFakeTimers()` for timing.

**`AdManager.test.js`**
- Happy path: `showRewardedAd()` with MockProvider → verify event sequence and AdResult
- Skipped path: `forceOutcome: 'skipped'` → verify `reward_declined`, no `reward_granted`
- Failed path: MockProvider throws on load → verify `ad_failed` emitted
- `isAdReady()` respects 120s cooldown (fake timers)
- `isAdReady()` respects max-3 cap
- `setProvider()` swaps provider; next call uses new provider
- `isProviderReady()` returns provider state with no side effects

**`MockProvider.test.js`**
- `load()` resolves after configured delay (fake timers)
- `show()` before `load()` → `not_ready`
- `forceOutcome` values produce correct AdResult
- `getEventLog()` returns a copy, not a live reference
- `reset()` clears log and resets `isReady()` to false

**`Analytics.test.js`**
- Events queued < batch size: no fetch called
- N-th event triggers auto-flush with all N events
- Auto-flush via setInterval after 5s (fake timers)
- Failed POST: events retained in queue
- Second flush after failure: events included in new batch

### Component Tests (`frontend/src/components/arcade/__tests__/`)

Use **Vitest + React Testing Library**.

**`GameOverOverlay.test.jsx`** (tested via `GameLayout`)
- `supportsRewarded={false}`: no Continue button rendered
- `supportsRewarded={true}`, `isAdReady()` mocked false: no Continue button
- `supportsRewarded={true}`, `isAdReady()` mocked true: Continue button visible
- Click Continue: spinner appears
- Ad completes: overlay closes (game restarts)
- Ad fails: "Ad unavailable" message shown, "Play Again" still accessible
- Timeout (8s, fake timers): error state rendered

### Integration Test (`frontend/src/ads/__tests__/ContinueFlow.integration.test.js`)

Full end-to-end Continue Flow using `MockProvider` (no real network):
1. Initialize `AdManager` with `new MockProvider()` and a mock `Analytics`
2. Trigger `showRewardedAd()`
3. Assert full event sequence via `onAdEvent` handler
4. Assert `AdResult.outcome === 'completed'`
5. Assert `Analytics.track()` called with all 9 expected events
6. Assert `fetch` was never called with an ad-network URL

### Property-Based Tests

Use **fast-check** (install as dev dependency: `npm install --save-dev fast-check`).

Each property test runs minimum **100 iterations**.

```js
// Feature: rewarded-ads-arcade, Property 2: forceOutcome determines show() result
import fc from 'fast-check'
import { MockProvider } from '../providers/MockProvider'

test('forceOutcome determines show() result', async () => {
  await fc.assert(fc.asyncProperty(
    fc.constantFrom('completed', 'skipped', 'failed'),
    async (forceOutcome) => {
      const provider = new MockProvider({ loadDelay: 0, viewingDuration: 0, forceOutcome })
      await provider.load('test-unit')
      const result = await provider.show()
      return result.outcome === forceOutcome
    }
  ), { numRuns: 100 })
})
```

Each correctness property listed in this document maps to exactly one property-based test, tagged
with a comment in the format:
```js
// Feature: rewarded-ads-arcade, Property N: <property title>
```

Property tests for timing-sensitive behavior (Properties 8, 9) use `vi.useFakeTimers()` inside
`fc.asyncProperty` with `fc.integer({ min: 0, max: 300_000 })` generators for time offsets.

Property tests for analytics shape (Property 5) use `fc.record()` generators producing random
`gameSlug`, `adUnitId`, and `sessionId` strings to cover the full input space.

---
