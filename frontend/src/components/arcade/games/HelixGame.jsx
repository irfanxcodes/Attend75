import { useCallback, useEffect, useRef, useState } from 'react'

// === HELIX JUMP — Ball falls through rotating spiral platforms ===
const GW = 320, GH = 560, CX = GW / 2
const OR = 105, IR = 18, PH = 14
const GAP_Y = 90, NUM_P = 10
const BALL_R = 11, GRAV = 0.4, MAX_VY = 14
const GAP = 0.62 * Math.PI
const BASE_SPD = 0.022, SPD_INC = 0.0005

const COLS = ['#FF6B6B','#FF9F43','#FECA57','#48DBFB','#FF9FF3','#54A0FF','#5F27CD','#00D2D3','#1DD1A1','#EE5A24']

function mkPlat(worldY, idx) {
  const gs = Math.random() * Math.PI * 2
  return { y: worldY, rot: Math.random() * Math.PI * 2, gs, ge: gs + GAP, color: COLS[idx % COLS.length], scored: false }
}

function initState() {
  const plats = Array.from({ length: NUM_P }, (_, i) => mkPlat(160 + i * GAP_Y, i))
  return {
    ball: { y: 60, vy: 0 }, camY: 0, score: 0, over: false, won: false,
    plats, nextIdx: NUM_P, spd: BASE_SPD,
    particles: [], texts: [], shake: 0, combo: 0,
    inputDelta: 0, // accumulated rotation from drag/touch
  }
}

function normalizeAngle(a) { return ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) }
function angleInGap(a, gs, ge) {
  const na = normalizeAngle(a)
  const s = normalizeAngle(gs), e = normalizeAngle(ge)
  if (s < e) return na >= s && na <= e
  return na >= s || na <= e
}

function spawnParticles(st, x, y, color, n) {
  for (let i = 0; i < n; i++)
    st.particles.push({ x, y, vx: (Math.random()-0.5)*5, vy: -Math.random()*4-1, life: 35, color })
}

function update(st, dt) {
  if (st.over) return

  // Rotate platforms
  const rotDelta = st.spd + Math.abs(st.inputDelta) * 0.015
  for (const p of st.plats) p.rot += rotDelta + st.inputDelta * 0.008
  st.inputDelta *= 0.85 // decay input

  // Ball physics
  st.ball.vy = Math.min(st.ball.vy + GRAV, MAX_VY)
  st.ball.y += st.ball.vy

  // Camera follows ball
  const targetCamY = st.ball.y - GH * 0.28
  if (targetCamY > st.camY) st.camY += (targetCamY - st.camY) * 0.12

  // Check platform collisions
  const ballWorldY = st.ball.y
  for (const p of st.plats) {
    const platScreenY = p.y - st.camY
    if (platScreenY < -PH - 20 || platScreenY > GH + 20) continue

    // Ball hitting top of platform
    const ballBottom = ballWorldY + BALL_R
    const platTop = p.y
    const prevBottom = ballBottom - st.ball.vy

    if (prevBottom <= platTop && ballBottom >= platTop && ballBottom <= platTop + PH + 8) {
      // Check if ball is within outer radius and above inner hole
      const dx = CX - CX // ball is always at center X
      const distFromCenter = 0 // ball at center
      // Ball at CX — check if the angle right under ball aligns with gap
      // Since ball is at center X, it maps to angle 0 (or π)
      // We check two angles: 0 and π (left/right of center)
      const angles = [0, Math.PI] // ball center projects to these edge angles
      let inGap = false
      for (const testAngle of angles) {
        if (angleInGap(testAngle - p.rot, p.gs, p.ge)) { inGap = true; break }
      }
      // Better: check if ball x (center) projection falls in gap arc
      // The platform is a ring. Ball at cx drops through if gap covers ~center
      // Use a wider check: any part of ball width in gap
      let gapHit = false
      for (let a = -0.3; a <= 0.3; a += 0.06) {
        if (angleInGap(a - p.rot, p.gs, p.ge)) { gapHit = true; break }
      }

      if (gapHit) {
        // Passed through gap
        if (!p.scored) {
          p.scored = true; st.score++; st.combo++
          st.spd = BASE_SPD + st.score * SPD_INC
          spawnParticles(st, CX, platTop - st.camY, p.color, 12)
          const txt = st.combo >= 3 ? `x${st.combo} COMBO!` : '+1'
          st.texts.push({ x: CX, y: platTop - st.camY, text: txt, life: 50, color: st.combo >= 3 ? '#FFD700' : '#FFF' })
        }
      } else {
        // Hit platform — game over
        st.over = true
        st.ball.vy = 0
        spawnParticles(st, CX, platTop - st.camY, '#FF3838', 20)
        st.shake = 10
        return
      }
    }
  }

  // Recycle platforms that scroll off top
  const topCamY = st.camY
  for (let i = st.plats.length - 1; i >= 0; i--) {
    if (st.plats[i].y < topCamY - GAP_Y) {
      const maxY = Math.max(...st.plats.map(p => p.y))
      st.plats[i] = mkPlat(maxY + GAP_Y, st.nextIdx++)
    }
  }

  // Particles
  for (let i = st.particles.length - 1; i >= 0; i--) {
    const p = st.particles[i]
    p.x += p.vx; p.y += p.vy; p.vy += 0.15; p.life--
    if (p.life <= 0) st.particles.splice(i, 1)
  }
  for (let i = st.texts.length - 1; i >= 0; i--) {
    st.texts[i].y -= 1.5; st.texts[i].life--
    if (st.texts[i].life <= 0) st.texts.splice(i, 1)
  }
  if (st.shake > 0) st.shake *= 0.7
}

