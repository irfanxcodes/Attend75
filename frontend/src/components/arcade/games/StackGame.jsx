import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

// ─── Constants (match reference) ─────────────────────────────────────────────
const BH   = 26   // block height
const DX   = 9    // 3D x-offset
const DY   = -7   // 3D y-offset
const WW   = 360  // logical world width
const TIERS = [10, 25, 50, 100, 200, 400, 800]

// ─── Themes (sky gradient phases based on score) ──────────────────────────────
const THEMES = [
  // Sky
  [[[135,206,235],[205,234,243]],[[90,160,230],[180,214,242]],[[43,63,158],[111,127,209]],[[7,10,36],[29,34,96]]],
  // Sunset
  [[[255,170,120],[255,220,170]],[[220,110,140],[250,180,170]],[[90,60,150],[200,120,160]],[[12,10,40],[50,30,90]]],
  // Midnight
  [[[40,50,110],[90,100,170]],[[26,32,84],[60,70,140]],[[14,16,52],[38,42,100]],[[5,6,22],[20,22,64]]],
]

function skc(SK, skyVal) {
  const f = skyVal * 3
  const i = Math.min(2, f | 0)
  const r = f - i
  return [0, 1].map(j =>
    'rgb(' + SK[i][j].map((v, m) => Math.round(v + (SK[Math.min(3,i+1)][j][m] - v) * r)) + ')'
  )
}

// ─── Static scene data ────────────────────────────────────────────────────────
function mkBuildings() {
  let x = -20; const o = []
  while (x < WW + 160) {
    const b = 44 + Math.random() * 34
    o.push({ x, w: b, h: 50 + Math.random() * 130 })
    x += b + 6
  }
  return o
}

const CITY   = mkBuildings()
const CLOUDS = Array.from({ length: 9 }, (_, i) => ({
  x: Math.random() * 400,
  y: 260 + i * 190 + Math.random() * 80,
  r: 22 + Math.random() * 22,
  v: 3 + Math.random() * 6,
}))
const STARS = Array.from({ length: 80 }, () => ({
  x: Math.random(), y: Math.random(),
  p: Math.random() * 6,
  r: 0.6 + Math.random() * 1.3,
}))

// ─── Audio ────────────────────────────────────────────────────────────────────
let _ac = null
function beep(f, d, ty, v, sl, muted) {
  if (!muted) return
  try {
    if (!_ac) _ac = new (window.AudioContext || window.webkitAudioContext)()
    if (_ac.state === 'suspended') _ac.resume()
    const n = _ac.currentTime
    const osc = _ac.createOscillator(), gain = _ac.createGain()
    osc.type = ty
    osc.frequency.setValueAtTime(f, n)
    osc.frequency.exponentialRampToValueAtTime(f * sl, n + d)
    gain.gain.setValueAtTime(v, n)
    gain.gain.exponentialRampToValueAtTime(1e-4, n + d)
    osc.connect(gain); gain.connect(_ac.destination)
    osc.start(); osc.stop(n + d)
  } catch {}
}

// Note: beep with muted=true means sound IS on (cfg.sound=1 maps to muted=true for beep calls)
function playSound(name, cfg) {
  if (!cfg.sound) return
  if (name === 'drop')    beep(300, 0.1,  'sine',     0.05, 0.7,  true)
  if (name === 'perfect') beep(440, 0.18, 'triangle', 0.12, 1.5,  true)
  if (name === 'land')    beep(150, 0.14, 'sine',     0.16, 0.5,  true)
  if (name === 'over')    beep(210, 0.55, 'sawtooth', 0.1,  0.3,  true)
  if (name === 'tier')    beep(660, 0.4,  'triangle', 0.1,  2,    true)
}

function vib(pattern, cfg) {
  if (!cfg.haptics) return
  try { navigator.vibrate && navigator.vibrate(pattern) } catch {}
}

