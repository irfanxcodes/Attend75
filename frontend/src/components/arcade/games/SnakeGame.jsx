import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trophy, Zap, Clock, Award, TrendingUp } from 'lucide-react'

// === SNAKE GAME CONFIG ===
const COLS = 14
const ROWS = 14
const CELL = 30          // px per cell

const DIR = { UP: 0, RIGHT: 1, DOWN: 2, LEFT: 3 }
const DX = [0, 1, 0, -1]
const DY = [-1, 0, 1, 0]

const SKINS = [
  { name: 'Mint', head: [104, 238, 170], tail: [31, 150, 110], edge: [13, 77, 57], css: '#3ddc97', ink: '#06281c', food: '#ff7a59' },
  { name: 'Ocean', head: [120, 222, 255], tail: [40, 120, 210], edge: [14, 54, 104], css: '#5cc8ff', ink: '#04263f', food: '#ff7a59' },
  { name: 'Violet', head: [196, 170, 255], tail: [110, 80, 220], edge: [45, 28, 115], css: '#b79cff', ink: '#1d1244', food: '#ff8a5c' },
  { name: 'Rose', head: [255, 160, 196], tail: [214, 60, 120], edge: [107, 23, 64], css: '#ff8fb8', ink: '#4a0d29', food: '#c8f04c' }
]

const BOARD = ['#1a1b35', '#1f2040']
const DEAD = [116, 120, 156]


const INITIAL_SPEED = 150
const MIN_SPEED = 76
const SPEED_STEP = 8
const PER_LEVEL = 3
const MAX_LEVEL = 10
const COMBO_TICKS = 22
const MAX_COMBO = 4
const BONUS_TICKS = 45

// Helper functions
const lerp = (a, b, t) => a + (b - a) * t
const mix = (a, b, t) => `rgb(${a.map((v, i) => Math.round(lerp(v, b[i], t)))})`
const backOut = t => 1 + 3.2 * Math.pow(t - 1, 3) + 2.2 * Math.pow(t - 1, 2)
const fmt = ms => {
  const s = Math.floor(ms / 1000)
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0')
}

function randomFood(snake, stones) {
  const free = []
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (!snake.some(s => s.x === x && s.y === y) && !stones.some(s => s.x === x && s.y === y)) {
        free.push({ x, y })
      }
    }
  }
  return free.length ? free[Math.floor(Math.random() * free.length)] : null
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
    prev: snake.map(p => ({ ...p })),
    dir: DIR.RIGHT,
    nextDir: DIR.RIGHT,
    food: randomFood(snake, []),
    foodAt: performance.now(),
    bonus: null,
    score: 0,
    fruit: 0,
    combo: 0,
    bestCombo: 0,
    since: 999,
    over: false,
    started: false,
    tickMs: INITIAL_SPEED,
    foodPulse: 0,
    bulges: [],
    stones: [],
    playMs: 0,
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

