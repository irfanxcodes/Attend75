# Implementation Plan: Face Rater

## Overview

Implement the Face Rater feature at `/app/mog` — a fully client-side facial analysis tool using MediaPipe FaceLandmarker (WASM), a heuristic scoring engine, and a rule-based glow-up tips generator. The implementation follows seven discrete phases: backend infrastructure, pure utility modules, UI components, page orchestration, navigation integration, PWA/SW caching, and accessibility/performance polish.

All computation runs in-browser. No image data is transmitted. The modular `aestheticModel.js` interface allows the v1 heuristic to be swapped for an ONNX model without touching any UI component.

---

## Tasks

- [ ] 1. Backend infrastructure
  - [ ] 1.1 Create `FaceRaterScore` SQLAlchemy model
    - Create `backend/db/models/face_rater_score.py` with columns: `id`, `anonymous_id` (String 36, indexed), `score` (Float), `tier` (String 32), `submitted_at` (DateTime with server_default)
    - Follow the same mapped_column style as `game_score.py`
    - Export the model from `backend/db/models/__init__.py`
    - _Requirements: 12.6_

  - [ ] 1.2 Create Alembic migration for `face_rater_scores` table
    - Create `backend/alembic/versions/YYYYMMDD_0014_create_face_rater_scores.py`
    - Use the naming convention from existing migrations (date prefix, sequential number)
    - Migration creates `face_rater_scores` table with all columns and the `anonymous_id` index
    - Set `down_revision` to `'20260802_0013_add_semester_filtering'`
    - _Requirements: 12.6_

  - [ ] 1.3 Create `face_rater.py` FastAPI router
    - Create `backend/routers/face_rater.py` with `APIRouter(prefix="/api/face-rater", tags=["face-rater"])`
    - Implement `POST /api/face-rater/score`: accepts `{ anonymous_id: str, score: float, tier: str }`, validates score in [0.0, 10.0], tier against the 8 valid tier strings, anonymous_id as UUID format; persists to `face_rater_scores`; no auth required
    - Implement `GET /api/face-rater/leaderboard`: returns top 10 entries ordered by score DESC; response shape `{ status: "success", data: [{ rank, anonymous_id_short, score, tier }] }` where `anonymous_id_short` is first 8 chars
    - Follow the same threadpool + SessionLocal pattern as `arcade.py`
    - _Requirements: 12.2, 12.4, 12.6_

  - [ ] 1.4 Register face_rater router in `app.py`
    - Add `from routers.face_rater import router as face_rater_router` import
    - Add `app.include_router(face_rater_router)` alongside existing router registrations
    - _Requirements: 12.6_

