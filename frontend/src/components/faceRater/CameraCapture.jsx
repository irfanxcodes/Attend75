/**
 * CameraCapture — webcam stream + real-time landmark overlay + scan trigger.
 *
 * Startup sequence (bulletproof):
 * 1. getUserMedia → set srcObject → call play() → wait for 'playing' event
 * 2. Only AFTER 'playing' fires do we start the rAF loop
 * 3. The rAF loop reads everything via refs — no stale closures, no re-starts
 * 4. detectForVideo timestamp is always performance.now() at call time (monotonic)
 */
import { useEffect, useRef, useState } from 'react'
import { detectLandmarks } from '../../utils/faceLandmarks'
import { analyseSkin } from '../../utils/skinAnalysis'

const MAX_FPS             = 30
const FRAME_MS            = 1000 / MAX_FPS
const SKIN_EVERY_N        = 2
const OVAL_COLOR          = 'rgba(255, 145, 108, 0.6)'
const MESH_COLOR          = 'rgba(247, 244, 255, 0.25)'
const MESH_SIZE           = 1.5
const BUFFER_SIZE         = 8
const STABILITY_THRESHOLD = 0.012
const BAD_SPECULAR        = 0.30
const BAD_UNIFORMITY      = 0.20

// ── Pure helpers ──────────────────────────────────────────────────────────────

function meanDelta(prev, curr) {
  if (!prev || prev.length !== curr.length) return Infinity
  let sum = 0
  for (let i = 0; i < curr.length; i++) {
    const dx = curr[i].x - prev[i].x
    const dy = curr[i].y - prev[i].y
    sum += Math.sqrt(dx * dx + dy * dy)
  }
  return sum / curr.length
}

function avgLandmarks(frames) {
  if (!frames.length) return []
  const n = frames.length, c = frames[0].length
  return Array.from({ length: c }, (_, i) => ({
    x: frames.reduce((s, f) => s + f[i].x, 0) / n,
    y: frames.reduce((s, f) => s + f[i].y, 0) / n,
    z: frames.reduce((s, f) => s + f[i].z, 0) / n,
  }))
}

