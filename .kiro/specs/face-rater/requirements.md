# Requirements Document

## Introduction

The Face Rater is a browser-native, privacy-first feature integrated into the existing Attend75 React + Vite PWA. It uses the device webcam to perform real-time facial landmark detection and skin analysis entirely on-device — no image data ever leaves the browser. The feature computes a structured set of facial measurements (symmetry, proportions, skin quality), produces a 0–10 "glow-up score," assigns a tier label, and generates personalised, actionable grooming and skincare tips. An optional anonymous leaderboard lets users compare scores. The feature is accessible at the route `/app/mog` and appears in the existing bottom navigation bar and sidebar alongside Arcade.

The primary audience is Indian/South Asian college students. The scoring model uses transparent, cross-culturally validated signals (facial symmetry and skin quality) rather than hardcoded Western "ideal" ratios, and the UI acknowledges model limitations honestly.

---

## Glossary

- **FaceRater**: The top-level page component rendered at `/app/mog`.
- **FaceLandmarker**: The MediaPipe Tasks Vision `FaceLandmarker` instance that produces 468 3D facial landmarks from a video frame.
- **LandmarkSet**: The array of 468 `{x, y, z}` normalised coordinate objects returned by FaceLandmarker for a single frame.
- **MeasurementEngine**: The pure functional module (`faceMetrics.js`) that converts a LandmarkSet into a `MeasurementResult` object. It performs no scoring.
- **MeasurementResult**: A plain object containing all computed facial measurements: `symmetryScore`, `facialThirdsRatio`, `widthToHeightRatio`, `eyeSpacingRatio`, `canthalTiltAngle`, `jawWidthRatio`, `noseWidthRatio`, `faceShape`, `skinSmoothnessScore`, `skinUniformityScore`, `specularHighlightRatio`.
- **SkinAnalyser**: The canvas pixel-operations module (`skinAnalysis.js`) that computes `skinSmoothnessScore`, `skinUniformityScore`, and `specularHighlightRatio` from raw `ImageData` using LBP texture analysis, HSV color uniformity, and specular highlight detection respectively.
- **AestheticModel**: The swappable interface (`aestheticModel.js`) with the contract `analyzeFrame(imageData: ImageData) → { score: number, confidence: number, modelName: string }`.
- **ScoringEngine**: The v1 heuristic implementation of `AestheticModel` (`faceScoring.js`) that derives a 0–10 score from `MeasurementResult` using only symmetry and skin quality signals.
- **GlowUpEngine**: The rule-based module (`glowUpEngine.js`) that maps low measurement values to categorised, actionable tip objects.
- **GlowUpTip**: A plain object `{ category: string, tip: string, priority: 'high'|'medium'|'low' }`.
- **Tier**: A named band mapped from a score range. The seven tiers are: `Gigachad` (10.0), `Halo Tier` (9.0–9.9), `Looksmaxxed` (8.0–8.9), `Above Average` (7.0–7.9), `High Tier Normie` (6.0–6.9), `Normie` (5.0–5.9), `Lookspilled` (4.0–4.9), `Needs the Grind` (below 4.0).
- **RatingResult**: The composite output object `{ score, confidence, tier, tierLabel, measurements: MeasurementResult, tips: GlowUpTip[], modelName }` produced after a completed scan.
- **GenderContext**: A `'male'|'female'` value selected by the user before scanning. Affects canthal tilt interpretation and tip generation; does not alter the core symmetry or skin score.
- **ServiceWorker**: The existing Attend75 service worker (`sw.js`) built with `vite-plugin-pwa` using the `injectManifest` strategy.
- **WASM Bundle**: The MediaPipe FaceLandmarker WebAssembly files (~8 MB) fetched from the `@mediapipe/tasks-vision` CDN or bundled locally.
- **LeaderboardEntry**: An anonymous record `{ anonymousId: string, score: number, tier: string, submittedAt: timestamp }` stored server-side.
- **PrivacyDisclosure**: The plain-language notice shown before camera access is requested, explicitly stating that no image data is stored or transmitted.
- **CameraCapture**: The component (`CameraCapture.jsx`) that manages `getUserMedia`, the hidden `<video>` element, the overlay `<canvas>`, and the continuous landmark detection loop.
- **CategoryCard**: The component (`CategoryCard.jsx`) displaying a single named measurement with its value, a visual bar, and a short label.
- **TierBadge**: The component (`TierBadge.jsx`) that renders the tier name and score with colour coding.

