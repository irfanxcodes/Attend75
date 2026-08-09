# Design Document — Face Rater

## Architecture

See the detailed Architecture Overview, Data Flow, and component breakdowns below.

---

## Components and Interfaces

See Component Hierarchy and Prop Contracts, aestheticModel.js Interface Contract, and faceLandmarks.js sections below.

---

## Data Models

See Type Definitions (JSDoc) and Backend — Leaderboard sections below.

---

## Overview

The Face Rater is a fully client-side facial analysis feature integrated into the existing Attend75 React + Vite PWA. All computation — landmark detection, skin analysis, scoring — runs in the browser using WebAssembly. No image data ever leaves the device. The architecture separates measurements from scoring behind a swappable `aestheticModel` interface, so a future ONNX or TFJS model can replace the v1 heuristic without touching any UI component.

---

## Architecture Overview

```
FaceRater (page — state machine)
│
├── PrivacyDisclosure (step 1)
├── GenderSelector (step 2)
├── CameraCapture (step 3 — live scan)
│   ├── <video> hidden element
│   ├── <canvas> overlay (oval guide + landmarks)
│   └── rAF detection loop → FaceLandmarker (MediaPipe WASM)
│
└── RatingResult (step 4 — results)
    ├── TierBadge
    ├── Measurements Panel → CategoryCard[]
    ├── GlowUpTips
    └── Leaderboard (opt-in)

Utils (pure functions, no React):
├── faceLandmarks.js   — MediaPipe init + single-frame extraction
├── faceMetrics.js     — LandmarkSet → MeasurementResult (pure)
├── skinAnalysis.js    — ImageData → skin scores (pure)
├── aestheticModel.js  — INTERFACE + active model export
├── faceScoring.js     — v1 heuristic (implements aestheticModel)
└── glowUpEngine.js    — MeasurementResult → GlowUpTip[] (pure)
```

---

## Page State Machine

`FaceRater.jsx` owns a single `phase` state string with these transitions:

```
'privacy'
    │  user taps "I Understand – Start Scan"
    ▼
'gender'
    │  user taps "Start Scan" (defaults to 'male' if untouched)
    ▼
'loading'  ← parallel: getUserMedia + FaceLandmarker.createFromOptions()
    │  both resolved
    ▼
'scanning' ← rAF loop running, landmark overlay active
    │  user taps "Scan" button + face detected
    ▼
'processing' ← faceMetrics + skinAnalysis + aestheticModel.analyzeFrame()
    │  complete (< 500 ms)
    ▼
'results'
    │  user taps "Scan Again"
    ▼
'scanning' ← reuse existing FaceLandmarker instance, no reload

Error states: 'error:camera', 'error:wasm', 'error:compat'
Each has a Retry button that returns to 'loading' without reloading the page.
```

State shape held in `FaceRater`:
```js
{
  phase: 'privacy' | 'gender' | 'loading' | 'scanning' | 'processing' | 'results'
       | 'error:camera' | 'error:wasm' | 'error:compat',
  gender: 'male' | 'female',
  landmarker: FaceLandmarker | null,
  stream: MediaStream | null,
  ratingResult: RatingResult | null,
  errorMessage: string | null,
}
```

---

## Data Flow

```
webcam frame (VideoFrame at rAF)
    │
    ▼
FaceLandmarker.detectForVideo(videoEl, timestamp)
    │  returns FaceLandmarkerResult { faceLandmarks: NormalizedLandmark[][] }
    │
    ▼  (on "Scan" button press)
captureFrame(videoEl) → ImageData          (offscreen canvas, 640×480)
    │
    ├──► faceMetrics.computeMeasurements(landmarks[0], imageData)
    │        └── returns MeasurementResult
    │
    ├──► skinAnalysis.analyseSkin(imageData, faceROI)
    │        └── returns { skinSmoothnessScore, skinUniformityScore, specularHighlightRatio }
    │             merged into MeasurementResult
    │
    ├──► aestheticModel.analyzeFrame(imageData, measurementResult)
    │        └── returns { score, confidence, modelName }
    │
    ├──► classifyTier(score) → Tier
    │
    └──► glowUpEngine.generateTips(measurementResult, gender)
             └── returns GlowUpTip[]

All merged into RatingResult → passed to RatingResult component
```

