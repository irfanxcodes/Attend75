import { useCallback, useEffect, useRef, useState } from 'react'

// === SNAKE GAME ===
const COLS = 20
const ROWS = 20
const CELL = 20          // px per cell (logical)
const GW = COLS * CELL   // 400
const GH = ROWS * CELL   // 400

const DIR = { UP: 0, RIGHT: 1, DOWN: 2, LEFT: 3 }
const DX = [0, 1, 0, -1]
const DY = [-1, 0, 1, 0]

const COLORS = {
  bg: '#1A1A2E',
  grid: 'rgba(255,255,255,0.03)',
  snakeHead: '#4EF0A0',
  snakeBody: '#2DC078',
  snakeOutline: '#1A9A58',
  food: '#FF916C',
  foodGlow: 'rgba(255,145,108,0.4)',
  text: '#F7F4FF',
  textDim: '#9F9AB5',
  scoreColor: '#4EF0A0',
}

const INITIAL_SPEED = 150   // ms per tick (lower = faster)
const MIN_SPEED = 65        // max speed cap
const SPEED_STEP = 5        // ms faster every 5 points

function randomFood(snake) {
  let pos
  do {
    pos = {
      x: Math.floor(Math.random() * COLS),
      y: Math.floor(Math.random() * ROWS),
    }
  } while (snake.some(s => s.x === pos.x && s.y === pos.y))
  return pos
}

function initState() {
  const head = { x: Math.floor(COLS / 2), y: Math.floor(ROWS / 2) }
  const snake = [
    head,
    { x: head.x - 1, y: head.y },
    { x: head.x - 2, y: head.y },
  ]
  return {
    snake,
    dir: DIR.RIGHT,
    nextDir: DIR.RIGHT,
    food: randomFood(snake),
    score: 0,
    over: false,
    started: false,
    tickMs: INITIAL_SPEED,
    // food animation
    foodPulse: 0,
  }
}

function drawRoundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.arcTo(x + w, y, x + w, y + r, r)
  ctx.lineTo(x + w, y + h - r)
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
  ctx.lineTo(x + r, y + h)
  ctx.arcTo(x, y + h, x, y + h - r, r)
  ctx.lineTo(x, y + r)
  ctx.arcTo(x, y, x + r, y, r)
  ctx.closePath()
}

