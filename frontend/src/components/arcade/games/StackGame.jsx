import { useCallback, useEffect, useRef, useState } from 'react'

// === STACK TOWER — Polished with juice, 3D blocks, dynamic bg, particles ===
const GW = 320, GH = 560
const BH = 30, START_W = 90
const BASE_SPEED = 1.3, SPEED_INC = 0.06, MAX_SPEED = 5.5
const DROP_GRAVITY = 0.6, PERFECT_THRESH = 4

// Dynamic sky phases based on height
const SKY_PHASES = [
  { at: 0, top: '#87CEEB', bot: '#C8E6F0', label: 'Ground' },
  { at: 15, top: '#5BA3D9', bot: '#87CEEB', label: 'City' },
  { at: 35, top: '#2D5F8A', bot: '#7FB3D8', label: 'Clouds' },
  { at: 55, top: '#1A1A4E', bot: '#4A5FA0', label: 'High Atmo' },
  { at: 80, top: '#0A0A2A', bot: '#1A1A4E', label: 'Space' },
]

// Block colors with gradients (top/front/side)
const BLOCK_THEMES = [
  { top: '#FFE066', front: '#FFD700', side: '#CC9900', win: 'rgba(255,255,255,0.5)' },
  { top: '#FF9A5C', front: '#FF7043', side: '#D84315', win: 'rgba(255,255,255,0.4)' },
  { top: '#AED581', front: '#7CB342', side: '#558B2F', win: 'rgba(255,255,255,0.4)' },
  { top: '#4FC3F7', front: '#039BE5', side: '#0277BD', win: 'rgba(255,255,255,0.3)' },
  { top: '#CE93D8', front: '#AB47BC', side: '#7B1FA2', win: 'rgba(255,255,255,0.3)' },
  { top: '#FF8A80', front: '#E53935', side: '#B71C1C', win: 'rgba(255,255,255,0.3)' },
  { top: '#80DEEA', front: '#00ACC1', side: '#00838F', win: 'rgba(255,255,255,0.3)' },
]

function getTheme(i) { return BLOCK_THEMES[i % BLOCK_THEMES.length] }
function getSky(score) {
  let phase = SKY_PHASES[0]
  for (const p of SKY_PHASES) { if (score >= p.at) phase = p }
  return phase
}
function lerp(a, b, t) { return a + (b - a) * Math.min(Math.max(t, 0), 1) }

function createState() {
  return {
    stack: [{ x: GW / 2 - START_W / 2, w: START_W, y: GH - BH - 20 }],
    swing: { x: 30, w: START_W, dir: 1 },
    drop: null, // {x, y, w, vy, targetY}
    score: 0, over: false, combo: 0,
    speed: BASE_SPEED, camY: 0,
    particles: [], shake: 0, shakeX: 0, shakeY: 0,
    floatTexts: [], // {text, x, y, life, color}
    towerFall: false, fallBlocks: [], // game over animation
  }
}

function spawnParticles(st, x, y, w, count, color) {
  for (let i = 0; i < count; i++) {
    st.particles.push({
      x: x + Math.random() * w, y,
      vx: (Math.random() - 0.5) * 6,
      vy: -Math.random() * 5 - 2,
      size: 2 + Math.random() * 4,
      life: 40 + Math.random() * 20,
      color: color || '#FFD700',
    })
  }
}

function addFloatText(st, text, x, y, color) {
  st.floatTexts.push({ text, x, y, life: 60, color: color || '#FFD700' })
}

function dropBlock(st) {
  if (st.over || st.drop) return
  const top = st.stack[st.stack.length - 1]
  // Drop from a fixed distance above the top block (in world space)
  const dropY = top.y - BH - 80
  st.drop = { x: st.swing.x, y: dropY, w: st.swing.w, vy: 0, targetY: top.y - BH }
}

