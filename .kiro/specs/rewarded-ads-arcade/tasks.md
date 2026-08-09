# Implementation Plan: Rewarded Ads Arcade

## Overview

Build the self-contained `src/ads/` module (types, providers, RewardedAd, Analytics, AdManager),
wire it into `GameLayout.jsx` via a `supportsRewarded` prop, and back it with a FastAPI endpoint
that persists ad events to the database. Test coverage includes unit tests, a full-flow integration
test, and property-based tests (Properties 1–12 from the design document) using fast-check.

## Tasks

- [ ] 1. Install testing dependencies and configure Vitest
  - [ ] 1.1 Install Vitest, React Testing Library, and jsdom as dev dependencies
    - Run: `npm install --save-dev vitest @vitest/ui jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event`
    - Add `"test": "vitest --run"` to `scripts` in `frontend/package.json`
    - Add vitest config to `vite.config.js`: `test: { environment: 'jsdom', globals: true, setupFiles: ['./src/test-setup.js'] }`
    - Create `frontend/src/test-setup.js` importing `@testing-library/jest-dom`
    - _Requirements: 8.1–8.5_

  - [ ] 1.2 Install fast-check as a dev dependency
    - Run: `npm install --save-dev fast-check`
    - Verify fast-check import works in a smoke test
    - _Requirements: 8.1, 8.2_

- [ ] 2. Create frontend ad module — types and provider interface
  - [ ] 2.1 Create `src/ads/types.js` with AdEventType enum, AdResult and AdEvent typedefs
    - Export frozen `AdEventType` object with all 9 event type string values
    - Add JSDoc `@typedef` for `AdOutcome` (`'completed'|'skipped'|'failed'|'not_ready'`)
    - Add JSDoc `@typedef` for `AdResult` (`{ outcome: AdOutcome, error?: string }`)
    - Add JSDoc `@typedef` for `AdEvent` (`{ eventType, gameSlug, adUnitId, timestamp, sessionId }`)
    - _Requirements: 2.5, 7.4, 7.5_

  - [ ] 2.2 Create `src/ads/providers/AdProvider.js` as JSDoc interface documentation
    - Document the three required methods: `load(adUnitId): Promise<void>`, `show(): Promise<AdResult>`, `isReady(): boolean`
    - No runtime class — documentation only as per design
    - _Requirements: 2.1, 2.2, 2.3_

- [ ] 3. Implement MockProvider
  - [ ] 3.1 Create `src/ads/providers/MockProvider.js`
    - Constructor accepts `{ loadDelay=500, viewingDuration=3000, forceOutcome=null }`
    - `load(adUnitId)`: resolves after `loadDelay` ms, sets `_ready = true`; if `forceOutcome === 'failed'` simulate a load rejection
    - `show()`: if not ready return `{ outcome: 'not_ready' }` immediately; otherwise wait `viewingDuration` ms and resolve `{ outcome: forceOutcome ?? 'completed' }`; set `_ready = false` after show
    - `isReady()`: returns `this._ready`
    - `getEventLog()`: returns shallow copy of `_eventLog` array
    - `reset()`: clears `_eventLog` and sets `_ready = false`
    - Emit internal AdEvents matching what AdManager would emit so `getEventLog()` captures the session
    - _Requirements: 3.1–3.6, 8.3_

  - [ ]* 3.2 Write unit tests for MockProvider (`src/ads/__tests__/MockProvider.test.js`)
    - `load()` resolves after configured delay (use `vi.useFakeTimers()`)
    - `show()` before `load()` → outcome `not_ready`
    - `isReady()` transitions: false → true after load → false after show
    - `forceOutcome: 'skipped'` and `forceOutcome: 'failed'` produce correct outcomes
    - `getEventLog()` returns a copy, not a live reference (mutation check)
    - `reset()` clears log and resets `isReady()` to false
    - _Requirements: 3.1–3.6, 8.3_

- [ ] 4. Create provider factory and barrel export
  - [ ] 4.1 Create `src/ads/providers/index.js` with MockProvider re-export and `createProvider()` factory
    - Export `{ MockProvider }` from `./MockProvider.js`
    - Export `createProvider(type, config={})` factory function switching on `'mock'` type; throw `Error('Unknown provider type: ${type}')` for unknown types
    - _Requirements: 1.1–1.5_

