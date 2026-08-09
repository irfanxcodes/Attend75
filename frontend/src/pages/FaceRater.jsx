/**
 * FaceRater — top-level page for /app/mog
 * Owns the 9-state machine:
 *   privacy → gender → loading → scanning → processing → results
 *   error:camera | error:wasm | error:compat
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { createFaceLandmarker } from '../utils/faceLandmarks'
import { computeMeasurements }  from '../utils/faceMetrics'
import { analyseSkin }          from '../utils/skinAnalysis'
import { analyzeFrame }         from '../utils/aestheticModel'
import { classifyTier }         from '../utils/faceScoring'
import { generateTips }         from '../utils/glowUpEngine'
import CameraCapture            from '../components/faceRater/CameraCapture'
import RatingResult             from '../components/faceRater/RatingResult'

// ── Browser capability check ────────────────────────────────────────────────

function checkCompat() {
  return !!(
    navigator.mediaDevices?.getUserMedia &&
    typeof OffscreenCanvas !== 'undefined'
  )
}

// ── Privacy Disclosure (inline, shown each session) ────────────────────────

function PrivacyDisclosure({ onAccept }) {
  const btnRef = useRef(null)

  useEffect(() => {
    btnRef.current?.focus()
    const trap = (e) => {
      if (e.key === 'Tab') { e.preventDefault(); btnRef.current?.focus() }
    }
    document.addEventListener('keydown', trap)
    return () => document.removeEventListener('keydown', trap)
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 px-4 pb-6 pt-10 backdrop-blur-md sm:items-center sm:py-8"
      role="presentation"
    >
      <div
        role="dialog" aria-modal="true" aria-labelledby="privacy-title"
        className="w-full max-w-sm overflow-hidden rounded-3xl border border-white/10 bg-[#1C1830] shadow-2xl ring-1 ring-white/5"
      >
        {/* Hero */}
        <div className="flex flex-col items-center gap-2 bg-gradient-to-b from-[#FF916C]/20 to-transparent px-6 pt-8 pb-4">
          <span className="text-5xl">🪞</span>
          <h2 id="privacy-title" className="text-xl font-extrabold text-[#F7F4FF]">Get Mogged</h2>
          <p className="text-center text-sm text-[#9F9AB5]">AI face rating — fully on-device, 100% private</p>
        </div>

        <div className="space-y-2.5 px-6 pb-2">
          {[
            { icon: '🔒', text: 'Everything runs on your device — your camera feed never leaves the browser' },
            { icon: '🗑️', text: 'No images saved. Results disappear when you leave the page' },
            { icon: '⚠️', text: 'This is a fun heuristic score, not a scientific measure of attractiveness' },
          ].map(({ icon, text }) => (
            <div key={icon} className="flex gap-3 rounded-2xl bg-white/5 px-3 py-3">
              <span className="mt-0.5 text-base shrink-0">{icon}</span>
              <p className="text-xs leading-relaxed text-[#D8D4E7]">{text}</p>
            </div>
          ))}
        </div>

        <div className="p-6 pt-4">
          <button
            ref={btnRef} type="button" onClick={onAccept}
            className="w-full rounded-full py-3.5 text-sm font-bold text-[#1C2030] transition-all active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF916C]"
            style={{ background: 'linear-gradient(135deg, #FF916C 0%, #FF6B3D 100%)', boxShadow: '0 4px 20px rgba(255,107,61,0.4)' }}
          >
            I Understand — Let's Go 🚀
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Gender selector ─────────────────────────────────────────────────────────

