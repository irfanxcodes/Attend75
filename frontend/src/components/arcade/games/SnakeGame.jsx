import { useCallback, useEffect, useRef, useState } from 'react'

/* ================= config ================= */
const CFG = {
  cols: 14,
  minRows: 11,
  maxRows: 24,
  maxBoardW: 520,
  len: 3,
  baseMs: 150,
  stepMs: 8,
  minMs: 76,
  perLevel: 3,
  maxLevel: 10,
  comboTicks: 22,
  maxCombo: 4,
  bonusTicks: 45,
  swipe: 16
}

const DIR = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } }

const MODES = {
  classic: ['Classic', 'Hitting a wall ends the run.'],
  wrap: ['Wrap', 'Edges loop around. Only your own tail is deadly.'],
  maze: ['Maze', 'Walls and stones are deadly. Plan your route.']
}

const SKINS = [
  { name: 'Mint', head: [104, 238, 170], tail: [31, 150, 110], edge: [13, 77, 57], css: '#3ddc97', ink: '#06281c', food: '#ff7a59' },
  { name: 'Ocean', head: [120, 222, 255], tail: [40, 120, 210], edge: [14, 54, 104], css: '#5cc8ff', ink: '#04263f', food: '#ff7a59' },
  { name: 'Violet', head: [196, 170, 255], tail: [110, 80, 220], edge: [45, 28, 115], css: '#b79cff', ink: '#1d1244', food: '#ff8a5c' },
  { name: 'Rose', head: [255, 160, 196], tail: [214, 60, 120], edge: [107, 23, 64], css: '#ff8fb8', ink: '#4a0d29', food: '#c8f04c' }
]

const BOARD = ['#1a1b35', '#1f2040']
const DEAD = [116, 120, 156]

const lerp = (a, b, t) => a + (b - a) * t
const mix = (a, b, t) => `rgb(${a.map((v, i) => Math.round(lerp(v, b[i], t)))})`
const backOut = t => 1 + 3.2 * Math.pow(t - 1, 3) + 2.2 * Math.pow(t - 1, 2)
const fmt = ms => {
  const s = Math.floor(ms / 1000)
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0')
}

function rr(c, x, y, w, h, r) {
  c.beginPath()
  c.moveTo(x + r, y)
  c.arcTo(x + w, y, x + w, y + h, r)
  c.arcTo(x + w, y + h, x, y + h, r)
  c.arcTo(x, y + h, x, y, r)
  c.arcTo(x, y, x + w, y, r)
  c.closePath()
}

/* ================= storage ================= */
const Store = {
  d: { best: { classic: 0, wrap: 0, maze: 0 }, mute: false, mode: 'classic', skin: 0, ctl: 'swipe' },
  load() {
    try {
      const s = JSON.parse(localStorage.getItem('snake.v3') || '{}')
      Object.assign(this.d, s)
      this.d.best = Object.assign({ classic: 0, wrap: 0, maze: 0 }, s.best)
    } catch (e) { }
  },
  save() {
    try { localStorage.setItem('snake.v3', JSON.stringify(this.d)) } catch (e) { }
  }
}

/* ================= sound ================= */
const Sfx = {
  ac: null,
  unlock() {
    try {
      this.ac = this.ac || new (window.AudioContext || window.webkitAudioContext)()
      if (this.ac.state === 'suspended') this.ac.resume()
    } catch (e) { }
  },
  tone(f, d, type = 'sine', to = f, v = 0.06) {
    if (Store.d.mute || !this.ac) return
    try {
      const n = this.ac.currentTime
      const o = this.ac.createOscillator()
      const g = this.ac.createGain()
      o.type = type
      o.frequency.setValueAtTime(f, n)
      o.frequency.exponentialRampToValueAtTime(to, n + d)
      g.gain.setValueAtTime(v, n)
      g.gain.exponentialRampToValueAtTime(0.0001, n + d)
      o.connect(g).connect(this.ac.destination)
      o.start()
      o.stop(n + d)
    } catch (e) { }
  },
  eat(c) {
    const b = 520 + c * 70
    this.tone(b, 0.09, 'triangle', b * 1.7)
    setTimeout(() => this.tone(b * 1.7, 0.12, 'triangle', b * 2.5), 70)
  },
  gold() { [660, 880, 1320].forEach((f, i) => setTimeout(() => this.tone(f, 0.12, 'triangle', f * 1.2, 0.06), i * 70)) },
  tick() { this.tone(440, 0.08, 'square', 440, 0.03) },
  go() { this.tone(660, 0.25, 'triangle', 990, 0.06) },
  up() { this.tone(400, 0.15, 'triangle', 800, 0.05) },
  die() { this.tone(230, 0.5, 'sawtooth', 45, 0.08) }
}

