/**
 * skinAnalysis.js
 * SkinAnalyser — pure function.
 * Computes skin quality metrics from raw ImageData using canvas pixel operations.
 * No ML model, no external libraries. Camera-independent (no Laplacian sharpness).
 *
 * Returns three metrics merged into MeasurementResult by the caller.
 */

// ---------------------------------------------------------------------------
// Face ROI extraction
// ---------------------------------------------------------------------------

/**
 * Extract a rectangular face region from ImageData using landmark bounding box.
 * Pads the bounding box by 5% on each side.
 *
 * @param {ImageData} imageData
 * @param {Array<{x:number,y:number}>} landmarks - normalised [0,1] coordinates
 * @returns {{ pixels: Uint8ClampedArray, width: number, height: number, x0: number, y0: number }}
 */
function extractFaceROI(imageData, landmarks) {
  const { width, height, data } = imageData

  let minX = Infinity, maxX = -Infinity
  let minY = Infinity, maxY = -Infinity

  for (const lm of landmarks) {
    const px = lm.x * width
    const py = lm.y * height
    if (px < minX) minX = px
    if (px > maxX) maxX = px
    if (py < minY) minY = py
    if (py > maxY) maxY = py
  }

  // 5% padding
  const padX = (maxX - minX) * 0.05
  const padY = (maxY - minY) * 0.05

  const x0 = Math.max(0,       Math.floor(minX - padX))
  const y0 = Math.max(0,       Math.floor(minY - padY))
  const x1 = Math.min(width,   Math.ceil(maxX  + padX))
  const y1 = Math.min(height,  Math.ceil(maxY  + padY))

  const roiW = x1 - x0
  const roiH = y1 - y0

  if (roiW <= 0 || roiH <= 0) {
    return { pixels: data, width, height, x0: 0, y0: 0, roiW: width, roiH: height }
  }

  // Copy the ROI pixel rows
  const roi = new Uint8ClampedArray(roiW * roiH * 4)
  for (let row = 0; row < roiH; row++) {
    const srcStart  = ((y0 + row) * width + x0) * 4
    const destStart = row * roiW * 4
    roi.set(data.subarray(srcStart, srcStart + roiW * 4), destStart)
  }

  return { pixels: roi, roiW, roiH }
}

// ---------------------------------------------------------------------------
// RGB → greyscale
// ---------------------------------------------------------------------------

function toGrey(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b
}

// ---------------------------------------------------------------------------
// 1. LBP skin smoothness (8-neighbour, radius 1, uniform patterns)
// ---------------------------------------------------------------------------

/**
 * Compute LBP-based skin smoothness score.
 * Returns the fraction of pixels whose 8-neighbour LBP pattern is "uniform"
 * (≤ 2 bit transitions in the circular binary string).
 * Smooth skin → high uniform ratio; rough/textured skin → low.
 *
 * @param {Uint8ClampedArray} pixels - RGBA pixel data
 * @param {number} w - width
 * @param {number} h - height
 * @returns {number} 0–1
 */
function computeLBPSmoothness(pixels, w, h) {
  // 8-neighbour offsets: N, NE, E, SE, S, SW, W, NW
  const DX = [ 0,  1, 1,  1,  0, -1, -1, -1]
  const DY = [-1, -1, 0,  1,  1,  1,  0, -1]

  let uniformCount = 0
  let total = 0

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = (y * w + x) * 4
      const centre = toGrey(pixels[idx], pixels[idx + 1], pixels[idx + 2])

      // Build 8-bit LBP code
      let lbp = 0
      for (let n = 0; n < 8; n++) {
        const nx = x + DX[n]
        const ny = y + DY[n]
        const nIdx = (ny * w + nx) * 4
        const neighbourGrey = toGrey(pixels[nIdx], pixels[nIdx + 1], pixels[nIdx + 2])
        if (neighbourGrey >= centre) {
          lbp |= (1 << n)
        }
      }

      // Count bit transitions (circular)
      let transitions = 0
      const msb = (lbp >> 7) & 1
      let prev  = msb
      for (let b = 0; b < 8; b++) {
        const bit = (lbp >> b) & 1
        if (bit !== prev) transitions++
        prev = bit
      }
      // Close the circle
      if (prev !== msb) transitions++

      // Threshold of 4 (was 2) to tolerate webcam compression noise while
      // still distinguishing genuinely textured / rough skin regions.
      if (transitions <= 4) uniformCount++
      total++
    }
  }

  return total > 0 ? uniformCount / total : 0.5
}