---

## Requirements

### Requirement 1: Route and Navigation Integration

**User Story:** As a student using the Attend75 PWA, I want to access the Face Rater from the main navigation, so that I can discover and launch it the same way I find the Arcade.

#### Acceptance Criteria

1. THE FaceRater SHALL be accessible at the path `/app/mog` within the existing authenticated `AppLayout` route tree.
2. THE AppRoutes module SHALL lazily import `FaceRater` and register it at `/app/mog` using `React.lazy` and `Suspense`, consistent with the existing lazy-loading pattern.
3. WHEN an unauthenticated user navigates to `/app/mog`, THE AppRoutes module SHALL redirect the user to `/login`.
4. THE BottomNav component SHALL include a navigation item labelled "Mog" pointing to `/app/mog`, styled consistently with existing navigation items.
5. THE Sidebar component SHALL include a navigation entry for "Mog" pointing to `/app/mog`, styled consistently with existing sidebar entries.
6. WHEN the user navigates away from `/app/mog`, THE CameraCapture component SHALL stop all active `MediaStream` tracks within 200 ms, handling React router navigation, browser tab close, and page refresh via `beforeunload` and `pagehide` events, to prevent the browser camera indicator from remaining active.

---

### Requirement 2: Privacy Disclosure and Camera Permission

**User Story:** As a privacy-conscious student, I want to see a clear disclosure before the camera is accessed, so that I understand exactly what happens to my face data and can make an informed choice.

#### Acceptance Criteria

1. WHEN the user first loads `/app/mog`, THE FaceRater SHALL display the PrivacyDisclosure screen before requesting camera access or loading the WASM Bundle.
2. THE PrivacyDisclosure SHALL state, in plain language visible without scrolling on a 375 px wide viewport, that: (a) all processing occurs on-device, (b) no image or video is stored or transmitted, and (c) the scan result is discarded when the user leaves the page.
3. WHEN the user dismisses the PrivacyDisclosure by tapping "I Understand – Start Scan", THE FaceRater SHALL begin both the WASM Bundle load and camera permission request in parallel. IF the WASM Bundle fails to load while camera permission has already been granted, THEN THE FaceRater SHALL display a recoverable WASM error with a "Retry" button while preserving the already-granted camera permission state.
4. IF the user denies camera permission, THEN THE FaceRater SHALL display a recoverable error message instructing the user how to re-enable camera access in browser settings, without crashing or entering an unrecoverable state.
5. IF the browser does not support `getUserMedia` or `OffscreenCanvas`, THEN THE FaceRater SHALL display a compatibility notice and SHALL NOT attempt to load the WASM Bundle.
6. THE PrivacyDisclosure SHALL be re-shown each session (i.e., on every fresh page load), not permanently suppressed after first acceptance.

---

### Requirement 3: Gender Context Selection

**User Story:** As a user, I want to select a gender context before scanning, so that the tip generation and canthal tilt interpretation are appropriate for my face type.

#### Acceptance Criteria

1. WHEN the user proceeds past the PrivacyDisclosure, THE FaceRater SHALL present a GenderContext selector with two options: "Male" and "Female".
2. THE GenderContext selector SHALL be visually presented as a toggle or two-button selector, not a dropdown, to minimise friction on mobile.
3. THE GenderContext value SHALL default to "Male" with no selection required before scanning if the user does not interact with the selector.
4. WHEN the user selects a GenderContext and taps "Start Scan", THE FaceRater SHALL pass the selected GenderContext to the GlowUpEngine for tip generation. WHEN the user taps "Start Scan" without making a GenderContext selection, THE FaceRater SHALL automatically use the default "Male" context without blocking the scan.
5. IF the GlowUpEngine is unavailable due to a technical error, THEN THE FaceRater SHALL allow the scan to proceed and display measurement and score results without tips, using the ScoringEngine defaults.
6. THE GenderContext selection SHALL NOT be persisted to `localStorage` or any server-side store.