- [ ] 5. Implement RewardedAd lifecycle helper
  - [ ] 5.1 Create `src/ads/RewardedAd.js` with the stateless `request()` function
    - Accept `{ provider, analytics, adUnitId, gameSlug, sessionId, emit }` options object
    - Implement the event-sequencing algorithm from the design: `ad_requested` → `load()` → `ad_loaded` → `reward_accepted` → `show()` → branch on outcome
    - On `completed`: emit `ad_started`, `ad_completed`, `reward_granted`; return `{ outcome: 'completed' }`
    - On `skipped`: emit `ad_started`, `ad_completed`, `reward_declined`; return `{ outcome: 'skipped' }`
    - On `failed`/`not_ready`: emit `ad_failed`; return the result object
    - Catch `load()` rejection: emit `ad_failed` with error message; return `{ outcome: 'failed', error }`
    - _Requirements: 4.1–4.8_

- [ ] 6. Implement Analytics batching module
  - [ ] 6.1 Create `src/ads/Analytics.js` with `track()`, `flush()`, and auto-flush
    - Constructor sets `_endpoint = '/api/ads/events'`, `_batchSize = 10`, `_queue = []`, starts `setInterval(flush, 5000)`
    - `setEndpoint(url)` and `setBatchSize(n)` configuration methods
    - `track(event)`: push to `_queue`; if `_queue.length >= _batchSize` call `flush()`
    - `flush()`: if empty return; splice first `_batchSize` events; POST to endpoint with `{ events: batch }`; on failure `unshift` batch back to front of queue
    - `destroy()`: clear the interval (for test cleanup)
    - _Requirements: 7.1–7.3, 7.6_

  - [ ]* 6.2 Write unit tests for Analytics (`src/ads/__tests__/Analytics.test.js`)
    - Events queued below batch size: no `fetch` called
    - N-th event at batch size triggers auto-flush with all N events
    - Auto-flush via `setInterval` after 5 s (fake timers)
    - Failed POST: events retained in queue (mock `fetch` to reject)
    - Subsequent flush after failure: failed events included in new batch
    - _Requirements: 7.1–7.3_

- [ ] 7. Implement AdManager singleton
  - [ ] 7.1 Create `src/ads/AdManager.js` singleton with full public API
    - Internal state: `_provider`, `_analytics`, `_gameSlug`, `_adUnitId`, `_sessionId`, `_lastShownAt`, `_showCount`, `_handlers`
    - `init({ provider, analytics, gameSlug, adUnitId, sessionId })`: reset `_showCount=0`, `_lastShownAt=null`, store all config
    - `showRewardedAd()`: throw if not initialized; delegate to `RewardedAd.request()`; after `completed` result set `_lastShownAt=Date.now()` and `_showCount++`
    - `isAdReady()`: return `false` if `_showCount >= 3`; return `false` if cooldown not elapsed (`Date.now() - _lastShownAt < 120_000`); return `_provider.isReady()`
    - `isProviderReady()`: return `_provider?.isReady() ?? false` (no state mutation)
    - `onAdEvent(handler)`: add to `_handlers` set; return unsubscribe function
    - `setProvider(provider)`: replace `_provider`
    - Internal `_emit(eventType)`: build `AdEvent` object, call all handlers, call `_analytics.track()`
    - _Requirements: 1.1–1.5, 4.1–4.8, 9.1–9.4_

  - [ ]* 7.2 Write unit tests for AdManager (`src/ads/__tests__/AdManager.test.js`)
    - Happy path: `showRewardedAd()` with MockProvider → verify event sequence and `AdResult`
    - Skipped path: `forceOutcome: 'skipped'` → `reward_declined` emitted, no `reward_granted`
    - Failed path: MockProvider rejects `load()` → `ad_failed` emitted, `not_ready` path
    - `isAdReady()` returns false within 120s cooldown (fake timers); returns true after 120s
    - `isAdReady()` returns false after 3 shows; remains false regardless of time elapsed
    - `setProvider()` swaps provider; next call uses new provider
    - `isProviderReady()` returns provider state with no side effects (call N times, no events emitted)
    - Uninitialized `showRewardedAd()` throws expected error
    - _Requirements: 1.1–1.5, 4.1–4.8, 9.1–9.4_

