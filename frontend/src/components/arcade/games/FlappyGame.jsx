import { useCallback, useEffect, useRef, useState } from 'react'

// ─── Game Constants ──────────────────────────────────────────────────────────
const GRAVITY            = 1400
const JUMP_VELOCITY      = -420
const PIPE_SPEED_MIN     = 130
const PIPE_SPEED_MAX     = 280
const PIPE_GAP_MAX       = 210
const PIPE_GAP_MIN       = 120
const PIPE_WIDTH         = 52
const PIPE_SPACING_MAX   = 320
const PIPE_SPACING_MIN   = 200
const BIRD_SIZE          = 32
const GAME_WIDTH         = 400
const GAME_HEIGHT        = 700
const GROUND_HEIGHT      = 48

const STATE_READY     = 0
const STATE_PLAYING   = 1
const STATE_GAME_OVER = 2

// ─── Difficulty ──────────────────────────────────────────────────────────────
function getDifficulty(score) {
  let t = score <= 60
    ? (score / 60) * 0.3
    : 0.3 + ((score - 60) / 40) * 0.7
  t = Math.min(t, 1)
  return {
    pipeSpeed:   PIPE_SPEED_MIN + (PIPE_SPEED_MAX - PIPE_SPEED_MIN) * t,
    pipeGap:     PIPE_GAP_MAX  - (PIPE_GAP_MAX   - PIPE_GAP_MIN)   * t,
    pipeSpacing: PIPE_SPACING_MAX - (PIPE_SPACING_MAX - PIPE_SPACING_MIN) * t,
  }
}

// ─── Static scene data ───────────────────────────────────────────────────────
const STARS = Array.from({ length: 35 }, (_, i) => ({
  x:       (i * 137.5) % 1,
  y:       (i * 97.3)  % 0.60,
  size:    1 + (i % 3) * 0.8,
  opacity: 0.2 + (i % 5) * 0.08,
}))

const BUILDINGS = (() => {
  const arr = []; let x = 0
  while (x < 1.25) {
    const w = 0.055 + (arr.length * 0.013) % 0.065
    const h = 0.10  + (arr.length * 0.031) % 0.20
    arr.push({ x, w, h })
    x += w + 0.008 + (arr.length * 0.007) % 0.018
  }
  return arr
})()

// ─── Web Audio helper ────────────────────────────────────────────────────────
function makeAudio() {
  let ctx = null
  function getCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)()
    return ctx
  }
  function playTone(freq, type, dur, gain = 0.18) {
    try {
      const ac  = getCtx()
      const osc = ac.createOscillator()
      const g   = ac.createGain()
      osc.connect(g); g.connect(ac.destination)
      osc.type = type; osc.frequency.value = freq
      g.gain.setValueAtTime(gain, ac.currentTime)
      g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur)
      osc.start(); osc.stop(ac.currentTime + dur)
    } catch {}
  }
  return {
    flap:  () => playTone(520, 'sine',   0.08, 0.15),
    score: () => { playTone(880, 'sine', 0.06, 0.12); setTimeout(() => playTone(1100, 'sine', 0.1, 0.12), 60) },
    hit:   () => playTone(140, 'sawtooth', 0.22, 0.25),
  }
}

