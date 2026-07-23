import { useCallback, useEffect, useRef, useState } from 'react'

// --- Game Constants ---
const GRAVITY = 1800
const JUMP_VELOCITY = -450
const PIPE_SPEED = 200
const PIPE_GAP = 150
const PIPE_WIDTH = 60
const PIPE_SPACING = 250
const BIRD_SIZE = 30
const GAME_WIDTH = 400
const GAME_HEIGHT = 750
const GROUND_HEIGHT = 50

// --- Colors ---
const COLORS = {
  background1: '#5B5878',
  background2: '#4A466A',
  bird: '#FF916C',
  birdOutline: '#E07A58',
  pipeBody: '#7B77A0',
  pipeHighlight: '#8D89B0',
  pipeCap: '#9490B8',
  ground: '#3A3658',
  groundLine: '#2D2A4A',
  scoreText: '#F7F4FF',
}

// --- Pre-generated static data ---
const STARS = Array.from({ length: 25 }, () => ({
  x: Math.random(),
  y: Math.random() * 0.55,
  size: 1 + Math.random() * 1.5,
  opacity: 0.15 + Math.random() * 0.25,
}))

const BUILDINGS = (() => {
  const arr = []
  let x = 0
  while (x < 1.2) {
    const w = 0.06 + Math.random() * 0.07
    const h = 0.1 + Math.random() * 0.18
    const winRows = Math.floor(Math.random() * 3) + 1
    const winOpacities = Array.from({ length: winRows * 2 }, () => 0.15 + Math.random() * 0.15)
    arr.push({ x, w, h, winRows, winOpacities })
    x += w + 0.01 + Math.random() * 0.02
  }
  return arr
})()

// --- States ---
const STATE_READY = 0
const STATE_PLAYING = 1
const STATE_GAME_OVER = 2