---

## aestheticModel.js — Interface Contract

This is the single swap point. Replacing the scoring model means only replacing the implementation returned by `getActiveModel()`.

```js
// aestheticModel.js

/**
 * AestheticModelResult
 * @typedef {{ score: number, confidence: number, modelName: string }} AestheticModelResult
 * score      — float in [0.0, 10.0]
 * confidence — float in [0.0, 1.0]
 * modelName  — string identifier shown in UI footnote
 */

/**
 * AestheticModel interface (duck-typed)
 * Any object with this shape satisfies the contract.
 *
 * analyzeFrame(imageData, measurementResult) → Promise<AestheticModelResult>
 *
 * imageData         — ImageData from captured frame (640×480)
 * measurementResult — MeasurementResult from faceMetrics + skinAnalysis
 */

// v1: heuristic scorer
import { heuristicModel } from './faceScoring.js'

// Future swap: replace this one line only
// import { scutModel } from './scutModel.js'
// import { onnxModel } from './onnxFbpModel.js'

export const activeModel = heuristicModel

export async function analyzeFrame(imageData, measurementResult) {
  return activeModel.analyzeFrame(imageData, measurementResult)
}
```

`faceScoring.js` exports `heuristicModel`:

```js
export const heuristicModel = {
  modelName: 'heuristic-v1',

  async analyzeFrame(imageData, measurementResult) {
    const { symmetryScore, skinSmoothnessScore, skinUniformityScore } = measurementResult

    // Weights: symmetry 40%, smoothness 35%, uniformity 25%
    const raw = (symmetryScore * 0.40)
              + (skinSmoothnessScore * 0.35)
              + (skinUniformityScore * 0.25)

    // Map [0,1] → [1, 9.5] — genuine 10.0 is extremely rare by design
    const score = Math.min(10.0, Math.max(0.0, 1.0 + raw * 8.5))

    // Confidence: based on landmark visibility + face fraction of frame
    const confidence = measurementResult._detectionConfidence ?? 0.7

    return { score: +score.toFixed(1), confidence, modelName: this.modelName }
  }
}
```

**Swapping to a future ONNX model requires only:**
1. Adding `onnxFbpModel.js` that exports an object with `analyzeFrame(imageData, measurementResult)`
2. Changing one import line in `aestheticModel.js`
3. No UI component changes needed

---

## faceLandmarks.js — MediaPipe Initialisation

```js
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'

export async function createFaceLandmarker() {
  const vision = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm'
  )
  return FaceLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
    numFaces: 1,
    runningMode: 'VIDEO',
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: false,
  })
}

export function detectLandmarks(landmarker, videoEl, timestamp) {
  // Returns FaceLandmarkerResult — caller checks .faceLandmarks.length
  return landmarker.detectForVideo(videoEl, timestamp)
}
```

GPU delegate is preferred; MediaPipe falls back to CPU automatically on unsupported devices.

---

## faceMetrics.js — Measurement Formulas

All coordinates are normalised `[0,1]` from MediaPipe. Distances are Euclidean in normalised space.

### Key Landmark Indices (MediaPipe 468-point map)

```
Forehead top (approx):  10
Chin bottom:           152
Left cheekbone:        234
Right cheekbone:         454
Left inner canthus:    133
Left outer canthus:    33
Right inner canthus:   362
Right outer canthus:   263
Left pupil:            468  (iris centre, refined model)
Right pupil:           473
Left jaw angle:        172
Right jaw angle:       397
Nose left alar:        129
Nose right alar:       358
Brow midpoint:         8  (approximated as midpoint of brow landmarks)
Nose base:             2
```