- [ ] 8. Write property-based tests for MockProvider and AdManager
  - [ ]* 8.1 Write property test for Property 1: `show()` before `load()` always returns `not_ready`
    - **Property 1: AdProvider `show()` before `load()` returns `not_ready`**
    - Generate arbitrary MockProvider configs via `fc.record({ loadDelay: fc.nat(), viewingDuration: fc.nat(), forceOutcome: fc.constantFrom('completed','skipped','failed',null) })`
    - Assert `show()` result has `outcome === 'not_ready'` and `isReady()` is still `false`
    - **Validates: Requirements 2.4**

  - [ ]* 8.2 Write property test for Property 2: `forceOutcome` determines `show()` result
    - **Property 2: `forceOutcome` determines `show()` result**
    - Generate `fc.constantFrom('completed', 'skipped', 'failed')` for `forceOutcome`
    - After `load()` completes, assert `show()` outcome equals `forceOutcome`
    - **Validates: Requirements 3.4, 3.5, 2.3**

  - [ ]* 8.3 Write property test for Property 3: Correct event sequence per outcome
    - **Property 3: Correct event sequence per outcome**
    - For `completed`: assert log contains `[ad_requested, ad_loaded, reward_accepted, ad_started, ad_completed, reward_granted]` in order
    - For `skipped`: assert log ends with `[ad_completed, reward_declined]`
    - For `failed`/load rejection: assert log contains `ad_failed` and never contains `reward_granted`
    - **Validates: Requirements 4.1–4.8, 8.5**

  - [ ]* 8.4 Write property test for Property 4: Reward only on `completed`
    - **Property 4: Reward only on `completed`**
    - Generate `fc.constantFrom('skipped', 'failed', 'not_ready')` for non-completed outcomes
    - Assert `reward_granted` never appears in event log for any non-completed outcome
    - **Validates: Requirements 4.8**

  - [ ]* 8.5 Write property test for Property 5: AdEvent shape invariant
    - **Property 5: AdEvent shape invariant**
    - Generate random `gameSlug`, `adUnitId`, `sessionId` strings via `fc.record({ gameSlug: fc.string({ minLength:1 }), adUnitId: fc.string({ minLength:1 }), sessionId: fc.string({ minLength:1 }) })`
    - Init AdManager with generated values; run a full ad session
    - Assert every emitted `AdEvent` has all 5 required fields, `eventType` is a valid `AdEventType` member, `timestamp` is a valid ISO 8601 string
    - **Validates: Requirements 7.5**

  - [ ]* 8.6 Write property test for Property 6: Analytics flush-at-N invariant
    - **Property 6: Analytics batching — flush-at-N invariant**
    - Generate `fc.integer({ min: 1, max: 20 })` for batch size N and `fc.integer({ min: 1, max: N-1 })` for events below threshold
    - Assert no `fetch` called when queue length < N
    - Assert exactly one `fetch` call when queue reaches N
    - **Validates: Requirements 7.2**

  - [ ]* 8.7 Write property test for Property 7: Analytics retry on failure
    - **Property 7: Analytics retry on failure**
    - Generate arbitrary batches of AdEvents
    - Mock `fetch` to fail on first call, succeed on second
    - Assert all events from the failed batch are included in the retry batch
    - **Validates: Requirements 7.3**

  - [ ]* 8.8 Write property test for Property 8: Cooldown guardrail
    - **Property 8: Cooldown guardrail**
    - Use `vi.useFakeTimers()`; generate `fc.integer({ min: 0, max: 119_999 })` for elapsed time within cooldown
    - Assert `isAdReady()` returns `false` for all times < 120_000ms after last show
    - Generate `fc.integer({ min: 120_000, max: 300_000 })` for elapsed time beyond cooldown
    - Assert `isAdReady()` returns `true` (when `_showCount < 3` and `provider.isReady()`)
    - **Validates: Requirements 9.1, 9.2**

  - [ ]* 8.9 Write property test for Property 9: Session show-count guardrail
    - **Property 9: Session show-count guardrail**
    - After simulating 3 completed ad shows, assert `isAdReady()` always returns `false`
    - Generate arbitrary elapsed times with `fc.integer({ min: 120_000, max: 600_000 })` (cooldown not a factor)
    - **Validates: Requirements 9.3, 9.4**

  - [ ]* 8.10 Write property test for Property 12: `isProviderReady()` has no side effects
    - **Property 12: `isProviderReady()` has no side effects**
    - Generate `fc.integer({ min: 1, max: 20 })` for N invocations
    - Call `isProviderReady()` N times; assert no events were emitted, `_showCount` and `_lastShownAt` unchanged, return value consistent across calls
    - **Validates: Requirements 8.4**