function render(ctx, st, scale) {
  const s = scale, w = GW * s, h = GH * s
  const or = OR * s, ir = IR * s, ph = PH * s
  const cx = CX * s

  // Camera shake
  const sx = st.shake > 0.3 ? (Math.random() - 0.5) * st.shake * 2 : 0
  const sy = st.shake > 0.3 ? (Math.random() - 0.5) * st.shake * 1 : 0
  ctx.save()
  ctx.translate(sx, sy)

  // Background gradient (darkens as you go deeper)
  const depth = Math.min(st.score / 30, 1)
  const bg1 = `hsl(${230 - depth * 30}, 50%, ${15 - depth * 5}%)`
  const bg2 = `hsl(${220 - depth * 30}, 60%, ${10 - depth * 3}%)`
  const grad = ctx.createLinearGradient(0, 0, 0, h)
  grad.addColorStop(0, bg1); grad.addColorStop(1, bg2)
  ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h)

  // Center tube walls (subtle guides)
  ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1.5 * s
  ctx.beginPath(); ctx.arc(cx, h * 0.5, or + 8 * s, 0, Math.PI * 2); ctx.stroke()

  // Platforms
  for (const p of st.plats) {
    const py = (p.y - st.camY) * s
    if (py < -ph * 2 || py > h + ph) continue

    // Draw platform arc (ring with gap)
    const gs = p.rot + p.gs, ge = p.rot + p.ge

    ctx.save()
    ctx.translate(cx, py)

    // Shadow
    ctx.shadowColor = p.color
    ctx.shadowBlur = 8 * s

    // Top face (full ring minus gap)
    ctx.beginPath()
    ctx.arc(0, 0, or, ge, gs + Math.PI * 2, false)
    ctx.arc(0, 0, ir, gs + Math.PI * 2, ge, true)
    ctx.closePath()
    const pGrad = ctx.createLinearGradient(-or, 0, or, 0)
    pGrad.addColorStop(0, p.color + 'CC')
    pGrad.addColorStop(0.5, p.color)
    pGrad.addColorStop(1, p.color + 'CC')
    ctx.fillStyle = pGrad
    ctx.fill()

    // Bottom face (3D effect)
    ctx.translate(0, ph)
    ctx.beginPath()
    ctx.arc(0, 0, or, ge, gs + Math.PI * 2, false)
    ctx.arc(0, 0, ir, gs + Math.PI * 2, ge, true)
    ctx.closePath()
    ctx.fillStyle = p.color + '55'
    ctx.fill()

    ctx.shadowBlur = 0
    ctx.restore()
  }

  // Ball
  const by = (st.ball.y - st.camY) * s
  ctx.save()
  ctx.shadowColor = 'rgba(255,255,255,0.6)'; ctx.shadowBlur = 12 * s
  const bGrad = ctx.createRadialGradient(cx - BALL_R * 0.3 * s, by - BALL_R * 0.3 * s, BALL_R * 0.1 * s, cx, by, BALL_R * s)
  bGrad.addColorStop(0, '#FFFFFF')
  bGrad.addColorStop(0.5, '#E0E0FF')
  bGrad.addColorStop(1, '#9090DD')
  ctx.fillStyle = bGrad
  ctx.beginPath(); ctx.arc(cx, by, BALL_R * s, 0, Math.PI * 2); ctx.fill()
  ctx.shadowBlur = 0
  ctx.restore()

  // Ball trail
  ctx.fillStyle = 'rgba(180,180,255,0.15)'
  for (let i = 1; i <= 4; i++) {
    ctx.beginPath()
    ctx.arc(cx, by - i * 7 * s, (BALL_R - i * 1.5) * s, 0, Math.PI * 2)
    ctx.fill()
  }

  // Particles
  for (const p of st.particles) {
    ctx.globalAlpha = p.life / 35
    ctx.fillStyle = p.color
    ctx.beginPath(); ctx.arc(p.x * s, p.y * s, 3 * s, 0, Math.PI * 2); ctx.fill()
  }
  ctx.globalAlpha = 1

  // Float texts
  for (const t of st.texts) {
    ctx.globalAlpha = t.life / 50
    ctx.fillStyle = t.color
    ctx.font = `bold ${13 * s}px system-ui`; ctx.textAlign = 'center'
    ctx.fillText(t.text, t.x * s, t.y * s)
  }
  ctx.globalAlpha = 1

  // HUD: score pill at top
  ctx.fillStyle = 'rgba(0,0,0,0.5)'
  ctx.beginPath(); ctx.roundRect(w / 2 - 45 * s, 8 * s, 90 * s, 28 * s, 14 * s); ctx.fill()
  ctx.fillStyle = '#FFF'; ctx.font = `bold ${13 * s}px system-ui`; ctx.textAlign = 'center'
  ctx.fillText(`Floor ${st.score}`, w / 2, 27 * s)

  // Game over overlay
  if (st.over) {
    ctx.fillStyle = 'rgba(0,0,0,0.75)'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#FF6B6B'; ctx.font = `bold ${22 * s}px system-ui`; ctx.textAlign = 'center'
    ctx.fillText('GAME OVER', w / 2, h * 0.42)
    ctx.fillStyle = '#FFD700'; ctx.font = `bold ${15 * s}px system-ui`
    ctx.fillText(`${st.score} Floors`, w / 2, h * 0.50)
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = `${11 * s}px system-ui`
    ctx.fillText('Tap to play again', w / 2, h * 0.58)
  }

  ctx.restore()
}