// ─── Component ───────────────────────────────────────────────────────────────
function FlappyGame({ onGameEnd, onScoreUpdate, isActive, initialScore = 0 }) {
  const canvasRef       = useRef(null)
  const stateRef        = useRef(null)
  const rafRef          = useRef(null)
  const inputRef        = useRef(false)
  const lastTimeRef     = useRef(0)
  const endCalledRef    = useRef(false)
  const pausedRef       = useRef(false)
  const bgCanvasRef     = useRef(null)
  const canvasSizeRef   = useRef({ w: 0, h: 0 })
  const audioRef        = useRef(null)
  const mutedRef        = useRef(false)
  const initialScoreRef = useRef(initialScore)
  const loopRef         = useRef(null)
  const lastTouchRef    = useRef(0)

  const [gameStatus, setGameStatus] = useState(STATE_READY)
  const [score,      setScore]      = useState(initialScore)
  const [bestScore,  setBestScore]  = useState(() => {
    try { return parseInt(localStorage.getItem('flappy_best') || '0', 10) } catch { return 0 }
  })
  const [isMuted,  setIsMuted]  = useState(false)
  const [isPaused, setIsPaused] = useState(false)

  useEffect(() => { initialScoreRef.current = initialScore }, [initialScore])

  // ── Audio ────────────────────────────────────────────────────────────────
  const getAudio = useCallback(() => {
    if (!audioRef.current) audioRef.current = makeAudio()
    return audioRef.current
  }, [])

  const playSound = useCallback((name) => {
    if (mutedRef.current) return
    getAudio()[name]?.()
  }, [getAudio])

  // ── State factory ────────────────────────────────────────────────────────
  const createState = useCallback(() => ({
    status:    STATE_READY,
    birdX:     GAME_WIDTH * 0.25,
    birdY:     GAME_HEIGHT * 0.42,
    birdVel:   0,
    pipes:     [],
    score:     initialScoreRef.current,
    pipeTimer: 0,
    wobble:    0,   // idle bobbing phase
  }), [])

  const genPipe = useCallback((x, gap) => {
    const g = gap || PIPE_GAP_MAX
    const minC = g / 2 + 60
    const maxC = GAME_HEIGHT - g / 2 - GROUND_HEIGHT - 30
    const center = minC + Math.random() * (maxC - minC)
    return { x, gapTop: center - g / 2, gapBottom: center + g / 2, scored: false }
  }, [])

  // ── Background ───────────────────────────────────────────────────────────
  const renderBackground = useCallback((w, h) => {
    let off = bgCanvasRef.current
    if (!off || off.width !== w || off.height !== h) {
      off = document.createElement('canvas')
      off.width = w; off.height = h
      bgCanvasRef.current = off
    }
    const ctx    = off.getContext('2d')
    const gndY   = (GAME_HEIGHT - GROUND_HEIGHT) * (h / GAME_HEIGHT)

    // Sky gradient
    const grad = ctx.createLinearGradient(0, 0, 0, h)
    grad.addColorStop(0,   '#2e2b52')
    grad.addColorStop(0.5, '#3d3a6e')
    grad.addColorStop(1,   '#4a4680')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, w, h)

    // Moon
    const mx = w * 0.78, my = h * 0.22, mr = w * 0.095
    ctx.beginPath()
    ctx.arc(mx, my, mr * 1.35, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(200,195,230,0.18)'
    ctx.fill()
    ctx.beginPath()
    ctx.arc(mx, my, mr, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(220,215,240,0.82)'
    ctx.fill()

    // Stars
    for (const s of STARS) {
      ctx.fillStyle = `rgba(255,255,255,${s.opacity})`
      ctx.beginPath()
      ctx.arc(s.x * w, s.y * h, s.size, 0, Math.PI * 2)
      ctx.fill()
    }

    // City skyline — two layers for depth
    const scaleX = w / GAME_WIDTH
    const scaleY = h / GAME_HEIGHT

    // Back layer (darker, taller)
    for (const b of BUILDINGS) {
      const bx = b.x * w
      const bw = b.w * w * 1.1
      const bh = b.h * h * 1.1
      ctx.fillStyle = 'rgba(32,28,62,0.75)'
      ctx.fillRect(bx - bw * 0.05, gndY - bh, bw, bh)
    }
    // Front layer (mid-tone)
    for (const b of BUILDINGS) {
      const bx = (b.x + b.w * 0.3) * w
      const bw = b.w * w * 0.85
      const bh = b.h * h * 0.78
      ctx.fillStyle = 'rgba(45,42,80,0.85)'
      ctx.fillRect(bx, gndY - bh, bw, bh)

      // Windows
      const cols = 2, ww = bw * 0.18, wh = bh * 0.09
      const gx = (bw - cols * ww) / (cols + 1)
      const rows = Math.floor(bh / (wh * 2.8))
      const gy = wh * 1.8
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const alpha = (((b.x * 31 + r * 7 + c * 13) % 10) > 5) ? 0.22 : 0.08
          ctx.fillStyle = `rgba(167,139,250,${alpha})`
          ctx.fillRect(bx + gx * (c + 1) + ww * c, gndY - bh + wh + gy * r, ww, wh)
        }
      }
    }

    // Ground
    const groundGrad = ctx.createLinearGradient(0, gndY, 0, h)
    groundGrad.addColorStop(0, '#322f5e')
    groundGrad.addColorStop(1, '#26234a')
    ctx.fillStyle = groundGrad
    ctx.fillRect(0, gndY, w, h - gndY)

    // Ground line (purple-ish stripe)
    ctx.fillStyle = '#7b76b0'
    ctx.fillRect(0, gndY, w, 2)
    ctx.fillStyle = 'rgba(123,118,176,0.3)'
    ctx.fillRect(0, gndY + 2, w, 4)

    return off
  }, [])

  // ── Per-frame render ─────────────────────────────────────────────────────
  const render = useCallback((ctx, state, w, h) => {
    const scaleX = w / GAME_WIDTH
    const scaleY = h / GAME_HEIGHT

    // Background
    if (bgCanvasRef.current) ctx.drawImage(bgCanvasRef.current, 0, 0, w, h)

    // Teal pipes
    for (const pipe of state.pipes) {
      const px  = pipe.x * scaleX
      const pw  = PIPE_WIDTH * scaleX
      const capH = 20 * scaleY
      const capW  = pw + 10 * scaleX
      const capX  = px - 5 * scaleX
      const r    = 6 * scaleX   // cap corner radius

      // ── Top pipe ──
      const topH = pipe.gapTop * scaleY

      // Body
      const tg = ctx.createLinearGradient(px, 0, px + pw, 0)
      tg.addColorStop(0,   '#3ecfad')
      tg.addColorStop(0.4, '#4de8c5')
      tg.addColorStop(1,   '#2aab8f')
      ctx.fillStyle = tg
      ctx.fillRect(px, 0, pw, topH - capH)

      // Cap (rounded bottom)
      ctx.fillStyle = '#4de8c5'
      ctx.beginPath()
      ctx.roundRect(capX, topH - capH, capW, capH, [0, 0, r, r])
      ctx.fill()
      // Cap shade
      ctx.fillStyle = 'rgba(0,0,0,0.12)'
      ctx.beginPath()
      ctx.roundRect(capX + capW * 0.6, topH - capH, capW * 0.4, capH, [0, 0, r, 0])
      ctx.fill()
      // Highlight
      ctx.fillStyle = 'rgba(255,255,255,0.18)'
      ctx.fillRect(px + pw * 0.1, 0, pw * 0.2, topH - capH)

      // ── Bottom pipe ──
      const botY = pipe.gapBottom * scaleY
      const botH = h - botY

      const bg2 = ctx.createLinearGradient(px, 0, px + pw, 0)
      bg2.addColorStop(0,   '#3ecfad')
      bg2.addColorStop(0.4, '#4de8c5')
      bg2.addColorStop(1,   '#2aab8f')
      ctx.fillStyle = bg2
      ctx.fillRect(px, botY + capH, pw, botH)

      // Cap (rounded top)
      ctx.fillStyle = '#4de8c5'
      ctx.beginPath()
      ctx.roundRect(capX, botY, capW, capH, [r, r, 0, 0])
      ctx.fill()
      ctx.fillStyle = 'rgba(0,0,0,0.12)'
      ctx.beginPath()
      ctx.roundRect(capX + capW * 0.6, botY, capW * 0.4, capH, [0, r, 0, 0])
      ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.18)'
      ctx.fillRect(px + pw * 0.1, botY + capH, pw * 0.2, botH)
    }

    // ── Bird ──
    const bx     = state.birdX * scaleX
    const by     = state.birdY * scaleY
    const bSize  = BIRD_SIZE * scaleX
    const half   = bSize / 2
    const rot    = Math.max(-0.45, Math.min(0.65, state.birdVel / 800))

    ctx.save()
    ctx.translate(bx, by)
    ctx.rotate(rot)

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.18)'
    ctx.beginPath()
    ctx.ellipse(2, half * 0.9, half * 0.85, half * 0.25, 0, 0, Math.PI * 2)
    ctx.fill()

    // Body
    const bGrad = ctx.createRadialGradient(-half * 0.2, -half * 0.2, 0, 0, 0, bSize * 0.72)
    bGrad.addColorStop(0, '#ffaa80')
    bGrad.addColorStop(0.6, '#FF916C')
    bGrad.addColorStop(1,   '#d96840')
    ctx.fillStyle = bGrad
    ctx.beginPath()
    ctx.roundRect(-half, -half, bSize, bSize, bSize * 0.30)
    ctx.fill()

    // Outline
    ctx.strokeStyle = '#c85a30'
    ctx.lineWidth = 1.5
    ctx.stroke()

    // Eye white
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(half * 0.28, -half * 0.18, half * 0.38, 0, Math.PI * 2)
    ctx.fill()
    // Pupil
    ctx.fillStyle = '#1D183E'
    ctx.beginPath()
    ctx.arc(half * 0.36, -half * 0.12, half * 0.20, 0, Math.PI * 2)
    ctx.fill()
    // Pupil shine
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(half * 0.42, -half * 0.22, half * 0.07, 0, Math.PI * 2)
    ctx.fill()

    // Wing (small rounded flap)
    ctx.fillStyle = 'rgba(255,130,80,0.7)'
    ctx.beginPath()
    ctx.ellipse(-half * 0.1, half * 0.15, half * 0.45, half * 0.22, -0.3, 0, Math.PI * 2)
    ctx.fill()

    // Beak
    ctx.fillStyle = '#f5a623'
    ctx.beginPath()
    ctx.moveTo(half * 0.7,  -half * 0.05)
    ctx.lineTo(half * 1.15, -half * 0.25)
    ctx.lineTo(half * 1.15,  half * 0.1)
    ctx.closePath()
    ctx.fill()

    ctx.restore()

    // ── Live score (during play) ──
    if (state.status === STATE_PLAYING) {
      const fs = Math.round(38 * scaleX)
      ctx.font = `900 ${fs}px -apple-system,system-ui,sans-serif`
      ctx.textAlign = 'center'
      ctx.fillStyle = 'rgba(0,0,0,0.35)'
      ctx.fillText(String(state.score), w / 2 + 2, 62 * scaleY + 2)
      ctx.fillStyle = '#fff'
      ctx.fillText(String(state.score), w / 2, 62 * scaleY)
    }
  }, [])

  // ── Game loop ────────────────────────────────────────────────────────────
  const loop = useCallback((ts) => {
    const state = stateRef.current
    if (!state || state.status === STATE_GAME_OVER || pausedRef.current) return

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) return

    if (!lastTimeRef.current) lastTimeRef.current = ts
    const dt = Math.min((ts - lastTimeRef.current) / 1000, 0.033)
    lastTimeRef.current = ts

    // Input
    if (inputRef.current) {
      inputRef.current = false
      if (state.status === STATE_READY) {
        state.status = STATE_PLAYING
        setGameStatus(STATE_PLAYING)
        state.birdVel = JUMP_VELOCITY
        playSound('flap')
      } else if (state.status === STATE_PLAYING) {
        state.birdVel = JUMP_VELOCITY
        playSound('flap')
      }
    }

    // Physics
    if (state.status === STATE_PLAYING) {
      const { pipeSpeed, pipeGap, pipeSpacing } = getDifficulty(state.score)

      state.birdVel += GRAVITY * dt
      state.birdY   += state.birdVel * dt

      // Idle bob in READY is handled separately
      state.pipeTimer += pipeSpeed * dt
      if (state.pipeTimer >= pipeSpacing) {
        state.pipeTimer -= pipeSpacing
        const last = state.pipes[state.pipes.length - 1]
        state.pipes.push(genPipe(last ? last.x + pipeSpacing : GAME_WIDTH + 50, pipeGap))
      }

      // Move & cull pipes
      for (let i = state.pipes.length - 1; i >= 0; i--) {
        state.pipes[i].x -= pipeSpeed * dt
        if (state.pipes[i].x + PIPE_WIDTH < -20) state.pipes.splice(i, 1)
      }

      // Score
      for (const pipe of state.pipes) {
        if (!pipe.scored && pipe.x + PIPE_WIDTH < state.birdX - BIRD_SIZE / 2) {
          pipe.scored = true
          state.score += 1
          setScore(state.score)
          onScoreUpdate(state.score)
          playSound('score')
        }
      }

      // Collision
      const bL = state.birdX - BIRD_SIZE / 2
      const bR = state.birdX + BIRD_SIZE / 2
      const bT = state.birdY - BIRD_SIZE / 2
      const bB = state.birdY + BIRD_SIZE / 2

      let dead = bB >= GAME_HEIGHT - GROUND_HEIGHT || bT <= 0
      if (!dead) {
        for (const p of state.pipes) {
          if (bR > p.x + 4 && bL < p.x + PIPE_WIDTH - 4) {
            if (bT < p.gapTop + 4 || bB > p.gapBottom - 4) { dead = true; break }
          }
        }
      }

      if (dead && !endCalledRef.current) {
        endCalledRef.current = true
        state.status = STATE_GAME_OVER
        playSound('hit')
        // clamp to ground
        state.birdY = Math.min(state.birdY, GAME_HEIGHT - GROUND_HEIGHT - BIRD_SIZE / 2)
        setGameStatus(STATE_GAME_OVER)
        setBestScore(prev => {
          const nb = Math.max(prev, state.score)
          try { localStorage.setItem('flappy_best', String(nb)) } catch {}
          return nb
        })
        onGameEnd(state.score)
        // Render final frame then stop
        const { w, h } = canvasSizeRef.current
        render(ctx, state, w, h)
        return
      }
    } else if (state.status === STATE_READY) {
      // Gentle idle bob
      state.wobble = (state.wobble || 0) + dt * 2.2
      state.birdY = GAME_HEIGHT * 0.42 + Math.sin(state.wobble) * 10
    }

    const { w, h } = canvasSizeRef.current
    render(ctx, state, w, h)
    rafRef.current = requestAnimationFrame(loopRef.current)
  }, [genPipe, render, onGameEnd, onScoreUpdate, playSound])

  useEffect(() => { loopRef.current = loop }, [loop])

  // ── Canvas setup ─────────────────────────────────────────────────────────
  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const container = canvas.parentElement
    if (!container) return
    const dpr = window.devicePixelRatio || 1
    const cw  = Math.min(container.clientWidth, 420)
    const maxH = window.innerHeight
    let ch = cw * (GAME_HEIGHT / GAME_WIDTH)
    if (ch > maxH) ch = maxH

    canvas.style.width  = `${cw}px`
    canvas.style.height = `${ch}px`
    canvas.width  = Math.round(cw * dpr)
    canvas.height = Math.round(ch * dpr)
    canvasSizeRef.current = { w: cw, h: ch }

    const ctx = canvas.getContext('2d', { alpha: false })
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    renderBackground(cw, ch)
  }, [renderBackground])

  // ── Start / restart ──────────────────────────────────────────────────────
  const startGame = useCallback(() => {
    endCalledRef.current = false
    lastTimeRef.current  = 0
    inputRef.current     = false
    pausedRef.current    = false
    setIsPaused(false)
    setGameStatus(STATE_READY)
    setScore(initialScoreRef.current)

    const state = createState()
    const ix = GAME_WIDTH + 100
    state.pipes.push(genPipe(ix,                   PIPE_GAP_MAX))
    state.pipes.push(genPipe(ix + PIPE_SPACING_MAX, PIPE_GAP_MAX))
    state.pipes.push(genPipe(ix + PIPE_SPACING_MAX * 2, PIPE_GAP_MAX))
    stateRef.current = state

    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(loopRef.current)
  }, [createState, genPipe])

  // ── Input handlers ───────────────────────────────────────────────────────
  const onTouchTap = useCallback((e) => {
    e.preventDefault()
    lastTouchRef.current = Date.now()
    inputRef.current = true
  }, [])
  const onClickTap = useCallback((e) => {
    if (Date.now() - lastTouchRef.current < 300) return
    e.preventDefault()
    inputRef.current = true
  }, [])
  const onKey = useCallback((e) => {
    if (e.code === 'Space' || e.key === ' ') { e.preventDefault(); inputRef.current = true }
  }, [])

  const togglePause = useCallback(() => {
    const state = stateRef.current
    if (!state || state.status !== STATE_PLAYING) return
    if (pausedRef.current) {
      pausedRef.current = false
      setIsPaused(false)
      lastTimeRef.current = 0
      rafRef.current = requestAnimationFrame(loopRef.current)
    } else {
      pausedRef.current = true
      setIsPaused(true)
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    }
  }, [])

  const toggleMute = useCallback(() => {
    mutedRef.current = !mutedRef.current
    setIsMuted(mutedRef.current)
  }, [])

  // ── Visibility change ────────────────────────────────────────────────────
  const onVisChange = useCallback(() => {
    const state = stateRef.current
    if (!state) return
    if (document.hidden && state.status === STATE_PLAYING && !pausedRef.current) {
      pausedRef.current = true; setIsPaused(true)
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    } else if (!document.hidden && pausedRef.current) {
      pausedRef.current = false; setIsPaused(false)
      lastTimeRef.current = 0
      rafRef.current = requestAnimationFrame(loopRef.current)
    }
  }, [])

  // ── Effects ──────────────────────────────────────────────────────────────
  useEffect(() => {
    setupCanvas()
    startGame()
    const onResize = () => { setupCanvas() }
    window.addEventListener('resize', onResize)
    window.addEventListener('keydown', onKey)
    document.addEventListener('visibilitychange', onVisChange)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('visibilitychange', onVisChange)
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
      stateRef.current = null
    }
  }, [setupCanvas, startGame, onKey, onVisChange])

  const prevActiveRef = useRef(isActive)
  useEffect(() => {
    if (isActive && !prevActiveRef.current) {
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
      onScoreUpdate(initialScoreRef.current)
      startGame()
    }
    prevActiveRef.current = isActive
  }, [isActive, startGame, onScoreUpdate])

  // ── Retry (game-over → restart) ──────────────────────────────────────────
  const handleRetry = useCallback(() => {
    startGame()
  }, [startGame])

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="relative w-full h-full overflow-hidden flex justify-center items-start bg-[#2e2b52]">
      {/* Canvas */}
      <canvas
        ref={canvasRef}
        onClick={onClickTap}
        onTouchStart={onTouchTap}
        className="block touch-none cursor-pointer"
        aria-label="Flappy Bird game — tap to play"
        role="img"
      />

      {/* ── Sound button (top-left) ── */}
      <button
        onClick={toggleMute}
        className="absolute top-3 left-3 z-20 w-11 h-11 rounded-xl flex items-center justify-center transition-transform active:scale-90"
        style={{ background: 'rgba(30,27,60,0.72)', backdropFilter: 'blur(8px)', border: '1.5px solid rgba(255,255,255,0.12)' }}
        aria-label={isMuted ? 'Unmute' : 'Mute'}
      >
        {isMuted ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a09ac8" strokeWidth="2" strokeLinecap="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="#a09ac8" stroke="none"/>
            <line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a09ac8" strokeWidth="2" strokeLinecap="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="#a09ac8" stroke="none"/>
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" stroke="#a09ac8"/>
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" stroke="#a09ac8"/>
          </svg>
        )}
      </button>

      {/* ── Pause button (top-right) ── */}
      {gameStatus === STATE_PLAYING && (
        <button
          onClick={togglePause}
          className="absolute top-3 right-3 z-20 w-11 h-11 rounded-xl flex items-center justify-center transition-transform active:scale-90"
          style={{ background: 'rgba(30,27,60,0.72)', backdropFilter: 'blur(8px)', border: '1.5px solid rgba(255,255,255,0.12)' }}
          aria-label={isPaused ? 'Resume' : 'Pause'}
        >
          {isPaused ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#a09ac8">
              <polygon points="5,3 19,12 5,21"/>
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#a09ac8">
              <rect x="6" y="4" width="4" height="16" rx="1"/>
              <rect x="14" y="4" width="4" height="16" rx="1"/>
            </svg>
          )}
        </button>
      )}

      {/* ── READY screen overlay ── */}
      {gameStatus === STATE_READY && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-start pt-[14%] pointer-events-none select-none">
          {/* Title */}
          <div
            className="font-black tracking-wider text-white mb-2 drop-shadow-lg"
            style={{ fontSize: 'clamp(44px, 12vw, 64px)', fontFamily: "'Arial Black', Arial, sans-serif", letterSpacing: '0.04em',
              textShadow: '0 4px 24px rgba(0,0,0,0.4), 0 2px 0 rgba(0,0,0,0.3)' }}
          >
            FLAPPY
          </div>
          <div className="text-white/70 font-semibold mb-4" style={{ fontSize: 'clamp(13px,3.5vw,18px)' }}>
            Fly through the gaps
          </div>
          {/* Best score badge */}
          <div
            className="flex items-center gap-2 px-5 py-2 rounded-full mb-8"
            style={{ background: 'rgba(30,27,60,0.6)', border: '1.5px solid rgba(255,255,255,0.12)' }}
          >
            <span className="font-black tracking-widest" style={{ color: '#FF916C', fontSize: 'clamp(12px,3vw,16px)' }}>
              BEST {bestScore}
            </span>
          </div>

          {/* Tap hint */}
          <div
            className="absolute font-medium text-white/55"
            style={{ bottom: '14%', fontSize: 'clamp(12px,3vw,15px)' }}
          >
            Tap or press Space to start
          </div>
        </div>
      )}

      {/* ── PAUSED overlay ── */}
      {isPaused && gameStatus === STATE_PLAYING && (
        <div className="absolute inset-0 z-20 flex items-center justify-center"
          style={{ background: 'rgba(20,18,45,0.65)', backdropFilter: 'blur(4px)' }}>
          <div className="flex flex-col items-center gap-4 px-10 py-8 rounded-3xl"
            style={{ background: 'rgba(26,24,54,0.92)', border: '1.5px solid rgba(255,255,255,0.1)' }}>
            <div className="text-white font-black text-2xl tracking-wider">PAUSED</div>
            <button onClick={togglePause}
              className="px-8 py-3 rounded-full font-bold text-white transition-transform active:scale-95"
              style={{ background: 'linear-gradient(135deg, #FF916C, #e06040)', fontSize: 15 }}>
              Resume
            </button>
          </div>
        </div>
      )}

      {/* ── GAME OVER overlay ── */}
      {gameStatus === STATE_GAME_OVER && (
        <div className="absolute inset-0 z-20 flex items-center justify-center"
          style={{ background: 'rgba(20,18,45,0.55)' }}>
          <div
            className="flex flex-col items-center rounded-3xl px-8 py-7 mx-6 w-full max-w-[320px]"
            style={{ background: 'rgba(26,24,60,0.96)', border: '1.5px solid rgba(255,255,255,0.1)',
              boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}
          >
            <div className="font-black text-white tracking-widest mb-5"
              style={{ fontSize: 'clamp(22px,6vw,30px)', fontFamily: "'Arial Black', Arial, sans-serif",
                textShadow: '0 2px 12px rgba(0,0,0,0.4)' }}>
              GAME OVER
            </div>

            {/* Score row */}
            <div className="flex gap-8 mb-6">
              <div className="flex flex-col items-center">
                <span className="text-white/50 font-bold tracking-widest text-xs mb-1">SCORE</span>
                <span className="text-white font-black" style={{ fontSize: 'clamp(32px,9vw,48px)',
                  lineHeight: 1, textShadow: '0 2px 8px rgba(0,0,0,0.3)' }}>{score}</span>
              </div>
              <div className="w-px bg-white/10" />
              <div className="flex flex-col items-center">
                <span className="text-white/50 font-bold tracking-widest text-xs mb-1">BEST</span>
                <span className="font-black" style={{ fontSize: 'clamp(32px,9vw,48px)',
                  lineHeight: 1, color: '#FF916C', textShadow: '0 2px 8px rgba(0,0,0,0.3)' }}>{bestScore}</span>
              </div>
            </div>

            {/* Retry button */}
            <button
              onClick={handleRetry}
              className="w-full py-4 rounded-full font-black text-white transition-transform active:scale-95"
              style={{ background: 'linear-gradient(135deg, #FF916C 0%, #e06040 100%)',
                fontSize: 'clamp(15px,4vw,18px)', letterSpacing: '0.02em',
                boxShadow: '0 6px 24px rgba(255,100,60,0.4), inset 0 2px 0 rgba(255,255,255,0.2)' }}
            >
              Tap to retry
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default FlappyGame
