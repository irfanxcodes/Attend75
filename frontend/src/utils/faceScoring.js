/**
 * faceScoring.js
 * v1 Heuristic ScoringEngine — implements the AestheticModel interface.
 *
 * Scores derived only from cross-culturally validated signals:
 *   - symmetryScore        (45%)
 *   - skinSmoothnessScore  (30%)
 *   - skinUniformityScore  (25%)
 *
 * No facial proportion ratio is used as a scored signal against an "ideal".
 * Pure function — same inputs always produce the same output.
 */

// ---------------------------------------------------------------------------
// Tier classification
// ---------------------------------------------------------------------------

/**
 * All 8 tier bands, ordered highest to lowest.
 * Gigachad is a point (exactly 10.0); all others are half-open [low, high).
 *
 * @type {Array<{ tier: string, min: number, max: number }>}
 */
const TIER_BANDS = [
  { tier: 'Gigachad',         min: 10.0, max: 10.0  },
  { tier: 'Halo Tier',        min: 9.0,  max: 10.0  },
  { tier: 'Looksmaxxed',      min: 8.0,  max: 9.0   },
  { tier: 'Above Average',    min: 7.0,  max: 8.0   },
  { tier: 'High Tier Normie', min: 6.0,  max: 7.0   },
  { tier: 'Normie',           min: 5.0,  max: 6.0   },
  { tier: 'Lookspilled',      min: 4.0,  max: 5.0   },
  { tier: 'Needs the Grind',  min: 0.0,  max: 4.0   },
]

/**
 * Map a score to its tier label.
 * Total function — every value in [0.0, 10.0] maps to exactly one tier.
 *
 * @param {number} score
 * @returns {string}
 */
export function classifyTier(score) {
  if (score >= 10.0) return 'Gigachad'
  for (const band of TIER_BANDS) {
    if (score >= band.min && score < band.max) return band.tier
  }
  // Fallback for floating-point edge cases at exactly 0.0
  return 'Needs the Grind'
}

// ---------------------------------------------------------------------------
// Heuristic model
// ---------------------------------------------------------------------------

/**
 * @typedef {{ score: number, confidence: number, modelName: string }} AestheticModelResult
 */

/**
 * v1 heuristic implementation of the AestheticModel interface.
 * Satisfies: analyzeFrame(imageData, measurementResult) → Promise<AestheticModelResult>
 */
export const heuristicModel = {
  modelName: 'heuristic-v1',

  /**
   * Compute a 0–10 Glow-Up Score from the MeasurementResult.
   *
   * @param {ImageData} _imageData - unused in v1 (reserved for future ML model)
   * @param {import('./faceMetrics.js').MeasurementResult} measurementResult
   * @returns {Promise<AestheticModelResult>}
   */
  async analyzeFrame(_imageData, measurementResult) {
    const {
      symmetryScore,
      skinSmoothnessScore,
      skinUniformityScore,
      _detectionConfidence,
    } = measurementResult

    // Treat unfilled skin metrics (=-1) as neutral 0.5 to avoid penalising
    // scans where skinAnalysis.js hasn't run yet
    const smoothness  = skinSmoothnessScore    >= 0 ? skinSmoothnessScore    : 0.5
    const uniformity  = skinUniformityScore    >= 0 ? skinUniformityScore    : 0.5
    const symmetry    = symmetryScore          >= 0 ? symmetryScore          : 0.5

    // Weighted combination → raw in [0, 1]
    // Symmetry is the most stable signal (landmark geometry); skin metrics
    // are noisier on compressed webcam feeds so weighted slightly lower.
    const raw = symmetry   * 0.45
              + smoothness * 0.30
              + uniformity * 0.25

    // Map [0, 1] → [2.5, 9.8]
    // Floor of 2.5 prevents unfairly low scores from noise; ceiling of 9.8
    // keeps Gigachad (10.0) genuinely rare without compressing the mid-range.
    const mapped = 2.5 + raw * 7.3

    const score = +Math.min(10.0, Math.max(0.0, mapped)).toFixed(1)
    const confidence = Math.min(1.0, Math.max(0.4, _detectionConfidence ?? 0.7))

    return { score, confidence, modelName: this.modelName }
  },
}
