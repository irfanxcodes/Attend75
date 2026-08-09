/**
 * faceMetrics.js
 * MeasurementEngine — pure function.
 * Converts a MediaPipe LandmarkSet (468 normalised {x,y,z} points) into a
 * MeasurementResult. Contains zero scoring logic.
 *
 * All coordinates are normalised to [0,1]. Distances are Euclidean in that space.
 */

/**
 * @typedef {Object} MeasurementResult
 * @property {number}   symmetryScore          - 0–1, higher = more symmetric
 * @property {[number, number, number]} facialThirdsRatio - [upper, mid, lower] fractions of face height
 * @property {number}   widthToHeightRatio     - bizygomatic width / face height
 * @property {number}   eyeSpacingRatio        - inter-pupil distance / face width
 * @property {number}   canthalTiltAngle       - degrees; positive = outer corner higher
 * @property {number}   jawWidthRatio          - bigonial width / bizygomatic width
 * @property {number}   noseWidthRatio         - alar width / inter-canthal distance
 * @property {'oval'|'square'|'heart'|'oblong'} faceShape
 * @property {number}   skinSmoothnessScore    - 0–1, filled by skinAnalysis.js
 * @property {number}   skinUniformityScore    - 0–1, filled by skinAnalysis.js
 * @property {number}   specularHighlightRatio - 0–1, filled by skinAnalysis.js
 * @property {number}   _detectionConfidence   - internal 0–1; face size proxy
 */

// ---------------------------------------------------------------------------
// MediaPipe 468-point landmark indices used in calculations
// ---------------------------------------------------------------------------
const LM = {
  FOREHEAD_TOP:        10,
  CHIN_BOTTOM:         152,
  LEFT_CHEEKBONE:      234,
  RIGHT_CHEEKBONE:     454,
  LEFT_INNER_CANTHUS:  133,
  LEFT_OUTER_CANTHUS:  33,
  RIGHT_INNER_CANTHUS: 362,
  RIGHT_OUTER_CANTHUS: 263,
  // Iris centres (refined model adds indices 468–477)
  LEFT_PUPIL:          468,
  RIGHT_PUPIL:         473,
  LEFT_JAW_ANGLE:      172,
  RIGHT_JAW_ANGLE:     397,
  NOSE_LEFT_ALAR:      129,
  NOSE_RIGHT_ALAR:     358,
  BROW_MIDPOINT:       8,   // between brows — approximation
  NOSE_BASE:           2,
  // Bilateral symmetry pairs  [left, right]
}