- [ ] 2. Core utility modules (pure functions)
  - [ ] 2.1 Create `faceLandmarks.js` — MediaPipe initialisation
    - Create `frontend/src/features/faceRater/utils/faceLandmarks.js`
    - Export `createFaceLandmarker()`: uses `FilesetResolver.forVisionTasks` (CDN WASM URL), then `FaceLandmarker.createFromOptions` with exactly `numFaces: 1`, `runningMode: 'VIDEO'`, `outputFaceBlendshapes: false`, `outputFacialTransformationMatrixes: false`, `delegate: 'GPU'`
    - Export `detectLandmarks(landmarker, videoEl, timestamp)`: calls `landmarker.detectForVideo` and returns the raw result
    - _Requirements: 4.1, 4.5_

  - [ ] 2.2 Create `faceMetrics.js` — MeasurementEngine pure function
    - Create `frontend/src/features/faceRater/utils/faceMetrics.js`
    - Export `computeMeasurements(landmarks, imageData)` — pure function returning `MeasurementResult`
    - Implement all 8 geometric measurements using the exact landmark indices and formulas from design: `symmetryScore`, `facialThirdsRatio`, `widthToHeightRatio`, `eyeSpacingRatio`, `canthalTiltAngle`, `jawWidthRatio`, `noseWidthRatio`, `faceShape` (categorical: oval/square/heart/oblong), and internal `_detectionConfidence`
    - Include JSDoc typedef for `MeasurementResult`
    - _Requirements: 6.1–6.9, 6.13, 17.1_

  - [ ]* 2.3 Write property tests for `faceMetrics.js`
    - **Property 1: Pure Functions** — same LandmarkSet input always returns identical MeasurementResult (no randomness or side effects)
    - **Property 5: Measurement and Scoring Separation** — `faceMetrics.js` imports nothing from `faceScoring.js` or `aestheticModel.js`
    - Use Vitest; feed synthetic landmark arrays (468 objects with x, y, z properties) and assert specific measurement values
    - Test `faceShape` classification boundaries: widthToHeight ≥ 0.85 → 'square', ≤ 0.68 → 'oblong', jawWidthRatio < 0.72 → 'heart', else → 'oval'
    - **Validates: Requirements 17.1**

  - [ ] 2.4 Create `skinAnalysis.js` — SkinAnalyser pure function
    - Create `frontend/src/features/faceRater/utils/skinAnalysis.js`
    - Export `analyseSkin(imageData, landmarks)` — pure function returning `{ skinSmoothnessScore, skinUniformityScore, specularHighlightRatio }`
    - Implement `extractFaceROI(imageData, landmarks)`: bounding box from landmark x/y min/max, padded 10%
    - Implement LBP texture analysis for `skinSmoothnessScore`: 8-neighbour radius-1 uniform patterns, returns uniform pattern ratio in [0,1]
    - Implement HSV colour uniformity for `skinUniformityScore`: hue and saturation stddev, normalised and inverted to [0,1]
    - Implement specular highlight detection for `specularHighlightRatio`: pixel fraction where V > 230/255 AND S < 30/255
    - _Requirements: 6.10–6.12, 6.13, 17.1_

  - [ ] 2.5 Create `faceScoring.js` — v1 heuristic ScoringEngine
    - Create `frontend/src/features/faceRater/utils/faceScoring.js`
    - Export `heuristicModel` object with `modelName: 'heuristic-v1'` and async `analyzeFrame(imageData, measurementResult)`
    - Score formula: `raw = symmetryScore * 0.40 + skinSmoothnessScore * 0.35 + skinUniformityScore * 0.25`; map to `[1, 9.5]` via `1.0 + raw * 8.5`; clamp to `[0.0, 10.0]`; return `score` as `+score.toFixed(1)`
    - Read `_detectionConfidence` from `measurementResult` for the `confidence` field, defaulting to 0.7
    - Export `classifyTier(score)` implementing all 8 tier boundaries exactly as specified in Req 8.1 (Gigachad at exactly 10.0; Halo Tier [9.0,10.0); etc.)
    - _Requirements: 7.2–7.4, 7.7, 8.1, 17.2_

  - [ ]* 2.6 Write property tests for `faceScoring.js`
    - **Property 2: Score Bounds** — for any symmetryScore, skinSmoothnessScore, skinUniformityScore in [0,1], output score is always in [0.0, 10.0]
    - **Property 3: Tier Completeness** — `classifyTier` maps every score in [0.0, 10.0] to exactly one tier; test all boundary values: 0.0, 3.99, 4.0, 4.99, 5.0, 5.99, 6.0, 6.99, 7.0, 7.99, 8.0, 8.99, 9.0, 9.99, 10.0 → verify no gaps or overlaps
    - **Validates: Requirements 7.7, 8.1, 8.4**

  - [ ] 2.7 Create `aestheticModel.js` — interface + active model export
    - Create `frontend/src/features/faceRater/utils/aestheticModel.js`
    - Import `heuristicModel` from `./faceScoring.js`; export it as `activeModel`
    - Export `analyzeFrame(imageData, measurementResult)` that delegates to `activeModel.analyzeFrame`
    - Add JSDoc comments documenting the `AestheticModelResult` typedef and the interface contract for future model swaps
    - Confirm that swapping models requires only changing one import line and no UI component changes
    - _Requirements: 7.1, 7.5, 17.2_

  - [ ] 2.8 Create `glowUpEngine.js` — tip generation pure function
    - Create `frontend/src/features/faceRater/utils/glowUpEngine.js`
    - Export `generateTips(measurementResult, gender)` — pure function returning `GlowUpTip[]`
    - Implement all 7 rules from the design rule table with exact thresholds: skinSmoothnessScore < 0.55, skinUniformityScore < 0.50, specularHighlightRatio > 0.15, _detectionConfidence < 0.50, gender='male' AND skinSmoothnessScore < 0.65, gender='female' AND skinUniformityScore < 0.60, _detectionConfidence < 0.12
    - Sort by priority (high → medium → low), cap at 5 tips, use exact tip text from design
    - No tip text references facial proportions, invasive procedures, or specific body part defects
    - Include JSDoc typedef for `GlowUpTip`
    - _Requirements: 10.1–10.11, 17.3_

  - [ ]* 2.9 Write property tests for `glowUpEngine.js`
    - **Property 1: Pure Functions** — same MeasurementResult + GenderContext always returns identical GlowUpTip list
    - Test each of the 7 rules independently by toggling thresholds above/below the boundary value
    - Test max 5 tips cap: provide input satisfying all 7 rules simultaneously, assert output length ≤ 5
    - Test no surgery/proportion language: assert none of the tip strings contain "surgery", "filler", "nose", "jaw", or "eye" as defect references
    - **Validates: Requirements 10.2–10.11, 17.3**