function GenderSelector({ gender, onChange, onStart }) {
  return (
    <div className="flex flex-col items-center gap-6 py-6">
      <div className="text-center">
        <span className="text-4xl">👤</span>
        <h2 className="mt-2 text-xl font-extrabold text-[#F7F4FF]">One quick thing</h2>
        <p className="mt-1 text-sm text-[#9F9AB5]">
          Gender context shapes your personalised tips — doesn't change your score
        </p>
      </div>

      <div className="flex w-full max-w-xs gap-3">
        {[
          { value: 'male',   label: 'Male',   emoji: '♂️' },
          { value: 'female', label: 'Female', emoji: '♀️' },
        ].map(({ value, label, emoji }) => (
          <button
            key={value} type="button"
            onClick={() => onChange(value)}
            aria-pressed={gender === value}
            className={[
              'flex flex-1 flex-col items-center gap-2 rounded-2xl border py-4 text-sm font-bold transition-all',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FF916C]',
              gender === value
                ? 'border-[#FF916C] bg-[#FF916C]/15 text-[#FF916C]'
                : 'border-white/10 bg-white/5 text-[#9F9AB5] hover:bg-white/10',
            ].join(' ')}
          >
            <span className="text-2xl">{emoji}</span>
            {label}
          </button>
        ))}
      </div>

      <button
        type="button" onClick={onStart}
        className="w-full max-w-xs rounded-full py-3.5 text-sm font-bold text-[#1C2030] transition-all active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FF916C]"
        style={{ background: 'linear-gradient(135deg, #FF916C 0%, #FF6B3D 100%)', boxShadow: '0 4px 16px rgba(255,107,61,0.35)' }}
      >
        Start Scan
      </button>
    </div>
  )
}

// ── Loading indicator ───────────────────────────────────────────────────────

function LoadingState({ message }) {
  return (
    <div className="flex flex-col items-center gap-4 py-12">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#FF916C]/30 border-t-[#FF916C]" aria-hidden="true" />
      <p className="text-sm text-[#9F9AB5]">{message}</p>
    </div>
  )
}

// ── Error state ─────────────────────────────────────────────────────────────

function ErrorState({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl bg-[#4A466A] p-6 text-center ring-1 ring-white/5">
      <span aria-hidden="true" className="text-3xl">⚠️</span>
      <p className="text-sm leading-relaxed text-[#D8D4E7]">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className={[
            'rounded-full border border-white/15 bg-white/5 px-6 py-2 text-sm font-semibold text-[#F7F4FF]',
            'transition-colors hover:bg-white/10',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF916C]',
          ].join(' ')}
        >
          Retry
        </button>
      )}
    </div>
  )
}

// ── Main page ───────────────────────────────────────────────────────────────