function render(ctx, st, w, h) {
  const sx = w / GW
  const sy = h / GH
  const cs = CELL * sx  // cell size in canvas px

  // Background
  ctx.fillStyle = COLORS.bg
  ctx.fillRect(0, 0, w, h)

  // Grid
  ctx.strokeStyle = COLORS.grid
  ctx.lineWidth = 0.5
  for (let c = 0; c <= COLS; c++) {
    ctx.beginPath()
    ctx.moveTo(c * cs, 0)
    ctx.lineTo(c * cs, h)
    ctx.stroke()
  }
  for (let r = 0; r <= ROWS; r++) {
    ctx.beginPath()
    ctx.moveTo(0, r * cs * (sy / sx))
    ctx.lineTo(w, r * cs * (sy / sx))
    ctx.stroke()
  }

  // Food glow
  const fx = (st.food.x + 0.5) * cs
  const fy = (st.food.y + 0.5) * cs * (sy / sx)
  const pulse = 0.7 + 0.3 * Math.sin(st.foodPulse * 0.15)
  const glowR = cs * 0.9 * pulse
  const grd = ctx.createRadialGradient(fx, fy, 0, fx, fy, glowR)
  grd.addColorStop(0, COLORS.foodGlow)
  grd.addColorStop(1, 'transparent')
  ctx.fillStyle = grd
  ctx.beginPath()
  ctx.arc(fx, fy, glowR, 0, Math.PI * 2)
  ctx.fill()

  // Food circle
  ctx.fillStyle = COLORS.food
  ctx.beginPath()
  ctx.arc(fx, fy, cs * 0.32 * pulse, 0, Math.PI * 2)
  ctx.fill()

  // Snake body (tail to neck)
  for (let i = st.snake.length - 1; i >= 1; i--) {
    const seg = st.snake[i]
    const t = i / (st.snake.length - 1)  // 1 = tail, 0 = neck
    const alpha = 0.5 + 0.5 * (1 - t)
    ctx.fillStyle = COLORS.snakeBody
    ctx.globalAlpha = alpha
    const pad = cs * 0.1
    const r = cs * 0.3
    drawRoundedRect(ctx, seg.x * cs + pad, seg.y * cs * (sy / sx) + pad, cs - pad * 2, cs - pad * 2, r)
    ctx.fill()
  }
  ctx.globalAlpha = 1

  // Snake head
  const head = st.snake[0]
  ctx.fillStyle = COLORS.snakeHead
  const hpad = cs * 0.08
  drawRoundedRect(ctx, head.x * cs + hpad, head.y * cs * (sy / sx) + hpad, cs - hpad * 2, cs - hpad * 2, cs * 0.35)
  ctx.fill()
  // Head outline
  ctx.strokeStyle = COLORS.snakeOutline
  ctx.lineWidth = 1.5
  ctx.stroke()

  // Eyes
  const eyeSize = cs * 0.1
  const eyeOffset = cs * 0.22
  ctx.fillStyle = '#1A1A2E'
  // eye positions depend on direction
  let e1x, e1y, e2x, e2y
  const hcx = (head.x + 0.5) * cs
  const hcy = (head.y + 0.5) * cs * (sy / sx)
  if (st.dir === DIR.RIGHT)  { e1x = hcx + eyeOffset; e1y = hcy - eyeOffset; e2x = hcx + eyeOffset; e2y = hcy + eyeOffset }
  else if (st.dir === DIR.LEFT) { e1x = hcx - eyeOffset; e1y = hcy - eyeOffset; e2x = hcx - eyeOffset; e2y = hcy + eyeOffset }
  else if (st.dir === DIR.UP)   { e1x = hcx - eyeOffset; e1y = hcy - eyeOffset; e2x = hcx + eyeOffset; e2y = hcy - eyeOffset }
  else                          { e1x = hcx - eyeOffset; e1y = hcy + eyeOffset; e2x = hcx + eyeOffset; e2y = hcy + eyeOffset }
  ctx.beginPath(); ctx.arc(e1x, e1y, eyeSize, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(e2x, e2y, eyeSize, 0, Math.PI * 2); ctx.fill()

  // Ready overlay
  if (!st.started && !st.over) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = COLORS.text
    ctx.font = `bold ${Math.round(cs * 0.9)}px system-ui`
    ctx.textAlign = 'center'
    ctx.fillText('Tap or press any key', w / 2, h / 2 - cs * 0.5)
    ctx.font = `${Math.round(cs * 0.65)}px system-ui`
    ctx.fillStyle = COLORS.textDim
    ctx.fillText('to start', w / 2, h / 2 + cs * 0.3)
  }
}