### Formulas

**symmetryScore**
Bilateral pairs: (33,263), (133,362), (234,454), (172,397), (129,358), (61,291).
For each pair, compute horizontal distance from face midline.
`asymmetry = mean(|leftDist - rightDist|) / faceWidth`
`symmetryScore = clamp(1 - asymmetry * 6, 0, 1)`

**facialThirdsRatio**
`totalHeight = y[152] - y[10]`
`upperThird  = (y[8]  - y[10]) / totalHeight`  (forehead to brow)
`midThird    = (y[2]  - y[8])  / totalHeight`  (brow to nose base)
`lowerThird  = (y[152]- y[2])  / totalHeight`  (nose to chin)

**widthToHeightRatio**
`faceWidth  = x[454] - x[234]`
`faceHeight = y[152] - y[10]`
`ratio = faceWidth / faceHeight`

**eyeSpacingRatio**
`interPupil = x[473] - x[468]` (right pupil - left pupil)
`ratio = interPupil / faceWidth`

**canthalTiltAngle**
Left eye:  `angle_L = atan2(y[33] - y[133], x[33] - x[133]) * (180/π)`
Right eye: `angle_R = atan2(y[362] - y[263], x[362] - x[263]) * (180/π)`
`canthalTiltAngle = (angle_L + angle_R) / 2`
Positive = upward tilt (outer corner higher than inner).

**jawWidthRatio**
`jawWidth = x[397] - x[172]`
`ratio = jawWidth / faceWidth`

**noseWidthRatio**
`noseWidth = x[358] - x[129]`
`interCanthal = x[362] - x[133]`
`ratio = noseWidth / interCanthal`

**faceShape** (categorical, from ratios)
```
widthToHeight >= 0.85             → 'square'
widthToHeight <= 0.68             → 'oblong'
jawWidthRatio  < 0.72             → 'heart'
else                              → 'oval'
```

**_detectionConfidence** (internal, for scoring engine)
`faceSizeFraction = faceWidth * faceHeight`  (normalised area, 0–1)
`confidence = clamp(0.4 + faceSizeFraction * 4, 0.4, 1.0)`

---

## skinAnalysis.js — Skin Metrics

All ops are pure canvas pixel arithmetic on the face ROI extracted from `ImageData`.

### Face ROI Extraction

```js
function extractFaceROI(imageData, landmarks) {
  // Bounding box from landmark x/y min/max, padded 10%
  const xs = landmarks.map(l => l.x * imageData.width)
  const ys = landmarks.map(l => l.y * imageData.height)
  const x0 = Math.max(0, Math.min(...xs) * 0.95)
  const y0 = Math.max(0, Math.min(...ys) * 0.95)
  const x1 = Math.min(imageData.width,  Math.max(...xs) * 1.05)
  const y1 = Math.min(imageData.height, Math.max(...ys) * 1.05)
  // Return sub-ImageData of that bounding box
}
```

### 1. skinSmoothnessScore — LBP Texture Analysis

LBP (Local Binary Patterns) parameters: radius=1, 8 neighbours, uniform patterns.

```
For each pixel (x,y) in face ROI:
  1. Sample 8 neighbours at radius 1 (N, NE, E, SE, S, SW, W, NW)
  2. Compare each neighbour to centre pixel intensity (grayscale)
  3. Encode as 8-bit binary pattern (1 if neighbour >= centre, else 0)
  4. Count bit transitions in circular pattern
  5. If transitions <= 2: "uniform" pattern (smooth region)
  6. If transitions > 2:  "non-uniform" (complex texture, edge, spot)

uniformRatio = uniformPatternCount / totalPixelCount
skinSmoothnessScore = uniformRatio  (already in [0,1])
```

High uniformRatio = smooth skin. Low = rough texture, acne, pores.
This is camera-independent unlike Laplacian variance.

### 2. skinUniformityScore — HSV Color Uniformity