// ─── Component ────────────────────────────────────────────────────────────────
function StackGame({ onGameEnd, onScoreUpdate, isActive, initialScore = 0 }) {
  const navigate   = useNavigate()
  const cvRef      = useRef(null)
  const rafRef     = useRef(null)
  const lastRef    = useRef(performance.now())
  const endRef     = useRef(false)
  const inputRef   = useRef(false)  // tap pending

  // All mutable game state in one ref
  const G = useRef(null)

  // Config (persisted)
  const cfgRef = useRef({ sound: 1, haptics: 1, calm: 0, diff: 1, theme: 0, style: 0 })
  try {
    Object.assign(cfgRef.current, JSON.parse(localStorage.getItem('st2') || '{}'))
  } catch {}

  // React UI state
  const [uiScore,   setUiScore]   = useState(0)
  const [uiBest,    setUiBest]    = useState(0)
  const [uiCombo,   setUiCombo]   = useState(0)
  const [uiTier,    setUiTier]    = useState(0)
  const [uiRail,    setUiRail]    = useState(0)       // 0-100 fill %
  const [uiRailTgt, setUiRailTgt] = useState(TIERS[0])
  const [uiSt,      setUiSt]      = useState('ready') // ready | play | paused | over
  const [uiOvDone,  setUiOvDone]  = useState(false)
  const [uiNb,      setUiNb]      = useState(false)
  const [uiPerf,    setUiPerf]    = useState(0)
  const [uiMute,    setUiMute]    = useState(!cfgRef.current.sound)

  const initialScoreRef = useRef(initialScore)
  useEffect(() => { initialScoreRef.current = initialScore }, [initialScore])

  // ── Init game object ────────────────────────────────────────────────────
  const initG = useCallback(() => {
    let best = 0
    try { best = +localStorage.getItem('st_best') || 0 } catch {}

    const cfg = cfgRef.current
    const diff = cfg.diff  // 0=chill, 1=normal, 2=hard
    const startW = [160, 160, 130][diff]

    G.current = {
      st: 'ready',        // ready | play | paused | over
      pst: 'ready',
      t: 0,
      score: 0, best,
      combo: 0, perf: 0,
      tier: 0,
      blocks: [{ x: 100, w: 160, h: 0, f: 0 }],  // h = hue
      cur: null,          // current sliding block
      n: 1,
      nextW: startW,
      cam: 0, sky: 0,
      debris: [], fx: [],
      shake: 0,
      ot: 0, ovDone: false, nb: false,
      // canvas size
      dpr: 1, w: 0, h: 0, s: 1, Hv: 0, ww: 0, ox: 0, base: 0,
      // clouds (mutable, animated)
      clouds: CLOUDS.map(c => ({ ...c })),
    }
    endRef.current = false
    setUiScore(0); setUiBest(best); setUiCombo(0); setUiTier(0)
    setUiRail(0); setUiRailTgt(TIERS[0]); setUiSt('ready')
    setUiOvDone(false); setUiNb(false); setUiPerf(0)
  }, [])

  // ── Fit canvas ──────────────────────────────────────────────────────────
  const fit = useCallback(() => {
    const cv = cvRef.current; if (!cv) return
    const g = G.current; if (!g) return
    g.dpr = Math.min(devicePixelRatio || 1, 2)
    g.w = innerWidth; g.h = innerHeight
    cv.width  = g.w * g.dpr
    cv.height = g.h * g.dpr
    g.s  = Math.min(g.w / WW, g.h / 520)
    g.Hv = g.h / g.s
    g.ww = g.w / g.s
    g.ox = (g.ww - WW) / 2
    g.base = g.Hv - 84
  }, [])

  // ── Spawn ────────────────────────────────────────────────────────────────
  const spawn = useCallback(() => {
    const g = G.current; if (!g) return
    const l = g.n % 2
    g.cur = {
      w: g.nextW,
      x: l ? 0 : WW - g.nextW,
      dir: l ? 1 : -1,
      y: (g.n + 4.5) * BH,
      vy: 0,
      hue: (14 + g.n * 11) % 360,
      drop: false,
    }
  }, [])

  // ── Rail update ──────────────────────────────────────────────────────────
  const updateRail = useCallback((score, tier) => {
    const lo = tier ? TIERS[tier - 1] : 0
    const hi = TIERS[Math.min(tier, TIERS.length - 1)]
    const pct = Math.min(100, (score - lo) / (hi - lo) * 100)
    setUiRail(pct); setUiRailTgt(hi)
  }, [])

  // ── Land block ───────────────────────────────────────────────────────────
  const land = useCallback(() => {
    const g = G.current; if (!g) return
    const cfg = cfgRef.current
    const p = g.blocks[g.n - 1]
    const dx = g.cur.x - p.x
    const perfectThresh = [8, 5, 3][cfg.diff]

    if (Math.abs(dx) <= perfectThresh) {
      // Perfect
      g.cur.x = p.x; g.combo++; g.perf++
      if (g.combo >= 3) g.cur.w = Math.min(160, g.cur.w + 4)
      g.fx.push(
        { k: 'r', x: g.cur.x + g.cur.w / 2, y: g.n * BH, r: 10, l: 0.5, m: 0.5 },
        { k: 't', x: g.cur.x + g.cur.w / 2, y: (g.n + 1) * BH + 24,
          txt: g.combo > 1 ? 'PERFECT x' + g.combo : 'PERFECT', l: 1, m: 1, c: '#ffe066', z: 20 }
      )
      for (let i = 0; i < 14; i++) g.fx.push({
        k: 'p', x: g.cur.x + Math.random() * g.cur.w, y: g.n * BH + BH / 2,
        vx: (Math.random() - 0.5) * 180, vy: 60 + Math.random() * 180, l: 0.7, m: 0.7, c: '#ffe066'
      })
      playSound('perfect', cfg); vib(12, cfg)
      g.blocks.push({ x: g.cur.x, w: g.cur.w, h: g.cur.hue, f: 0.35 })
    } else {
      // Overlap cut
      const L = Math.max(g.cur.x, p.x)
      const R = Math.min(g.cur.x + g.cur.w, p.x + p.w)
      if (R - L <= 0) {
        // Missed entirely
        g.debris.push({ x: g.cur.x, w: g.cur.w, y: g.cur.y, hue: g.cur.hue,
          vx: g.cur.dir * 40, vy: 0, rot: 0, vr: g.cur.dir * 1.5 })
        g.cur.hide = true
        over()
        return
      }
      const cx = dx < 0 ? g.cur.x : p.x + p.w
      const cw = dx < 0 ? p.x - g.cur.x : g.cur.x + g.cur.w - (p.x + p.w)
      g.debris.push({ x: cx, w: cw, y: g.n * BH, hue: g.cur.hue,
        vx: (dx < 0 ? -1 : 1) * 40, vy: 0, rot: 0, vr: (dx < 0 ? -1 : 1) * 1.8 })
      g.combo = 0
      g.blocks.push({ x: L, w: R - L, h: g.cur.hue, f: 0 })
      g.cur.x = L; g.cur.w = R - L
      playSound('land', cfg); vib(8, cfg)
    }

    g.shake = 0.18; g.nextW = g.cur.w; g.n++

    // Score
    const newScore = g.n - 1
    g.score = newScore
    setUiScore(newScore); setUiCombo(g.combo)
    onScoreUpdate(newScore)

    // Tier check
    if (newScore >= TIERS[g.tier]) {
      g.tier++
      g.fx.push({ k: 't', x: WW / 2, y: (g.n + 3) * BH, txt: 'FLOOR ' + newScore + '!', l: 1.4, m: 1.4, c: '#fff', z: 26 })
      playSound('tier', cfg); vib([20, 40, 20], cfg)
      setUiTier(g.tier)
    }
    updateRail(newScore, g.tier)

    spawn()

    if (g.cur.w < 6) over()
  }, [onScoreUpdate, spawn, updateRail])

  // ── Over ─────────────────────────────────────────────────────────────────
  const over = useCallback(() => {
    const g = G.current; if (!g) return
    g.st = 'over'; g.ot = 0; g.ovDone = false; g.shake = 0.45
    playSound('over', cfgRef.current); vib([60, 40, 80], cfgRef.current)
    let nb = false
    if (g.score > g.best) { g.best = g.score; nb = true; try { localStorage.setItem('st_best', g.best) } catch {} }
    g.nb = nb; setUiNb(nb); setUiBest(g.best); setUiSt('over')
    if (!endRef.current) { endRef.current = true; onGameEnd(g.score) }
  }, [onGameEnd])

  // ── Drop ─────────────────────────────────────────────────────────────────
  const drop = useCallback(() => {
    const g = G.current; if (!g) return
    if (g.st === 'play' && !g.cur?.drop) {
      g.cur.drop = true; g.cur.vy = 0
      playSound('drop', cfgRef.current)
    }
  }, [])

  // ── Tap handler ───────────────────────────────────────────────────────────
  const handleTap = useCallback(() => {
    const g = G.current; if (!g) return
    if (g.st === 'ready') { g.st = 'play'; setUiSt('play'); drop(); return }
    if (g.st === 'play') { drop(); return }
    if (g.st === 'paused') { g.st = g.pst; setUiSt(g.pst); return }
    if (g.st === 'over' && g.ot > 0.9) {
      initG()
      setTimeout(() => { fit(); G.current.st = 'play'; setUiSt('play'); spawn() }, 0)
    }
  }, [drop, initG, fit, spawn])

  // ── Update ────────────────────────────────────────────────────────────────
  const upd = useCallback((dt) => {
    const g = G.current; if (!g) return
    g.t += dt; g.shake = Math.max(0, g.shake - dt)

    // Sky scroll
    const tgtSky = Math.min(1, g.score / 70)
    g.sky += (tgtSky - g.sky) * Math.min(1, dt * 1.5)

    // Camera
    const tgtCam = Math.max(0, (g.n + 5.5) * BH + g.Hv * 0.36 - g.base)
    g.cam += (tgtCam - g.cam) * Math.min(1, dt * 4)

    // Clouds
    for (const c of g.clouds) {
      c.x += c.v * dt; if (c.x > WW + 120) c.x = -120
    }

    if (g.st === 'play' || g.st === 'ready') {
      const cfg = cfgRef.current
      const sp = (120 + Math.min(g.score * 5, 200)) * [0.8, 1, 1.25][cfg.diff]
      if (!g.cur?.drop) {
        g.cur.x += g.cur.dir * sp * dt
        if (g.cur.x <= 0) { g.cur.x = 0; g.cur.dir = 1 }
        if (g.cur.x + g.cur.w >= WW) { g.cur.x = WW - g.cur.w; g.cur.dir = -1 }
      } else {
        g.cur.vy += 2400 * dt
        g.cur.y -= g.cur.vy * dt
        if (g.cur.y <= g.n * BH) { g.cur.y = g.n * BH; land() }
      }
    }

    // Block flash decay
    for (const b of g.blocks) b.f = Math.max(0, b.f - dt)

    // Debris
    for (const d of g.debris) { d.vy += 1800 * dt; d.y -= d.vy * dt; d.x += d.vx * dt; d.rot += d.vr * dt }
    g.debris = g.debris.filter(d => d.y > g.cam - 260)

    // FX
    for (const f of g.fx) {
      f.l -= dt
      if (f.k === 'p') { f.x += f.vx * dt; f.y += f.vy * dt; f.vy -= 500 * dt }
      else if (f.k === 'r') f.r += dt * 150
      else f.y += dt * 40
    }
    g.fx = g.fx.filter(f => f.l > 0)

    if (g.st === 'over') {
      g.ot += dt
      if (g.ot > 0.8 && !g.ovDone) { g.ovDone = true; setUiOvDone(true); setUiPerf(g.perf) }
    }
  }, [land])

  // ── Draw block (modern style) ────────────────────────────────────────────
  const box = useCallback((ctx, x, y, wd, hue, fl, s) => {
    ctx.save()
    ctx.shadowColor = '#0004'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 6
    const q = ctx.createLinearGradient(0, y, 0, y + BH * s)
    q.addColorStop(0, `hsl(${hue},88%,64%)`)
    q.addColorStop(1, `hsl(${hue},84%,52%)`)
    ctx.fillStyle = q
    ctx.beginPath(); ctx.roundRect(x, y, wd, BH * s, 9 * s); ctx.fill()
    ctx.restore()
    // Gloss
    ctx.fillStyle = '#ffffff38'
    ctx.beginPath(); ctx.roundRect(x + 4 * s, y + 3 * s, wd - 8 * s, 5 * s, 3 * s); ctx.fill()
    if (fl > 0) {
      ctx.fillStyle = `rgba(255,255,255,${fl * 1.6})`
      ctx.beginPath(); ctx.roundRect(x, y, wd, BH * s, 9 * s); ctx.fill()
    }
  }, [])

  // ── Draw ─────────────────────────────────────────────────────────────────
  const draw = useCallback((ctx) => {
    const g = G.current; if (!g) return
    const { dpr, s, ww, Hv, ox, base, cam, sky, t, shake, blocks, debris, fx, clouds, n, cur, st, score } = g
    const cfg = cfgRef.current
    const SK = THEMES[cfg.theme]

    const sh = cfg.calm ? 0 : shake * 26
    ctx.setTransform(
      dpr * s, 0, 0, dpr * s,
      (Math.random() - 0.5) * sh * dpr,
      (Math.random() - 0.5) * sh * dpr
    )

    // Sky gradient
    const [c1, c2] = skc(SK, sky)
    const sg = ctx.createLinearGradient(0, 0, 0, Hv)
    sg.addColorStop(0, c1); sg.addColorStop(1, c2)
    ctx.fillStyle = sg; ctx.fillRect(-30, -30, ww + 60, Hv + 60)

    // Stars (midnight theme or high sky)
    const sa = cfg.theme === 2
      ? Math.max(0.7, (sky - 0.45) * 1.8)
      : Math.max(0, (sky - 0.45) * 1.8)
    if (sa > 0) {
      for (const o of STARS) {
        ctx.fillStyle = `rgba(255,255,255,${sa * (0.5 + 0.5 * Math.sin(t * 2 + o.p))})`
        ctx.beginPath(); ctx.arc(o.x * ww, o.y * Hv, o.r, 0, 7); ctx.fill()
      }
    }

    ctx.save(); ctx.translate(ox, 0)

    // Clouds
    const ca = Math.max(0, 0.85 - sky * 0.9) * (cfg.theme === 2 ? 0.25 : 1)
    if (ca > 0) {
      ctx.fillStyle = `rgba(255,255,255,${ca})`
      for (const c of clouds) {
        const cy = base - c.y + cam * 0.55
        if (cy < -60 || cy > Hv + 60) continue
        ctx.beginPath()
        ctx.ellipse(c.x, cy, c.r * 1.7, c.r * 0.6, 0, 0, 7)
        ctx.ellipse(c.x + c.r * 0.8, cy - c.r * 0.3, c.r, c.r * 0.6, 0, 0, 7)
        ctx.fill()
      }
    }

    // City silhouette
    const cityY = base + cam * 0.3
    const la = Math.max(0, 1 - cam / 520)
    if (la > 0) {
      ctx.globalAlpha = la * 0.55
      ctx.fillStyle = ['#6f93ad', '#a8667f', '#252d62'][cfg.theme]
      for (let o = -ox - 60; o < ww + 60; o += WW + 180)
        for (const b of CITY) ctx.fillRect(o + b.x, cityY - b.h, b.w, b.h + 400)
      ctx.globalAlpha = 1
    }

    // Ground
    const gy = base - 0 + cam  // world y=0
    if (gy < Hv + 20) {
      ctx.fillStyle = '#34476b'; ctx.fillRect(-ox - 30, gy, ww + 60, Hv)
      ctx.fillStyle = '#4e6794'; ctx.fillRect(-ox - 30, gy, ww + 60, 4)
    }

    // Stacked blocks
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i]
      const y = base - (i + 1) * BH + cam
      if (y > Hv + 20 || y < -60) continue
      box(ctx, b.x, y, b.w, i ? b.h : 48, b.f, 1)
    }

    // Debris
    for (const d of debris) {
      ctx.save()
      ctx.translate(d.x + d.w / 2, base - d.y + cam + BH / 2)
      ctx.rotate(d.rot)
      ctx.globalAlpha = 0.9
      box(ctx, -d.w / 2, -BH / 2, d.w, d.hue, 0, 1)
      ctx.restore(); ctx.globalAlpha = 1
    }

    // Current swinging/dropping block
    if (cur && !cur.hide) {
      box(ctx, cur.x, base - cur.y + cam, cur.w, cur.hue, 0, 1)
    }

    // Drop guide line
    if (st === 'play' && cur && !cur.drop) {
      ctx.strokeStyle = '#ffffff55'; ctx.setLineDash([4, 6]); ctx.lineWidth = 2
      ctx.beginPath()
      const tp = blocks[n - 1]
      ctx.moveTo(tp.x + tp.w / 2, base - cur.y + cam + 6)
      ctx.lineTo(tp.x + tp.w / 2, base - n * BH + cam - 4)
      ctx.stroke(); ctx.setLineDash([])
    }

    // FX
    for (const f of fx) {
      const a = Math.max(0, f.l / f.m)
      ctx.globalAlpha = a
      if (f.k === 'r') {
        ctx.strokeStyle = '#fff3b0'; ctx.lineWidth = 3
        ctx.beginPath(); ctx.ellipse(f.x, base - f.y + cam, f.r * 1.6, f.r * 0.5, 0, 0, 7)
        ctx.stroke()
      } else if (f.k === 'p') {
        ctx.fillStyle = f.c; ctx.beginPath()
        ctx.arc(f.x, base - f.y + cam, 2.5, 0, 7); ctx.fill()
      } else {
        ctx.font = `700 ${f.z || 20}px Fredoka,system-ui,sans-serif`
        ctx.textAlign = 'center'; ctx.lineWidth = 4
        ctx.strokeStyle = '#0008'; ctx.strokeText(f.txt, f.x, base - f.y + cam)
        ctx.fillStyle = f.c; ctx.fillText(f.txt, f.x, base - f.y + cam)
      }
    }
    ctx.globalAlpha = 1
    ctx.restore()
  }, [box])

  // ── Loop ─────────────────────────────────────────────────────────────────
  const loopFn = useCallback((now) => {
    const g = G.current; if (!g) return
    const dt = Math.min((now - lastRef.current) / 1000, 0.033)
    lastRef.current = now
    if (g.st !== 'paused') upd(dt); else g.t += dt
    const cv = cvRef.current; if (!cv) return
    const ctx = cv.getContext('2d')
    if (ctx) draw(ctx)
    rafRef.current = requestAnimationFrame(loopRef.current)
  }, [upd, draw])

  const loopRef = useRef(loopFn)
  useEffect(() => { loopRef.current = loopFn }, [loopFn])

  // ── Input ─────────────────────────────────────────────────────────────────
  const lastTouchRef = useRef(0)
  const onTouchTap = useCallback((e) => {
    if (e.target.closest?.('.st-btn')) return
    e.preventDefault(); lastTouchRef.current = Date.now(); handleTap()
  }, [handleTap])
  const onClickTap = useCallback((e) => {
    if (e.target.closest?.('.st-btn')) return
    if (Date.now() - lastTouchRef.current < 300) return
    e.preventDefault(); handleTap()
  }, [handleTap])
  const onKey = useCallback((e) => {
    if (e.code === 'Space' || e.code === 'ArrowDown' || e.key === 'Enter') {
      e.preventDefault()
      const g = G.current; if (!g) return
      g.st === 'play' ? drop() : handleTap()
    } else if (e.key === 'p' || e.key === 'Escape') {
      const g = G.current; if (!g) return
      if (g.st === 'play') { g.pst = g.st; g.st = 'paused'; setUiSt('paused') }
      else if (g.st === 'paused') { g.st = g.pst; setUiSt(g.pst) }
    }
  }, [drop, handleTap])

  const togglePause = useCallback(() => {
    const g = G.current; if (!g) return
    if (g.st === 'play') { g.pst = g.st; g.st = 'paused'; setUiSt('paused') }
    else if (g.st === 'paused') { g.st = g.pst; setUiSt(g.pst) }
  }, [])

  const toggleMute = useCallback(() => {
    cfgRef.current.sound = cfgRef.current.sound ? 0 : 1
    setUiMute(!cfgRef.current.sound)
    try { localStorage.setItem('st2', JSON.stringify(cfgRef.current)) } catch {}
  }, [])

  // ── Visibility ────────────────────────────────────────────────────────────
  const onVisChange = useCallback(() => {
    const g = G.current; if (!g) return
    if (document.hidden && g.st === 'play') { g.pst = g.st; g.st = 'paused'; setUiSt('paused') }
  }, [])

  // ── Mount ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    initG()
    setTimeout(() => {
      fit()
      const g = G.current; if (!g) return
      spawn()
      lastRef.current = performance.now()
      rafRef.current = requestAnimationFrame(loopRef.current)
    }, 0)

    const onResize = () => fit()
    window.addEventListener('resize', onResize)
    window.addEventListener('keydown', onKey)
    document.addEventListener('visibilitychange', onVisChange)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('visibilitychange', onVisChange)
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
      G.current = null
    }
  }, []) // eslint-disable-line

  const prevActiveRef = useRef(isActive)
  useEffect(() => {
    if (isActive && !prevActiveRef.current) {
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
      initG()
      onScoreUpdate(0)
      setTimeout(() => {
        fit()
        const g = G.current; if (!g) return
        spawn()
        lastRef.current = performance.now()
        rafRef.current = requestAnimationFrame(loopRef.current)
      }, 0)
    }
    prevActiveRef.current = isActive
  }, [isActive, initG, fit, spawn, onScoreUpdate])

  // ── Play again ─────────────────────────────────────────────────────────
  const playAgain = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    initG()
    onScoreUpdate(0)
    setTimeout(() => {
      fit()
      const g = G.current; if (!g) return
      g.st = 'play'; setUiSt('play')
      spawn()
      lastRef.current = performance.now()
      rafRef.current = requestAnimationFrame(loopRef.current)
    }, 0)
  }, [initG, fit, spawn, onScoreUpdate])

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      className="relative w-full h-full"
      style={{ background: '#0b1230', overflow: 'hidden', touchAction: 'none', userSelect: 'none' }}
    >
      {/* Fredoka font */}
      <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;600;700&display=swap" rel="stylesheet" />

      {/* Canvas */}
      <canvas
        ref={cvRef}
        onClick={onClickTap}
        onTouchStart={onTouchTap}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', touchAction: 'none' }}
        aria-label="Stack Tower — tap to drop"
      />

      {/* ── BACK button — top-left ── */}
      <button
        className="st-btn"
        onClick={() => navigate('/app/arcade')}
        style={{
          position: 'absolute',
          top: 'calc(env(safe-area-inset-top, 0px) + 12px)',
          left: 14,
          height: 44, borderRadius: 14, border: 0,
          background: 'linear-gradient(180deg, #B8F77D 0%, #7BE056 100%)',
          color: '#111', fontWeight: 800, fontSize: 12,
          paddingLeft: 10, paddingRight: 12,
          boxShadow: '0 3px 0 rgba(0,0,0,0.25)',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 4,
        }}
        aria-label="Back to Arcade"
      >
        <span style={{ fontSize: 14 }}>←</span> BACK
      </button>

      {/* ── BEST — sits next to back button ── */}
      <div
        className="st-btn absolute pointer-events-none"
        style={{
          top: 'calc(env(safe-area-inset-top, 0px) + 14px)',
          left: 100,
          background: 'rgba(13,26,58,0.45)',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255,255,255,0.18)',
          borderRadius: 12, padding: '5px 12px',
          fontSize: 12, letterSpacing: '0.08em', color: '#fff',
        }}
      >
        BEST <b style={{ color: '#ffd23f' }}>{uiBest}</b>
      </div>

      {/* ── Score — top-center ── */}
      <div
        className="st-btn absolute pointer-events-none"
        style={{
          top: 'calc(env(safe-area-inset-top, 0px) + 6px)',
          left: '50%', transform: 'translateX(-50%)',
          textAlign: 'center',
        }}
      >
        <span
          style={{
            display: 'block', fontSize: 76, fontWeight: 700, color: '#fff', lineHeight: 1,
            textShadow: '0 4px 20px #0005',
            fontFamily: 'Fredoka, system-ui, sans-serif',
          }}
        >
          {uiScore}
        </span>
        {uiCombo >= 2 && (
          <span
            style={{
              display: 'inline-block', fontSize: 13, padding: '4px 12px', borderRadius: 14,
              background: 'rgba(13,26,58,0.45)', backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255,255,255,0.18)', marginTop: 2,
            }}
          >
            🔥 x{uiCombo}
          </span>
        )}
      </div>

      {/* ── Pause button — top-right ── */}
      <button
        className="st-btn"
        onClick={togglePause}
        style={{
          position: 'absolute',
          top: 'calc(env(safe-area-inset-top, 0px) + 12px)',
          right: 14,
          width: 44, height: 44, borderRadius: 14, border: 0,
          background: 'rgba(255,255,255,0.13)',
          backdropFilter: 'blur(6px)',
          color: '#fff', fontSize: 17, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
        aria-label={uiSt === 'paused' ? 'Resume' : 'Pause'}
      >
        {uiSt === 'paused' ? '▶' : '❚❚'}
      </button>

      {/* ── Sound button — top-right (second) ── */}
      <button
        className="st-btn"
        onClick={toggleMute}
        style={{
          position: 'absolute',
          top: 'calc(env(safe-area-inset-top, 0px) + 12px)',
          right: 66,
          width: 44, height: 44, borderRadius: 14, border: 0,
          background: 'rgba(255,255,255,0.13)',
          backdropFilter: 'blur(6px)',
          color: '#fff', fontSize: 17, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
        aria-label={uiMute ? 'Unmute' : 'Mute'}
      >
        {uiMute ? '🔇' : '🔊'}
      </button>

      {/* ── Rail — right side ── */}
      <div
        className="st-btn pointer-events-none"
        style={{
          position: 'absolute',
          right: 16,
          top: 'calc(env(safe-area-inset-top, 0px) + 96px)',
          bottom: 120,
          width: 12,
          borderRadius: 8,
          background: 'rgba(13,26,58,0.45)',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255,255,255,0.18)',
        }}
      >
        <div
          style={{
            position: 'absolute', left: 0, right: 0, bottom: 0,
            height: uiRail + '%',
            borderRadius: 8,
            background: 'linear-gradient(#ffd23f, #ff8a3d)',
            transition: 'height 0.45s cubic-bezier(.2,.9,.3,1)',
          }}
        />
        <div
          style={{
            position: 'absolute', right: -4, top: -30,
            fontSize: 12, padding: '3px 9px', borderRadius: 10,
            background: 'rgba(13,26,58,0.45)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255,255,255,0.18)',
            color: '#fff', whiteSpace: 'nowrap',
          }}
        >
          🏁 {uiRailTgt}
        </div>
      </div>

      {/* ── PAUSED overlay ── */}
      {uiSt === 'paused' && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ background: 'rgba(11,18,48,0.66)', backdropFilter: 'blur(3px)' }}
        >
          <div
            className="text-center px-8 py-8 rounded-3xl"
            style={{ background: 'rgba(16,26,56,0.93)', border: '1px solid rgba(255,255,255,0.12)',
              animation: 'st-rise 0.35s cubic-bezier(.2,.9,.3,1)' }}
          >
            <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 8, fontFamily: 'Fredoka, system-ui' }}>PAUSED</div>
            <div style={{ color: '#dfe8ff', fontSize: 15, marginBottom: 20 }}>Your tower is waiting.</div>
            <button
              className="st-btn"
              onClick={togglePause}
              style={{
                fontSize: 17, fontWeight: 700, border: 0, borderRadius: 16,
                padding: '14px 34px',
                background: 'linear-gradient(#ffd23f, #ff9a3d)',
                color: '#2b1700', cursor: 'pointer',
                boxShadow: '0 6px 0 #c4701c',
                fontFamily: 'Fredoka, system-ui',
              }}
            >
              Resume
            </button>
          </div>
        </div>
      )}

      {/* ── GAME OVER card — tap outside to go back ── */}
      {uiSt === 'over' && uiOvDone && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ background: 'rgba(11,18,48,0.66)', backdropFilter: 'blur(3px)', padding: 24 }}
          onClick={() => navigate('/app/arcade')}
        >
          {/* Stop click propagation on the card itself so only backdrop click navigates */}
          <div
            className="relative text-center w-full"
            onClick={e => e.stopPropagation()}
            style={{
              maxWidth: 320, padding: '30px 24px 24px', borderRadius: 26,
              background: 'rgba(16,26,56,0.96)',
              border: '1px solid rgba(255,255,255,0.12)',
              animation: 'st-rise 0.45s cubic-bezier(.2,.9,.3,1)',
            }}
          >
            {/* NEW BEST badge */}
            {uiNb && (
              <div
                style={{
                  position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)',
                  background: '#ffd23f', color: '#3a2a00', fontWeight: 700, fontSize: 13,
                  padding: '5px 14px', borderRadius: 14,
                  animation: 'st-wob 1s ease-in-out infinite',
                  fontFamily: 'Fredoka, system-ui',
                }}
              >
                NEW BEST!
              </div>
            )}

            {/* Title */}
            <h1 style={{
              margin: '0 0 10px', fontSize: 30, lineHeight: 1.1,
              background: 'linear-gradient(#ffd23f, #ff8a3d)',
              WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
              fontFamily: 'Fredoka, system-ui',
            }}>
              {uiNb ? 'NEW RECORD' : 'TOWER DOWN'}
            </h1>
            <p style={{ margin: '0 0 20px', fontSize: 15, lineHeight: 1.5, color: '#dfe8ff' }}>
              {uiNb ? 'Your tallest tower yet.' : 'So close. Try again.'}
            </p>

            {/* Stats */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              {[
                { label: 'FLOORS', val: uiScore },
                { label: 'BEST',   val: uiBest  },
                { label: 'PERFECT',val: uiPerf  },
              ].map(({ label, val }) => (
                <div key={label} style={{ flex: 1, borderRadius: 14, padding: '8px 4px', background: 'rgba(255,255,255,0.08)', textAlign: 'center' }}>
                  <small style={{ display: 'block', fontSize: 10, letterSpacing: '0.12em', opacity: 0.75, fontFamily: 'Fredoka, system-ui' }}>{label}</small>
                  <b style={{ fontSize: 24, fontFamily: 'Fredoka, system-ui' }}>{val}</b>
                </div>
              ))}
            </div>

            {/* Play again button */}
            <button
              className="st-btn"
              onClick={playAgain}
              style={{
                fontFamily: 'Fredoka, system-ui', fontWeight: 700, fontSize: 18,
                border: 0, borderRadius: 16, padding: '14px 34px', width: '100%',
                background: 'linear-gradient(#ffd23f, #ff9a3d)',
                color: '#2b1700', cursor: 'pointer',
                boxShadow: '0 6px 0 #c4701c',
              }}
            >
              Play again
            </button>

            {/* Back hint */}
            <p style={{ margin: '14px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.35)', cursor: 'pointer' }}
              onClick={() => navigate('/app/arcade')}>
              ← Back to Arcade
            </p>
          </div>
        </div>
      )}

      {/* Animations */}
      <style>{`
        @keyframes st-rise {
          from { transform: translateY(40px) scale(0.94); opacity: 0; }
        }
        @keyframes st-wob {
          50% { transform: translateX(-50%) rotate(-3deg) scale(1.06); }
        }
      `}</style>
    </div>
  )
}

export default StackGame