---

### Requirement 4: WASM Bundle Loading and Model Initialisation

**User Story:** As a user on a slow connection, I want the MediaPipe model to load from cache when possible, so that I don't wait for an 8 MB download every visit.

#### Acceptance Criteria

1. WHEN the user proceeds to scan, THE FaceRater SHALL initialise `FaceLandmarker` from the `@mediapipe/tasks-vision` package with exactly `numFaces: 1` and `runningMode: 'VIDEO'` — any other values for these parameters SHALL be treated as a configuration error and prevented at the initialisation call site.
2. WHEN the WASM Bundle is being fetched, THE FaceRater SHALL display a loading indicator with the text "Loading face model…" so the user knows the delay is expected.
3. THE ServiceWorker SHALL cache the `face_landmarker.task` model asset using a `CacheFirst` strategy with a maximum age of 30 days, so subsequent visits load the model from cache without a network request.
4. IF the WASM Bundle fails to load after one automatic retry, THEN THE FaceRater SHALL display a recoverable error with a manual "Retry" button and SHALL NOT leave the user on a blank screen.
5. THE FaceRater SHALL initialise the `FaceLandmarker` instance once per component mount and SHALL reuse it across all scan sessions within the same page lifecycle.

---

### Requirement 5: Real-Time Webcam Capture

**User Story:** As a user, I want to see my camera feed with a face-framing overlay, so that I can position my face correctly before scanning.

#### Acceptance Criteria

1. WHEN the model has loaded and camera permission has been granted, THE CameraCapture component SHALL start a `getUserMedia` stream with constraints `{ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } }`.
2. THE CameraCapture component SHALL render the live camera feed in a `<video>` element that is visually present but covered by an overlay `<canvas>` of equal dimensions.
3. THE CameraCapture component SHALL draw a face-framing oval guide on the overlay `<canvas>` at all times during capture, to help the user centre their face.
4. WHEN `FaceLandmarker` detects one or more faces in a frame, THE CameraCapture component SHALL draw the detected landmark mesh on the overlay `<canvas>` using a low-opacity stroke, providing real-time visual feedback.
5. THE CameraCapture component SHALL call `FaceLandmarker.detectForVideo` at the browser's `requestAnimationFrame` rate, passing the current video frame and timestamp.
6. WHEN the user taps the "Scan" button, THE CameraCapture component SHALL capture a single frame by drawing the current video frame to an offscreen canvas and extracting `ImageData` for scoring.
7. THE CameraCapture component SHALL support both portrait and landscape orientations without layout overflow on viewports from 320 px to 1280 px wide.
8. IF no face is detected in the current frame when the user taps "Scan", THEN THE CameraCapture component SHALL display the message "No face detected — position your face within the oval" and SHALL NOT proceed to scoring.

---

### Requirement 6: Facial Measurement Computation

**User Story:** As a user curious about my facial proportions, I want to see objective measurements of my facial geometry and skin quality, so that I have factual data rather than just an opaque score.

#### Acceptance Criteria