- [ ] 3. Checkpoint — Core utils complete
  - Ensure all property tests and unit tests for utils pass. Confirm `faceMetrics.js`, `faceScoring.js`, `glowUpEngine.js`, and `aestheticModel.js` are pure functions with no browser dependencies. Ask the user if anything needs adjustment before proceeding to UI components.

- [ ] 4. UI components
  - [ ] 4.1 Create `TierBadge.jsx` component
    - Create `frontend/src/features/faceRater/components/TierBadge.jsx`
    - Props: `{ tier: string, score: number }`
    - Render tier name as visible text AND score formatted to one decimal place — never colour-only
    - Apply the exact Tailwind colour map from design: Gigachad/Halo Tier → yellow, Looksmaxxed/Above Average → green, High Tier Normie/Normie → purple, Lookspilled/Needs the Grind → orange/red
    - Add `aria-label` conveying both tier name and score for screen readers
    - _Requirements: 8.2, 8.3, 16.2, 16.6_

  - [ ] 4.2 Create `CategoryCard.jsx` component
    - Create `frontend/src/features/faceRater/components/CategoryCard.jsx`
    - Props: `{ label: string, description: string, value: string, barValue: number | null }`
    - Use `<dl><dt>{label}</dt><dd>{value}</dd></dl>` semantic structure
    - Render a visual bar for numeric values (`barValue` 0–1 → width percentage); omit bar when `barValue` is null (categorical)
    - Render `description` as a subdued subtitle beneath `label`
    - No colour-coding or value-judgement styling on the bar — neutral only
    - _Requirements: 9.2, 9.3, 9.5, 16.3_

  - [ ] 4.3 Create `GlowUpTips.jsx` component
    - Create `frontend/src/features/faceRater/components/GlowUpTips.jsx`
    - Props: `{ tips: GlowUpTip[] }`
    - When `tips.length === 0`, render exactly: "Looking solid — keep up your current routine."
    - Render each tip as a card with category label, tip text, and priority indicator (High/Medium/Low text, not colour-only)
    - Section heading: "Glow-Up Tips"
    - _Requirements: 10.7, 10.10, 11.2_

  - [ ] 4.4 Create `CameraCapture.jsx` component
    - Create `frontend/src/features/faceRater/components/CameraCapture.jsx`
    - Props: `{ landmarker, onScanComplete: (ImageData, landmarks) => void, onNoFaceDetected: () => void }`
    - On mount: call `getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } })` and start rAF loop calling `detectLandmarks` from `faceLandmarks.js`
    - Throttle to max 30 fps using a timestamp comparison in the rAF callback
    - Render `<video aria-label="Live webcam feed for face scanning">` (hidden) plus equal-dimension overlay `<canvas>`
    - Draw face-framing oval guide on canvas at all times during capture
    - When landmarks detected, draw landmark mesh on canvas with low-opacity stroke
    - On "Scan" button tap: if no face detected show "No face detected — position your face within the oval"; otherwise draw frame to offscreen canvas, extract ImageData, call `onScanComplete`
    - Register `visibilitychange`, `beforeunload`, and `pagehide` listeners for stream cleanup and rAF pause/resume via Page Visibility API
    - `useEffect` cleanup: stop all `MediaStream` tracks, cancel rAF loop within 200 ms
    - Responsive: no layout overflow 320 px–1280 px wide, supports portrait and landscape
    - _Requirements: 5.1–5.8, 15.1, 15.3, 15.4, 15.6, 16.1_

  - [ ] 4.5 Create `RatingResult.jsx` component
    - Create `frontend/src/features/faceRater/components/RatingResult.jsx`
    - Props: `{ result: RatingResult, onScanAgain: () => void }`
    - Section 1 — Rating: `TierBadge`, score, confidence as text ("Confidence: High/Medium/Low" mapped from ≥0.75/≥0.50/<0.50), model name footnote showing `modelName`, "Glow-Up Score" label (never "attractiveness" or "beauty")
    - Section 2 — Measurements: `CategoryCard[]` for all 11 measurements; `faceShape` shown as text badge, no bar; ratios formatted to 2 decimal places, angles to 1 decimal place, scores to 2 decimal places; no "ideal" reference values shown
    - Section 3 — Glow-Up Tips: `GlowUpTips` component
    - Persistent disclaimer (subdued style): exact text from Req 13.1
    - "Scan Again" button: keyboard-focusable with visible focus ring, calls `onScanAgain`
    - Opt-in "Submit to Leaderboard (Anonymous)" button (not selected by default); on tap: generate UUID in `sessionStorage`, POST `{ anonymousId, score, tier }` only (no image/landmarks/measurements/gender) to `POST /api/face-rater/score`
    - Fetch and display top 10 leaderboard entries via `GET /api/face-rater/leaderboard`; if offline show "Leaderboard unavailable offline"; if API fails show non-blocking inline error
    - Responsive: single-column on < 768 px, two-column (camera left, results right) on ≥ 1024 px via `grid grid-cols-1 lg:grid-cols-2`; minimum 8 px horizontal padding on < 400 px
    - _Requirements: 7.6, 9.1–9.7, 11.1–11.5, 12.1–12.5, 13.1–13.3, 14.5_

