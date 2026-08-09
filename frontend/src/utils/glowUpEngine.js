/**
 * glowUpEngine.js
 * Rule-based glow-up tip generator — pure function.
 *
 * Maps low MeasurementResult values to actionable, non-invasive tips.
 * No tip references facial proportions, surgery, fillers, or body parts as defects.
 * Max 5 tips per scan, sorted high → medium → low priority.
 */

/**
 * @typedef {'Skincare'|'Grooming'|'Posture'|'Lighting'|'Hair'} TipCategory
 * @typedef {'high'|'medium'|'low'} TipPriority
 *
 * @typedef {Object} GlowUpTip
 * @property {TipCategory} category
 * @property {string}      tip
 * @property {TipPriority} priority
 */

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 }
const MAX_TIPS = 5

/**
 * Generate actionable glow-up tips from measurement results.
 * Pure function — same inputs always produce the same output list.
 *
 * @param {import('./faceMetrics.js').MeasurementResult} m
 * @param {'male'|'female'} gender
 * @returns {GlowUpTip[]}
 */
export function generateTips(m, gender) {
  /** @type {GlowUpTip[]} */
  const tips = []

  const add = (category, tip, priority) => tips.push({ category, tip, priority })

  // ── Rule 1: Low skin texture (any gender) ──────────────────────────────
  if (m.skinSmoothnessScore >= 0 && m.skinSmoothnessScore < 0.55) {
    add(
      'Skincare',
      'Your skin texture shows some roughness. A consistent routine with a gentle cleanser and niacinamide serum can improve this noticeably over 8–12 weeks.',
      'high',
    )
  }

  // ── Rule 2: Uneven skin tone (any gender) ──────────────────────────────
  if (m.skinUniformityScore >= 0 && m.skinUniformityScore < 0.50) {
    add(
      'Skincare',
      'Uneven skin tone detected. Daily SPF 50 and a Vitamin C serum in the morning are the most evidence-backed fixes for long-term evenness.',
      'high',
    )
  }

  // ── Rule 3: Oily/shiny skin ────────────────────────────────────────────
  if (m.specularHighlightRatio >= 0 && m.specularHighlightRatio > 0.15) {
    add(
      'Grooming',
      'Your skin reads as oily on camera. A mattifying moisturiser or blotting paper before photos makes a noticeable difference.',
      'medium',
    )
  }

  // ── Rule 4: Low detection confidence (poor lighting) ──────────────────
  if (m._detectionConfidence >= 0 && m._detectionConfidence < 0.50) {
    add(
      'Lighting',
      'Low scan confidence — poor lighting can affect all measurements. Try scanning in natural daylight facing a window for more accurate results.',
      'medium',
    )
  }

  // ── Rule 5: Male + slightly rough skin ────────────────────────────────
  if (
    gender === 'male' &&
    m.skinSmoothnessScore >= 0 &&
    m.skinSmoothnessScore < 0.65 &&
    m.skinSmoothnessScore >= 0.55  // avoid double-tip with Rule 1
  ) {
    add(
      'Grooming',
      'A consistent shaving routine combined with a post-shave moisturiser significantly reduces skin texture irregularity over time.',
      'medium',
    )
  }

  // ── Rule 6: Female + slightly uneven tone ─────────────────────────────
  if (
    gender === 'female' &&
    m.skinUniformityScore >= 0 &&
    m.skinUniformityScore < 0.60 &&
    m.skinUniformityScore >= 0.50  // avoid double-tip with Rule 2
  ) {
    add(
      'Skincare',
      'A tinted moisturiser with SPF can even out skin tone while protecting your skin barrier — two benefits in one step.',
      'medium',
    )
  }

  // ── Rule 7: Face too small in frame ───────────────────────────────────
  if (m._detectionConfidence >= 0 && m._detectionConfidence < 0.12) {
    add(
      'Posture',
      'Move closer to the camera — your face is too small in the frame for accurate measurements.',
      'low',
    )
  }

  // Sort by priority (high first) then cap at MAX_TIPS
  tips.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])
  return tips.slice(0, MAX_TIPS)
}