```
For each pixel in face ROI:
  Convert RGB → HSV
  Collect H values (hue) and S values (saturation)

hueStdDev = stddev(H[])           // range 0–360
satStdDev = stddev(S[])           // range 0–1

// Normalise: max expected stddev ~40° hue, ~0.25 sat
normHue = clamp(hueStdDev / 40, 0, 1)
normSat = clamp(satStdDev / 0.25, 0, 1)

skinUniformityScore = 1 - (normHue * 0.5 + normSat * 0.5)
```

High uniformity = even skin tone. Low = redness, pigmentation, uneven tone.
Works correctly on dark skin tones because it measures relative variation.

### 3. specularHighlightRatio — Oiliness Proxy

```
For each pixel in face ROI (in HSV):
  IF V > 230/255 AND S < 30/255:
    highlightCount++

specularHighlightRatio = highlightCount / totalPixelCount
```

High ratio = oily/shiny skin. Threshold chosen for overexposed specular highlights only.

---

## glowUpEngine.js — Tip Generation

Pure function: `generateTips(measurementResult, gender) → GlowUpTip[]`

Rule table (max 5 tips, sorted by priority then added order):

| Condition | Category | Priority | Tip text |
|---|---|---|---|
| skinSmoothnessScore < 0.55 | Skincare | high | "Your skin texture shows some roughness. A consistent routine with a gentle cleanser and niacinamide serum can improve this over 8–12 weeks." |
| skinUniformityScore < 0.50 | Skincare | high | "Uneven skin tone detected. Daily SPF 50 and a Vitamin C serum in the morning are the most evidence-backed fixes." |
| specularHighlightRatio > 0.15 | Grooming | medium | "Your skin reads as oily on camera. A mattifying primer or blotting paper before photos can make a big difference." |
| _detectionConfidence < 0.50 | Lighting | medium | "Low scan quality. Try scanning in natural daylight facing a window for more accurate results." |
| gender='male' AND skinSmoothnessScore < 0.65 | Grooming | medium | "A consistent shaving routine and post-shave moisturiser reduce skin texture irregularity significantly." |
| gender='female' AND skinUniformityScore < 0.60 | Skincare | medium | "A tinted moisturiser with SPF can even out tone while protecting your skin barrier." |
| _detectionConfidence < 0.12 (face too small) | Posture | low | "Move closer to the camera — your face is too small in the frame for accurate measurements." |

Tips are never about proportions. No tip says anything about nose, jaw, eyes, or face shape.

---

## Component Hierarchy and Prop Contracts

### FaceRater.jsx (page)
No props (top-level route component).
Owns all state. Passes down only what each child needs.

### CameraCapture.jsx
```js
props: {
  landmarker: FaceLandmarker,          // already initialised
  onScanComplete: (ImageData, landmarks) => void,
  onNoFaceDetected: () => void,
}
```
Internally manages: `videoRef`, `canvasRef`, `rafIdRef`, stream lifecycle.
Exposes no imperative handles — parent controls via props.

### RatingResult.jsx
```js
props: {
  result: RatingResult,   // { score, confidence, tier, measurements, tips, modelName }
  onScanAgain: () => void,
}
```

### CategoryCard.jsx
```js
props: {
  label: string,          // e.g. "Facial Symmetry"
  description: string,    // e.g. "Left-right balance of your facial landmarks"
  value: string,          // pre-formatted by parent: "0.87" or "+4.2°" or "Oval"
  barValue: number | null, // 0–1 for bar width, null = no bar (categorical)
}
```
Uses `<dl><dt>{label}</dt><dd>{value}</dd></dl>` for accessibility.