function SnakeGame({ onGameEnd, onScoreUpdate, isActive, initialScore = 0 }) {
  const canvasRef = useRef(null)
  const stRef = useRef(null)
  const rafRef = useRef(null)
  const tickTimerRef = useRef(null)
  const endRef = useRef(false)
  const pausedRef = useRef(false)
  const [paused, setPaused] = useState(false)
  const scaleRef = useRef({ sx: 1, sy: 1, w: 0, h: 0 })
  const initialScoreRef = useRef(initialScore)
  useEffect(() => { initialScoreRef.current = initialScore }, [initialScore])

  const onGameEndRef = useRef(onGameEnd)
  const onScoreUpdateRef = useRef(onScoreUpdate)
  useEffect(() => { onGameEndRef.current = onGameEnd }, [onGameEnd])
  useEffect(() => { onScoreUpdateRef.current = onScoreUpdate }, [onScoreUpdate])

  const setup = useCallback(() => {
    const cv = canvasRef.current
    if (!cv) return
    const ctr = cv.parentElement
    if (!ctr) return
    const maxW = Math.min(ctr.clientWidth, 420)
    const dpr = window.devicePixelRatio || 1
    const h = maxW  // square
    cv.style.width = `${maxW}px`
    cv.style.height = `${h}px`
    cv.width = Math.round(maxW * dpr)
    cv.height = Math.round(h * dpr)
    const ctx = cv.getContext('2d')
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    scaleRef.current = { sx: maxW / GW, sy: h / GH, w: maxW, h }
  }, [])

  const startTick = useCallback((st) => {
    if (tickTimerRef.current) clearInterval(tickTimerRef.current)
    tickTimerRef.current = setInterval(() => {
      if (!stRef.current || pausedRef.current || stRef.current.over || !stRef.current.started) return

      const s = stRef.current
      // Apply queued direction
      s.dir = s.nextDir

      // Move head
      const head = s.snake[0]
      const newHead = {
        x: (head.x + DX[s.dir] + COLS) % COLS,
        y: (head.y + DY[s.dir] + ROWS) % ROWS,
      }

      // Self-collision
      if (s.snake.some(seg => seg.x === newHead.x && seg.y === newHead.y)) {
        s.over = true
        if (!endRef.current) {
          endRef.current = true
          onGameEndRef.current(s.score)
        }
        return
      }

      // Eat food
      const ateFood = newHead.x === s.food.x && newHead.y === s.food.y
      s.snake.unshift(newHead)
      if (ateFood) {
        s.score++
        onScoreUpdateRef.current(s.score)
        s.food = randomFood(s.snake)
        // Speed up every 5 points
        s.tickMs = Math.max(MIN_SPEED, INITIAL_SPEED - Math.floor(s.score / 5) * SPEED_STEP)
        startTick(s)  // restart with new speed
      } else {
        s.snake.pop()
      }
    }, st.tickMs)
  }, [])

  // Render loop
  useEffect(() => {
    setup()
    const st = initState()
    st.score = initialScoreRef.current
    stRef.current = st
    endRef.current = false
    startTick(st)

    const drawLoop = () => {
      rafRef.current = requestAnimationFrame(drawLoop)
      const cv = canvasRef.current
      if (!cv) return
      const ctx = cv.getContext('2d')
      const s = stRef.current
      if (!ctx || !s) return
      s.foodPulse++
      const { w, h } = scaleRef.current
      render(ctx, s, w, h)
    }
    rafRef.current = requestAnimationFrame(drawLoop)

    const handleKey = (e) => {
      const s = stRef.current
      if (!s) return
      if (!s.started) { s.started = true; return }
      const keyMap = {
        ArrowUp: DIR.UP, w: DIR.UP, W: DIR.UP,
        ArrowDown: DIR.DOWN, s: DIR.DOWN, S: DIR.DOWN,
        ArrowLeft: DIR.LEFT, a: DIR.LEFT, A: DIR.LEFT,
        ArrowRight: DIR.RIGHT, d: DIR.RIGHT, D: DIR.RIGHT,
      }
      const newDir = keyMap[e.key]
      if (newDir === undefined) return
      // Prevent reversing
      const opposite = (s.dir + 2) % 4
      if (newDir !== opposite) s.nextDir = newDir
      e.preventDefault()
    }

    const handleVis = () => {
      if (document.hidden) { pausedRef.current = true; setPaused(true) }
      else { pausedRef.current = false; setPaused(false) }
    }

    window.addEventListener('keydown', handleKey)
    document.addEventListener('visibilitychange', handleVis)
    window.addEventListener('resize', setup)

    return () => {
      clearInterval(tickTimerRef.current)
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('keydown', handleKey)
      document.removeEventListener('visibilitychange', handleVis)
      window.removeEventListener('resize', setup)
    }
  }, [setup, startTick])

  // Touch / tap handler
  const touchRef = useRef({ x: 0, y: 0 })
  const handleTouchStart = useCallback((e) => {
    e.preventDefault()
    touchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    const s = stRef.current
    if (s && !s.started) { s.started = true }
  }, [])

  const handleTouchEnd = useCallback((e) => {
    e.preventDefault()
    const s = stRef.current
    if (!s || !s.started || s.over) return
    const dx = e.changedTouches[0].clientX - touchRef.current.x
    const dy = e.changedTouches[0].clientY - touchRef.current.y
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return  // tap, not swipe
    const opposite = (s.dir + 2) % 4
    let newDir
    if (Math.abs(dx) > Math.abs(dy)) {
      newDir = dx > 0 ? DIR.RIGHT : DIR.LEFT
    } else {
      newDir = dy > 0 ? DIR.DOWN : DIR.UP
    }
    if (newDir !== opposite) s.nextDir = newDir
  }, [])

  // isActive restart
  const prevActiveRef = useRef(isActive)
  useEffect(() => {
    if (isActive && !prevActiveRef.current) {
      clearInterval(tickTimerRef.current)
      const st = initState()
      st.score = initialScoreRef.current
      stRef.current = st
      endRef.current = false
      onScoreUpdateRef.current(initialScoreRef.current)
      startTick(st)
    }
    prevActiveRef.current = isActive
  }, [isActive, startTick])

  return (
    <div className="relative w-full overflow-hidden rounded-xl">
      <canvas
        ref={canvasRef}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="mx-auto block touch-none rounded-xl"
        aria-label="Snake game — swipe to change direction"
      />
      {paused && (
        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/70">
          <span className="text-xl font-bold text-yellow-400">PAUSED</span>
        </div>
      )}
    </div>
  )
}

export default SnakeGame