function FlappyGame({ onGameEnd, onScoreUpdate, isActive }) {
  const canvasRef = useRef(null)
  const stateRef = useRef(null)
  const rafRef = useRef(null)
  const inputRef = useRef(false)
  const lastTimeRef = useRef(0)
  const endCalledRef = useRef(false)
  const pausedRef = useRef(false)
  const bgCanvasRef = useRef(null) // offscreen background canvas
  const canvasSizeRef = useRef({ w: 0, h: 0 })
  const [isPaused, setIsPaused] = useState(false)

  // --- Create initial state ---
  const createState = useCallback(() => ({
    status: STATE_READY,
    birdX: GAME_WIDTH * 0.25,
    birdY: GAME_HEIGHT * 0.45,
    birdVel: 0,
    pipes: [],
    score: 0,
    pipeTimer: 0,
  }), [])

  // --- Generate pipe ---
  const genPipe = useCallback((x) => {
    const minCenter = PIPE_GAP / 2 + 60
    const maxCenter = GAME_HEIGHT - PIPE_GAP / 2 - GROUND_HEIGHT - 30
    const center = minCenter + Math.random() * (maxCenter - minCenter)
    return { x, gapTop: center - PIPE_GAP / 2, gapBottom: center + PIPE_GAP / 2, scored: false }
  }, [])

  // --- Render static background to offscreen canvas ---
  const renderBackground = useCallback((w, h) => {
    let offscreen = bgCanvasRef.current
    if (!offscreen || offscreen.width !== w || offscreen.height !== h) {
      offscreen = document.createElement('canvas')
      offscreen.width = w
      offscreen.height = h
      bgCanvasRef.current = offscreen
    }

    const ctx = offscreen.getContext('2d')
    const scaleX = w / GAME_WIDTH
    const scaleY = h / GAME_HEIGHT
    const groundY = (GAME_HEIGHT - GROUND_HEIGHT) * scaleY

    // Background gradient
    const grad = ctx.createLinearGradient(0, 0, 0, h)
    grad.addColorStop(0, COLORS.background1)
    grad.addColorStop(1, COLORS.background2)
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, w, h)

    // Stars
    for (const s of STARS) {
      ctx.fillStyle = `rgba(247,244,255,${s.opacity})`
      ctx.beginPath()
      ctx.arc(s.x * w, s.y * h, s.size, 0, 6.283)
      ctx.fill()
    }

    // Buildings
    for (const b of BUILDINGS) {
      const bx = b.x * w
      const bw = b.w * w
      const bh = b.h * h
      const by = groundY - bh

      ctx.fillStyle = 'rgba(45,42,74,0.6)'
      ctx.fillRect(bx, by, bw, bh)

      // Windows
      const winW = bw * 0.2
      const winH = bh / (b.winRows * 2.5)
      const gapX = (bw - 2 * winW) / 3
      const gapY = (bh - b.winRows * winH) / (b.winRows + 1)

      let idx = 0
      for (let row = 0; row < b.winRows; row++) {
        for (let col = 0; col < 2; col++) {
          const wx = bx + gapX * (col + 1) + winW * col
          const wy = by + gapY * (row + 1) + winH * row
          ctx.fillStyle = `rgba(167,139,250,${b.winOpacities[idx++]})`
          ctx.fillRect(wx, wy, winW, winH)
        }
      }
    }

    // Ground
    ctx.fillStyle = COLORS.ground
    ctx.fillRect(0, groundY, w, h - groundY)
    ctx.fillStyle = COLORS.groundLine
    ctx.fillRect(0, groundY, w, 2)

    return offscreen
  }, [])

  // --- Main render (called every frame) ---
  const render = useCallback((ctx, state, w, h) => {
    const scaleX = w / GAME_WIDTH
    const scaleY = h / GAME_HEIGHT

    // Blit cached background
    const bg = bgCanvasRef.current
    if (bg) {
      ctx.drawImage(bg, 0, 0, w, h)
    }

    // Pipes (flat color, no gradients for perf)
    for (let i = 0; i < state.pipes.length; i++) {
      const pipe = state.pipes[i]
      const px = pipe.x * scaleX
      const pw = PIPE_WIDTH * scaleX
      const capH = 18 * scaleY

      // Top pipe
      ctx.fillStyle = COLORS.pipeBody
      ctx.fillRect(px, 0, pw, pipe.gapTop * scaleY)
      ctx.fillStyle = COLORS.pipeCap
      ctx.fillRect(px - 3, pipe.gapTop * scaleY - capH, pw + 6, capH)

      // Bottom pipe
      const bottomY = pipe.gapBottom * scaleY
      ctx.fillStyle = COLORS.pipeBody
      ctx.fillRect(px, bottomY, pw, h - bottomY)
      ctx.fillStyle = COLORS.pipeCap
      ctx.fillRect(px - 3, bottomY, pw + 6, capH)
    }

    // Bird
    const bx = state.birdX * scaleX
    const by = state.birdY * scaleY
    const bSize = BIRD_SIZE * scaleX
    const halfSize = bSize / 2
    const radius = bSize * 0.3

    ctx.save()
    ctx.translate(bx, by)
    const rot = Math.max(-0.4, Math.min(0.6, state.birdVel / 800))
    ctx.rotate(rot)

    // Body
    ctx.fillStyle = COLORS.bird
    ctx.beginPath()
    ctx.roundRect(-halfSize, -halfSize, bSize, bSize, radius)
    ctx.fill()

    // Outline
    ctx.strokeStyle = COLORS.birdOutline
    ctx.lineWidth = 2
    ctx.stroke()

    // Eye
    ctx.fillStyle = '#FFF'
    ctx.beginPath()
    ctx.arc(bSize * 0.15, -bSize * 0.1, bSize * 0.2, 0, 6.283)
    ctx.fill()
    ctx.fillStyle = '#1D183E'
    ctx.beginPath()
    ctx.arc(bSize * 0.2, -bSize * 0.1, bSize * 0.1, 0, 6.283)
    ctx.fill()

    ctx.restore()

    // Score
    ctx.fillStyle = 'rgba(0,0,0,0.4)'
    ctx.font = `bold ${Math.round(36 * scaleX)}px system-ui,-apple-system,sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText(String(state.score), w / 2 + 2, 60 * scaleY + 2)
    ctx.fillStyle = COLORS.scoreText
    ctx.fillText(String(state.score), w / 2, 60 * scaleY)

    // Ready state text
    if (state.status === STATE_READY) {
      ctx.fillStyle = 'rgba(247,244,255,0.8)'
      ctx.font = `${Math.round(16 * scaleX)}px system-ui,-apple-system,sans-serif`
      ctx.fillText('Tap or press Space to start', w / 2, GAME_HEIGHT * 0.58 * scaleY)
    }
  }, [])

  // --- Game loop ---
  const loop = useCallback((timestamp) => {
    const state = stateRef.current
    if (!state || state.status === STATE_GAME_OVER || pausedRef.current) return

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) return

    // Delta time
    if (!lastTimeRef.current) lastTimeRef.current = timestamp
    const dt = Math.min((timestamp - lastTimeRef.current) / 1000, 0.033) // cap at ~30fps minimum
    lastTimeRef.current = timestamp

    // Input
    if (inputRef.current) {
      inputRef.current = false
      if (state.status === STATE_READY) {
        state.status = STATE_PLAYING
        state.birdVel = JUMP_VELOCITY
      } else if (state.status === STATE_PLAYING) {
        state.birdVel = JUMP_VELOCITY
      }
    }

    // Physics
    if (state.status === STATE_PLAYING) {
      state.birdVel += GRAVITY * dt
      state.birdY += state.birdVel * dt

      state.pipeTimer += PIPE_SPEED * dt
      if (state.pipeTimer >= PIPE_SPACING) {
        state.pipeTimer -= PIPE_SPACING
        const last = state.pipes[state.pipes.length - 1]
        state.pipes.push(genPipe(last ? last.x + PIPE_SPACING : GAME_WIDTH + 50))
      }

      // Move and cull pipes
      let i = state.pipes.length
      while (i--) {
        state.pipes[i].x -= PIPE_SPEED * dt
        if (state.pipes[i].x + PIPE_WIDTH < -10) {
          state.pipes.splice(i, 1)
        }
      }

      // Score
      for (const pipe of state.pipes) {
        if (!pipe.scored && pipe.x + PIPE_WIDTH < state.birdX - BIRD_SIZE / 2) {
          pipe.scored = true
          state.score += 1
          onScoreUpdate(state.score)
        }
      }

      // Collision
      const bLeft = state.birdX - BIRD_SIZE / 2
      const bRight = state.birdX + BIRD_SIZE / 2
      const bTop = state.birdY - BIRD_SIZE / 2
      const bBot = state.birdY + BIRD_SIZE / 2

      if (bBot >= GAME_HEIGHT - GROUND_HEIGHT || bTop <= 0) {
        state.status = STATE_GAME_OVER
      } else {
        for (const p of state.pipes) {
          if (bRight > p.x && bLeft < p.x + PIPE_WIDTH) {
            if (bTop < p.gapTop || bBot > p.gapBottom) {
              state.status = STATE_GAME_OVER
              break
            }
          }
        }
      }

      if (state.status === STATE_GAME_OVER && !endCalledRef.current) {
        endCalledRef.current = true
        onGameEnd(state.score)
        return
      }
    }

    // Render
    const { w, h } = canvasSizeRef.current
    render(ctx, state, w, h)

    rafRef.current = requestAnimationFrame(loop)
  }, [genPipe, render, onGameEnd, onScoreUpdate])

  // --- Setup canvas ---
  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const container = canvas.parentElement
    if (!container) return

    const dpr = window.devicePixelRatio || 1
    const containerWidth = container.clientWidth
    // On desktop/large screens, cap the game width to a phone-like width
    const maxGameWidth = 420
    const cw = Math.min(containerWidth, maxGameWidth)
    const maxH = window.innerHeight - 140
    let ch = cw * (GAME_HEIGHT / GAME_WIDTH)
    if (ch > maxH) ch = maxH

    canvas.style.width = `${cw}px`
    canvas.style.height = `${ch}px`
    canvas.width = Math.round(cw * dpr)
    canvas.height = Math.round(ch * dpr)

    canvasSizeRef.current = { w: cw, h: ch }

    const ctx = canvas.getContext('2d', { alpha: false })
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    // Rebuild offscreen background at native resolution
    renderBackground(cw, ch)
  }, [renderBackground])

  // --- Start game ---
  const startGame = useCallback(() => {
    endCalledRef.current = false
    lastTimeRef.current = 0
    inputRef.current = false
    pausedRef.current = false
    setIsPaused(false)

    const state = createState()
    const firstX = GAME_WIDTH + 100
    state.pipes.push(genPipe(firstX))
    state.pipes.push(genPipe(firstX + PIPE_SPACING))
    state.pipes.push(genPipe(firstX + PIPE_SPACING * 2))
    stateRef.current = state

    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(loop)
  }, [createState, genPipe, loop])

  // --- Visibility change ---
  const onVisChange = useCallback(() => {
    const state = stateRef.current
    if (!state) return
    if (document.hidden) {
      if (state.status !== STATE_GAME_OVER) {
        pausedRef.current = true
        setIsPaused(true)
        if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
      }
    } else if (pausedRef.current) {
      pausedRef.current = false
      setIsPaused(false)
      lastTimeRef.current = 0
      rafRef.current = requestAnimationFrame(loop)
    }
  }, [loop])

  // --- Input handlers ---
  const onTap = useCallback((e) => { e.preventDefault(); inputRef.current = true }, [])
  const onKey = useCallback((e) => {
    if (e.code === 'Space' || e.key === ' ') { e.preventDefault(); inputRef.current = true }
  }, [])

  // --- Effects ---
  useEffect(() => {
    setupCanvas()
    startGame()

    const onResize = () => {
      setupCanvas()
      const state = stateRef.current
      if (state) {
        const canvas = canvasRef.current
        if (canvas) {
          const ctx = canvas.getContext('2d', { alpha: false })
          if (ctx) {
            const { w, h } = canvasSizeRef.current
            render(ctx, state, w, h)
          }
        }
      }
    }

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
  }, [setupCanvas, startGame, onKey, onVisChange, render])

  // --- Restart on isActive change ---
  const prevActiveRef = useRef(isActive)
  useEffect(() => {
    if (isActive && !prevActiveRef.current) {
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
      onScoreUpdate(0)
      startGame()
    }
    prevActiveRef.current = isActive
  }, [isActive, startGame, onScoreUpdate])

  return (
    <div className="relative w-full overflow-hidden rounded-xl flex justify-center">
      <canvas
        ref={canvasRef}
        onClick={onTap}
        onTouchStart={onTap}
        className="block cursor-pointer rounded-xl touch-none"
        aria-label="Flappy game canvas — tap to play"
        role="img"
      />
      {isPaused && (
        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/60">
          <span className="text-2xl font-bold text-white">Paused</span>
        </div>
      )}
    </div>
  )
}

export default FlappyGame