### TierBadge.jsx
```js
props: {
  tier: string,   // e.g. "Above Average"
  score: number,  // e.g. 7.4
}
```
Colour map:
```js
const tierColours = {
  'Gigachad':        'bg-yellow-400 text-yellow-900',
  'Halo Tier':       'bg-yellow-300 text-yellow-900',
  'Looksmaxxed':     'bg-green-400  text-green-900',
  'Above Average':   'bg-green-300  text-green-900',
  'High Tier Normie':'bg-purple-400 text-purple-900',
  'Normie':          'bg-purple-300 text-purple-900',
  'Lookspilled':     'bg-orange-400 text-orange-900',
  'Needs the Grind': 'bg-red-400    text-red-900',
}
```
Always renders both tier name as text AND score number — never colour-only.

### GlowUpTips.jsx
```js
props: {
  tips: GlowUpTip[],  // [{ category, tip, priority }]
}
```
If `tips.length === 0`: renders "Looking solid — keep up your current routine."

---

## Responsive Layout

```
< 400 px   single column, 8 px horizontal padding, all components stacked
400–767 px single column, 16 px padding
768–1023px single column, 24 px padding  
≥ 1024 px  two-column: camera (left, sticky) | results (right, scrollable)
```

Implemented via Tailwind: `grid grid-cols-1 lg:grid-cols-2 gap-6`

---

## Route and Navigation Integration

### AppRoutes.jsx additions
```js
const FaceRater = lazy(() => import('../pages/FaceRater'))

// Inside <Route path="app"> children:
<Route path="mog" element={<FaceRater />} />
```

### BottomNav.jsx additions
The `navItems` array has 6 items on a 6-column grid. Adding a 7th item breaks the layout.
Solution: replace the least-used item OR expand to 7 columns. The recommended approach is to add "Mog" as a 7th nav item and change the grid to `grid-cols-7`. The item uses an inline SVG (face/scan icon) consistent with the Study item pattern.

```js
{ label: 'Mog', to: '/app/mog', icon: null, useInlineSvg: 'mog' }
```

### Sidebar.jsx additions
Add a new `NavLink` entry for "Mog" following the existing pattern for Arcade.

---

## Camera Cleanup — Stream Lifecycle

`CameraCapture` registers cleanup in `useEffect`:

```js
useEffect(() => {
  // Start stream + rAF loop on mount

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'hidden') pauseLoop()
    else resumeLoop()
  }
  const handleUnload = () => stopStream()

  document.addEventListener('visibilitychange', handleVisibilityChange)
  window.addEventListener('beforeunload', handleUnload)
  window.addEventListener('pagehide', handleUnload)

  return () => {
    // React router navigation cleanup
    stopStream()
    cancelAnimationFrame(rafIdRef.current)
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    window.removeEventListener('beforeunload', handleUnload)
    window.removeEventListener('pagehide', handleUnload)
  }
}, [])
```

`stopStream()` calls `track.stop()` on every track in the `MediaStream`.

---

## PWA Service Worker Cache Configuration

The existing `sw.js` uses `vite-plugin-pwa` `injectManifest` strategy. Add a runtime cache entry:

```js
// In the workbox runtimeCaching config (vite.config.js or sw.js):
{
  urlPattern: /face_landmarker\.task$/,
  handler: 'CacheFirst',
  options: {
    cacheName: 'face-rater-model-v1',
    expiration: {
      maxEntries: 2,
      maxAgeSeconds: 60 * 60 * 24 * 30,  // 30 days
    },
  },
},
{
  urlPattern: /mediapipe.*\.wasm$/,
  handler: 'CacheFirst',
  options: {
    cacheName: 'face-rater-wasm-v1',
    expiration: {
      maxEntries: 4,
      maxAgeSeconds: 60 * 60 * 24 * 30,
    },
  },
},
```

These entries ensure the ~8 MB model + WASM files are cached after first load and served offline.

---

## Backend — Leaderboard

### New file: `backend/db/models/face_rater_score.py`

```python
from sqlalchemy import Column, DateTime, Float, Integer, String, func
from db.base import Base

class FaceRaterScore(Base):
    __tablename__ = "face_rater_scores"

    id           = Column(Integer, primary_key=True, index=True)
    anonymous_id = Column(String(36), nullable=False, index=True)
    score        = Column(Float, nullable=False)
    tier         = Column(String(32), nullable=False)
    submitted_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
```