/* ================= game rules ================= */
class Game {
  constructor(cols, rows, mode) {
    this.cols = cols
    this.rows = rows
    this.mode = mode
    this.reset()
  }

  reset() {
    const y = this.rows >> 1
    const x0 = Math.floor(this.cols / 3)
    this.snake = Array.from({ length: CFG.len }, (_, i) => ({ x: x0 - i, y }))
    this.prev = this.snake.map(p => ({ ...p }))
    this.dir = DIR.right
    this.queue = []
    this.score = 0
    this.fruit = 0
    this.combo = 0
    this.bestCombo = 0
    this.since = 999
    this.bulges = []
    this.alive = true
    this.eaten = null
    this.bonus = null
    this.stones = []
    if (this.mode === 'maze') this.placeStones(y, x0)
    this.food = this.spawn()
    this.foodAt = performance.now()
  }

  get level() { return Math.min(CFG.maxLevel, 1 + Math.floor(this.fruit / CFG.perLevel)) }
  get interval() { return Math.max(CFG.minMs, CFG.baseMs - (this.level - 1) * CFG.stepMs) }
  get comboOn() { return this.combo > 1 && this.since <= CFG.comboTicks }

  placeStones(y, x0) {
    let tries = 0
    const n = Math.round(this.cols * this.rows * 0.05)
    while (this.stones.length < n && tries++ < 500) {
      const x = Math.floor(Math.random() * this.cols)
      const yy = Math.floor(Math.random() * this.rows)
      if (Math.abs(yy - y) <= 1 && x <= x0 + 5) continue
      if (this.stones.some(s => Math.abs(s.x - x) <= 1 && Math.abs(s.y - yy) <= 1)) continue
      this.stones.push({ x, y: yy })
    }
  }

  isFree(x, y) {
    const at = p => p && p.x === x && p.y === y
    return !this.snake.some(at) && !this.stones.some(at) && !at(this.food) && !at(this.bonus)
  }

  spawn() {
    const free = []
    for (let y = 0; y < this.rows; y++)
      for (let x = 0; x < this.cols; x++)
        if (this.isFree(x, y)) free.push({ x, y })
    return free.length ? free[Math.floor(Math.random() * free.length)] : null
  }

  turn(d) {
    const last = this.queue.length ? this.queue[this.queue.length - 1] : this.dir
    if (d === last || (d.x === -last.x && d.y === -last.y)) return
    if (this.queue.length < 2) this.queue.push(d)
  }

  next(d) {
    let x = this.snake[0].x + d.x
    let y = this.snake[0].y + d.y
    if (this.mode === 'wrap') {
      x = (x + this.cols) % this.cols
      y = (y + this.rows) % this.rows
    } else if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return { x, y, hit: 'wall' }
    if (this.stones.some(s => s.x === x && s.y === y)) return { x, y, hit: 'stone' }
    const eat = (this.food && this.food.x === x && this.food.y === y) || (this.bonus && this.bonus.x === x && this.bonus.y === y)
    if ((eat ? this.snake : this.snake.slice(0, -1)).some(p => p.x === x && p.y === y)) return { x, y, hit: 'self' }
    return { x, y, hit: null }
  }

  safe(d) { return !this.next(d).hit }

  tick() {
    this.prev = this.snake.map(p => ({ x: p.x, y: p.y }))
    if (this.queue.length) this.dir = this.queue.shift()
    const n = this.next(this.dir)
    if (n.hit) { this.alive = false; return n.hit }
    const head = { x: n.x, y: n.y }
    const isFood = this.food && head.x === this.food.x && head.y === this.food.y
    const isGold = this.bonus && head.x === this.bonus.x && head.y === this.bonus.y
    this.snake.unshift(head)
    this.bulges = this.bulges.map(i => i + 1).filter(i => i < this.snake.length)
    this.since++
    if (this.bonus && --this.bonus.ttl <= 0) this.bonus = null
    let res = 'move'
    if (isFood) {
      this.combo = this.since <= CFG.comboTicks ? Math.min(CFG.maxCombo, this.combo + 1) : 1
      this.bestCombo = Math.max(this.bestCombo, this.combo)
      this.since = 0
      this.fruit++
      this.score += this.combo
      this.eaten = { x: head.x, y: head.y, pts: this.combo, combo: this.combo }
      this.food = null
      this.food = this.spawn()
      this.foodAt = performance.now()
      if (!this.food) { this.alive = false; return 'win' }
      if (!this.bonus && this.fruit >= 4 && Math.random() < 0.22) {
        const b = this.spawn()
        if (b) this.bonus = { ...b, ttl: CFG.bonusTicks }
      }
      res = 'eat'
    } else if (isGold) {
      this.score += 5
      this.eaten = { x: head.x, y: head.y, pts: 5, gold: true }
      this.bonus = null
      res = 'gold'
    }
    if (res === 'move') this.snake.pop()
    else this.bulges.push(0)
    return res
  }
}

