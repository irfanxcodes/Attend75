import { useCallback, useEffect, useRef, useState } from 'react'

// ─── Constants (match reference exactly) ─────────────────────────────────────
const H0 = 640          // logical height
const GY = H0 - 64      // ground Y
const PW = 62           // pipe width
const SP = 215          // pipe spacing

// ─── Static scene data (seeded, no Math.random() at render time) ─────────────
const SNOW = Array.from({ length: 60 }, (_, i) => ({
  x: (i * 0.137 + 0.05) % 1,
  y: (i * 97.3) % H0,
  r: 0.8 + (i % 5) * 0.36,
  v: 6 + (i % 7) * 2,
  p: (i * 1.047) % 6.28,
}))

function mkLayer(hMin, hMax, wMin, wMax, seed) {
  const objs = []; let x = 0, s = seed
  while (x < 1500) {
    s = (s * 1664525 + 1013904223) >>> 0
    const bw = wMin + (s % 1000) / 1000 * (wMax - wMin)
    s = (s * 1664525 + 1013904223) >>> 0
    const bh = hMin + (s % 1000) / 1000 * (hMax - hMin)
    s = (s * 1664525 + 1013904223) >>> 0
    const l = s % 10
    objs.push({ x, w: bw, h: bh, l })
    s = (s * 1664525 + 1013904223) >>> 0
    x += bw + 2 + (s % 1000) / 1000 * 8
  }
  return { objs, len: x }
}

const FAR  = mkLayer(90, 200, 44, 72, 12345)
const NEAR = mkLayer(60, 140, 50, 84, 67890)

// ─── Audio ────────────────────────────────────────────────────────────────────
let _ac = null
function getAC() {
  if (!_ac) _ac = new (window.AudioContext || window.webkitAudioContext)()
  return _ac
}
function beep(freq, dur, type, vol, slide, muted) {
  if (muted) return
  try {
    const ac = getAC()
    const n = ac.currentTime
    const osc = ac.createOscillator()
    const gain = ac.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, n)
    osc.frequency.exponentialRampToValueAtTime(freq * slide, n + dur)
    gain.gain.setValueAtTime(vol, n)
    gain.gain.exponentialRampToValueAtTime(1e-4, n + dur)
    osc.connect(gain); gain.connect(ac.destination)
    osc.start(); osc.stop(n + dur)
  } catch {}
}

// ─── States ───────────────────────────────────────────────────────────────────
const S_READY  = 'ready'
const S_PLAY   = 'play'
const S_DEAD   = 'dead'
const S_PAUSED = 'paused'