1. WHEN a captured frame is passed to the MeasurementEngine, THE MeasurementEngine SHALL compute all eleven measurements defined in the MeasurementResult type from the LandmarkSet.
2. THE MeasurementEngine SHALL compute `symmetryScore` as the mean of per-landmark bilateral distance differences, normalised to a 0–1 scale where 1.0 is perfect symmetry.
3. THE MeasurementEngine SHALL compute `facialThirdsRatio` as three values representing the proportional height of (a) the forehead region (hairline to brow), (b) the midface region (brow to nose base), and (c) the lower face region (nose base to chin), each expressed as a fraction of total face height.
4. THE MeasurementEngine SHALL compute `widthToHeightRatio` as the ratio of bizygomatic width to total face height, both measured in normalised landmark coordinate units.
5. THE MeasurementEngine SHALL compute `eyeSpacingRatio` as the inter-pupil distance divided by the bizygomatic width.
6. THE MeasurementEngine SHALL compute `canthalTiltAngle` as the angle in degrees between the inner and outer canthal points of each eye, averaged across both eyes, where positive values indicate upward tilt.
7. THE MeasurementEngine SHALL compute `jawWidthRatio` as the bigonial width divided by the bizygomatic width.
8. THE MeasurementEngine SHALL compute `noseWidthRatio` as the alar width divided by the inter-canthal distance.
9. THE MeasurementEngine SHALL classify `faceShape` as one of `'oval'|'square'|'heart'|'oblong'` based on the ratio of bizygomatic width to face height and the ratio of jaw width to bizygomatic width.
10. THE SkinAnalyser SHALL compute `skinSmoothnessScore` using Local Binary Pattern (LBP) texture analysis on the facial region of the captured `ImageData`, returning a 0–1 value where 1.0 is maximally smooth texture.
11. THE SkinAnalyser SHALL compute `skinUniformityScore` using HSV colour uniformity of the facial region pixels, returning a 0–1 value where 1.0 is perfectly uniform colour.
12. THE SkinAnalyser SHALL compute `specularHighlightRatio` as the fraction of facial region pixels exceeding a luminance threshold of 230/255, returning a 0–1 value where lower is less oily.
13. THE MeasurementEngine SHALL be a pure function: given the same LandmarkSet and ImageData inputs, THE MeasurementEngine SHALL always return an identical MeasurementResult with no side effects.

---

### Requirement 7: Score Computation via Aesthetic Model Interface

**User Story:** As a user, I want to receive a numeric score that reflects only validated, culturally neutral signals, so that I'm not judged against arbitrary Western beauty ideals.

#### Acceptance Criteria

1. THE AestheticModel interface SHALL define the contract `analyzeFrame(imageData: ImageData) → Promise<{ score: number, confidence: number, modelName: string }>` with `score` in the range [0, 10] and `confidence` in the range [0, 1].
2. THE ScoringEngine (v1 heuristic) SHALL implement the AestheticModel interface and SHALL derive `score` from a weighted combination of `symmetryScore`, `skinSmoothnessScore`, and `skinUniformityScore` only — it SHALL NOT incorporate any facial proportion ratio as a scored signal against an "ideal" value.
3. THE ScoringEngine SHALL produce `modelName: 'heuristic-v1'` in its output so the UI can disclose which model was used.
4. THE ScoringEngine SHALL produce `confidence` values between 0.4 and 1.0, where confidence increases with face detection quality (landmark visibility completeness and face size relative to frame).
5. WHERE a future ONNX or TensorFlow.js model is integrated, THE FaceRater SHALL use it by replacing the ScoringEngine module without modifying any UI component, thereby satisfying the interface contract.
6. WHEN the score is displayed to the user, THE RatingResult panel SHALL label it "Glow-Up Score" and SHALL display the `modelName` in a footnote so users know it is a product heuristic, not a scientific measurement.
7. THE ScoringEngine SHALL clamp the computed score to the range [0.0, 10.0] before returning it.

---

### Requirement 8: Tier Classification

**User Story:** As a user, I want my score mapped to a tier label, so that I can understand my result in a relatable, gamified context.

#### Acceptance Criteria

1. THE ScoringEngine SHALL map each score to a Tier according to the following boundaries:
   - Score = 10.0 → `Gigachad`
   - Score ∈ [9.0, 10.0) → `Halo Tier`
   - Score ∈ [8.0, 9.0) → `Looksmaxxed`
   - Score ∈ [7.0, 8.0) → `Above Average`
   - Score ∈ [6.0, 7.0) → `High Tier Normie`
   - Score ∈ [5.0, 6.0) → `Normie`
   - Score ∈ [4.0, 5.0) → `Lookspilled`
   - Score ∈ [0.0, 4.0) → `Needs the Grind`
2. THE TierBadge component SHALL display the tier name and the numeric score to one decimal place (e.g., "7.4").
3. THE TierBadge component SHALL apply distinct colour coding per tier: warm gold for Halo Tier and Gigachad, cool green for Looksmaxxed and Above Average, neutral purple for High Tier Normie and Normie, warm red/orange for Lookspilled and Needs the Grind.
4. FOR ALL valid score inputs in [0.0, 10.0], THE ScoringEngine tier classification SHALL be total: every score maps to exactly one Tier with no gaps or overlaps.

