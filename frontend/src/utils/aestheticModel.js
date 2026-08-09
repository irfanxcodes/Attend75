/**
 * aestheticModel.js
 * AestheticModel interface + active model export.
 *
 * This is the single swap point for the scoring model.
 * To replace the v1 heuristic with a future ONNX or TFJS model:
 *   1. Create a new module (e.g. onnxFbpModel.js) that exports an object
 *      conforming to the AestheticModel interface below.
 *   2. Change ONE import line here (marked with "← SWAP HERE").
 *   3. No UI component or utility changes are needed.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * AestheticModel interface (duck-typed):
 *
 *   {
 *     modelName: string,
 *     analyzeFrame(
 *       imageData: ImageData,
 *       measurementResult: MeasurementResult
 *     ): Promise<AestheticModelResult>
 *   }
 *
 * AestheticModelResult:
 *   {
 *     score:      number,   // float in [0.0, 10.0]
 *     confidence: number,   // float in [0.0, 1.0]
 *     modelName:  string,   // identifier shown in UI footnote
 *   }
 * ─────────────────────────────────────────────────────────────────────────
 */

// ← SWAP HERE: replace this import to switch the active model
import { heuristicModel } from './faceScoring.js'

// Future examples (uncomment one and remove the heuristicModel import above):
// import { scutModel }    from './scutModel.js'
// import { onnxFbpModel } from './onnxFbpModel.js'

/** The currently active scoring model. */
export const activeModel = heuristicModel

/**
 * Analyse a captured frame and return a Glow-Up Score.
 * Delegates to the active model — swap the import above to change behaviour.
 *
 * @param {ImageData} imageData
 * @param {import('./faceMetrics.js').MeasurementResult} measurementResult
 * @returns {Promise<{ score: number, confidence: number, modelName: string }>}
 */
export async function analyzeFrame(imageData, measurementResult) {
  return activeModel.analyzeFrame(imageData, measurementResult)
}