// Bilateral pairs for symmetry: [leftIdx, rightIdx]
const SYMMETRY_PAIRS = [
  [33,  263],  // outer canthi
  [133, 362],  // inner canthi
  [234, 454],  // cheekbones
  [172, 397],  // jaw angles
  [129, 358],  // alar base
  [61,  291],  // mouth corners
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dist2D(a, b) {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

// Safe accessor — returns {x:0,y:0,z:0} for missing landmarks (e.g. irises
// on the non-refined model which only outputs 468 points).
function lm(landmarks, idx) {
  return landmarks[idx] ?? { x: 0, y: 0, z: 0 }
}

// ---------------------------------------------------------------------------
// Individual metric computations
// ---------------------------------------------------------------------------

function computeSymmetryScore(landmarks) {
  const faceWidth = lm(landmarks, LM.RIGHT_CHEEKBONE).x - lm(landmarks, LM.LEFT_CHEEKBONE).x
  if (faceWidth <= 0) return 0.5

  const midlineX = (lm(landmarks, LM.LEFT_CHEEKBONE).x + lm(landmarks, LM.RIGHT_CHEEKBONE).x) / 2

  let totalAsymmetry = 0
  for (const [leftIdx, rightIdx] of SYMMETRY_PAIRS) {
    const leftDist  = Math.abs(lm(landmarks, leftIdx).x  - midlineX)
    const rightDist = Math.abs(lm(landmarks, rightIdx).x - midlineX)
    totalAsymmetry += Math.abs(leftDist - rightDist)
  }

  const meanAsymmetry = totalAsymmetry / SYMMETRY_PAIRS.length
  const normAsymmetry = meanAsymmetry / faceWidth
  // Human faces typically have normAsymmetry in ~0.01–0.08 range.
  // Multiply by 4 (was 6) so that typical asymmetry maps sensibly:
  //   0.01 → 0.96  (very symmetric)
  //   0.04 → 0.84  (normal)
  //   0.08 → 0.68  (noticeably asymmetric)
  return clamp(1 - normAsymmetry * 4, 0, 1)
}

function computeFacialThirdsRatio(landmarks) {
  const top    = lm(landmarks, LM.FOREHEAD_TOP).y
  const brow   = lm(landmarks, LM.BROW_MIDPOINT).y
  const nose   = lm(landmarks, LM.NOSE_BASE).y
  const chin   = lm(landmarks, LM.CHIN_BOTTOM).y
  const total  = chin - top
  if (total <= 0) return [0.33, 0.34, 0.33]
  return [
    (brow - top)  / total,
    (nose - brow) / total,
    (chin - nose) / total,
  ]
}

function computeWidthToHeightRatio(landmarks) {
  const faceWidth  = lm(landmarks, LM.RIGHT_CHEEKBONE).x - lm(landmarks, LM.LEFT_CHEEKBONE).x
  const faceHeight = lm(landmarks, LM.CHIN_BOTTOM).y    - lm(landmarks, LM.FOREHEAD_TOP).y
  if (faceHeight <= 0) return 0.7
  return faceWidth / faceHeight
}

function computeEyeSpacingRatio(landmarks, faceWidth) {
  if (faceWidth <= 0) return 0.46
  // Use inner canthi as fallback if iris landmarks are missing (non-refined model)
  const leftPupil  = lm(landmarks, LM.LEFT_PUPIL).x  || lm(landmarks, LM.LEFT_INNER_CANTHUS).x
  const rightPupil = lm(landmarks, LM.RIGHT_PUPIL).x || lm(landmarks, LM.RIGHT_INNER_CANTHUS).x
  const interPupil = Math.abs(rightPupil - leftPupil)
  return interPupil / faceWidth
}

function computeCanthalTiltAngle(landmarks) {
  const leftInner  = lm(landmarks, LM.LEFT_INNER_CANTHUS)
  const leftOuter  = lm(landmarks, LM.LEFT_OUTER_CANTHUS)
  const rightInner = lm(landmarks, LM.RIGHT_INNER_CANTHUS)
  const rightOuter = lm(landmarks, LM.RIGHT_OUTER_CANTHUS)

  // Positive = outer corner higher (upward tilt). atan2 in canvas coords
  // where y increases downward, so a higher outer corner means smaller y,
  // meaning the angle will be negative in raw atan2 — we negate to match
  // the conventional definition (positive = hunter eyes).
  const angleL = Math.atan2(leftOuter.y  - leftInner.y,  leftOuter.x  - leftInner.x)
  const angleR = Math.atan2(rightOuter.y - rightInner.y, rightOuter.x - rightInner.x)
  const avgRad = (angleL + angleR) / 2
  // Negate because canvas y-axis is flipped relative to anatomical convention
  return -avgRad * (180 / Math.PI)
}

function computeJawWidthRatio(landmarks, faceWidth) {
  if (faceWidth <= 0) return 0.7
  const jawWidth = lm(landmarks, LM.RIGHT_JAW_ANGLE).x - lm(landmarks, LM.LEFT_JAW_ANGLE).x
  return Math.abs(jawWidth) / faceWidth
}

function computeNoseWidthRatio(landmarks) {
  const noseWidth     = Math.abs(lm(landmarks, LM.NOSE_RIGHT_ALAR).x    - lm(landmarks, LM.NOSE_LEFT_ALAR).x)
  const interCanthal  = Math.abs(lm(landmarks, LM.RIGHT_INNER_CANTHUS).x - lm(landmarks, LM.LEFT_INNER_CANTHUS).x)
  if (interCanthal <= 0) return 1.0
  return noseWidth / interCanthal
}

function classifyFaceShape(widthToHeight, jawWidthRatio) {
  if (widthToHeight >= 0.85) return 'square'
  if (widthToHeight <= 0.68) return 'oblong'
  if (jawWidthRatio  < 0.72) return 'heart'
  return 'oval'
}

function computeDetectionConfidence(landmarks) {
  const faceWidth  = lm(landmarks, LM.RIGHT_CHEEKBONE).x - lm(landmarks, LM.LEFT_CHEEKBONE).x
  const faceHeight = lm(landmarks, LM.CHIN_BOTTOM).y    - lm(landmarks, LM.FOREHEAD_TOP).y
  const faceFraction = Math.max(0, faceWidth) * Math.max(0, faceHeight)
  return clamp(0.4 + faceFraction * 4, 0.4, 1.0)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute all geometric facial measurements from a MediaPipe LandmarkSet.
 * Pure function — no side effects, no IO, no scoring logic.
 *
 * Skin metrics (skinSmoothnessScore, skinUniformityScore, specularHighlightRatio)
 * are initialised to -1 here and filled in by skinAnalysis.js before scoring.
 *
 * @param {Array<{x:number, y:number, z:number}>} landmarks - 468 normalised points
 * @returns {MeasurementResult}
 */
export function computeMeasurements(landmarks) {
  const faceWidth  = lm(landmarks, LM.RIGHT_CHEEKBONE).x - lm(landmarks, LM.LEFT_CHEEKBONE).x
  const whr        = computeWidthToHeightRatio(landmarks)
  const jwRatio    = computeJawWidthRatio(landmarks, faceWidth)

  return {
    symmetryScore:          computeSymmetryScore(landmarks),
    facialThirdsRatio:      computeFacialThirdsRatio(landmarks),
    widthToHeightRatio:     whr,
    eyeSpacingRatio:        computeEyeSpacingRatio(landmarks, faceWidth),
    canthalTiltAngle:       computeCanthalTiltAngle(landmarks),
    jawWidthRatio:          jwRatio,
    noseWidthRatio:         computeNoseWidthRatio(landmarks),
    faceShape:              classifyFaceShape(whr, jwRatio),
    // Skin metrics — filled by skinAnalysis.js
    skinSmoothnessScore:    -1,
    skinUniformityScore:    -1,
    specularHighlightRatio: -1,
    // Internal
    _detectionConfidence:   computeDetectionConfidence(landmarks),
  }
}