function landBlock(st) {
  const { drop, stack } = st
  const top = stack[stack.length - 1]
  const oL = Math.max(drop.x, top.x)
  const oR = Math.min(drop.x + drop.w, top.x + top.w)
  const oW = oR - oL

  if (oW <= 0) {
    // Missed — trigger tower fall
    st.over = true; st.towerFall = true
    st.fallBlocks = stack.map(b => ({ ...b, vx: (Math.random() - 0.5) * 3, vy: 0, rot: 0, vr: (Math.random() - 0.5) * 0.1 }))
    spawnParticles(st, drop.x, drop.y, drop.w, 15, '#FF5555')
    return
  }

  const isPerfect = Math.abs(drop.x - top.x) < PERFECT_THRESH && Math.abs(drop.w - top.w) < PERFECT_THRESH

  if (isPerfect) {
    st.combo++
    stack.push({ x: top.x, y: top.y - BH, w: top.w })
    spawnParticles(st, top.x, top.y - BH, top.w, 20, '#FFD700')
    st.shake = 5
    const comboText = st.combo >= 3 ? `COMBO x${st.combo}!` : 'PERFECT!'
    addFloatText(st, comboText, GW / 2, top.y - BH - 30 + st.camY, st.combo >= 3 ? '#FF6B35' : '#FFD700')
  } else {
    st.combo = 0
    // Add debris for overhang
    if (drop.x < top.x) spawnParticles(st, drop.x, drop.y, top.x - drop.x, 8, '#AA6633')
    if (drop.x + drop.w > top.x + top.w) spawnParticles(st, top.x + top.w, drop.y, drop.x + drop.w - top.x - top.w, 8, '#AA6633')
    stack.push({ x: oL, y: top.y - BH, w: oW })
    st.shake = 3
  }

  st.score++; st.drop = null
  st.speed = Math.min(BASE_SPEED + st.score * SPEED_INC, MAX_SPEED)
  const newW = isPerfect ? top.w : oW
  st.swing = { x: st.score % 2 === 0 ? 10 : GW - newW - 10, w: newW, dir: st.score % 2 === 0 ? 1 : -1 }

  // Camera scroll — aggressively track the top of the stack
  // Keep the top block at ~65% from the top of the viewport
  const newTop = stack[stack.length - 1]
  const targetCamY = -(newTop.y - GH * 0.65)
  if (targetCamY > st.camY) st.camY = targetCamY

  if (newW < 6) { st.over = true; st.towerFall = true; st.fallBlocks = stack.map(b => ({ ...b, vx: (Math.random() - 0.5) * 2, vy: 0, rot: 0, vr: (Math.random() - 0.5) * 0.08 })) }
}

function update(st) {
  if (st.towerFall) {
    for (const b of st.fallBlocks) { b.vy += 0.3; b.y += b.vy; b.x += b.vx; b.rot += b.vr }
    return
  }
  if (st.over) return

  // Swing
  if (!st.drop) {
    st.swing.x += st.speed * st.swing.dir
    if (st.swing.x + st.swing.w > GW - 5) st.swing.dir = -1
    if (st.swing.x < 5) st.swing.dir = 1
  }

  // Drop
  if (st.drop) {
    st.drop.vy += DROP_GRAVITY
    st.drop.y += st.drop.vy
    if (st.drop.y >= st.drop.targetY) { st.drop.y = st.drop.targetY; landBlock(st) }
  }

  // Particles
  for (let i = st.particles.length - 1; i >= 0; i--) {
    const p = st.particles[i]
    p.x += p.vx; p.y += p.vy; p.vy += 0.2; p.life--
    if (p.life <= 0) st.particles.splice(i, 1)
  }

  // Float texts
  for (let i = st.floatTexts.length - 1; i >= 0; i--) {
    st.floatTexts[i].y -= 1.2; st.floatTexts[i].life--
    if (st.floatTexts[i].life <= 0) st.floatTexts.splice(i, 1)
  }

  // Shake decay
  if (st.shake > 0) {
    st.shakeX = (Math.random() - 0.5) * st.shake * 2
    st.shakeY = (Math.random() - 0.5) * st.shake * 1.5
    st.shake *= 0.8
    if (st.shake < 0.3) st.shake = 0
  } else { st.shakeX = 0; st.shakeY = 0 }
}