// ---------------------------------------------------------------------------
// RGB → HSV conversion (per pixel)
// ---------------------------------------------------------------------------

function rgbToHSV(r, g, b) {
  const rn = r / 255, gn = g / 255, bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const delta = max - min

  let h = 0
  if (delta > 0) {
    if      (max === rn) h = ((gn - bn) / delta) % 6
    else if (max === gn) h = (bn - rn) / delta + 2
    else                 h = (rn - gn) / delta + 4
    h = ((h * 60) + 360) % 360
  }

  const s = max === 0 ? 0 : delta / max
  const v = max

  return { h, s, v }
}

// ---------------------------------------------------------------------------
// 2. HSV colour uniformity (skin tone evenness)
// ---------------------------------------------------------------------------

/**
 * Compute skin tone uniformity from HSV hue and saturation standard deviation.
 * Works correctly on all skin tones because it measures relative variation.
 *
 * @param {Uint8ClampedArray} pixels
 * @param {number} count - number of pixels
 * @returns {number} 0–1 (1 = perfectly uniform)
 */
function computeHSVUniformity(pixels, count) {
  if (count === 0) return 0.5

  let sumH = 0, sumS = 0
  const hues = new Float32Array(count)
  const sats = new Float32Array(count)

  for (let i = 0; i < count; i++) {
    const base = i * 4
    const { h, s } = rgbToHSV(pixels[base], pixels[base + 1], pixels[base + 2])
    hues[i] = h
    sats[i] = s
    sumH += h
    sumS += s
  }

  const meanH = sumH / count
  const meanS = sumS / count

  let varH = 0, varS = 0
  for (let i = 0; i < count; i++) {
    varH += (hues[i] - meanH) ** 2
    varS += (sats[i] - meanS) ** 2
  }

  const stdH = Math.sqrt(varH / count)
  const stdS = Math.sqrt(varS / count)

  // Max expected: hue stddev ~60° (wider to account for shadows and ROI edges),
  // sat stddev ~0.30. Tighter normalisation prevents normal lighting variation
  // from being misread as uneven skin tone.
  const normH = Math.min(stdH / 60,   1)
  const normS = Math.min(stdS / 0.30, 1)

  return Math.max(0, 1 - (normH * 0.5 + normS * 0.5))
}

// ---------------------------------------------------------------------------
// 3. Specular highlight ratio (oiliness proxy)
// ---------------------------------------------------------------------------

/**
 * Fraction of face pixels that are likely specular highlights (oily/shiny skin).
 * Threshold: V > 230/255 AND S < 30/255 in HSV.
 *
 * @param {Uint8ClampedArray} pixels
 * @param {number} count
 * @returns {number} 0–1
 */
function computeSpecularRatio(pixels, count) {
  if (count === 0) return 0

  let highlights = 0
  for (let i = 0; i < count; i++) {
    const base = i * 4
    const { s, v } = rgbToHSV(pixels[base], pixels[base + 1], pixels[base + 2])
    if (v > 230 / 255 && s < 30 / 255) highlights++
  }
  return highlights / count
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Analyse skin quality from a captured frame's ImageData.
 * Pure function — identical inputs always produce identical outputs.
 *
 * @param {ImageData} imageData
 * @param {Array<{x:number,y:number,z:number}>} landmarks - 468 normalised points
 * @returns {{ skinSmoothnessScore: number, skinUniformityScore: number, specularHighlightRatio: number }}
 */
export function analyseSkin(imageData, landmarks) {
  const { pixels, roiW, roiH } = extractFaceROI(imageData, landmarks)
  const pixelCount = roiW * roiH

  const skinSmoothnessScore    = computeLBPSmoothness(pixels, roiW, roiH)
  const skinUniformityScore    = computeHSVUniformity(pixels, pixelCount)
  const specularHighlightRatio = computeSpecularRatio(pixels, pixelCount)

  return {
    skinSmoothnessScore:    Math.max(0, Math.min(1, skinSmoothnessScore)),
    skinUniformityScore:    Math.max(0, Math.min(1, skinUniformityScore)),
    specularHighlightRatio: Math.max(0, Math.min(1, specularHighlightRatio)),
  }
}