- [ ] 9. Checkpoint — all unit and property tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 10. Integration test for the full Continue Flow
  - [ ]* 10.1 Write integration test (`src/ads/__tests__/ContinueFlow.integration.test.js`)
    - Initialize `AdManager` with `new MockProvider({ loadDelay: 0, viewingDuration: 0 })` and a spy Analytics instance
    - Call `showRewardedAd()` and await result
    - Assert `AdResult.outcome === 'completed'`
    - Assert full event sequence via `onAdEvent` handler (all 6 events in order)
    - Assert `Analytics.track()` called with each of the expected events
    - Assert no real ad-network URLs were fetched
    - _Requirements: 8.1–8.5_

- [ ] 11. Modify `GameLayout.jsx` to add the Continue flow
  - [ ] 11.1 Add `supportsRewarded` prop, `adState` state, and AdManager `useEffect` initialization to `GameLayout.jsx`
    - Import `AdManager` from `src/ads/AdManager`; import `createProvider` from `src/ads/providers`; import `Analytics` from `src/ads/Analytics`
    - Add `supportsRewarded = false` prop (default false, no change to existing callers)
    - Add `const [adState, setAdState] = useState('idle')` state variable
    - Add `useEffect` that calls `AdManager.init(...)` when `gameSlug` or `supportsRewarded` changes; skip if `!supportsRewarded`
    - _Requirements: 6.1–6.5, 1.4_

  - [ ] 11.2 Add `handleContinue` callback and update GameOverOverlay JSX in `GameLayout.jsx`
    - Implement `handleContinue` using `useCallback`: guard → `setAdState('loading')` → 8s timeout → `AdManager.showRewardedAd()` → branch on outcome
    - Reset `adState` to `'idle'` on new game-over (when overlay is re-shown)
    - Add Continue button (shown when `supportsRewarded && AdManager.isAdReady() && adState === 'idle'`)
    - Add spinner div with `role="status"` (shown when `adState === 'loading'`)
    - Add error message paragraph (shown when `adState === 'failed'`)
    - Ensure "Play Again" button always renders regardless of `adState`
    - _Requirements: 5.1–5.8, 6.1–6.4, 9.5_

  - [ ]* 11.3 Write component tests for GameLayout rewarded flow (`src/components/arcade/__tests__/GameLayout.rewarded.test.jsx`)
    - `supportsRewarded={false}`: no Continue button, no spinner, no ad copy in render
    - `supportsRewarded={true}`, `AdManager.isAdReady()` mocked `false`: no Continue button shown
    - `supportsRewarded={true}`, `AdManager.isAdReady()` mocked `true`: Continue button visible
    - Click Continue: spinner appears; "Play Again" still visible
    - Ad completes (`outcome: 'completed'`): overlay closes, restart callback invoked
    - Ad fails (`outcome: 'failed'`): error message shown, "Play Again" still accessible
    - 8-second timeout (fake timers): `adState` transitions to `'failed'`, error message shown
    - _Requirements: 5.1–5.8, 6.5, 9.2, 9.4, 9.5_

  - [ ]* 11.4 Write property tests for Properties 10 and 11 (GameLayout rendering)
    - **Property 10: Continue button absent when ad unavailable**
    - Generate arbitrary `AdManager.isAdReady()` returning `false` for any reason (cooldown, cap, provider not ready)
    - Assert Continue button absent from rendered GameOverOverlay
    - **Property 11: No ad UI when `supportsRewarded` is false**
    - Generate arbitrary `AdManager` state
    - Render `GameLayout` with `supportsRewarded={false}`; assert no ad-related elements in output
    - **Validates: Requirements 9.5, 6.5, 5.1**