function sd(arr) {
  if (arr.length < 2) return 0
  const m = arr.reduce((a, b) => a + b, 0) / arr.length
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length)
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CameraCapture({ landmarker, onScanComplete, scanKey = 0 }) {
  const videoRef         = useRef(null)
  const canvasRef        = useRef(null)
  const offscreenRef     = useRef(null)
  const rafRef           = useRef(null)
  const streamRef        = useRef(null)
  const lastTsRef        = useRef(0)      // last rAF timestamp for fps throttle
  const lastDetectTsRef  = useRef(-1)     // last timestamp passed to detectForVideo (must increase)
  const stableCountRef   = useRef(0)
  const prevLmsRef       = useRef(null)
  const frozenRef        = useRef(false)
  const bufRef           = useRef([])

  // Keep latest props accessible from the loop without re-creating it
  const lmRef            = useRef(landmarker)
  const cbRef            = useRef(onScanComplete)
  useEffect(() => { lmRef.current = landmarker }, [landmarker])
  useEffect(() => { cbRef.current = onScanComplete }, [onScanComplete])

  const [bufFill,      setBufFill]    = useState(0)
  const [lightWarn,    setLightWarn]  = useState(null)
  const [noFace,       setNoFace]     = useState(false)
  const [scanning,     setScanning]   = useState(false)
  const [frozen,       setFrozen]     = useState(false)

  // ── The loop — lives in a ref, always current, never stale ───────────────

  const loopFn = useRef(null)
  loopFn.current = (rafTs) => {
    // Reschedule immediately so we never miss a frame
    rafRef.current = requestAnimationFrame((t) => loopFn.current(t))

    if (frozenRef.current) return

    // FPS throttle
    if (rafTs - lastTsRef.current < FRAME_MS) return
    lastTsRef.current = rafTs

    const video = videoRef.current
    // Must be playing and have decoded a frame
    if (!video || video.paused || video.readyState < 2) return

    // MediaPipe requires strictly increasing timestamps
    const detectionTs = performance.now()
    if (detectionTs <= lastDetectTsRef.current) return
    lastDetectTsRef.current = detectionTs

    // ── Detection ─────────────────────────────────────────────────────
    let result
    try {
      result = detectLandmarks(lmRef.current, video, detectionTs)
    } catch {
      return
    }

    // ── Draw ──────────────────────────────────────────────────────────
    const canvas = canvasRef.current
    if (canvas) {
      // Always keep canvas dimensions in sync
      if (video.videoWidth > 0 && canvas.width !== video.videoWidth) {
        canvas.width  = video.videoWidth
        canvas.height = video.videoHeight
      }
      if (canvas.width > 0) {
        const ctx = canvas.getContext('2d')
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        // Guide oval
        ctx.beginPath()
        ctx.ellipse(canvas.width / 2, canvas.height / 2,
          canvas.width * 0.32, canvas.height * 0.42, 0, 0, Math.PI * 2)
        ctx.strokeStyle = OVAL_COLOR
        ctx.lineWidth = 2.5
        ctx.setLineDash([6, 4])
        ctx.stroke()
        ctx.setLineDash([])
        // Landmark mesh
        const lms = result?.faceLandmarks?.[0]
        if (lms) {
          ctx.fillStyle = MESH_COLOR
          for (const p of lms) {
            ctx.beginPath()
            ctx.arc(p.x * canvas.width, p.y * canvas.height, MESH_SIZE, 0, Math.PI * 2)
            ctx.fill()
          }
        }
      }
    }

    // ── Buffer ────────────────────────────────────────────────────────
    const lms = result?.faceLandmarks?.[0]
    if (!lms) {
      prevLmsRef.current = null
      stableCountRef.current = 0
      bufRef.current = []
      setBufFill(0)
      setLightWarn(null)
      setNoFace(true)
      return
    }
    setNoFace(false)

    // Stability gate
    const delta = meanDelta(prevLmsRef.current, lms)
    prevLmsRef.current = lms
    if (delta > STABILITY_THRESHOLD) {
      stableCountRef.current = 0
      bufRef.current = []
      setBufFill(0)
      return
    }
    stableCountRef.current++

    // Skin analysis every Nth stable frame
    const vw = video.videoWidth || 640
    const vh = video.videoHeight || 480
    let skin = null
    if (stableCountRef.current % SKIN_EVERY_N === 0) {
      try {
        if (!offscreenRef.current) offscreenRef.current = document.createElement('canvas')
        const off = offscreenRef.current
        if (off.width !== vw || off.height !== vh) { off.width = vw; off.height = vh }
        const oc = off.getContext('2d')
        oc.drawImage(video, 0, 0, vw, vh)
        skin = analyseSkin(oc.getImageData(0, 0, vw, vh), lms)
      } catch { /* skip */ }
    }
    if (!skin) return

    const buf = bufRef.current
    buf.push({ landmarks: lms, skin })
    if (buf.length > BUFFER_SIZE) buf.shift()
    const fill = Math.min(buf.length, BUFFER_SIZE)
    setBufFill((p) => p !== fill ? fill : p)

    if (buf.length >= BUFFER_SIZE) {
      const n = buf.length
      const sp = buf.reduce((s, f) => s + f.skin.specularHighlightRatio, 0) / n
      const un = buf.reduce((s, f) => s + f.skin.skinUniformityScore, 0) / n
      setLightWarn(
        sp > BAD_SPECULAR    ? 'Too much light — move away from bright windows or lamps'
        : un < BAD_UNIFORMITY ? 'Uneven lighting — try facing a window or use white light'
        : null
      )
    }
  }

  // ── Stream — starts ONCE, waits for 'playing' before rAF ─────────────────

  useEffect(() => {
    let cancelled = false

    function startLoop() {
      if (cancelled) return
      // Cancel any existing rAF before starting fresh
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      lastDetectTsRef.current = -1   // reset so first timestamp is always accepted
      lastTsRef.current = 0
      rafRef.current = requestAnimationFrame((t) => loopFn.current(t))
    }

    async function init() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        })
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return }

        streamRef.current = stream
        const video = videoRef.current
        if (!video) return

        video.srcObject = stream
        video.muted = true
        video.playsInline = true

        // 'playing' is the only reliable event that means the video
        // is actually delivering decoded frames — not just 'canplay'
        await new Promise((resolve, reject) => {
          // Already playing (shouldn't happen on first mount but be safe)
          if (!video.paused && video.readyState >= 2) { resolve(); return }
          video.addEventListener('playing', resolve, { once: true })
          video.addEventListener('error', reject, { once: true })
          video.play().catch(reject)
        })

        if (cancelled) return
        startLoop()
      } catch (err) {
        console.error('[CameraCapture] stream init failed:', err)
      }
    }

    init()

    // Visibility: pause rAF when hidden, resume when visible
    function onVisibility() {
      if (document.visibilityState === 'hidden') {
        if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
      } else {
        // Resume — reset detection timestamp so first resumed frame is accepted
        lastDetectTsRef.current = -1
        startLoop()
      }
    }

    function onUnload() {
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('beforeunload', onUnload)
    window.addEventListener('pagehide', onUnload)

    return () => {
      cancelled = true
      onUnload()
      bufRef.current = []
      prevLmsRef.current = null
      stableCountRef.current = 0
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('beforeunload', onUnload)
      window.removeEventListener('pagehide', onUnload)
    }
  }, []) // runs exactly once

  // ── Scan Again ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (scanKey === 0) return
    frozenRef.current = false
    bufRef.current = []
    prevLmsRef.current = null
    stableCountRef.current = 0
    lastDetectTsRef.current = -1
    setFrozen(false)
    setBufFill(0)
    setLightWarn(null)
    setNoFace(false)
  }, [scanKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Scan ──────────────────────────────────────────────────────────────────

  function handleScan() {
    if (scanning) return
    const buf = bufRef.current
    if (buf.length < BUFFER_SIZE) return
    setScanning(true)

    const video = videoRef.current
    const n = buf.length

    const vw = video?.videoWidth  || 640
    const vh = video?.videoHeight || 480
    const snap = document.createElement('canvas')
    snap.width = vw; snap.height = vh
    snap.getContext('2d').drawImage(video, 0, 0)
    const imageData = snap.getContext('2d').getImageData(0, 0, vw, vh)

    cbRef.current(
      imageData,
      avgLandmarks(buf.map((f) => f.landmarks)),
      {
        skinSmoothnessScore:    buf.reduce((s, f) => s + f.skin.skinSmoothnessScore,    0) / n,
        skinUniformityScore:    buf.reduce((s, f) => s + f.skin.skinUniformityScore,    0) / n,
        specularHighlightRatio: buf.reduce((s, f) => s + f.skin.specularHighlightRatio, 0) / n,
      },
      (sd(buf.map((f) => f.skin.skinSmoothnessScore)) +
       sd(buf.map((f) => f.skin.skinUniformityScore))) / 2,
    )

    frozenRef.current = true
    setFrozen(true)
    setScanning(false)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const isReady = bufFill >= BUFFER_SIZE && !scanning && !lightWarn
  const fillPct = Math.round((bufFill / BUFFER_SIZE) * 100)

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Camera + overlay */}
      <div className="relative w-full max-w-sm overflow-hidden rounded-2xl bg-[#1C1830] ring-1 ring-white/10">
        <video
          ref={videoRef}
          aria-label="Live webcam feed for face scanning"
          muted
          playsInline
          className="h-auto w-full"
          style={{ display: 'block' }}
        />
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full"
        />
      </div>

      {/* Status messages */}
      {noFace && !frozen && (
        <p role="alert" className="text-center text-sm font-medium text-orange-300">
          No face detected — position your face within the oval
        </p>
      )}

      {!noFace && !frozen && bufFill > 0 && bufFill < BUFFER_SIZE && (
        <div className="w-full max-w-sm">
          <div className="mb-1 flex justify-between text-[10px] text-[#9F9AB5]">
            <span>Hold still — reading your face…</span>
            <span>{bufFill}/{BUFFER_SIZE}</span>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-[#FF916C] transition-all duration-100"
              style={{ width: `${fillPct}%` }}
              aria-hidden="true"
            />
          </div>
        </div>
      )}

      {lightWarn && !frozen && (
        <p role="alert" className="text-center text-sm font-medium text-yellow-300">
          ⚠ {lightWarn}
        </p>
      )}

      {/* Scan button — hidden once frozen (results screen shows "Scan Again") */}
      {!frozen && (
        <button
          type="button"
          onClick={handleScan}
          disabled={!isReady}
          className={[
            'w-full max-w-sm rounded-full py-3.5 text-sm font-bold text-[#1C2030] transition-all',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF916C]',
            !isReady ? 'cursor-not-allowed opacity-60' : 'active:scale-[0.97]',
          ].join(' ')}
          style={{
            background: !isReady
              ? 'rgba(255,145,108,0.4)'
              : 'linear-gradient(135deg, #FF916C 0%, #FF6B3D 100%)',
            boxShadow: !isReady ? 'none' : '0 4px 16px rgba(255,107,61,0.35)',
          }}
        >
          {scanning      ? 'Scanning…'
           : lightWarn   ? 'Fix Lighting to Scan'
           : bufFill === 0   ? 'Detecting face…'
           : bufFill < BUFFER_SIZE ? 'Hold Still…'
           : 'Scan My Face'}
        </button>
      )}

      <p className="text-center text-[11px] text-[#9F9AB5]">
        {frozen
          ? 'Tap "Scan Again" to rescan'
          : bufFill < BUFFER_SIZE
            ? 'Keep your face in the oval and hold still'
            : 'Look straight ahead · Good lighting helps · Face fills the oval'}
      </p>
    </div>
  )
}