- [ ] 5. Page orchestration
  - [ ] 5.1 Create `FaceRater.jsx` page with state machine
    - Create `frontend/src/pages/FaceRater.jsx`
    - Implement the 9-state machine: `privacy → gender → loading → scanning → processing → results` plus error states `error:camera`, `error:wasm`, `error:compat`
    - State shape: `{ phase, gender: 'male'|'female', landmarker, stream, ratingResult, errorMessage }`
    - Phase: `privacy` — render `PrivacyDisclosure` inline component (not a separate file) with the exact text from Req 2.2, a sentence acknowledging model limitations (Req 13.4), `aria-modal="true" role="dialog"` with focus trap; "I Understand – Start Scan" button
    - Phase: `gender` — render two-button gender selector (not a dropdown), default `'male'`, no selection required; "Start Scan" button
    - Phase: `loading` — trigger `createFaceLandmarker()` and `getUserMedia` in parallel; show "Loading face model…" indicator; on WASM failure: one silent retry then `error:wasm`; on camera denial: `error:camera`; on no `getUserMedia`/`OffscreenCanvas` support: `error:compat`
    - Phase: `scanning` — render `CameraCapture`; `onScanComplete` triggers `processing`
    - Phase: `processing` — call `computeMeasurements`, `analyseSkin` (merge into MeasurementResult), `analyzeFrame`, `classifyTier`, `generateTips`; assemble `RatingResult`; transition to `results` (all within 500 ms budget)
    - Phase: `results` — render `RatingResult`; "Scan Again" resets to `scanning` reusing existing `landmarker` instance (no re-init)
    - Error phases: each shows a recoverable message + "Retry" button returning to `loading`; camera stream and landmarker instance are preserved where possible
    - `FaceLandmarker` initialised once per mount; reused across sessions
    - PrivacyDisclosure re-shown each page load (not suppressed)
    - GenderContext not persisted to localStorage or server
    - _Requirements: 2.1–2.6, 3.1–3.6, 4.1–4.5, 11.4, 15.2_