- [ ] 12. Checkpoint — frontend tests pass, Continue flow works end-to-end
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 13. Backend — AdEvent SQLAlchemy model and Alembic migration
  - [ ] 13.1 Create `backend/db/models/ad_event.py` with the `AdEvent` SQLAlchemy model
    - Follow the same pattern as `backend/db/models/game_score.py`
    - Table: `ad_events`; columns: `id`, `event_type`, `game_slug`, `ad_unit_id`, `timestamp`, `session_id`, `received_at`
    - Add indexes on `game_slug`, `event_type`, and `session_id` as specified in design
    - _Requirements: 7.1, 7.5_

  - [ ] 13.2 Register `AdEvent` in `backend/db/models/__init__.py`
    - Add `from db.models.ad_event import AdEvent` import
    - _Requirements: 7.1_

  - [ ] 13.3 Create Alembic migration `backend/alembic/versions/20260802_0013_create_ad_events.py`
    - Follow the pattern of existing migrations (e.g., `20260720_0010_create_game_scores.py`)
    - `upgrade()`: create `ad_events` table with all columns and indexes
    - `downgrade()`: drop `ad_events` table
    - _Requirements: 7.1_

- [ ] 14. Backend — FastAPI ads router and app registration
  - [ ] 14.1 Create `backend/routers/ads.py` with `POST /api/ads/events` endpoint
    - Follow the exact same pattern as `backend/routers/arcade.py` (use `run_in_threadpool`, return standard `{"status":"success","data":{...}}` shape)
    - Pydantic models: `AdEventPayload` and `AdEventsRequest` as defined in design
    - `_store_events_sync()` helper that opens a `SessionLocal`, bulk-inserts all rows, commits, closes
    - Empty payload returns `{ "status": "success", "data": { "received": 0 } }` without hitting DB
    - Return HTTP 500 JSON on DB failure
    - _Requirements: 7.1, 7.2_

  - [ ] 14.2 Register `ads_router` in `backend/app.py`
    - Add `from routers.ads import router as ads_router`
    - Add `app.include_router(ads_router)`
    - _Requirements: 7.1_

- [ ] 15. Final checkpoint — all tests pass
  - Run the full test suite (`npm run test` in `frontend/`); ensure all unit, integration, and property-based tests pass.
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP delivery
- Each task references specific requirements for traceability
- The `src/ads/` module is entirely self-contained — no game file ever imports from it directly
- `fast-check` property tests (Properties 1–12 from the design) use a minimum of 100 iterations each
- Vitest fake timers (`vi.useFakeTimers()`) are required for cooldown and auto-flush timing tests
- The Alembic migration filename uses `20260802_0013` as the next sequential number; adjust if another migration is added first
- Backend endpoint follows the existing `arcade.py` pattern exactly — no new patterns introduced
- `GameLayout.jsx` changes are backwards-compatible: `supportsRewarded` defaults to `false`, so existing game pages require no changes

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1", "2.2"] },
    { "id": 2, "tasks": ["3.1", "4.1"] },
    { "id": 3, "tasks": ["3.2", "5.1", "13.1"] },
    { "id": 4, "tasks": ["6.1", "13.2", "13.3"] },
    { "id": 5, "tasks": ["6.2", "7.1"] },
    { "id": 6, "tasks": ["7.2", "8.1", "8.2", "8.3", "8.4", "8.5", "8.6", "8.7", "8.8", "8.9", "8.10", "14.1"] },
    { "id": 7, "tasks": ["10.1", "11.1", "14.2"] },
    { "id": 8, "tasks": ["11.2"] },
    { "id": 9, "tasks": ["11.3", "11.4"] }
  ]
}
```