---

### Requirement 9: Measurements Display Panel

**User Story:** As a curious user, I want to view all my facial measurements in a structured panel, so that I can understand which specific aspects of my face were analysed.

#### Acceptance Criteria

1. WHEN a RatingResult is available, THE RatingResult component SHALL render a Measurements panel that is visually separated from the Rating panel.
2. THE Measurements panel SHALL display each of the eleven measurements using CategoryCard components, each showing the measurement name, its computed value formatted appropriately (ratios to two decimal places, angles to one decimal place, scores to two decimal places), and a visual bar indicating relative magnitude.
3. THE RatingResult component SHALL display `faceShape` as a text badge (e.g., "Oval", "Square") rather than a numeric bar, since it is a categorical value.
4. THE Measurements panel SHALL include a brief label beneath each measurement name explaining what it measures in plain English (e.g., "Canthal Tilt — outer corner angle of your eyes").
5. THE RatingResult component SHALL NOT present any measurement value as "good" or "bad" — measurements SHALL be displayed as neutral factual data with no colour-coding, descriptive labels, or other elements that imply value judgments about individual measurements.
6. THE Measurements panel SHALL NOT display any "ideal" reference value alongside the user's measurements.
7. THE RatingResult component SHALL display all measurements returned by the MeasurementEngine, updating the panel dynamically if future engine versions produce additional measurements beyond the current eleven.

---

### Requirement 10: Glow-Up Tips Generation

**User Story:** As a student who wants to improve their appearance, I want actionable, non-invasive grooming and skincare tips derived from my measurements, so that I get concrete advice I can act on.

#### Acceptance Criteria

1. WHEN a RatingResult is computed, THE GlowUpEngine SHALL evaluate the MeasurementResult and GenderContext to produce a list of zero or more GlowUpTip objects.
2. THE GlowUpEngine SHALL generate tips from the following categories: `Skincare`, `Grooming`, `Posture`, `Lighting` (for low confidence scans), and `Hair`.
3. THE GlowUpEngine SHALL trigger a `Skincare` tip of priority `high` WHEN `skinSmoothnessScore` is below 0.55.
4. THE GlowUpEngine SHALL trigger a `Skincare` tip of priority `high` WHEN `skinUniformityScore` is below 0.50.
5. THE GlowUpEngine SHALL trigger a `Grooming` tip of priority `medium` WHEN `specularHighlightRatio` exceeds 0.15 (high oiliness proxy).
6. THE GlowUpEngine SHALL trigger a `Posture` tip WHEN the detected face size relative to the frame is below 0.12 (face too far from camera, reducing measurement accuracy).
7. THE GlowUpTips component SHALL render each GlowUpTip as a card with the category label, tip text, and a priority indicator.
8. THE GlowUpEngine SHALL NOT generate tips that recommend invasive procedures, cosmetic surgery, or fillers.
9. THE GlowUpEngine SHALL NOT generate tips referencing specific face proportion ratios as defects (e.g., SHALL NOT say "your nose is too wide").
10. WHEN the GlowUpEngine produces zero GlowUpTip objects, THE GlowUpTips component SHALL display the message "Looking solid — keep up your current routine."
11. THE GlowUpEngine SHALL produce at most 5 tips per scan to avoid overwhelming the user.

---

### Requirement 11: Results Layout and UI Separation

**User Story:** As a user, I want the score and measurements to be visually separated, so that I understand the score is a product metric while the measurements are objective data.

#### Acceptance Criteria

1. THE RatingResult component SHALL render in two visually distinct sections: (a) a Rating section at the top containing TierBadge, score, confidence indicator, and model name footnote; and (b) a Measurements section below containing all CategoryCards.
2. THE GlowUpTips component SHALL render below the Measurements section as a third distinct section labelled "Glow-Up Tips".
3. THE Rating section SHALL display the confidence value as a text label (e.g., "Confidence: High / Medium / Low") mapped from the `confidence` number: ≥0.75 → High, ≥0.50 → Medium, < 0.50 → Low.
4. THE FaceRater page SHALL provide a "Scan Again" button that resets all result state and returns the user to the CameraCapture view without reloading the page or reinitialising the FaceLandmarker instance.
5. THE FaceRater page layout SHALL be a single-column scroll on screens narrower than 768 px (mobile) and screens between 769 px and 1023 px (tablet). On screens narrower than 400 px, THE FaceRater SHALL reduce horizontal padding to a minimum of 8 px and stack all components without side margins. On screens 1024 px wide or wider, THE FaceRater SHALL use a two-column layout (camera left, results right).