`anonymous_id` is a UUID generated in `sessionStorage` on the client — not linked to any user account.

### New file: `backend/routers/face_rater.py`

Follows the same pattern as `arcade.py`:

```
POST /api/face-rater/score
  Body: { anonymous_id: str, score: float, tier: str }
  No auth required (anonymous submission)
  Validation: score in [0.0, 10.0], tier in valid tier list, anonymous_id is valid UUID

GET /api/face-rater/leaderboard
  Returns top 10 entries ordered by score DESC
  Response: { status: "success", data: [{ rank, anonymous_id_short, score, tier }] }
  anonymous_id_short = first 8 chars of UUID
```

### Alembic migration

New migration file: `backend/alembic/versions/YYYYMMDD_0014_create_face_rater_scores.py`
Creates `face_rater_scores` table with all columns above.

### Register in app.py

```python
from routers.face_rater import router as face_rater_router
app.include_router(face_rater_router)
```

---

## New Dependencies

```json
"@mediapipe/tasks-vision": "^0.10.21",
"onnxruntime-web": "^1.21.0"
```

`onnxruntime-web` is added now so the `aestheticModel.js` interface can import it in v1.1 without package changes. It is not used in v1 code — it is a forward-compatibility dependency only.

MediaPipe WASM files are served from CDN by `@mediapipe/tasks-vision`. No bundling needed.

---

## Type Definitions (JSDoc)

```js
/**
 * @typedef {Object} MeasurementResult
 * @property {number} symmetryScore          - 0–1, 1 = perfect symmetry
 * @property {[number,number,number]} facialThirdsRatio - [upper, mid, lower] fractions
 * @property {number} widthToHeightRatio     - bizygomatic/face-height
 * @property {number} eyeSpacingRatio        - inter-pupil/face-width
 * @property {number} canthalTiltAngle       - degrees, positive = upward
 * @property {number} jawWidthRatio          - bigonial/bizygomatic
 * @property {number} noseWidthRatio         - alar/inter-canthal
 * @property {'oval'|'square'|'heart'|'oblong'} faceShape
 * @property {number} skinSmoothnessScore    - 0–1, LBP uniform ratio
 * @property {number} skinUniformityScore    - 0–1, HSV uniformity
 * @property {number} specularHighlightRatio - 0–1, oiliness proxy
 * @property {number} _detectionConfidence  - internal, 0–1
 */

/**
 * @typedef {Object} GlowUpTip
 * @property {'Skincare'|'Grooming'|'Posture'|'Lighting'|'Hair'} category
 * @property {string} tip
 * @property {'high'|'medium'|'low'} priority
 */

/**
 * @typedef {Object} RatingResult
 * @property {number} score
 * @property {number} confidence
 * @property {string} tier
 * @property {MeasurementResult} measurements
 * @property {GlowUpTip[]} tips
 * @property {string} modelName
 */
```

---

## Requirements Traceability

| Requirement | Design Element |
|---|---|
| R1 — Route/Nav | AppRoutes lazy import, BottomNav 7th item, Sidebar entry |
| R2 — Privacy disclosure | FaceRater 'privacy' phase, PrivacyDisclosure component |
| R3 — Gender context | FaceRater 'gender' phase, passed to glowUpEngine only |
| R4 — WASM loading | createFaceLandmarker(), SW CacheFirst config |
| R5 — Webcam capture | CameraCapture, getUserMedia constraints, rAF loop |
| R6 — Measurements | faceMetrics.js formulas, skinAnalysis.js LBP+HSV+specular |
| R7 — Aesthetic model interface | aestheticModel.js contract, faceScoring.js heuristicModel |
| R8 — Tier classification | classifyTier() in faceScoring.js, TierBadge colour map |
| R9 — Measurements panel | RatingResult, CategoryCard with dl/dt/dd, no ideals shown |
| R10 — Glow-up tips | glowUpEngine.js rule table, GlowUpTips component |
| R11 — UI separation | Three distinct sections in RatingResult, responsive grid |
| R12 — Leaderboard | face_rater_score.py, face_rater.py router, sessionStorage UUID |
| R13 — Limitations disclosure | Persistent disclaimer in RatingResult, 'heuristic-v1' label |
| R14 — PWA offline | SW CacheFirst for model + WASM, offline detection in FaceRater |
| R15 — Performance | 30fps throttle in rAF loop, visibility API pause, 500ms budget |
| R16 — Accessibility | aria-label on video, dl structure, focus trap on modal |
| R17 — Pipeline determinism | All engines are pure functions with no side effects |