// === REACT COMPONENT ===
function HelixGame({ onGameEnd, onScoreUpdate, isActive }) {
  const cvRef = useRef(null)
  const stRef = useRef(null)
  const rafRef = useRef(null)
  const endRef = useRef(false)
  const prevScore = useRef(0)
  const pausedRef = useRef(false)
  const [paused, setPaused] = useState(false)
  const scaleRef = useRef(1)

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
    stRef.current = initState()
    prevScore.current = 0; endRef.current = false
    pausedRef.current = false; setPaused(false)
  }, [])

  const handleTap = useCallback(() => {
    const st = stRef.current; if (!st) return
    if (st.over) { start(); onScoreUpdate(0) }
  }, [start, onScoreUpdate])

  // Touch/drag to rotate platforms
  const touchRef = useRef({ x: 0, active: false })
  const onTouchStart = useCallback((e) => {
    e.preventDefault()
    touchRef.current = { x: e.touches[0].clientX, active: true }
  }, [])
  const onTouchMove = useCallback((e) => {
    e.preventDefault()
    if (!touchRef.current.active) return
    const st = stRef.current; if (!st || st.over) return
    const dx = e.touches[0].clientX - touchRef.current.x
    st.inputDelta += dx * 0.3
    touchRef.current.x = e.touches[0].clientX
  }, [])
  const onTouchEnd = useCallback((e) => {
    e.preventDefault()
    touchRef.current.active = false
    const st = stRef.current
    if (st?.over) { start(); onScoreUpdate(0) }
  }, [start, onScoreUpdate])

  // Mouse drag for desktop
  const mouseRef = useRef({ x: 0, down: false })
  const onMouseDown = useCallback((e) => { mouseRef.current = { x: e.clientX, down: true } }, [])
  const onMouseMove = useCallback((e) => {
    if (!mouseRef.current.down) return
    const st = stRef.current; if (!st || st.over) return
    const dx = e.clientX - mouseRef.current.x
    st.inputDelta += dx * 0.3
    mouseRef.current.x = e.clientX
  }, [])
  const onMouseUp = useCallback(() => { mouseRef.current.down = false }, [])

  const loop = useCallback(() => {
    rafRef.current = requestAnimationFrame(loop)
    if (pausedRef.current) return
    const st = stRef.current; if (!st) return

    update(st, 1)

    if (st.score !== prevScore.current) { prevScore.current = st.score; onScoreUpdate(st.score) }
    if (st.over && !endRef.current) { endRef.current = true; onGameEnd(st.score) }

    const cv = cvRef.current; if (!cv) return
    const ctx = cv.getContext('2d')
    if (ctx) render(ctx, st, scaleRef.current)
  }, [onGameEnd, onScoreUpdate])

  useEffect(() => {
    setup(); start()
    rafRef.current = requestAnimationFrame(loop)

    const onVis = () => {
      if (document.hidden) { pausedRef.current = true; setPaused(true) }
      else { pausedRef.current = false; setPaused(false) }
    }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('resize', setup)
    window.addEventListener('mouseup', onMouseUp)
    window.addEventListener('mousemove', onMouseMove)

    return () => {
      cancelAnimationFrame(rafRef.current)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('resize', setup)
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('mousemove', onMouseMove)
    }
  }, [setup, start, loop, onMouseMove, onMouseUp])

  const prevRef = useRef(isActive)
  useEffect(() => {
    if (isActive && !prevRef.current) { start(); onScoreUpdate(0) }
    prevRef.current = isActive
  }, [isActive, start, onScoreUpdate])

  return (
    <div className="relative w-full overflow-hidden rounded-xl bg-[#1A1A2E]">
      <canvas
        ref={cvRef}
        onClick={handleTap}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onMouseDown={onMouseDown}
        className="mx-auto block touch-none rounded-xl cursor-grab active:cursor-grabbing"
        aria-label="Helix Jump — drag to rotate platforms"
      />
      {paused && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 rounded-xl">
          <span className="text-xl font-bold text-white">PAUSED</span>
        </div>
      )}
      <p className="pb-1 text-center text-[9px] text-[#9F9AB5] opacity-60">Drag left/right to rotate platforms</p>
    </div>
  )
}

export default HelixGame
