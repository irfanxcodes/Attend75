/**
 * faceLandmarks.js
 * MediaPipe FaceLandmarker initialisation and per-frame detection.
 * All exports are framework-agnostic — no React dependencies.
 */

import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'

const WASM_CDN =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'

/**
 * Creates and returns an initialised FaceLandmarker instance.
 * Must be called once; reuse the returned instance across frames.
 *
 * @returns {Promise<FaceLandmarker>}
 */
export async function createFaceLandmarker() {
  const vision = await FilesetResolver.forVisionTasks(WASM_CDN)

  return FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: MODEL_URL,
      delegate: 'GPU', // falls back to CPU automatically on unsupported devices
    },
    numFaces: 1,
    runningMode: 'VIDEO',
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: false,
  })
}

/**
 * Run landmark detection on the current video frame.
 *
 * @param {FaceLandmarker} landmarker - Initialised FaceLandmarker instance
 * @param {HTMLVideoElement} videoEl  - Live video element
 * @param {number} timestamp          - DOMHighResTimeStamp from requestAnimationFrame
 * @returns {import('@mediapipe/tasks-vision').FaceLandmarkerResult}
 */
export function detectLandmarks(landmarker, videoEl, timestamp) {
  return landmarker.detectForVideo(videoEl, timestamp)
}