function draw3DBlock(ctx, x, y, w, h, theme, s) {
  const depth = 6 * s
  // Top face (lighter)
  ctx.fillStyle = theme.top
  ctx.beginPath()
  ctx.moveTo(x, y); ctx.lineTo(x + depth, y - depth)
  ctx.lineTo(x + w + depth, y - depth); ctx.lineTo(x + w, y)
  ctx.closePath(); ctx.fill()
  // Front face
  const grad = ctx.createLinearGradient(x, y, x, y + h)
  grad.addColorStop(0, theme.front); grad.addColorStop(1, theme.side)
  ctx.fillStyle = grad
  ctx.fillRect(x, y, w, h)
  // Right side face
  ctx.fillStyle = theme.side
  ctx.beginPath()
  ctx.moveTo(x + w, y); ctx.lineTo(x + w + depth, y - depth)
  ctx.lineTo(x + w + depth, y + h - depth); ctx.lineTo(x + w, y + h)
  ctx.closePath(); ctx.fill()
  // Windows
  ctx.fillStyle = theme.win
  const winCount = Math.max(1, Math.floor(w / (18 * s)))
  const winW = w * 0.15, winH = h * 0.45, gap = (w - winCount * winW) / (winCount + 1)
  for (let i = 0; i < winCount; i++) {
    const wx = x + gap + i * (winW + gap)
    ctx.fillRect(wx, y + h * 0.2, winW, winH)
  }
  // Block border
  ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 1
  ctx.strokeRect(x, y, w, h)
}