---

### Requirement 12: Anonymous Leaderboard

**User Story:** As a competitive student, I want to optionally submit my score to an anonymous leaderboard, so that I can see how I compare to others.

#### Acceptance Criteria

1. WHEN a RatingResult is displayed, THE FaceRater SHALL present an opt-in button labelled "Submit to Leaderboard (Anonymous)" that is not selected by default.
2. WHEN the user explicitly taps the submit button, THE FaceRater SHALL transmit only `{ anonymousId, score, tier }` to the backend leaderboard endpoint — it SHALL NOT transmit any image, landmark data, MeasurementResult, or GenderContext.
3. THE `anonymousId` SHALL be a randomly generated UUID stored in `sessionStorage` only, so that it is discarded when the browser tab is closed and cannot be linked to the user's account.
4. THE FaceRater SHALL fetch and display the top 10 leaderboard entries below the submit button, showing each entry's rank, anonymised ID (first 8 characters), score, and tier. THE FaceRater SHALL truncate the displayed list to 10 entries on the frontend regardless of how many entries the backend returns.
5. IF the leaderboard API request fails, THEN THE FaceRater SHALL display a non-blocking error message and SHALL NOT prevent the user from viewing their personal RatingResult.
6. THE leaderboard SHALL use the existing `game_scores` backend infrastructure or an equivalent new `face_rater_scores` table — the specific backend model is an implementation decision, but the frontend contract is `GET /api/face-rater/leaderboard` and `POST /api/face-rater/score`.

---

### Requirement 13: Model Limitations Disclosure

**User Story:** As an Indian/South Asian student, I want the app to honestly acknowledge the limitations of its face analysis model, so that I don't treat the score as a scientifically accurate judgment.

#### Acceptance Criteria

1. THE FaceRater SHALL display a persistent disclaimer in the RatingResult section with the text: "This score is generated by a product heuristic model. It uses symmetry and skin texture signals only and does not represent a scientific measure of attractiveness. Results may be less accurate for South Asian and darker skin tones."
2. THE disclaimer SHALL be rendered in a visually subdued style (smaller font, lower opacity) so it is present but not the dominant element.
3. THE FaceRater SHALL NOT use language such as "attractiveness score", "beauty rating", or "hotness score" anywhere in the UI — the score SHALL be labelled "Glow-Up Score" exclusively.
4. THE PrivacyDisclosure screen SHALL include one sentence acknowledging model limitations before the user proceeds.

---

### Requirement 14: PWA Offline Support

**User Story:** As a student using the PWA on a slow or intermittent campus connection, I want the face rater to work after the model has been cached, so that connectivity issues don't prevent a scan.

#### Acceptance Criteria

1. WHEN the WASM Bundle has been downloaded at least once, THE ServiceWorker SHALL serve the `face_landmarker.task` model asset from cache for all subsequent requests, regardless of network connectivity.
2. THE ServiceWorker cache configuration for the face-rater WASM Bundle SHALL use the `CacheFirst` strategy with a `maxAgeSeconds` of 2592000 (30 days) and a `maxEntries` limit of 2.
3. WHEN the device is offline and the WASM Bundle is available in cache, THE FaceRater SHALL complete initialisation and scanning without requiring a network connection. IF initialisation fails due to corrupted cache or insufficient device resources while offline, THEN THE FaceRater SHALL display an error message explaining the specific failure reason (e.g., "Model cache may be corrupted — reconnect to reload") and SHALL provide a manual "Retry" button.
4. WHEN the device is offline and the WASM Bundle is not yet cached, THE FaceRater SHALL display the message "Face model not yet cached — connect to the internet once to enable offline use."
5. WHEN the device is offline, THE FaceRater SHALL skip the leaderboard section entirely and show "Leaderboard unavailable offline" rather than showing an error state. WHILE the device is online, THE FaceRater SHALL NOT display the offline leaderboard message.