- [ ] 6. Navigation integration
  - [ ] 6.1 Register `/app/mog` route in `AppRoutes.jsx`
    - Add `const FaceRater = lazy(() => import('../pages/FaceRater'))` with the existing lazy import block
    - Add `<Route path="mog" element={<FaceRater />} />` inside the `/app` protected route children, following the `arcade` route entry
    - Unauthenticated access to `/app/mog` is already blocked by `ProtectedAppRoutes` — no additional guard needed
    - _Requirements: 1.1, 1.2, 1.3_

  - [ ] 6.2 Add "Mog" entry to `BottomNav.jsx`
    - Change the `<ul>` grid from `grid-cols-6` to `grid-cols-7`
    - Add a new nav item after "Me": `{ label: 'Mog', to: '/app/mog', useInlineSvg: 'mog' }`
    - Render the item using a `NavLink` with an inline SVG face/scan icon (consistent with the Study item SVG pattern)
    - Apply the same active/inactive colour classes as all other nav items
    - _Requirements: 1.4_

  - [ ] 6.3 Add "Mog" entry to `Sidebar.jsx`
    - Add `{ label: 'Mog', to: '/app/mog', icon: null, useInlineSvg: 'mog' }` to the `navItems` array, after the Arcade entry
    - Render it using the `NavLink` + inline SVG path (same pattern as the Arcade `Gamepad2` icon), using a face/scan SVG
    - Apply active/inactive state styling consistent with existing entries
    - _Requirements: 1.5_

- [ ] 7. PWA service worker cache configuration
  - [ ] 7.1 Add MediaPipe WASM and model cache entries to `sw.js`
    - In `frontend/src/sw.js`, add two new `registerRoute` calls using `CacheFirst` strategy and `ExpirationPlugin`:
      1. Pattern `/face_landmarker\.task$/` → cache name `face-rater-model-v1`, `maxEntries: 2`, `maxAgeSeconds: 2592000` (30 days)
      2. Pattern `/mediapipe.*\.wasm$/` → cache name `face-rater-wasm-v1`, `maxEntries: 4`, `maxAgeSeconds: 2592000`
    - Place new entries after the existing Google Fonts cache entries
    - _Requirements: 4.3, 14.1, 14.2_

- [ ] 8. Checkpoint — Integration complete
  - Verify the full user flow manually: privacy → gender → camera → scan → results → scan again. Confirm camera indicator turns off on navigation away. Ensure all tests pass. Ask the user if questions arise.

- [ ] 9. Accessibility and performance polish
  - [ ] 9.1 Accessibility audit and fixes
    - Verify `<video aria-label="Live webcam feed for face scanning">` is present in `CameraCapture.jsx`
    - Verify `TierBadge` renders tier name as text (not colour-only) and has a meaningful `aria-label`
    - Verify `CategoryCard` uses `<dl><dt><dd>` structure
    - Verify "Scan" and "Scan Again" buttons have visible focus rings consistent with existing Attend75 design (`outline` or `ring` utility classes)
    - Verify `PrivacyDisclosure` focus trap: on open, Tab cycles only within the dialog; Escape or button closes it; `aria-modal="true"` and `role="dialog"` are set
    - Verify no colour-only tier meaning — every `TierBadge` shows tier name text
    - _Requirements: 16.1–16.6_

  - [ ] 9.2 Install new frontend dependencies
    - In `frontend/package.json`, add `"@mediapipe/tasks-vision": "^0.10.21"` and `"onnxruntime-web": "^1.21.0"` to `dependencies`
    - Run `npm install` in `frontend/` to update `package-lock.json`
    - Verify the imports in `faceLandmarks.js` resolve correctly
    - _Requirements: 4.1_