function render(ctx, st, scale) {
  const s = scale, w = GW * s, h = GH * s
  const cam = st.camY * s

  // Apply shake
  ctx.save()
  ctx.translate(st.shakeX * s, st.shakeY * s)

  // Dynamic sky
  const sky = getSky(st.score)
  const grad = ctx.createLinearGradient(0, 0, 0, h)
  grad.addColorStop(0, sky.top); grad.addColorStop(1, sky.bot)
  ctx.fillStyle = grad; ctx.fillRect(-10, -10, w + 20, h + 20)

  // Parallax city silhouette (fades as you go higher)
  const cityAlpha = Math.max(0, 1 - st.score / 40)
  if (cityAlpha > 0) {
    ctx.globalAlpha = cityAlpha * 0.3
    const buildings = [60, 90, 45, 110, 70, 55, 95, 40, 80, 65]
    for (let i = 0; i < buildings.length; i++) {
      const bx = i * 34 * s, bw = 28 * s, bh = buildings[i] * s
      ctx.fillStyle = '#1A3A5C'
      ctx.fillRect(bx, h - bh + cam * 0.2, bw, bh)
    }
    ctx.globalAlpha = 1
  }

  // Clouds (mid-height)
  if (st.score > 10 && st.score < 70) {
    ctx.globalAlpha = 0.5
    ctx.fillStyle = '#FFF'
    const cloudY = h * 0.3 + cam * 0.4
    ctx.beginPath(); ctx.arc(60 * s, cloudY, 20 * s, 0, 6.28); ctx.fill()
    ctx.beginPath(); ctx.arc(80 * s, cloudY - 5 * s, 15 * s, 0, 6.28); ctx.fill()
    ctx.beginPath(); ctx.arc(240 * s, cloudY + 20 * s, 18 * s, 0, 6.28); ctx.fill()
    ctx.globalAlpha = 1
  }

  // Stars (space phase)
  if (st.score > 55) {
    ctx.fillStyle = '#FFF'
    for (let i = 0; i < 30; i++) {
      const sx = ((i * 73 + 17) % GW) * s
      const sy = ((i * 41 + 7) % (GH * 0.5)) * s
      ctx.globalAlpha = 0.3 + Math.sin(Date.now() * 0.003 + i) * 0.3
      ctx.fillRect(sx, sy, 2, 2)
    }
    ctx.globalAlpha = 1
  }

  // Tower fall animation
  if (st.towerFall) {
    for (let i = 0; i < st.fallBlocks.length; i++) {
      const b = st.fallBlocks[i]
      ctx.save()
      ctx.translate((b.x + b.w / 2) * s, (b.y + BH / 2) * s + cam)
      ctx.rotate(b.rot)
      const theme = getTheme(i)
      draw3DBlock(ctx, -b.w / 2 * s, -BH / 2 * s, b.w * s, BH * s, theme, s)
      ctx.restore()
    }
  } else {
    // Draw stack
    for (let i = 0; i < st.stack.length; i++) {
      const blk = st.stack[i]
      const theme = getTheme(i)
      draw3DBlock(ctx, blk.x * s, blk.y * s + cam, blk.w * s, BH * s, theme, s)
    }
  }

  // Dropping block
  if (st.drop) {
    const theme = getTheme(st.stack.length)
    draw3DBlock(ctx, st.drop.x * s, st.drop.y * s + cam, st.drop.w * s, BH * s, theme, s)
  }

  // Swinging block (floating above the top of the stack)
  if (!st.drop && !st.over) {
    const top = st.stack[st.stack.length - 1]
    // Position in world space: fixed distance above top block
    const swingY = top.y - BH - 80
    const bx = st.swing.x * s, by = swingY * s + cam
    const bw = st.swing.w * s
    const theme = getTheme(st.stack.length)

    // Block (no cable — just floating)
    draw3DBlock(ctx, bx, by, bw, BH * s, theme, s)
  }

  // Particles
  for (const p of st.particles) {
    ctx.globalAlpha = p.life / 40
    ctx.fillStyle = p.color
    ctx.beginPath(); ctx.arc(p.x * s, p.y * s + cam, p.size * s, 0, 6.28); ctx.fill()
  }
  ctx.globalAlpha = 1

  // Float texts
  for (const ft of st.floatTexts) {
    ctx.globalAlpha = ft.life / 60
    ctx.fillStyle = ft.color
    ctx.font = `bold ${14 * s}px system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText(ft.text, ft.x * s, ft.y * s + cam)
  }
  ctx.globalAlpha = 1

  // HUD
  // Floor badge (top-left)
  ctx.fillStyle = 'rgba(0,0,0,0.5)'
  const badgeW = 90 * s, badgeH = 36 * s
  ctx.beginPath()
  ctx.roundRect(8 * s, 8 * s, badgeW, badgeH, 8 * s)
  ctx.fill()
  ctx.fillStyle = '#FFF'; ctx.font = `bold ${10 * s}px monospace`; ctx.textAlign = 'left'
  ctx.fillText('FLOOR', 16 * s, 22 * s)
  ctx.fillStyle = '#FFD700'; ctx.font = `bold ${14 * s}px monospace`
  ctx.fillText(`${st.score}`, 16 * s, 38 * s)

  // Progress bar (right side)
  const barX = w - 14 * s, barW = 6 * s, barH = h * 0.6, barY = h * 0.15
  ctx.fillStyle = 'rgba(0,0,0,0.3)'
  ctx.beginPath(); ctx.roundRect(barX, barY, barW, barH, 3 * s); ctx.fill()
  const progress = Math.min(st.score / 100, 1)
  const fillH = barH * progress
  ctx.fillStyle = '#FFD700'
  ctx.beginPath(); ctx.roundRect(barX, barY + barH - fillH, barW, fillH, 3 * s); ctx.fill()
  // Milestone marks
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  for (const m of [25, 50, 75]) {
    const my = barY + barH * (1 - m / 100)
    ctx.fillRect(barX - 2 * s, my, barW + 4 * s, 1)
  }

  // Game over overlay
  if (st.over && st.fallBlocks.every(b => b.y > GH + 50)) {
    ctx.fillStyle = 'rgba(0,0,0,0.7)'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#FFF'; ctx.font = `bold ${22 * s}px system-ui`; ctx.textAlign = 'center'
    ctx.fillText('GAME OVER', w / 2, h * 0.4)
    ctx.fillStyle = '#FFD700'; ctx.font = `bold ${16 * s}px system-ui`
    ctx.fillText(`${st.score} Floors`, w / 2, h * 0.48)
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = `${11 * s}px system-ui`
    ctx.fillText('Tap to play again', w / 2, h * 0.56)
  }

  ctx.restore()
}

// === REACT COMPONENT ===
function StackGame({ onGameEnd, onScoreUpdate, isActive, initialScore = 0 }) {
  const cvRef = useRef(null)
  const stRef = useRef(null)
  const rafRef = useRef(null)
  const endRef = useRef(false)
  const prevScore = useRef(0)
  const pausedRef = useRef(false)
  const [paused, setPaused] = useState(false)
  const scaleRef = useRef(1)
  const initialScoreRef = useRef(initialScore)
  useEffect(() => { initialScoreRef.current = initialScore }, [initialScore])

  const setup = useCallback(() => {
    const cv = cvRef.current; if (!cv) return
    const ctr = cv.parentElement; if (!ctr) return
    const maxW = Math.min(ctr.clientWidth, 420)
    const scale = maxW / GW; scaleRef.current = scale
    const dpr = window.devicePixelRatio || 1
    const ch = GH * scale
    cv.style.width = `${maxW}px`; cv.style.height = `${ch}px`
    cv.width = Math.round(maxW * dpr); cv.height = Math.round(ch * dpr)
    const ctx = cv.getContext('2d'); if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }, [])

  const start = useCallback(() => {
    const st = createState()
    st.score = initialScoreRef.current
    stRef.current = st
    prevScore.current = initialScoreRef.current; endRef.current = false
    pausedRef.current = false; setPaused(false)
  }, [])

  const handleDrop = useCallback(() => {
    const st = stRef.current; if (!st) return
    if (st.over) { start(); onScoreUpdate(0); return } // restart on tap after game over
    dropBlock(st)
  }, [start, onScoreUpdate])

  const loop = useCallback(() => {
    rafRef.current = requestAnimationFrame(loop)
    if (pausedRef.current) return
    const st = stRef.current; if (!st) return

    update(st)
    if (st.score !== prevScore.current) { prevScore.current = st.score; onScoreUpdate(st.score) }
    if (st.over && !endRef.current) { endRef.current = true; onGameEnd(st.score) }

    const cv = cvRef.current; if (!cv) return
    const ctx = cv.getContext('2d'); if (ctx) render(ctx, st, scaleRef.current)
  }, [onGameEnd, onScoreUpdate])

  const handleDropRef = useRef(handleDrop)
  useEffect(() => { handleDropRef.current = handleDrop }, [handleDrop])

  useEffect(() => {
    setup(); start()
    rafRef.current = requestAnimationFrame(loop)
    const onKey = (e) => { if (e.code === 'Space') { e.preventDefault(); handleDropRef.current() } }
    window.addEventListener('keydown', onKey)
    const onVis = () => { if (document.hidden) { pausedRef.current = true; setPaused(true) } else { pausedRef.current = false; setPaused(false) } }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('resize', setup)
    return () => { cancelAnimationFrame(rafRef.current); window.removeEventListener('keydown', onKey); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('resize', setup) }
  }, [setup, start, loop]) // removed handleDrop — accessed via ref to prevent loop restart

  const pRef = useRef(isActive)
  useEffect(() => { if (isActive && !pRef.current) { start(); onScoreUpdate(initialScoreRef.current) }; pRef.current = isActive }, [isActive, start, onScoreUpdate])

  return (
    <div className="relative w-full overflow-hidden rounded-xl">
      <canvas ref={cvRef} onClick={handleDrop} onTouchStart={(e) => { e.preventDefault(); handleDrop() }}
        className="mx-auto block cursor-pointer touch-none rounded-xl" aria-label="Stack Tower — tap to drop" />
      {paused && <div className="absolute inset-0 flex items-center justify-center bg-black/70 rounded-xl"><span className="text-xl font-bold text-yellow-400">PAUSED</span></div>}
    </div>
  )
}

export default StackGame