---

### Requirement 15: Performance Constraints

**User Story:** As a user on a mid-range Android device, I want the scanning loop to run smoothly without draining the battery excessively, so that I can use the feature without the app becoming unresponsive.

#### Acceptance Criteria

1. THE CameraCapture component SHALL throttle `FaceLandmarker.detectForVideo` calls to a maximum of 30 frames per second on devices where `requestAnimationFrame` fires at higher rates.
2. WHEN the user taps "Scan" to capture the result, THE FaceRater SHALL complete MeasurementEngine computation and ScoringEngine computation within 500 ms of the frame capture on a device with a Snapdragon 720G equivalent or better.
3. WHEN the FaceRater page is not the active browser tab, THE CameraCapture component SHALL allow the current animation frame to finish processing before pausing the `requestAnimationFrame` loop, using the Page Visibility API (`document.visibilityState`). WHILE the page remains hidden, THE CameraCapture component SHALL not schedule any new animation frames.
4. WHEN the user navigates away from `/app/mog` or closes/refreshes the browser tab while on the page, THE CameraCapture component SHALL stop all active `MediaStream` tracks, handling both React navigation events and browser-level `beforeunload` and `pagehide` events.
5. THE FaceRater page SHALL achieve a Lighthouse Performance score of 70 or above when measured on a simulated mid-range mobile device with a cold cache (excluding the WASM Bundle download time from the measurement).
6. WHEN the user navigates away from `/app/mog`, THE CameraCapture component SHALL cancel the active `requestAnimationFrame` loop and release all camera stream tracks within 200 ms.

---

### Requirement 16: Accessibility

**User Story:** As a user relying on assistive technology, I want the Face Rater to be usable with screen readers and keyboard navigation, so that the feature is inclusive.

#### Acceptance Criteria

1. THE CameraCapture component SHALL include an `aria-label` on the `<video>` element describing it as "Live webcam feed for face scanning".
2. THE TierBadge component SHALL convey the tier name and score as accessible text (not solely via colour), ensuring the information is available to screen readers.
3. THE CategoryCard component SHALL use a `<dl>` (description list) or equivalent semantic structure to associate each measurement name with its value.
4. THE "Scan" and "Scan Again" buttons SHALL be focusable and activatable via keyboard (Enter/Space), with visible focus rings consistent with the existing Attend75 design system.
5. THE PrivacyDisclosure modal (if rendered as a dialog) SHALL trap focus within the modal until dismissed, using `aria-modal="true"` and `role="dialog"`.
6. THE FaceRater page SHALL not use colour alone to convey tier or measurement meaning — each TierBadge SHALL also display the tier name as text.

---

### Requirement 17: Round-Trip Integrity of Measurement and Scoring Pipeline

**User Story:** As a developer, I want the measurement and scoring pipeline to be deterministic and round-trippable, so that the same input always produces the same output and the pipeline can be reliably tested.

#### Acceptance Criteria

1. THE MeasurementEngine SHALL be a pure function: FOR ALL identical LandmarkSet and ImageData inputs, THE MeasurementEngine SHALL return an identical MeasurementResult.
2. THE ScoringEngine SHALL be a pure function: FOR ALL identical MeasurementResult inputs, THE ScoringEngine SHALL return an identical `{ score, confidence, modelName }` output.
3. THE GlowUpEngine SHALL be a pure function: FOR ALL identical MeasurementResult and GenderContext inputs, THE GlowUpEngine SHALL return an identical list of GlowUpTip objects.
4. FOR ALL MeasurementResult objects produced by the MeasurementEngine, WHEN the MeasurementResult is serialised to JSON and deserialised back, THE ScoringEngine SHALL produce the same score as it would from the original MeasurementResult (round-trip serialisation property).
5. THE ScoringEngine score output SHALL be monotonically non-decreasing with respect to increasing `symmetryScore` when all other inputs are held constant, and monotonically non-decreasing with respect to increasing `skinSmoothnessScore` when all other inputs are held constant.