export default function FaceRater() {
  const [phase,        setPhase]        = useState('privacy')
  const [gender,       setGender]       = useState('male')
  const [errorMsg,     setErrorMsg]     = useState(null)
  const [ratingResult, setRatingResult] = useState(null)
  const [scanKey,      setScanKey]      = useState(0)  // incremented to signal "Scan Again"

  const landmarkerRef = useRef(null)

  // ── Phase: loading → scanning ────────────────────────────────────────────

  const startLoading = useCallback(async () => {
    setPhase('loading')
    setErrorMsg(null)

    // Parallel: model init + camera permission
    // Camera is requested here so getUserMedia fires while the WASM loads.
    // CameraCapture will also call getUserMedia — that's fine, browsers reuse
    // the permission grant within the same page lifecycle.
    let retries = 0
    while (retries <= 1) {
      try {
        landmarkerRef.current = await createFaceLandmarker()
        setPhase('scanning')
        return
      } catch (err) {
        retries++
        if (retries > 1) {
          setErrorMsg('Face model failed to load. Check your connection and try again.')
          setPhase('error:wasm')
          return
        }
      }
    }
  }, [])

  // ── Phase: scanning → processing → results ───────────────────────────────

  const handleScanComplete = useCallback(async (imageData, landmarks, averagedSkin, skinStdDev) => {
    setPhase('processing')

    try {
      // 1. Geometric measurements from averaged landmarks (jitter already removed by CameraCapture)
      const measurements = computeMeasurements(landmarks)

      // 2. Skin metrics — always the buffered average from CameraCapture
      const skinMetrics = averagedSkin ?? analyseSkin(imageData, landmarks)
      Object.assign(measurements, skinMetrics)

      // 3. Score via the modular aestheticModel interface
      const { score, confidence, modelName } = await analyzeFrame(imageData, measurements)

      // 4. Tier
      const tier = classifyTier(score)

      // 5. Glow-up tips
      const tips = generateTips(measurements, gender)

      // 6. Score confidence band: ± mapped from skin signal std dev
      //    skinStdDev ~0 → band ±0, ~0.15+ → band ±0.5
      const scoreBand = skinStdDev != null
        ? +Math.min(0.5, skinStdDev * 3.5).toFixed(1)
        : null

      setRatingResult({ score, confidence, tier, measurements, tips, modelName, scoreBand })
      setPhase('results')
    } catch {
      setErrorMsg('An error occurred during analysis. Please try again.')
      setPhase('scanning')
    }
  }, [gender])

  // ── Scan again — camera stays mounted, just reset result state ─────────────

  const handleScanAgain = useCallback(() => {
    setRatingResult(null)
    setPhase('scanning')
    setScanKey((k) => k + 1)  // signals CameraCapture to unfreeze and resume buffering
  }, [])

  // ── Compat check on mount ────────────────────────────────────────────────

  useEffect(() => {
    if (!checkCompat()) {
      setErrorMsg(
        'Your browser doesn\'t support the camera API or required features. ' +
        'Try Chrome or Safari on a modern device.'
      )
      // Don't set phase:error here — PrivacyDisclosure hasn't shown yet.
      // We'll intercept on accept.
    }
  }, [])

  const handlePrivacyAccept = useCallback(() => {
    if (!checkCompat()) {
      setPhase('error:compat')
      return
    }
    setPhase('gender')
  }, [])

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <section className="pb-6">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-2xl font-extrabold text-[#F7F4FF]">Get Mogged 🪞</h1>
        <p className="text-xs text-[#9F9AB5]">AI face rating · 100% on-device · No data stored</p>
      </div>

      {/* Privacy disclosure — shown first, every session */}
      {phase === 'privacy' && (
        <PrivacyDisclosure onAccept={handlePrivacyAccept} />
      )}

      {/* Gender selection */}
      {phase === 'gender' && (
        <GenderSelector
          gender={gender}
          onChange={setGender}
          onStart={startLoading}
        />
      )}

      {/* Model loading */}
      {phase === 'loading' && (
        <LoadingState message="Loading face model…" />
      )}

      {/* Processing overlay — shown on top of camera feed */}
      {phase === 'processing' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4 rounded-2xl bg-[#4A466A] px-8 py-6 shadow-2xl ring-1 ring-white/10">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#FF916C]/30 border-t-[#FF916C]" aria-hidden="true" />
            <p className="text-sm text-[#9F9AB5]">Analysing your face…</p>
          </div>
        </div>
      )}

      {/* Camera — mounted for scanning, processing, and results phases.
          Keeping it mounted across all three phases means the stream and
          buffer are never torn down between a scan and "Scan Again". */}
      {landmarkerRef.current && ['scanning', 'processing', 'results'].includes(phase) && (
        <div className={[
          'grid grid-cols-1 gap-6',
          phase === 'results' ? 'lg:grid-cols-2' : '',
        ].join(' ')}>
          {/* Camera column — hidden while processing/results on mobile, always visible on desktop */}
          <div className={phase !== 'scanning' ? 'hidden lg:block' : ''}>
            <CameraCapture
              landmarker={landmarkerRef.current}
              onScanComplete={handleScanComplete}
              onNoFaceDetected={() => {}}
              scanKey={scanKey}
            />
          </div>

          {/* Results column — only shown in results phase */}
          {phase === 'results' && ratingResult && (
            <div>
              <RatingResult result={ratingResult} onScanAgain={handleScanAgain} />
            </div>
          )}

          {/* Placeholder on desktop while scanning */}
          {phase === 'scanning' && (
            <div className="hidden lg:flex lg:items-center lg:justify-center">
              <p className="text-sm text-[#9F9AB5]">Results will appear here after your scan</p>
            </div>
          )}
        </div>
      )}

      {/* Error states */}
      {phase === 'error:wasm' && (
        <ErrorState
          message={errorMsg ?? 'Face model failed to load.'}
          onRetry={startLoading}
        />
      )}
      {phase === 'error:camera' && (
        <ErrorState
          message="Camera access was denied. Enable camera permission in your browser settings and try again."
          onRetry={startLoading}
        />
      )}
      {phase === 'error:compat' && (
        <ErrorState
          message={errorMsg ?? 'Your browser does not support the required features. Try Chrome or Safari.'}
          onRetry={null}
        />
      )}
    </section>
  )
}