/* ================= rendering ================= */
class Renderer {
  constructor(cv) {
    this.cv = cv
    this.ctx = cv.getContext('2d')
    this.bg = document.createElement('canvas')
    this.parts = []
    this.floats = []
    this.shake = 0
    this.deadT = -1
    this.cell = 30
    this.skin = SKINS[0]
  }

  fit(cols, rows, cell) {
    const d = this.dpr = Math.min(window.devicePixelRatio || 1, 3)
    this.cell = cell
    this.w = cols * cell
    this.h = rows * cell
    for (const c of [this.cv, this.bg]) {
      c.width = this.w * d
      c.height = this.h * d
    }
    this.cv.style.width = this.w + 'px'
    this.cv.style.height = this.h + 'px'
    const b = this.bg.getContext('2d')
    b.setTransform(d, 0, 0, d, 0, 0)
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        b.fillStyle = BOARD[(x + y) % 2]
        b.fillRect(x * cell, y * cell, cell, cell)
      }
  }

  burst(x, y, n, cols) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283
      const v = 70 + Math.random() * 190
      this.parts.push({
        x, y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: 0,
        max: 0.4 + Math.random() * 0.4,
        s: 2 + Math.random() * 3.5,
        c: cols[i % cols.length]
      })
    }
  }

  float(x, y, text, c) { this.floats.push({ x, y, text, c, life: 0, max: 0.9 }) }

  update(dt) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i]
      p.life += dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vx *= 0.95
      p.vy *= 0.95
      if (p.life > p.max) this.parts.splice(i, 1)
    }
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i]
      f.life += dt
      f.y -= 38 * dt
      if (f.life > f.max) this.floats.splice(i, 1)
    }
    this.shake = Math.max(0, this.shake - dt * 40)
    if (this.deadT >= 0) this.deadT += dt
  }

  points(g, a) {
    const c = this.cell
    const wrap = g.mode === 'wrap'
    return g.snake.map((p, i) => {
      const q = g.prev[Math.min(i, g.prev.length - 1)]
      let dx = p.x - q.x
      let dy = p.y - q.y
      if (wrap) {
        if (dx > 1) dx -= g.cols
        if (dx < -1) dx += g.cols
        if (dy > 1) dy -= g.rows
        if (dy < -1) dy += g.rows
      }
      let x = q.x + dx * a
      let y = q.y + dy * a
      if (wrap) {
        x = (x % g.cols + g.cols) % g.cols
        y = (y % g.rows + g.rows) % g.rows
      }
      return { x: (x + 0.5) * c, y: (y + 0.5) * c }
    })
  }

  draw(g, now, a) {
    const c = this.ctx
    const cell = this.cell
    const t = now / 1000
    const dead = this.deadT >= 0 ? Math.min(this.deadT / 0.35, 1) : 0
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    if (this.shake > 0.3) c.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake)
    c.drawImage(this.bg, 0, 0, this.w, this.h)
    this.stones(c, g)
    this.food(c, g, now, t)
    this.bonus(c, g, t)
    this.snakeBody(c, g, a, t, dead)
    for (const p of this.parts) {
      const k = 1 - p.life / p.max
      c.globalAlpha = k
      c.fillStyle = p.c
      c.beginPath()
      c.arc(p.x, p.y, p.s * k + 0.5, 0, 6.283)
      c.fill()
    }
    c.globalAlpha = 1
    c.font = `700 ${Math.round(cell * 0.62)}px Fredoka, sans-serif`
    c.textAlign = 'center'
    c.lineJoin = 'round'
    for (const f of this.floats) {
      c.globalAlpha = 1 - f.life / f.max
      c.strokeStyle = 'rgba(11,15,29,0.85)'
      c.lineWidth = 4
      c.strokeText(f.text, f.x, f.y)
      c.fillStyle = f.c
      c.fillText(f.text, f.x, f.y)
    }
    c.globalAlpha = 1
    if (dead > 0 && dead < 1) {
      c.fillStyle = `rgba(255,90,90,${0.22 * (1 - dead)})`
      c.fillRect(-20, -20, this.w + 40, this.h + 40)
    }
  }

  stones(c, g) {
    const cell = this.cell
    const i = cell * 0.07
    const lip = cell * 0.12
    for (const s of g.stones) {
      const x = s.x * cell + i
      const y = s.y * cell + i
      const w = cell - 2 * i
      c.fillStyle = '#262956'
      rr(c, x, y + lip, w, w - lip, cell * 0.2)
      c.fill()
      c.fillStyle = '#4b5099'
      rr(c, x, y, w, w - lip, cell * 0.2)
      c.fill()
      c.fillStyle = 'rgba(255,255,255,0.12)'
      rr(c, x + w * 0.18, y + w * 0.14, w * 0.3, w * 0.12, 3)
      c.fill()
    }
  }

  food(c, g, now, t) {
    if (!g.food) return
    const cell = this.cell
    const s = backOut(Math.min((now - g.foodAt) / 400, 1))
    const col = this.skin.food
    const x = (g.food.x + 0.5) * cell
    const y = (g.food.y + 0.5) * cell + Math.sin(t * 4) * cell * 0.04
    const r = cell * 0.34 * s
    const k = (t % 1.3) / 1.3
    c.strokeStyle = col
    c.globalAlpha = 0.35 * (1 - k)
    c.lineWidth = 2
    c.beginPath()
    c.arc(x, y, cell * (0.34 + 0.28 * k) * s, 0, 6.283)
    c.stroke()
    c.globalAlpha = 1
    c.fillStyle = 'rgba(0,0,0,0.25)'
    c.beginPath()
    c.ellipse(x, y + r * 0.95, r * 0.8, r * 0.25, 0, 0, 6.283)
    c.fill()
    c.fillStyle = col
    c.beginPath()
    c.arc(x, y, r, 0, 6.283)
    c.fill()
    c.fillStyle = 'rgba(255,255,255,0.55)'
    c.beginPath()
    c.arc(x - r * 0.35, y - r * 0.35, r * 0.2, 0, 6.283)
    c.fill()
    c.fillStyle = '#3ddc97'
    c.beginPath()
    c.ellipse(x + r * 0.45, y - r * 0.95, r * 0.45, r * 0.2, -0.6, 0, 6.283)
    c.fill()
    c.strokeStyle = '#8a5a44'
    c.lineWidth = 2
    c.lineCap = 'round'
    c.beginPath()
    c.moveTo(x, y - r * 0.8)
    c.lineTo(x + r * 0.1, y - r * 1.15)
    c.stroke()
  }

  bonus(c, g, t) {
    const b = g.bonus
    if (!b) return
    const cell = this.cell
    const x = (b.x + 0.5) * cell
    const y = (b.y + 0.5) * cell
    const r = cell * 0.3 * (1 + Math.sin(t * 8) * 0.07)
    c.strokeStyle = '#ffd166'
    c.lineWidth = 3
    c.lineCap = 'round'
    c.beginPath()
    c.arc(x, y, cell * 0.46, -1.5708, -1.5708 + 6.283 * (b.ttl / CFG.bonusTicks))
    c.stroke()
    c.fillStyle = '#ffd166'
    c.beginPath()
    c.arc(x, y, r, 0, 6.283)
    c.fill()
    c.fillStyle = '#f0a93a'
    c.beginPath()
    c.arc(x, y, r * 0.58, 0, 6.283)
    c.fill()
    c.fillStyle = '#ffe9a8'
    c.beginPath()
    c.arc(x - r * 0.3, y - r * 0.3, r * 0.16, 0, 6.283)
    c.fill()
  }

  snakeBody(c, g, a, t, dead) {
    const cell = this.cell
    const sk = this.skin
    const P = this.points(g, a)
    const n = P.length
    const last = Math.max(1, n - 1)
    const far = cell * 1.6
    const wAt = i => {
      let w = cell * (0.86 - 0.3 * Math.pow(i / last, 1.3))
      for (const b of g.bulges) w *= 1 + 0.32 * Math.max(0, 1 - Math.abs(i - (b - 1 + a)))
      return w
    }
    c.lineCap = 'round'
    c.lineJoin = 'round'
    const seg = (i, col, extra) => {
      c.strokeStyle = col
      c.lineWidth = (wAt(i) + wAt(i + 1)) / 2 + extra
      c.beginPath()
      if (Math.hypot(P[i].x - P[i + 1].x, P[i].y - P[i + 1].y) > far) {
        c.moveTo(P[i].x, P[i].y)
        c.lineTo(P[i].x + 0.01, P[i].y)
      } else {
        c.moveTo(P[i + 1].x, P[i + 1].y)
        c.lineTo(P[i].x, P[i].y)
      }
      c.stroke()
    }
    for (let i = n - 2; i >= 0; i--) seg(i, dead ? mix(sk.edge, [60, 62, 90], dead) : `rgb(${sk.edge})`, 4)
    for (let i = n - 2; i >= 0; i--) {
      const base = [0, 1, 2].map(k => lerp(sk.head[k], sk.tail[k], i / last))
      seg(i, dead ? mix(base, DEAD, dead) : `rgb(${base.map(Math.round)})`, 0)
    }
    const head = P[0]
    const hr = wAt(0) / 2
    const d = g.dir
    const px = -d.y
    const py = d.x
    c.fillStyle = dead ? mix(sk.head, DEAD, dead) : `rgb(${sk.head})`
    c.beginPath()
    c.arc(head.x, head.y, hr, 0, 6.283)
    c.fill()
    if (!dead && (t % 2.6) < 0.4) {
      c.strokeStyle = '#ff5d73'
      c.lineWidth = 2.5
      const f = (t % 2.6) / 0.4
      const l = cell * 0.35 * Math.sin(f * Math.PI)
      const sx = head.x + d.x * hr
      const sy = head.y + d.y * hr
      const ex = sx + d.x * l
      const ey = sy + d.y * l
      c.beginPath()
      c.moveTo(sx, sy)
      c.lineTo(ex, ey)
      c.moveTo(ex, ey)
      c.lineTo(ex + d.x * 4 + px * 3, ey + d.y * 4 + py * 3)
      c.moveTo(ex, ey)
      c.lineTo(ex + d.x * 4 - px * 3, ey + d.y * 4 - py * 3)
      c.stroke()
    }
    for (const sd of [-1, 1]) {
      const ex = head.x + d.x * cell * 0.1 + px * sd * cell * 0.2
      const ey = head.y + d.y * cell * 0.1 + py * sd * cell * 0.2
      const er = cell * 0.14
      if (dead > 0.2) {
        c.strokeStyle = '#10122b'
        c.lineWidth = 2
        c.beginPath()
        c.moveTo(ex - er * 0.7, ey - er * 0.7)
        c.lineTo(ex + er * 0.7, ey + er * 0.7)
        c.moveTo(ex + er * 0.7, ey - er * 0.7)
        c.lineTo(ex - er * 0.7, ey + er * 0.7)
        c.stroke()
      } else {
        c.fillStyle = '#fff'
        c.beginPath()
        c.arc(ex, ey, er, 0, 6.283)
        c.fill()
        c.fillStyle = '#10122b'
        c.beginPath()
        c.arc(ex + d.x * er * 0.4, ey + d.y * er * 0.4, er * 0.55, 0, 6.283)
        c.fill()
      }
    }
  }
}