function render(ctx, st, w, h, alpha, skin, parts, floats, deadT) {
  const cell = w / COLS
  const t = performance.now() / 1000
  const dead = deadT >= 0 ? Math.min(deadT / 0.35, 1) : 0

  // Background - checkerboard
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      ctx.fillStyle = BOARD[(x + y) % 2]
      ctx.fillRect(x * cell, y * cell, cell, cell)
    }
  }

  // Food
  if (st.food) {
    const s = backOut(Math.min((performance.now() - st.foodAt) / 400, 1))
    const fx = (st.food.x + 0.5) * cell
    const fy = (st.food.y + 0.5) * cell + Math.sin(t * 4) * cell * 0.04
    const r = cell * 0.34 * s
    const k = (t % 1.3) / 1.3

    // Pulse ring
    ctx.strokeStyle = skin.food
    ctx.globalAlpha = 0.35 * (1 - k)
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(fx, fy, cell * (0.34 + 0.28 * k) * s, 0, Math.PI * 2)
    ctx.stroke()
    ctx.globalAlpha = 1

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.25)'
    ctx.beginPath()
    ctx.ellipse(fx, fy + r * 0.95, r * 0.8, r * 0.25, 0, 0, Math.PI * 2)
    ctx.fill()

    // Food body
    ctx.fillStyle = skin.food
    ctx.beginPath()
    ctx.arc(fx, fy, r, 0, Math.PI * 2)
    ctx.fill()

    // Highlight
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.beginPath()
    ctx.arc(fx - r * 0.35, fy - r * 0.35, r * 0.2, 0, Math.PI * 2)
    ctx.fill()

    // Leaf
    ctx.fillStyle = '#3ddc97'
    ctx.beginPath()
    ctx.ellipse(fx + r * 0.45, fy - r * 0.95, r * 0.45, r * 0.2, -0.6, 0, Math.PI * 2)
    ctx.fill()

    // Stem
    ctx.strokeStyle = '#8a5a44'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(fx, fy - r * 0.8)
    ctx.lineTo(fx + r * 0.1, fy - r * 1.15)
    ctx.stroke()
  }

  // Bonus
  if (st.bonus) {
    const bx = (st.bonus.x + 0.5) * cell
    const by = (st.bonus.y + 0.5) * cell
    const br = cell * 0.3 * (1 + Math.sin(t * 8) * 0.07)

    // Timer ring
    ctx.strokeStyle = '#ffd166'
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.arc(bx, by, cell * 0.46, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (st.bonus.ttl / BONUS_TICKS))
    ctx.stroke()

    // Coin
    ctx.fillStyle = '#ffd166'
    ctx.beginPath()
    ctx.arc(bx, by, br, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#f0a93a'
    ctx.beginPath()
    ctx.arc(bx, by, br * 0.58, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#ffe9a8'
    ctx.beginPath()
    ctx.arc(bx - br * 0.3, by - br * 0.3, br * 0.16, 0, Math.PI * 2)
    ctx.fill()
  }

  // Snake body with interpolation
  const points = st.snake.map((p, i) => {
    const q = st.prev[Math.min(i, st.prev.length - 1)]
    let dx = p.x - q.x
    let dy = p.y - q.y
    // Handle wrap-around
    if (dx > 1) dx -= COLS
    if (dx < -1) dx += COLS
    if (dy > 1) dy -= ROWS
    if (dy < -1) dy += ROWS
    let x = q.x + dx * alpha
    let y = q.y + dy * alpha
    return { x: (x + 0.5) * cell, y: (y + 0.5) * cell }
  })

  const wAt = i => {
    const last = Math.max(1, points.length - 1)
    let w = cell * (0.86 - 0.3 * Math.pow(i / last, 1.3))
    for (const b of st.bulges) {
      w *= 1 + 0.32 * Math.max(0, 1 - Math.abs(i - (b - 1 + alpha)))
    }
    return w
  }

  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  const drawSeg = (i, col, extra) => {
    ctx.strokeStyle = col
    ctx.lineWidth = (wAt(i) + wAt(i + 1)) / 2 + extra
    ctx.beginPath()
    ctx.moveTo(points[i + 1].x, points[i + 1].y)
    ctx.lineTo(points[i].x, points[i].y)
    ctx.stroke()
  }

  // Outline
  for (let i = points.length - 2; i >= 0; i--) {
    const baseCol = dead ? mix(skin.edge, [60, 62, 90], dead) : `rgb(${skin.edge})`
    drawSeg(i, baseCol, 4)
  }

  // Body gradient
  for (let i = points.length - 2; i >= 0; i--) {
    const last = Math.max(1, points.length - 1)
    const baseCol = [0, 1, 2].map(k => lerp(skin.head[k], skin.tail[k], i / last))
    const col = dead ? mix(baseCol, DEAD, dead) : `rgb(${baseCol.map(Math.round)})`
    drawSeg(i, col, 0)
  }

  // Head
  const head = points[0]
  const hr = wAt(0) / 2
  const d = st.dir
  const px = -DY[d]
  const py = DX[d]

  ctx.fillStyle = dead ? mix(skin.head, DEAD, dead) : `rgb(${skin.head})`
  ctx.beginPath()
  ctx.arc(head.x, head.y, hr, 0, Math.PI * 2)
  ctx.fill()

  // Tongue flicker
  if (!dead && (t % 2.6) < 0.4) {
    ctx.strokeStyle = '#ff5d73'
    ctx.lineWidth = 2.5
    const f = (t % 2.6) / 0.4
    const l = cell * 0.35 * Math.sin(f * Math.PI)
    const sx = head.x + DX[d] * hr
    const sy = head.y + DY[d] * hr
    const ex = sx + DX[d] * l
    const ey = sy + DY[d] * l
    ctx.beginPath()
    ctx.moveTo(sx, sy)
    ctx.lineTo(ex, ey)
    ctx.moveTo(ex, ey)
    ctx.lineTo(ex + DX[d] * 4 + px * 3, ey + DY[d] * 4 + py * 3)
    ctx.moveTo(ex, ey)
    ctx.lineTo(ex + DX[d] * 4 - px * 3, ey + DY[d] * 4 - py * 3)
    ctx.stroke()
  }

  // Eyes
  for (const sd of [-1, 1]) {
    const ex = head.x + DX[d] * cell * 0.1 + px * sd * cell * 0.2
    const ey = head.y + DY[d] * cell * 0.1 + py * sd * cell * 0.2
    const er = cell * 0.14

    if (dead > 0.2) {
      // X eyes when dead
      ctx.strokeStyle = '#10122b'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(ex - er * 0.7, ey - er * 0.7)
      ctx.lineTo(ex + er * 0.7, ey + er * 0.7)
      ctx.moveTo(ex + er * 0.7, ey - er * 0.7)
      ctx.lineTo(ex - er * 0.7, ey + er * 0.7)
      ctx.stroke()
    } else {
      // Normal eyes
      ctx.fillStyle = '#fff'
      ctx.beginPath()
      ctx.arc(ex, ey, er, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#10122b'
      ctx.beginPath()
      ctx.arc(ex + DX[d] * er * 0.4, ey + DY[d] * er * 0.4, er * 0.55, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // Particles
  for (const p of parts) {
    const k = 1 - p.life / p.max
    ctx.globalAlpha = k
    ctx.fillStyle = p.c
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.s * k + 0.5, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1

  // Floating score texts
  ctx.font = `700 ${Math.round(cell * 0.62)}px Fredoka, sans-serif`
  ctx.textAlign = 'center'
  ctx.lineJoin = 'round'
  for (const f of floats) {
    ctx.globalAlpha = 1 - f.life / f.max
    ctx.strokeStyle = 'rgba(11,15,29,0.85)'
    ctx.lineWidth = 4
    ctx.strokeText(f.text, f.x, f.y)
    ctx.fillStyle = f.c
    ctx.fillText(f.text, f.x, f.y)
  }
  ctx.globalAlpha = 1

  // Death flash
  if (dead > 0 && dead < 1) {
    ctx.fillStyle = `rgba(255,90,90,${0.22 * (1 - dead)})`
    ctx.fillRect(-20, -20, w + 40, h + 40)
  }

  // Start message
  if (!st.started && !st.over) {
    ctx.fillStyle = 'rgba(11,15,29,0.8)'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#eceefc'
    ctx.font = `bold ${Math.round(cell * 0.7)}px Fredoka, sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText('Tap or press arrow', w / 2, h / 2 - cell * 0.3)
    ctx.font = `${Math.round(cell * 0.5)}px Fredoka, sans-serif`
    ctx.fillStyle = '#98a0d6'
    ctx.fillText('to start', w / 2, h / 2 + cell * 0.4)
  }
}


function SnakeGame({ onGameEnd, onScoreUpdate, isActive }) {
  const navigate = useRef(useNavigate()).current
  const canvasRef = useRef(null)
  const stRef = useRef(null)
  const rafRef = useRef(null)
  const tickTimerRef = useRef(null)
  const endCalledRef = useRef(false)
  const skinRef = useRef(SKINS[0])
  const partsRef = useRef([])
  const floatsRef = useRef([])
  const deadTRef = useRef(-1)
  const alphaRef = useRef(1)
  const sizeRef = useRef({ w: 0, h: 0 })
  const lastFrameRef = useRef(0)

  const [gameStatus, setGameStatus] = useState('idle')   // idle | playing | dead
  const [score, setScore] = useState(0)
  const [fruit, setFruit] = useState(0)
  const [best, setBest] = useState(0)
  const [playTime, setPlayTime] = useState(0)
  const [bestCombo, setBestCombo] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [subResult, setSubResult] = useState(null)

  const onGameEndRef = useRef(onGameEnd)
  const onScoreUpdateRef = useRef(onScoreUpdate)
  useEffect(() => { onGameEndRef.current = onGameEnd }, [onGameEnd])
  useEffect(() => { onScoreUpdateRef.current = onScoreUpdate }, [onScoreUpdate])

  const burst = useCallback((x, y, n, cols) => {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2
      const v = 70 + Math.random() * 190
      partsRef.current.push({
        x, y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: 0,
        max: 0.4 + Math.random() * 0.4,
        s: 2 + Math.random() * 3.5,
        c: cols[i % cols.length]
      })
    }
  }, [])

  const floatText = useCallback((x, y, text, c) => {
    floatsRef.current.push({ x, y, text, c, life: 0, max: 0.9 })
  }, [])

  const updateParticles = useCallback((dt) => {
    const parts = partsRef.current
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]
      p.life += dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vx *= 0.95
      p.vy *= 0.95
      if (p.life > p.max) parts.splice(i, 1)
    }

    const floats = floatsRef.current
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i]
      f.life += dt
      f.y -= 38 * dt
      if (f.life > f.max) floats.splice(i, 1)
    }

    if (deadTRef.current >= 0) deadTRef.current += dt
  }, [])

  const setup = useCallback(() => {
    const cv = canvasRef.current
    if (!cv) return
    const ctr = cv.parentElement
    if (!ctr) return
    const maxW = Math.min(ctr.clientWidth, 520)
    const maxH = maxW
    const dpr = Math.min(window.devicePixelRatio || 1, 3)
    
    cv.style.width = `${maxW}px`
    cv.style.height = `${maxH}px`
    cv.width = Math.round(maxW * dpr)
    cv.height = Math.round(maxH * dpr)
    
    const ctx = cv.getContext('2d')
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    
    sizeRef.current = { w: maxW, h: maxH }
  }, [])

  const tick = useCallback(() => {
    const st = stRef.current
    if (!st || !st.started || st.over) return

    st.prev = st.snake.map(p => ({ ...p }))
    st.dir = st.nextDir

    // Move head
    const head = st.snake[0]
    const newHead = {
      x: (head.x + DX[st.dir] + COLS) % COLS,
      y: (head.y + DY[st.dir] + ROWS) % ROWS,
    }

    // Self-collision
    if (st.snake.some(seg => seg.x === newHead.x && seg.y === newHead.y)) {
      st.over = true
      setGameStatus('dead')
      deadTRef.current = 0
      setBestCombo(st.bestCombo)
      setPlayTime(st.playMs)
      if (!endCalledRef.current) {
        endCalledRef.current = true
        onGameEndRef.current(st.score, st.fruit)
      }
      return
    }

    // Eat food
    const ateFood = st.food && newHead.x === st.food.x && newHead.y === st.food.y
    const ateBonus = st.bonus && newHead.x === st.bonus.x && newHead.y === st.bonus.y

    st.snake.unshift(newHead)
    st.bulges = st.bulges.map(i => i + 1).filter(i => i < st.snake.length)
    st.since++

    if (st.bonus && --st.bonus.ttl <= 0) st.bonus = null

    if (ateFood) {
      st.combo = st.since <= COMBO_TICKS ? Math.min(MAX_COMBO, st.combo + 1) : 1
      st.bestCombo = Math.max(st.bestCombo, st.combo)
      st.since = 0
      st.fruit++
      st.score += st.combo
      st.bulges.push(0)

      const cell = sizeRef.current.w / COLS
      const fx = (newHead.x + 0.5) * cell
      const fy = (newHead.y + 0.5) * cell
      burst(fx, fy, 16, [skinRef.current.food, '#ffd166'])
      floatText(fx, fy - cell * 0.4, '+' + st.combo, st.combo > 1 ? '#ffd166' : '#ffffff')

      st.food = randomFood(st.snake, st.stones)
      st.foodAt = performance.now()

      setScore(st.score)
      setFruit(st.fruit)
      onScoreUpdateRef.current(st.score, st.fruit)

      // Speed up
      const level = Math.min(MAX_LEVEL, 1 + Math.floor(st.fruit / PER_LEVEL))
      st.tickMs = Math.max(MIN_SPEED, INITIAL_SPEED - (level - 1) * SPEED_STEP)

      // Bonus chance
      if (!st.bonus && st.fruit >= 4 && Math.random() < 0.22) {
        const b = randomFood(st.snake, st.stones)
        if (b) st.bonus = { ...b, ttl: BONUS_TICKS }
      }
    } else if (ateBonus) {
      st.score += 5
      st.bulges.push(0)

      const cell = sizeRef.current.w / COLS
      const bx = (newHead.x + 0.5) * cell
      const by = (newHead.y + 0.5) * cell
      burst(bx, by, 22, ['#ffd166', '#fff1b8', '#f0a93a'])
      floatText(bx, by - cell * 0.4, '+5', '#ffd166')

      st.bonus = null
      setScore(st.score)
      onScoreUpdateRef.current(st.score, st.fruit)
    } else {
      st.snake.pop()
    }
  }, [burst, floatText])

  const startTick = useCallback((st) => {
    if (tickTimerRef.current) clearInterval(tickTimerRef.current)
    tickTimerRef.current = setInterval(() => {
      tick()
    }, st.tickMs)
  }, [tick])

  // Render loop
  useEffect(() => {
    setup()
    const st = initState()
    stRef.current = st
    endCalledRef.current = false
    deadTRef.current = -1
    partsRef.current = []
    floatsRef.current = []
    
    setGameStatus('idle')
    setScore(0)
    setFruit(0)
    setBest(0)
    setPlayTime(0)
    setBestCombo(0)
    setSubResult(null)

    startTick(st)

    const drawLoop = (ts) => {
      rafRef.current = requestAnimationFrame(drawLoop)
      const dt = Math.min(0.05, (ts - lastFrameRef.current) / 1000 || 0)
      lastFrameRef.current = ts

      const cv = canvasRef.current
      if (!cv) return
      const ctx = cv.getContext('2d')
      const s = stRef.current
      if (!ctx || !s) return

      // Update particles
      updateParticles(dt)

      // Update play time in game state only
      if (s.started && !s.over) {
        s.playMs += dt * 1000
      }

      // Update alpha for smooth motion
      if (s.started && !s.over) {
        alphaRef.current += dt * 1000 / s.tickMs
        if (alphaRef.current >= 1) alphaRef.current = 0
      }

      const { w, h } = sizeRef.current
      render(ctx, s, w, h, alphaRef.current, skinRef.current, partsRef.current, floatsRef.current, deadTRef.current)
    }
    rafRef.current = requestAnimationFrame(drawLoop)

    const handleKey = (e) => {
      const s = stRef.current
      if (!s) return
      if (!s.started) {
        s.started = true
        setGameStatus('playing')
        return
      }
      const keyMap = {
        ArrowUp: DIR.UP, w: DIR.UP, W: DIR.UP,
        ArrowDown: DIR.DOWN, s: DIR.DOWN, S: DIR.DOWN,
        ArrowLeft: DIR.LEFT, a: DIR.LEFT, A: DIR.LEFT,
        ArrowRight: DIR.RIGHT, d: DIR.RIGHT, D: DIR.RIGHT,
      }
      const newDir = keyMap[e.key]
      if (newDir === undefined) return
      const opposite = (s.dir + 2) % 4
      if (newDir !== opposite) s.nextDir = newDir
      e.preventDefault()
    }

    window.addEventListener('keydown', handleKey)
    window.addEventListener('resize', setup)

    return () => {
      clearInterval(tickTimerRef.current)
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('keydown', handleKey)
      window.removeEventListener('resize', setup)
    }
  }, [setup, startTick, tick, updateParticles])

  // Touch / swipe handler
  const touchRef = useRef({ x: 0, y: 0 })
  const handleTouchStart = useCallback((e) => {
    e.preventDefault()
    touchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    const s = stRef.current
    if (s && !s.started) {
      s.started = true
      setGameStatus('playing')
    }
  }, [])

  const handleTouchEnd = useCallback((e) => {
    e.preventDefault()
    const s = stRef.current
    if (!s || !s.started || s.over) return
    const dx = e.changedTouches[0].clientX - touchRef.current.x
    const dy = e.changedTouches[0].clientY - touchRef.current.y
    if (Math.abs(dx) < 16 && Math.abs(dy) < 16) return
    
    const opposite = (s.dir + 2) % 4
    let newDir
    if (Math.abs(dx) > Math.abs(dy)) {
      newDir = dx > 0 ? DIR.RIGHT : DIR.LEFT
    } else {
      newDir = dy > 0 ? DIR.DOWN : DIR.UP
    }
    if (newDir !== opposite) s.nextDir = newDir
  }, [])

  // Restart when isActive flips
  const prevActiveRef = useRef(isActive)
  useEffect(() => {
    if (isActive && !prevActiveRef.current) {
      clearInterval(tickTimerRef.current)
      const st = initState()
      stRef.current = st
      endCalledRef.current = false
      deadTRef.current = -1
      partsRef.current = []
      floatsRef.current = []
      
      setGameStatus('idle')
      setScore(0)
      setFruit(0)
      setBest(0)
      setPlayTime(0)
      setBestCombo(0)
      setSubResult(null)
      
      onScoreUpdateRef.current(0, 0)
      startTick(st)
    }
    prevActiveRef.current = isActive
  }, [isActive, startTick])

  const handlePlayAgain = useCallback(() => {
    clearInterval(tickTimerRef.current)
    const st = initState()
    stRef.current = st
    endCalledRef.current = false
    deadTRef.current = -1
    partsRef.current = []
    floatsRef.current = []
    alphaRef.current = 1
    
    setGameStatus('idle')
    setScore(0)
    setFruit(0)
    setPlayTime(0)
    setBestCombo(0)
    setSubResult(null)
    
    onScoreUpdateRef.current(0, 0)
    startTick(st)
  }, [startTick])

  const handleLeaderboard = useCallback(() => {
    navigate('/app/arcade/snake?view=leaderboard')
  }, [navigate])

  // Update best score and combo from game state
  useEffect(() => {
    if (score > best) setBest(score)
  }, [score, best])

  return (
    <div className="absolute inset-0 bg-[#0b0f1d]">
      <canvas
        ref={canvasRef}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="absolute inset-0 m-auto block touch-none"
        style={{ maxWidth: '520px', maxHeight: '520px' }}
        aria-label="Snake game"
      />

      {/* Game Over Modal */}
      {gameStatus === 'dead' && (
        <div
          className="absolute inset-0 flex items-center justify-center p-4"
          style={{ 
            background: 'rgba(6,8,24,0.85)', 
            backdropFilter: 'blur(12px)',
            animation: 'fadeIn 0.3s ease-out'
          }}
        >
          <style>{`
            @keyframes fadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            @keyframes slideUp {
              from { 
                opacity: 0;
                transform: translateY(20px);
              }
              to { 
                opacity: 1;
                transform: translateY(0);
              }
            }
            @keyframes scaleIn {
              from { 
                opacity: 0;
                transform: scale(0.9);
              }
              to { 
                opacity: 1;
                transform: scale(1);
              }
            }
            @keyframes shimmer {
              0% { background-position: -200% center; }
              100% { background-position: 200% center; }
            }
          `}</style>
          
          <div
            className="w-full max-w-md flex flex-col gap-5"
            style={{
              animation: 'slideUp 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)'
            }}
          >
            {/* Header */}
            <div className="text-center">
              <div 
                className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-3"
                style={{
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  boxShadow: '0 8px 32px rgba(102,126,234,0.3)',
                  animation: 'scaleIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.1s backwards'
                }}
              >
                <Trophy size={32} strokeWidth={2.5} className="text-white" />
              </div>
              <h2 
                className="text-3xl font-black tracking-tight mb-1"
                style={{
                  background: 'linear-gradient(135deg, #ffffff 0%, #a0a0ff 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  animation: 'slideUp 0.4s ease-out 0.15s backwards'
                }}
              >
                Game Over
              </h2>
              <p 
                className="text-sm text-white/50"
                style={{
                  animation: 'slideUp 0.4s ease-out 0.2s backwards'
                }}
              >
                {score > best ? "New record! Incredible run!" : "Great game! Keep improving!"}
              </p>
            </div>

            {/* Main card */}
            <div
              className="rounded-3xl p-6 flex flex-col gap-5"
              style={{
                background: 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)',
                border: '1px solid rgba(255,255,255,0.15)',
                boxShadow: '0 24px 64px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)',
                backdropFilter: 'blur(20px)',
                animation: 'scaleIn 0.4s ease-out 0.25s backwards'
              }}
            >
              {/* Primary score */}
              <div className="text-center py-4">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <Zap size={18} className="text-white/50" />
                  <span className="text-xs font-bold tracking-widest text-white/50 uppercase">
                    Your Score
                  </span>
                </div>
                <div 
                  className="text-7xl font-black leading-none mb-1"
                  style={{
                    background: 'linear-gradient(135deg, #4ade80 0%, #3b82f6 50%, #a855f7 100%)',
                    backgroundSize: '200% auto',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                    animation: 'shimmer 3s linear infinite'
                  }}
                >
                  {score}
                </div>
                {score > best && (
                  <div 
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full"
                    style={{
                      background: 'rgba(74,222,128,0.15)',
                      border: '1px solid rgba(74,222,128,0.3)'
                    }}
                  >
                    <Award size={14} className="text-green-400" />
                    <span className="text-xs font-bold text-green-400">NEW RECORD!</span>
                  </div>
                )}
              </div>

              {/* Divider */}
              <div style={{ height: 1, background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.1) 50%, transparent 100%)' }} />

              {/* Stats grid */}
              <div className="grid grid-cols-3 gap-3">
                {/* Best */}
                <div 
                  className="rounded-2xl p-3 flex flex-col gap-1"
                  style={{
                    background: 'rgba(255,145,108,0.1)',
                    border: '1px solid rgba(255,145,108,0.2)'
                  }}
                >
                  <div className="flex items-center gap-1.5">
                    <TrendingUp size={14} className="text-[#FF916C]" />
                    <span className="text-[10px] font-bold text-white/60 uppercase tracking-wide">
                      Best
                    </span>
                  </div>
                  <span className="text-2xl font-black text-[#FF916C] leading-none">
                    {best}
                  </span>
                </div>

                {/* Fruit */}
                <div 
                  className="rounded-2xl p-3 flex flex-col gap-1"
                  style={{
                    background: 'rgba(255,145,108,0.1)',
                    border: '1px solid rgba(255,145,108,0.2)'
                  }}
                >
                  <span className="text-[10px] font-bold text-white/60 uppercase tracking-wide">
                    Fruit
                  </span>
                  <span className="text-2xl font-black text-[#ff7a59] leading-none">
                    {fruit}
                  </span>
                </div>

                {/* Time */}
                <div 
                  className="rounded-2xl p-3 flex flex-col gap-1"
                  style={{
                    background: 'rgba(120,222,255,0.1)',
                    border: '1px solid rgba(120,222,255,0.2)'
                  }}
                >
                  <div className="flex items-center gap-1.5">
                    <Clock size={14} className="text-[#78deff]" />
                    <span className="text-[10px] font-bold text-white/60 uppercase tracking-wide">
                      Time
                    </span>
                  </div>
                  <span className="text-2xl font-black text-[#78deff] leading-none">
                    {fmt(playTime)}
                  </span>
                </div>
              </div>

              {/* Combo stat */}
              {bestCombo > 1 && (
                <div 
                  className="rounded-2xl p-4 flex items-center justify-between"
                  style={{
                    background: 'rgba(255,210,63,0.1)',
                    border: '1px solid rgba(255,210,63,0.2)'
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-10 h-10 rounded-full flex items-center justify-center font-black text-lg"
                      style={{
                        background: 'linear-gradient(135deg, #ffd23f 0%, #f0a93a 100%)',
                        color: '#3a2a00'
                      }}
                    >
                      ×{bestCombo}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white/50 uppercase tracking-wide">
                        Top Combo
                      </div>
                      <div className="text-sm font-semibold text-white">
                        Ate {bestCombo} fruits in a row!
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Rank info */}
              {subResult && (
                <div 
                  className="rounded-2xl p-4 flex items-center justify-between"
                  style={{
                    background: 'linear-gradient(135deg, rgba(78,240,160,0.15) 0%, rgba(59,130,246,0.15) 100%)',
                    border: '1px solid rgba(78,240,160,0.25)'
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-10 h-10 rounded-full flex items-center justify-center font-black text-lg"
                      style={{
                        background: 'linear-gradient(135deg, #4EF0A0 0%, #3b82f6 100%)',
                        color: '#0a0c20'
                      }}
                    >
                      {subResult.rank}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white/50 uppercase tracking-wide">
                        Global Rank
                      </div>
                      <div className="text-sm font-semibold text-white">
                        Personal Best: <span className="font-black">{subResult.personal_best}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {submitting && (
                <div className="text-center">
                  <div 
                    className="inline-block w-5 h-5 border-3 border-white/20 border-t-white rounded-full"
                    style={{ animation: 'spin 0.8s linear infinite' }}
                  />
                  <style>{`
                    @keyframes spin {
                      to { transform: rotate(360deg); }
                    }
                  `}</style>
                  <p className="text-xs text-white/50 mt-2">Saving your score...</p>
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex flex-col gap-3">
              {/* Play Again */}
              <button
                onClick={handlePlayAgain}
                className="w-full py-4 rounded-2xl font-black text-white transition-all duration-200 active:scale-[0.97] hover:shadow-2xl"
                style={{
                  background: 'linear-gradient(135deg, #3ddc97 0%, #2aa872 100%)',
                  fontSize: 17,
                  boxShadow: '0 8px 32px rgba(61,220,151,0.4)',
                  letterSpacing: '0.02em'
                }}
              >
                🐍 Play Again
              </button>

              {/* Leaderboard */}
              <button
                onClick={handleLeaderboard}
                className="w-full py-4 rounded-2xl flex items-center justify-center gap-2 font-bold transition-all duration-200 active:scale-[0.97]"
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  color: 'rgba(255,255,255,0.8)',
                  fontSize: 16
                }}
              >
                <Trophy size={18} strokeWidth={2.5} />
                View Leaderboard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default SnakeGame