---

## Error Handling

| Error condition | Phase triggered | UI shown | Recovery |
|---|---|---|---|
| Browser lacks `getUserMedia` | 'loading' | `'error:compat'` — compatibility notice | None (static message) |
| Camera permission denied | 'loading' | `'error:camera'` — instructions to re-enable | User re-enables in browser settings |
| WASM fetch fails (1st attempt) | 'loading' | Auto-retry once silently | — |
| WASM fetch fails (2nd attempt) | 'loading' | `'error:wasm'` — "Retry" button | Button re-triggers load without page reload |
| No face detected on Scan tap | 'scanning' | Inline message below camera | User repositions, taps Scan again |
| MeasurementEngine throws | 'processing' | Returns to 'scanning' with error toast | Scan again |
| Leaderboard API fails | 'results' | Non-blocking inline error, result still shown | Silent — leaderboard section hidden |

All error states preserve the camera stream and FaceLandmarker instance where possible to avoid reloading the 8 MB model.

---

## Correctness Properties

These invariants must hold at all times:

### Property 1: Pure Functions
`faceMetrics.computeMeasurements`, `faceScoring.heuristicModel.analyzeFrame`, and `glowUpEngine.generateTips` are pure functions. Same inputs → same outputs, no side effects.

**Validates: Requirements 17.1, 17.2, 17.3**

### Property 2: Score Bounds
`score` is always clamped to `[0.0, 10.0]` before leaving `faceScoring.js`.

**Validates: Requirements 7.7, 8.4**

### Property 3: Tier Completeness
Every score in `[0.0, 10.0]` maps to exactly one tier with no gaps or overlaps.

**Validates: Requirements 8.1, 8.4**

### Property 4: No Image Transmission
`CameraCapture` never calls `fetch`, `XMLHttpRequest`, or any network API with image or pixel data.

**Validates: Requirements 2.2, 12.2**

### Property 5: Measurement and Scoring Separation
`faceMetrics.js` contains zero scoring logic. `faceScoring.js` receives `MeasurementResult` as a parameter and does not import `faceMetrics.js` directly.

**Validates: Requirements 7.2, 7.5, 17.1**

### Property 6: Model Swap Isolation
Swapping `activeModel` in `aestheticModel.js` requires zero changes in any component file.

**Validates: Requirements 7.5**

---

## Testing Strategy

### Unit tests (Vitest)
- `faceMetrics.js`: feed synthetic landmark arrays, assert specific measurement values
- `faceScoring.js`: test tier boundary conditions (3.99→"Needs the Grind", 4.0→"Lookspilled", 10.0→"Gigachad")
- `glowUpEngine.js`: test each rule threshold independently, confirm max 5 tips, confirm no surgery language
- `aestheticModel.js`: confirm interface contract — stub model returns correct shape

### Integration tests
- Full pipeline: synthetic landmarks + synthetic ImageData → RatingResult shape validation
- Score monotonicity: increasing `symmetryScore` with fixed skin scores → non-decreasing score output

### Manual / PWA tests
- Camera cleanup: navigate away from `/app/mog`, verify camera indicator turns off in browser
- Offline: disable network after first load, verify scan still works from SW cache
- Mobile: test on portrait + landscape on iOS Safari and Android Chrome