// ─── Component ────────────────────────────────────────────────────────────────
function FlappyGame({ onGameEnd, onScoreUpdate, isActive, initialScore = 0 }) {
  const cvRef     = useRef(null)
  const rafRef    = useRef(null)
  const lastRef   = useRef(performance.now())
  const inputRef  = useRef(false)
  const endCalledRef = useRef(false)

  // All mutable game state in one ref — never triggers re-renders
  const G = useRef(null)

  // React state only for overlay rendering
  const [uiState, setUiState] = useState(S_READY)
  const [uiScore, setUiScore] = useState(0)
  const [uiBest,  setUiBest]  = useState(0)
  const [uiOt,    setUiOt]    = useState(0)   // dead timer for overlay fade-in
  const [uiNb,    setUiNb]    = useState(false)
  const [uiPop,   setUiPop]   = useState(0)
  const [uiMute,  setUiMute]  = useState(false)

  // ── Initialise game object ────────────────────────────────────────────────
  const initG = useCallback((initialScoreVal = 0) => {
    let best = 0, mute = false
    try { best = +localStorage.getItem('fb_best') || 0 } catch {}
    try { mute = localStorage.getItem('fb_mute') === '1' } catch {}

    G.current = {
      st: S_READY, pst: S_READY,
      t: 0, score: initialScoreVal, best, nb: false,
      ot: 0, shake: 0, flash: 0, pop: 0,
      mute,
      spd: 150, off: 0, tr: 0,
      bird: { y: 300, vy: 0, r: 0, sq: 0 },
      pipes: [], parts: [],
      snow: SNOW.map(s => ({ ...s })),
      // canvas size
      dpr: 1, w: 0, h: 0, s: 1, ww: 0,
    }
    setUiBest(best)
    setUiMute(mute)
    setUiState(S_READY)
    setUiScore(initialScoreVal)
    setUiOt(0)
    setUiNb(false)
    setUiPop(0)
    endCalledRef.current = false
  }, [])

  // ── Fit canvas ───────────────────────────────────────────────────────────
  const fit = useCallback(() => {
    const cv = cvRef.current; if (!cv) return
    const g = G.current; if (!g) return
    g.dpr = Math.min(devicePixelRatio || 1, 2)
    g.w = innerWidth; g.h = innerHeight
    cv.width  = g.w * g.dpr
    cv.height = g.h * g.dpr
    g.s  = g.h / H0
    g.ww = g.w / g.s
  }, [])

  // ── Spawn pipe ────────────────────────────────────────────────────────────
  const spawn = useCallback((x) => {
    const g = G.current; if (!g) return
    const prev = g.pipes[g.pipes.length - 1]
    const gap = 178 - Math.min(g.score * 1.2, 34)
    const lo = 62 + gap / 2, hi = GY - 62 - gap / 2
    let c = lo + Math.random() * (hi - lo)
    if (prev) c = Math.max(prev.gy - 170, Math.min(prev.gy + 170, c))
    c = Math.max(lo, Math.min(hi, c))
    g.pipes.push({ x, gy: c, gap, ps: false })
  }, [])

  // ── Burst particles ───────────────────────────────────────────────────────
  const burst = useCallback((x, y, n, col, sp) => {
    const g = G.current; if (!g) return
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, v = sp * (0.3 + Math.random())
      g.parts.push({ x, y, vx: Math.cos(a) * v - 40, vy: Math.sin(a) * v, l: 0.5, m: 0.5, r: 2 + Math.random() * 3, c: col })
    }
  }, [])

  // ── Flap ─────────────────────────────────────────────────────────────────
  const flap = useCallback(() => {
    const g = G.current; if (!g) return
    beep(1, 0, 'sine', 0, 1, g.mute)
    if (g.st === S_READY) {
      g.st = S_PLAY
      setUiState(S_PLAY)
    }
    if (g.st === S_PLAY) {
      g.bird.vy = -430; g.bird.sq = 1
      burst(g.ww * 0.3 - 10, g.bird.y + 10, 5, '#ffffffaa', 70)
      beep(430, 0.12, 'square', 0.05, 1.7, g.mute)
    } else if (g.st === S_DEAD && g.ot > 0.7) {
      // retry
      g.st = S_READY; g.score = 0; g.pipes = []; g.bird.vy = 0; g.bird.r = 0
      g.nb = false; g.parts = []; g.t = 0; g.ot = 0
      endCalledRef.current = false
      setUiState(S_READY); setUiScore(0); setUiOt(0); setUiNb(false)
    } else if (g.st === S_PAUSED) {
      g.st = g.pst
      setUiState(g.pst)
    }
  }, [burst])

  // ── Die ───────────────────────────────────────────────────────────────────
  const die = useCallback(() => {
    const g = G.current; if (!g) return
    g.st = S_DEAD; g.ot = 0; g.shake = 0.4; g.flash = 1
    g.bird.vy = -220
    burst(g.ww * 0.3, g.bird.y, 16, '#ff8c61', 200)
    beep(170, 0.35, 'sawtooth', 0.12, 0.35, g.mute)
    try { navigator.vibrate && navigator.vibrate(120) } catch {}
    if (g.score > g.best) {
      g.best = g.score; g.nb = true
      try { localStorage.setItem('fb_best', g.best) } catch {}
      setUiBest(g.best); setUiNb(true)
    }
    setUiState(S_DEAD)
    if (!endCalledRef.current) {
      endCalledRef.current = true
      onGameEnd(g.score)
    }
  }, [burst, onGameEnd])

  // ── Update ────────────────────────────────────────────────────────────────
  const upd = useCallback((dt) => {
    const g = G.current; if (!g) return
    g.t += dt
    g.shake = Math.max(0, g.shake - dt)
    g.flash = Math.max(0, g.flash - dt * 3)
    g.pop   = Math.max(0, g.pop   - dt * 4)

    for (const f of g.snow) {
      f.y += f.v * dt
      f.x += Math.sin(g.t + f.p) * 0.0003
      if (f.y > H0) f.y = -4
    }
    g.parts = g.parts.filter(p => { p.l -= dt; p.x += p.vx * dt; p.y += p.vy * dt; return p.l > 0 })

    const bx = g.ww * 0.3

    if (g.st === S_READY) {
      g.bird.y = 300 + Math.sin(g.t * 3.2) * 10
      g.bird.r = Math.sin(g.t * 3.2) * 0.08
      g.off += 34 * dt
    } else if (g.st === S_PLAY) {
      g.spd = 150 + Math.min(g.score * 2.5, 70)
      g.off += g.spd * dt
      g.bird.vy += 1500 * dt
      g.bird.y  += g.bird.vy * dt
      g.bird.r  += (Math.max(-0.5, Math.min(1.1, g.bird.vy / 600)) - g.bird.r) * Math.min(1, dt * 12)
      g.bird.sq *= Math.pow(0.0005, dt)
      if (g.bird.y < 16) { g.bird.y = 16; g.bird.vy = 0 }

      if (!g.pipes.length || g.pipes[g.pipes.length - 1].x < g.ww - SP) spawn(g.ww + PW + 20)

      for (let i = g.pipes.length - 1; i >= 0; i--) {
        g.pipes[i].x -= g.spd * dt
        if (g.pipes[i].x < -90) g.pipes.splice(i, 1)
      }

      // Trail
      g.tr -= dt
      if (g.tr <= 0) {
        g.tr = 0.035
        g.parts.push({ x: bx - 12, y: g.bird.y, vx: -30, vy: 0, l: 0.3, m: 0.3, r: 5, c: '#ff8c6155' })
      }

      for (const p of g.pipes) {
        if (!p.ps && p.x + PW < bx - 13) {
          p.ps = true; g.score++; g.pop = 1
          setUiScore(g.score)
          onScoreUpdate(g.score)
          beep(880, 0.1, 'sine', 0.1, 1.4, g.mute)
        }
        if (bx + 13 > p.x && bx - 13 < p.x + PW &&
            (g.bird.y - 13 < p.gy - p.gap / 2 || g.bird.y + 13 > p.gy + p.gap / 2)) {
          return die()
        }
      }
      if (g.bird.y + 15 >= GY) { g.bird.y = GY - 15; die() }

    } else if (g.st === S_DEAD) {
      g.ot += dt
      setUiOt(g.ot)
      g.bird.vy += 1500 * dt
      g.bird.y = Math.min(GY - 15, g.bird.y + g.bird.vy * dt)
      g.bird.r = Math.min(1.5, g.bird.r + dt * 5)
    }
  }, [spawn, die, onScoreUpdate])

  // ── Draw helpers ──────────────────────────────────────────────────────────
  const drawLayer = useCallback((ctx, L, offset, col, win, base, ww) => {
    ctx.fillStyle = col
    for (let o = -(offset % L.len); o < ww; o += L.len) {
      for (const b of L.objs) {
        const x = o + b.x
        if (x > ww || x + b.w < 0) continue
        ctx.fillRect(x, base - b.h, b.w, b.h)
        ctx.fillStyle = win
        let i = 0
        for (let wx = x + 8; wx < x + b.w - 10; wx += 14, i++) {
          let j = 0
          for (let wy = base - b.h + 12; wy < base - 14; wy += 18, j++) {
            if ((i * 3 + j * 5 + b.l) % 4 === 0) ctx.fillRect(wx, wy, 6, 10)
          }
        }
        ctx.fillStyle = col
      }
    }
  }, [])

  const drawPipe = useCallback((ctx, x, y0, y1) => {
    const gr = ctx.createLinearGradient(x, 0, x + PW, 0)
    gr.addColorStop(0,   '#5be6bd')
    gr.addColorStop(0.5, '#3cc7a2')
    gr.addColorStop(1,   '#26967f')
    // Body
    ctx.fillStyle = gr
    ctx.fillRect(x + 5, y0, PW - 10, y1 - y0)
    ctx.fillStyle = '#ffffff2a'
    ctx.fillRect(x + 12, y0, 5, y1 - y0)
    // Cap — top pipe cap is at y1 side, bottom at y0 side
    const cy = y0   // will be set by caller
    ctx.fillStyle = gr
    ctx.beginPath(); ctx.roundRect(x, cy, PW, 26, 8); ctx.fill()
    ctx.strokeStyle = '#1e7664'; ctx.lineWidth = 2; ctx.stroke()
    ctx.fillStyle = '#ffffff2a'
    ctx.beginPath(); ctx.roundRect(x + 8, cy + 4, 5, 18, 3); ctx.fill()
  }, [])

  // ── Main draw ─────────────────────────────────────────────────────────────
  const draw = useCallback((ctx) => {
    const g = G.current; if (!g) return
    const { dpr, s, ww, t, shake, flash, pop, bird, pipes, parts, snow, off, st, score } = g

    const sh = shake * 30
    ctx.setTransform(
      dpr * s, 0, 0, dpr * s,
      (Math.random() - 0.5) * sh * dpr,
      (Math.random() - 0.5) * sh * dpr
    )

    // Sky
    const sk = ctx.createLinearGradient(0, 0, 0, H0)
    sk.addColorStop(0, '#5d5981'); sk.addColorStop(1, '#48436a')
    ctx.fillStyle = sk; ctx.fillRect(-20, -20, ww + 40, H0 + 40)

    // Moon
    ctx.fillStyle = '#ffffff10'; ctx.beginPath(); ctx.arc(ww * 0.8, 130, 46, 0, 7); ctx.fill()
    ctx.fillStyle = '#f3efff';   ctx.beginPath(); ctx.arc(ww * 0.8, 130, 24, 0, 7); ctx.fill()

    // Snow
    for (const f of snow) {
      ctx.fillStyle = `rgba(255,255,255,${0.25 + 0.25 * Math.sin(t * 2 + f.p)})`
      ctx.beginPath(); ctx.arc(f.x * ww, f.y, f.r, 0, 7); ctx.fill()
    }

    // City layers
    drawLayer(ctx, FAR,  off * 0.20, '#413b6a', '#5a4fa088', GY, ww)
    drawLayer(ctx, NEAR, off * 0.45, '#322d57', '#7a63d066', GY, ww)

    // Pipes
    for (const p of pipes) {
      // Top pipe
      const topBody0 = -30, topBody1 = p.gy - p.gap / 2
      const gr = ctx.createLinearGradient(p.x, 0, p.x + PW, 0)
      gr.addColorStop(0, '#5be6bd'); gr.addColorStop(0.5, '#3cc7a2'); gr.addColorStop(1, '#26967f')
      ctx.fillStyle = gr
      ctx.fillRect(p.x + 5, topBody0, PW - 10, topBody1 - topBody0 - 26)
      ctx.fillStyle = '#ffffff2a'; ctx.fillRect(p.x + 12, topBody0, 5, topBody1 - topBody0 - 26)
      // top cap (at bottom of top pipe)
      ctx.fillStyle = gr
      ctx.beginPath(); ctx.roundRect(p.x, topBody1 - 26, PW, 26, 8); ctx.fill()
      ctx.strokeStyle = '#1e7664'; ctx.lineWidth = 2; ctx.stroke()
      ctx.fillStyle = '#ffffff2a'; ctx.beginPath(); ctx.roundRect(p.x + 8, topBody1 - 22, 5, 18, 3); ctx.fill()

      // Bottom pipe
      const botBody0 = p.gy + p.gap / 2, botBody1 = GY + 2
      ctx.fillStyle = gr
      ctx.fillRect(p.x + 5, botBody0 + 26, PW - 10, botBody1 - botBody0 - 26)
      ctx.fillStyle = '#ffffff2a'; ctx.fillRect(p.x + 12, botBody0 + 26, 5, botBody1 - botBody0 - 26)
      // bottom cap (at top of bottom pipe)
      ctx.fillStyle = gr
      ctx.beginPath(); ctx.roundRect(p.x, botBody0, PW, 26, 8); ctx.fill()
      ctx.strokeStyle = '#1e7664'; ctx.lineWidth = 2; ctx.stroke()
      ctx.fillStyle = '#ffffff2a'; ctx.beginPath(); ctx.roundRect(p.x + 8, botBody0 + 4, 5, 18, 3); ctx.fill()
    }

    // Ground
    ctx.fillStyle = '#2a2549'; ctx.fillRect(-20, GY, ww + 40, H0 - GY + 20)
    ctx.fillStyle = '#7660d6'; ctx.fillRect(-20, GY, ww + 40, 3)
    ctx.fillStyle = '#373060'
    for (let x = -(off % 28); x < ww; x += 28) ctx.fillRect(x, GY + 16, 14, 6)

    // Particles
    for (const p of parts) {
      ctx.globalAlpha = Math.max(0, p.l / p.m)
      ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (p.l / p.m + 0.3), 0, 7); ctx.fill()
    }
    ctx.globalAlpha = 1

    // Bird
    ctx.save()
    ctx.translate(ww * 0.3, bird.y)
    ctx.rotate(bird.r)
    ctx.scale(1 - bird.sq * 0.12, 1 + bird.sq * 0.2)

    ctx.shadowColor = '#ff8c6180'; ctx.shadowBlur = 16
    ctx.fillStyle = '#ff8c61'
    ctx.beginPath(); ctx.roundRect(-17, -17, 34, 34, 10); ctx.fill()
    ctx.shadowBlur = 0
    ctx.strokeStyle = '#ffa883'; ctx.lineWidth = 3; ctx.stroke()

    // Wing
    ctx.save(); ctx.translate(-7, 5)
    ctx.rotate(st === S_PLAY ? Math.sin(t * 28) * 0.5 : Math.sin(t * 6) * 0.2)
    ctx.fillStyle = '#f06f45'
    ctx.beginPath(); ctx.roundRect(-8, -5, 16, 10, 5); ctx.fill()
    ctx.restore()

    if (st === S_DEAD) {
      // X eyes
      ctx.strokeStyle = '#1b1640'; ctx.lineWidth = 2.5
      ctx.beginPath(); ctx.moveTo(3, -9); ctx.lineTo(11, -1); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(11, -9); ctx.lineTo(3, -1); ctx.stroke()
    } else {
      // Eye
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(7, -5, 7, 0, 7); ctx.fill()
      ctx.fillStyle = '#1b1640'; ctx.beginPath(); ctx.arc(9, -5, 3.4, 0, 7); ctx.fill()
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(10, -6.2, 1.1, 0, 7); ctx.fill()
    }
    ctx.restore()

    // ── Canvas-drawn overlays ──────────────────────────────────────────────
    const cx = ww / 2

    // Ready screen (title drawn on canvas for exact match)
    if (st === S_READY) {
      // Title
      ctx.font = '700 56px Fredoka,system-ui,sans-serif'
      ctx.textAlign = 'center'; ctx.fillStyle = '#fff'
      ctx.shadowColor = '#0007'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3
      ctx.fillText('FLAPPY', cx, 170)
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0
      ctx.font = '700 16px Fredoka,system-ui,sans-serif'
      ctx.fillStyle = '#cfc9f2'; ctx.fillText('Fly through the gaps', cx, 206)

      if (g.best > 0) {
        ctx.fillStyle = '#ffffff1c'
        ctx.beginPath(); ctx.roundRect(cx - 52, 228, 104, 30, 15); ctx.fill()
        ctx.font = '700 15px Fredoka,system-ui,sans-serif'
        ctx.fillStyle = '#ffb48f'; ctx.fillText('BEST ' + g.best, cx, 249)
      }

      // Pulse ring
      const pl = (t * 1.2) % 1
      ctx.strokeStyle = `rgba(255,255,255,${0.5 * (1 - pl)})`
      ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, 455, 16 + pl * 26, 0, 7); ctx.stroke()
      ctx.fillStyle = '#ffffff30'; ctx.beginPath(); ctx.arc(cx, 455, 13, 0, 7); ctx.fill()

      ctx.font = '700 16px Fredoka,system-ui,sans-serif'
      ctx.fillStyle = `rgba(255,255,255,${0.65 + 0.3 * Math.sin(t * 4)})`
      ctx.fillText('Tap or press Space to start', cx, 520)
    }

    // Score during play
    if (st === S_PLAY || st === S_PAUSED) {
      const fs = Math.round(64 * (1 + pop * 0.22))
      ctx.font = `700 ${fs}px Fredoka,system-ui,sans-serif`
      ctx.textAlign = 'center'
      ctx.fillStyle = 'rgba(0,0,0,0.4)'
      ctx.shadowColor = '#0007'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3
      ctx.fillText(String(score), cx + 2, 118 + 2)
      ctx.fillStyle = '#fff'; ctx.fillText(String(score), cx, 118)
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0
    }

    // Paused
    if (st === S_PAUSED) {
      ctx.fillStyle = '#14102c99'; ctx.fillRect(-20, -20, ww + 40, H0 + 40)
      ctx.font = '700 44px Fredoka,system-ui,sans-serif'
      ctx.textAlign = 'center'; ctx.fillStyle = '#fff'
      ctx.shadowColor = '#0007'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3
      ctx.fillText('PAUSED', cx, 300)
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0
      ctx.font = '700 17px Fredoka,system-ui,sans-serif'
      ctx.fillStyle = '#cfc9f2'; ctx.fillText('Tap to resume', cx, 340)
    }

    // Dead overlay — drawn entirely on canvas for pixel-perfect match
    if (st === S_DEAD) {
      if (flash > 0) {
        ctx.fillStyle = `rgba(255,255,255,${flash * 0.6})`
        ctx.fillRect(-20, -20, ww + 40, H0 + 40)
      }
      if (g.ot > 0.45) {
        const k  = Math.min(1, (g.ot - 0.45) / 0.35)
        const e  = 1 - Math.pow(1 - k, 3)
        const cy = 200 + (1 - e) * 50
        ctx.globalAlpha = k

        // Card
        ctx.fillStyle = '#1b1838ee'
        ctx.beginPath(); ctx.roundRect(cx - 132, cy, 264, 262, 26); ctx.fill()
        ctx.strokeStyle = '#ffffff22'; ctx.lineWidth = 1.5; ctx.stroke()

        // GAME OVER
        ctx.font = '700 28px Fredoka,system-ui,sans-serif'
        ctx.textAlign = 'center'; ctx.fillStyle = '#fff'
        ctx.shadowColor = '#0007'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3
        ctx.fillText('GAME OVER', cx, cy + 50)
        ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0

        // Medal
        const mc = score >= 30 ? '#ffd84a' : score >= 15 ? '#d6dbe8' : score >= 5 ? '#d9895a' : null
        ctx.beginPath(); ctx.arc(cx - 68, cy + 120, 30, 0, 7)
        if (mc) {
          ctx.fillStyle = mc; ctx.fill()
          ctx.beginPath(); ctx.arc(cx - 68, cy + 120, 22, 0, 7)
          ctx.strokeStyle = '#00000030'; ctx.lineWidth = 3; ctx.stroke()
          ctx.font = '700 26px Fredoka,system-ui,sans-serif'
          ctx.fillStyle = '#00000040'; ctx.fillText('★', cx - 68, cy + 129)
        } else {
          ctx.strokeStyle = '#ffffff33'; ctx.lineWidth = 3
          ctx.setLineDash([5, 5]); ctx.stroke(); ctx.setLineDash([])
          ctx.font = '700 18px Fredoka,system-ui,sans-serif'
          ctx.fillStyle = '#ffffff44'; ctx.fillText('5', cx - 68, cy + 127)
        }

        // Score / Best
        ctx.font = '700 11px Fredoka,system-ui,sans-serif'
        ctx.fillStyle = '#a79fd6'; ctx.fillText('SCORE', cx + 40, cy + 96)
        ctx.font = '700 36px Fredoka,system-ui,sans-serif'
        ctx.fillStyle = '#fff'
        ctx.shadowColor = '#0007'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3
        ctx.fillText(String(score), cx + 40, cy + 128)
        ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0
        ctx.font = '700 11px Fredoka,system-ui,sans-serif'
        ctx.fillStyle = '#a79fd6'; ctx.fillText('BEST', cx + 40, cy + 154)
        ctx.font = '700 22px Fredoka,system-ui,sans-serif'
        ctx.fillStyle = '#ffb48f'
        ctx.shadowColor = '#0007'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3
        ctx.fillText(String(g.best), cx + 40, cy + 178)
        ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0

        // NEW BEST badge
        if (g.nb) {
          ctx.fillStyle = '#ffd84a'
          ctx.beginPath(); ctx.roundRect(cx - 50, cy - 14, 100, 28, 14); ctx.fill()
          ctx.font = '700 14px Fredoka,system-ui,sans-serif'
          ctx.fillStyle = '#3a2a00'; ctx.fillText('NEW BEST!', cx, cy + 5)
        }

        // Tap to retry (pulsing)
        if (g.ot > 0.7) {
          const pu = 1 + Math.sin(t * 6) * 0.03
          ctx.save(); ctx.translate(cx, cy + 222); ctx.scale(pu, pu)
          ctx.fillStyle = '#ff8c61'
          ctx.beginPath(); ctx.roundRect(-92, -21, 184, 42, 21); ctx.fill()
          ctx.font = '700 17px Fredoka,system-ui,sans-serif'
          ctx.fillStyle = '#2a1408'; ctx.fillText('Tap to retry', 0, 6)
          ctx.restore()
        }

        ctx.globalAlpha = 1
      }
    }
  }, [drawLayer])

  // ── Loop ─────────────────────────────────────────────────────────────────
  const loopFn = useCallback((now) => {
    const g = G.current; if (!g) return
    const dt = Math.min((now - lastRef.current) / 1000, 0.033)
    lastRef.current = now

    if (g.st !== S_PAUSED) upd(dt); else g.t += dt

    const cv = cvRef.current; if (!cv) return
    const ctx = cv.getContext('2d')
    if (ctx) draw(ctx)

    rafRef.current = requestAnimationFrame(loopFn)
  }, [upd, draw])

  // Keep stable ref
  const loopRef = useRef(loopFn)
  useEffect(() => { loopRef.current = loopFn }, [loopFn])

  // ── Input ─────────────────────────────────────────────────────────────────
  const lastTouchRef = useRef(0)
  const onTouchTap = useCallback((e) => {
    if (e.target.closest?.('.fb-btn')) return
    e.preventDefault(); lastTouchRef.current = Date.now(); flap()
  }, [flap])
  const onClickTap = useCallback((e) => {
    if (e.target.closest?.('.fb-btn')) return
    if (Date.now() - lastTouchRef.current < 300) return
    e.preventDefault(); flap()
  }, [flap])
  const onKey = useCallback((e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.key === 'w') { e.preventDefault(); flap() }
    else if (e.key === 'p' || e.key === 'Escape') {
      const g = G.current; if (!g) return
      if (g.st === S_PLAY) { g.pst = g.st; g.st = S_PAUSED; setUiState(S_PAUSED) }
      else if (g.st === S_PAUSED) { g.st = g.pst; setUiState(g.pst) }
    }
  }, [flap])

  const togglePause = useCallback(() => {
    const g = G.current; if (!g) return
    if (g.st === S_PLAY) { g.pst = g.st; g.st = S_PAUSED; setUiState(S_PAUSED) }
    else if (g.st === S_PAUSED) { g.st = g.pst; setUiState(g.pst) }
  }, [])

  const toggleMute = useCallback(() => {
    const g = G.current; if (!g) return
    g.mute = !g.mute; setUiMute(g.mute)
    try { localStorage.setItem('fb_mute', g.mute ? '1' : '0') } catch {}
  }, [])

  // ── Visibility change ─────────────────────────────────────────────────────
  const onVisChange = useCallback(() => {
    const g = G.current; if (!g) return
    if (document.hidden && g.st === S_PLAY) {
      g.pst = g.st; g.st = S_PAUSED; setUiState(S_PAUSED)
    }
  }, [])

  // ── Mount / unmount ───────────────────────────────────────────────────────
  useEffect(() => {
    initG(0)
    setTimeout(() => {
      fit()
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
  }, []) // intentionally empty — runs once

  // ── isActive restart ──────────────────────────────────────────────────────
  const prevActiveRef = useRef(isActive)
  useEffect(() => {
    if (isActive && !prevActiveRef.current) {
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
      initG(initialScore)
      onScoreUpdate(initialScore)
      setTimeout(() => {
        fit()
        lastRef.current = performance.now()
        rafRef.current = requestAnimationFrame(loopRef.current)
      }, 0)
    }
    prevActiveRef.current = isActive
  }, [isActive, initialScore, initG, fit, onScoreUpdate])

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="relative w-full h-full" style={{ background: '#2b2748', overflow: 'hidden', touchAction: 'none' }}>
      {/* Load Fredoka font */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;600;700&display=swap" rel="stylesheet" />

      {/* Canvas — fills the full area */}
      <canvas
        ref={cvRef}
        onClick={onClickTap}
        onTouchStart={onTouchTap}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', touchAction: 'none', userSelect: 'none' }}
        aria-label="Flappy Bird game — tap to play"
      />

      {/* Sound button — top-left */}
      <button
        className="fb-btn"
        onClick={toggleMute}
        style={{
          position: 'absolute',
          top: 'calc(env(safe-area-inset-top, 0px) + 12px)',
          left: 14,
          width: 44, height: 44,
          borderRadius: 14, border: 0,
          background: 'rgba(255,255,255,0.13)',
          color: '#fff', fontSize: 17,
          backdropFilter: 'blur(6px)',
          cursor: 'pointer', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          zIndex: 20,
        }}
        aria-label={uiMute ? 'Unmute' : 'Mute'}
      >
        {uiMute ? '🔇' : '🔊'}
      </button>

      {/* Pause button — top-right */}
      <button
        className="fb-btn"
        onClick={togglePause}
        style={{
          position: 'absolute',
          top: 'calc(env(safe-area-inset-top, 0px) + 12px)',
          right: 14,
          width: 44, height: 44,
          borderRadius: 14, border: 0,
          background: 'rgba(255,255,255,0.13)',
          color: '#fff', fontSize: 17,
          backdropFilter: 'blur(6px)',
          cursor: 'pointer', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          zIndex: 20,
        }}
        aria-label={uiState === S_PAUSED ? 'Resume' : 'Pause'}
      >
        {uiState === S_PAUSED ? '▶' : '❚❚'}
      </button>
    </div>
  )
}

export default FlappyGame