- [ ] 10. Unit tests for utility modules
  - [ ]* 10.1 Write unit tests for `faceMetrics.js` specific measurement values
    - Create `frontend/src/features/faceRater/utils/__tests__/faceMetrics.test.js`
    - Test `symmetryScore`: perfectly symmetric landmark set → 1.0; asymmetric set → value < 1.0
    - Test `faceShape` classification at each boundary (values from design): widthToHeight 0.85+ → 'square', 0.68- → 'oblong', jawWidthRatio < 0.72 → 'heart', else → 'oval'
    - Test `_detectionConfidence` clamping: large face → ≤ 1.0, tiny face → ≥ 0.4
    - _Requirements: 17.1_

  - [ ]* 10.2 Write unit tests for `faceScoring.js` tier boundaries
    - Create `frontend/src/features/faceRater/utils/__tests__/faceScoring.test.js`
    - Test exact tier boundaries: score 3.99 → "Needs the Grind"; 4.0 → "Lookspilled"; 5.0 → "Normie"; 6.0 → "High Tier Normie"; 7.0 → "Above Average"; 8.0 → "Looksmaxxed"; 9.0 → "Halo Tier"; 10.0 → "Gigachad"
    - Test score clamping: inputs producing raw > 10.0 → clamped to 10.0; inputs producing raw < 0.0 → clamped to 0.0
    - Test `modelName` is always `'heuristic-v1'`
    - _Requirements: 7.3, 7.7, 8.1_

  - [ ]* 10.3 Write integration test for the full measurement → scoring pipeline
    - Create `frontend/src/features/faceRater/utils/__tests__/pipeline.integration.test.js`
    - Feed synthetic 468-landmark array + synthetic ImageData through `computeMeasurements` → `analyseSkin` merge → `analyzeFrame` → `classifyTier` → `generateTips`
    - Assert the resulting `RatingResult` shape: `score`, `confidence`, `tier`, `measurements`, `tips`, `modelName` all present and within valid ranges
    - Assert score monotonicity: increasing `symmetryScore` with fixed skin scores produces non-decreasing output score
    - _Requirements: 17.1, 17.2, 17.3_

- [ ] 11. Final checkpoint
  - Ensure all tests pass (unit, property, integration). Verify the face rater is accessible via `/app/mog`, appears in BottomNav and Sidebar, cleans up camera on navigation, and loads MediaPipe from cache on second visit. Ask the user if questions arise.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP delivery
- All utility modules (`faceMetrics.js`, `faceScoring.js`, `glowUpEngine.js`) must remain pure functions with no browser/React dependencies — this enables Vitest unit testing without jsdom camera mocking
- The `aestheticModel.js` interface ensures a future ONNX swap requires zero UI changes
- The `FaceLandmarker` instance is created once per page mount and reused — never re-initialised on "Scan Again" to avoid reloading the 8 MB model
- BottomNav grid changes from 6 to 7 columns — verify on narrow viewports (320 px) that items remain readable
- Backend router follows the exact same threadpool + SessionLocal pattern as `arcade.py`
- `onnxruntime-web` is added as a forward-compatibility dependency only; it is unused in v1 code
- Property tests validate universal invariants; unit tests validate specific boundary examples — both are complementary

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "2.2"] },
    { "id": 1, "tasks": ["1.2", "2.3", "2.4"] },
    { "id": 2, "tasks": ["1.3", "2.5", "2.9"] },
    { "id": 3, "tasks": ["1.4", "2.6", "2.7"] },
    { "id": 4, "tasks": ["2.8"] },
    { "id": 5, "tasks": ["4.1", "4.2", "4.3"] },
    { "id": 6, "tasks": ["4.4"] },
    { "id": 7, "tasks": ["4.5"] },
    { "id": 8, "tasks": ["5.1"] },
    { "id": 9, "tasks": ["6.1", "6.2", "6.3", "7.1"] },
    { "id": 10, "tasks": ["9.1", "9.2"] },
    { "id": 11, "tasks": ["10.1", "10.2"] },
    { "id": 12, "tasks": ["10.3"] }
  ]
}
```