/* ================= React Component ================= */
function SnakeGame({ onGameEnd, onScoreUpdate }) {
  const cvRef = useRef(null)
  const gameRef = useRef(null)
  const rdRef = useRef(null)
  const accRef = useRef(0)
  const alphaRef = useRef(1)
  const lastRef = useRef(0)
  const demoAccRef = useRef(0)
  const countRef = useRef(0)
  const countTRef = useRef(0)
  const playMsRef = useRef(0)
  const lvlRef = useRef(1)
  const sizeRef = useRef('')
  const diedAtRef = useRef(0)

  const [state, setState] = useState('menu')
  const [count, setCount] = useState(0)
  const [result, setResult] = useState(null)
  const [mode, setMode] = useState(Store.d.mode)
  const [skin, setSkin] = useState(Store.d.skin)
  const [mute, setMute] = useState(Store.d.mute)

  const onGameEndRef = useRef(onGameEnd)
  const onScoreUpdateRef = useRef(onScoreUpdate)
  useEffect(() => { onGameEndRef.current = onGameEnd }, [onGameEnd])
  useEffect(() => { onScoreUpdateRef.current = onScoreUpdate }, [onScoreUpdate])

  useEffect(() => {
    Store.load()
    setMode(Store.d.mode)
    setSkin(Store.d.skin)
    setMute(Store.d.mute)
    const r = rdRef.current = new Renderer(cvRef.current)
    r.skin = SKINS[Store.d.skin]
    document.documentElement.style.setProperty('--snake', r.skin.css)
    document.documentElement.style.setProperty('--snakeInk', r.skin.ink)
  }, [])

  const layout = useCallback((fresh) => {
    const r = document.getElementById('stage')?.getBoundingClientRect()
    if (!r || !r.width) return
    const H = Math.max(r.height, 320)
    const cols = CFG.cols
    let cell = Math.floor(Math.min(r.width, CFG.maxBoardW) / cols)
    if (fresh || !gameRef.current) {
      const rows = Math.min(CFG.maxRows, Math.max(CFG.minRows, Math.floor(H / cell)))
      cell = Math.floor(Math.min(cell, H / rows))
      gameRef.current = new Game(cols, rows, Store.d.mode)
      rdRef.current.parts = []
      rdRef.current.floats = []
      rdRef.current.deadT = -1
    } else {
      cell = Math.floor(Math.min(cell, H / gameRef.current.rows))
    }
    rdRef.current.fit(cols, gameRef.current.rows, Math.max(14, cell))
    sizeRef.current = Math.round(r.width) + 'x' + Math.round(r.height)
  }, [])

  const begin = useCallback(() => {
    layout(true)
    setState('count')
    setCount(3)
    countTRef.current = 0
    playMsRef.current = 0
    lvlRef.current = 1
    accRef.current = 0
    alphaRef.current = 1
    Sfx.tick()
  }, [layout])

  const toMenu = useCallback(() => {
    setState('menu')
    layout(true)
  }, [layout])

  const step = useCallback(() => {
    const g = gameRef.current
    const res = g.tick()
    const c = rdRef.current.cell
    if (res === 'eat' || res === 'gold') {
      const e = g.eaten
      const x = (e.x + 0.5) * c
      const y = (e.y + 0.5) * c
      if (res === 'gold') {
        Sfx.gold()
        rdRef.current.burst(x, y, 22, ['#ffd166', '#fff1b8', '#f0a93a'])
        rdRef.current.float(x, y - c * 0.4, '+5', '#ffd166')
      } else {
        Sfx.eat(e.combo)
        rdRef.current.burst(x, y, 16, [rdRef.current.skin.food, '#ffd166'])
        rdRef.current.float(x, y - c * 0.4, '+' + e.pts, e.combo > 1 ? '#ffd166' : '#ffffff')
      }
      onScoreUpdateRef.current(g.score, g.fruit)
      if (g.level > lvlRef.current) {
        lvlRef.current = g.level
        Sfx.up()
      }
    }
    if (!g.alive) {
      setState('dying')
      diedAtRef.current = performance.now()
      rdRef.current.deadT = 0
      rdRef.current.shake = res === 'win' ? 0 : 10
      if (res !== 'win') Sfx.die()
      try { navigator.vibrate && navigator.vibrate(60) } catch (e) { }
      const nb = g.score > Store.d.best[Store.d.mode]
      if (nb) {
        Store.d.best[Store.d.mode] = g.score
        Store.save()
      }
      setResult({
        score: g.score,
        nb,
        win: res === 'win',
        fruit: g.fruit,
        time: playMsRef.current,
        combo: g.bestCombo
      })
      onGameEndRef.current(g.score, g.fruit)
    }
  }, [])

  useEffect(() => {
    if (!cvRef.current) return
    layout(true)
    let raf
    const loop = (ts) => {
      raf = requestAnimationFrame(loop)
      const dt = Math.min(0.05, (ts - lastRef.current) / 1000 || 0)
      lastRef.current = ts
      const st = state
      let g = gameRef.current
      let a = 1
      if (st === 'menu') {
        demoAccRef.current += dt * 1000
        const ms = 130
        while (demoAccRef.current >= ms) {
          demoAccRef.current -= ms
          const d = g
          const dir = aiDir(d)
          if (dir) d.turn(dir)
          d.tick()
          if (!d.alive) gameRef.current = new Game(d.cols, d.rows, d.mode)
        }
        a = Math.min(demoAccRef.current / ms, 1)
      } else if (st === 'count') {
        countTRef.current += dt
        if (countTRef.current >= 0.8) {
          countTRef.current = 0
          countRef.current--
          setCount(c => c - 1)
          if (countRef.current <= 0) {
            setState('play')
            accRef.current = 0
            Sfx.go()
          } else {
            Sfx.tick()
          }
        }
      } else if (st === 'play') {
        playMsRef.current += dt * 1000
        accRef.current += dt * 1000
        let ms = g.interval
        while (accRef.current >= ms && state === 'play') {
          accRef.current -= ms
          step()
          ms = g.interval
        }
        if (state === 'play') alphaRef.current = Math.min(accRef.current / ms, 1)
        a = alphaRef.current
      } else if (st === 'pause') {
        a = alphaRef.current
      } else if (st === 'dying' && performance.now() - diedAtRef.current > 800) {
        setState('over')
      }
      rdRef.current.update(dt)
      rdRef.current.draw(g, performance.now(), a)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [state, layout, step])

  const onDir = useCallback((d) => {
    if (state === 'play' || state === 'count') gameRef.current.turn(d)
  }, [state])

  const handleKey = useCallback((e) => {
    Sfx.unlock()
    const map = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' }
    if (map[e.code]) {
      e.preventDefault()
      onDir(DIR[map[e.code]])
    }
  }, [onDir])

  useEffect(() => {
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [handleKey])

  const aiDir = (g) => {
    const h = g.snake[0]
    const f = g.food
    if (!f) return null
    let best = null
    let bd = 1e9
    for (const d of Object.values(DIR)) {
      if (d.x === -g.dir.x && d.y === -g.dir.y) continue
      if (!g.safe(d)) continue
      const dist = Math.abs(h.x + d.x - f.x) + Math.abs(h.y + d.y - f.y)
      if (dist < bd) { bd = dist; best = d }
    }
    return best
  }

  const handleModeChange = (m) => {
    Store.d.mode = m
    Store.save()
    setMode(m)
    gameRef.current = new Game(gameRef.current.cols, gameRef.current.rows, m)
  }

  const handleSkinChange = (s) => {
    Store.d.skin = s
    Store.save()
    setSkin(s)
    rdRef.current.skin = SKINS[s]
    document.documentElement.style.setProperty('--snake', SKINS[s].css)
    document.documentElement.style.setProperty('--snakeInk', SKINS[s].ink)
  }

  const handleMute = () => {
    Store.d.mute = !Store.d.mute
    Store.save()
    setMute(Store.d.mute)
  }

  return (
    <div style={{ position: 'absolute', inset: 0, background: '#0b0f1d', fontFamily: 'Fredoka, sans-serif', display: 'flex', flexDirection: 'column', padding: '14px 16px' }}>
      {/* HUD */}
      {state !== 'menu' && (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '20px', marginBottom: '10px' }}>
          <div style={{ marginRight: 'auto' }}>
            <div style={{ fontSize: '14px', color: '#98a0d6', fontWeight: 500 }}>Score</div>
            <div style={{ fontSize: '54px', fontWeight: 700, color: '#eceefc', lineHeight: 1 }}>{gameRef.current?.score || 0}</div>
          </div>
          <div>
            <div style={{ fontSize: '14px', color: '#98a0d6', fontWeight: 500 }}>Best</div>
            <div style={{ fontSize: '24px', fontWeight: 600, color: '#eceefc', lineHeight: 1.1 }}>{Store.d.best[mode]}</div>
          </div>
          <button onClick={() => setState(s => s === 'play' ? 'pause' : 'play')} style={{ width: 44, height: 44, borderRadius: 14, border: '2px solid #2b2d52', background: '#171a33', display: 'grid', placeItems: 'center', cursor: 'pointer', visibility: state === 'play' || state === 'pause' ? 'visible' : 'hidden' }}>
            <svg viewBox="0 0 16 16" style={{ width: 16, height: 16, fill: '#eceefc' }}><rect x="2" y="1" width="4.5" height="14" rx="1.2" /><rect x="9.5" y="1" width="4.5" height="14" rx="1.2" /></svg>
          </button>
        </div>
      )}
      {state !== 'menu' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px', fontSize: '15px', color: '#98a0d6', fontWeight: 500 }}>
          <span>Speed {gameRef.current?.level || 1}</span>
          <div style={{ flex: 1, height: 8, borderRadius: 99, background: '#171a33', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${((gameRef.current?.fruit || 0) % CFG.perLevel) / CFG.perLevel * 100}%`, background: 'var(--snake, #3ddc97)', borderRadius: 99, transition: 'width 0.25s' }} />
          </div>
          {gameRef.current?.comboOn && <span style={{ padding: '2px 12px', borderRadius: 99, background: '#ffd166', color: '#3a2a00', fontWeight: 700 }}>x{gameRef.current.combo}</span>}
        </div>
      )}
      {/* Stage */}
      <div id="stage" style={{ flex: 1, minHeight: 360, display: 'grid', placeItems: 'center', touchAction: 'none', position: 'relative' }}>
        <div style={{ position: 'relative', borderRadius: 18, overflow: 'hidden', background: '#1a1b35', boxShadow: '0 0 0 2px #2b2d52' }}>
          <canvas ref={cvRef} />
          {state === 'count' && (
            <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none', fontSize: 130, fontWeight: 700, textShadow: '0 5px 0 rgba(0,0,0,0.35)', color: '#eceefc' }}>
              {count}
            </div>
          )}
          {(state === 'menu' || state === 'pause' || state === 'over') && (
            <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: state === 'menu' ? 'end center' : 'center', padding: 18, background: state === 'menu' ? 'none' : 'rgba(11,15,29,0.3)', textAlign: 'center' }}>
              <div style={{ width: 'min(340px, 100%)', padding: '24px 22px 18px', borderRadius: 24, background: state === 'menu' ? 'rgba(11,15,29,0.8)' : 'rgba(11,15,29,0.92)', border: '2px solid #2b2d52' }}>
                {state === 'menu' ? (
                  <>
                    <h1 style={{ fontSize: 44, fontWeight: 700, color: 'var(--snake, #3ddc97)', margin: 0 }}>Snake</h1>
                    <div style={{ display: 'flex', gap: 4, padding: 4, marginTop: 18, background: '#171a33', borderRadius: 14 }}>
                      {Object.keys(MODES).map(m => (
                        <button key={m} onClick={() => handleModeChange(m)} style={{ flex: 1, border: 0, background: mode === m ? 'var(--snake, #3ddc97)' : 'none', padding: '9px 4px', borderRadius: 10, fontWeight: 600, fontSize: 16, color: mode === m ? 'var(--snakeInk, #06281c)' : '#98a0d6', cursor: 'pointer' }}>{MODES[m][0]}</button>
                      ))}
                    </div>
                    <p style={{ margin: '14px 0 0', color: '#98a0d6', fontSize: 15, lineHeight: 1.45, minHeight: 44 }}>{MODES[mode][1]}<br />Best {Store.d.best[mode]}</p>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 14, marginTop: 14 }}>
                      {SKINS.map((s, i) => (
                        <button key={i} onClick={() => handleSkinChange(i)} style={{ width: 32, height: 32, borderRadius: '50%', padding: 0, background: s.css, border: `3px solid ${skin === i ? '#eceefc' : '#0b0f1d'}`, boxShadow: skin === i ? '0 0 0 3px #eceefc' : '0 0 0 2px #2b2d52', cursor: 'pointer' }} />
                      ))}
                    </div>
                    <button onClick={begin} style={{ display: 'block', width: '100%', marginTop: 18, padding: 14, border: 0, borderRadius: 14, fontSize: 21, fontWeight: 600, background: 'var(--snake, #3ddc97)', color: 'var(--snakeInk, #06281c)', cursor: 'pointer' }}>Play</button>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 18, marginTop: 12 }}>
                      <button onClick={handleMute} style={{ background: 'none', border: 0, padding: 4, color: '#98a0d6', fontSize: 14, textDecoration: 'underline', textUnderlineOffset: 4, cursor: 'pointer' }}>Sound {mute ? 'off' : 'on'}</button>
                    </div>
                  </>
                ) : state === 'pause' ? (
                  <>
                    <h2 style={{ fontSize: 36, fontWeight: 700, color: '#eceefc', margin: 0 }}>Paused</h2>
                    <button onClick={() => setState('play')} style={{ display: 'block', width: '100%', marginTop: 18, padding: 14, border: 0, borderRadius: 14, fontSize: 21, fontWeight: 600, background: 'var(--snake, #3ddc97)', color: 'var(--snakeInk, #06281c)', cursor: 'pointer' }}>Resume</button>
                    <button onClick={begin} style={{ display: 'block', width: '100%', marginTop: 10, padding: 14, background: 'none', border: '2px solid #2b2d52', borderRadius: 14, fontSize: 21, fontWeight: 600, color: '#eceefc', cursor: 'pointer' }}>Restart</button>
                    <button onClick={toMenu} style={{ display: 'block', width: '100%', marginTop: 10, padding: 14, background: 'none', border: '2px solid #2b2d52', borderRadius: 14, fontSize: 21, fontWeight: 600, color: '#eceefc', cursor: 'pointer' }}>Menu</button>
                  </>
                ) : (
                  <>
                    <h2 style={{ fontSize: 36, fontWeight: 700, color: '#eceefc', margin: 0 }}>{result?.win ? 'Board cleared' : 'Game over'}</h2>
                    <div style={{ fontSize: 84, fontWeight: 700, lineHeight: 1, marginTop: 16, letterSpacing: '-0.03em', color: '#eceefc' }}>{result?.score}</div>
                    <span style={{ display: 'inline-block', marginTop: 8, padding: '4px 14px', borderRadius: 99, fontWeight: 600, fontSize: 15, background: result?.nb ? '#ffd166' : '#171a33', border: `2px solid ${result?.nb ? '#ffd166' : '#2b2d52'}`, color: result?.nb ? '#3a2a00' : '#eceefc' }}>{result?.nb ? 'New best' : `Best ${Store.d.best[mode]}`}</span>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 26, marginTop: 18, fontSize: 14, color: '#98a0d6' }}>
                      <div><b style={{ display: 'block', fontSize: 22, color: '#eceefc', fontWeight: 600 }}>{result?.fruit}</b>Fruit</div>
                      <div><b style={{ display: 'block', fontSize: 22, color: '#eceefc', fontWeight: 600 }}>{fmt(result?.time || 0)}</b>Time</div>
                      <div><b style={{ display: 'block', fontSize: 22, color: '#eceefc', fontWeight: 600 }}>x{result?.combo || 1}</b>Top combo</div>
                    </div>
                    <button onClick={begin} style={{ display: 'block', width: '100%', marginTop: 18, padding: 14, border: 0, borderRadius: 14, fontSize: 21, fontWeight: 600, background: 'var(--snake, #3ddc97)', color: 'var(--snakeInk, #06281c)', cursor: 'pointer' }}>Play again</button>
                    <button onClick={toMenu} style={{ display: 'block', width: '100%', marginTop: 10, padding: 14, background: 'none', border: '2px solid #2b2d52', borderRadius: 14, fontSize: 21, fontWeight: 600, color: '#eceefc', cursor: 'pointer' }}>Menu</button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default SnakeGame
