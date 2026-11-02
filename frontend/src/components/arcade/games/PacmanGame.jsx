import { useEffect, useRef, useState } from 'react'

const T = 24, W = 28, H = 31

const LAYOUT = [
  "############################",
  "#............##............#",
  "#.####.#####.##.#####.####.#",
  "#o####.#####.##.#####.####o#",
  "#.####.#####.##.#####.####.#",
  "#..........................#",
  "#.####.##.########.##.####.#",
  "#.####.##.########.##.####.#",
  "#......##....##....##......#",
  "######.##### ## #####.######",
  "     #.##### ## #####.#     ",
  "     #.#####    #####.#     ",
  "     #.######--######.#     ",
  "######.####      ####.######",
  "      .####      ####.      ",
  "######.####      ####.######",
  "     #.##############.#     ",
  "     #.##          ##.#     ",
  "     #.##############.#     ",
  "######.##############.######",
  "#............##............#",
  "#.####.#####.##.#####.####.#",
  "#.####.#####.##.#####.####.#",
  "#o..##.......  .......##..o#",
  "###.##.##.########.##.##.###",
  "###.##.##.########.##.##.###",
  "#......##....##....##......#",
  "#.##########.##.##########.#",
  "#.##########.##.##########.#",
  "#..........................#",
  "############################"
]

const DIRS = [[0,-1],[-1,0],[0,1],[1,0]]
const COL = ['#ff3b3b','#ff9be8','#3be8ff','#ffb347']
const CORNERS = [[25,1],[2,1],[25,29],[2,29]]

function PacmanGame({ onGameEnd, onScoreUpdate, isActive, initialScore = 0 }) {
  const canvasRef = useRef(null)
  const wallCanvasRef = useRef(null)
  const stateRef = useRef(null)
  const rafRef = useRef(null)
  const [lives, setLives] = useState(3)
  const [score, setScore] = useState(initialScore)
  const [best, setBest] = useState(0)
  const [level, setLevel] = useState(1)
  const [powerPercent, setPowerPercent] = useState(0)
  const [gameState, setGameState] = useState('menu') // menu, ready, play, dying, over
  const [isPaused, setIsPaused] = useState(false)

  // Load best score
  useEffect(() => {
    try {
      const saved = localStorage.getItem('pm_best')
      if (saved) setBest(+saved || 0)
    } catch(e) {}
  }, [])

  // Initialize game
  const buildMaze = () => {
    const M = LAYOUT.map(r => [...r])
    const D = M.map(r => r.map(c => c === '.' || c === 'o' ? c : ''))
    const left = D.flat().filter(Boolean).length
    return { M, D, left }
  }

  const drawWalls = () => {
    const canvas = wallCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const { M } = buildMaze()
    
    ctx.clearRect(0, 0, 672, 744)
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#4a7bff'
    ctx.lineWidth = 3
    ctx.shadowColor = '#4a7bff'
    ctx.shadowBlur = 9

    for (let y = 0; y < H; y++) {
      for (let c = 0; c < W; c++) {
        const k = M[y][c]
        const px = c * T, py = y * T

        if (k === '#') {
          ctx.shadowBlur = 0
          ctx.fillStyle = '#4a7bff1c'
          ctx.fillRect(px, py, T, T)
          ctx.shadowBlur = 9

          DIRS.forEach(([a, b]) => {
            const nx = c + a, ny = y + b
            if (nx < 0 || nx >= W || ny < 0 || ny >= H) return
            if (M[ny][nx] === '#') return

            const m = 3
            ctx.beginPath()
            if (a) {
              const X = px + (a > 0 ? T - m : m)
              ctx.moveTo(X, py + m)
              ctx.lineTo(X, py + T - m)
            } else {
              const Y = py + (b > 0 ? T - m : m)
              ctx.moveTo(px + m, Y)
              ctx.lineTo(px + T - m, Y)
            }
            ctx.stroke()
          })
        }

        if (k === '-') {
          ctx.shadowBlur = 0
          ctx.fillStyle = '#ff9be8'
          ctx.fillRect(px, py + T/2 - 2, T, 4)
        }
      }
    }
  }

  const resetGame = () => {
    const { M, D, left } = buildMaze()
    
    stateRef.current = {
      M, D, left,
      score: initialScore,
      lives: 3,
      level: 1,
      pac: { tx: 13, ty: 23, dx: -1, dy: 0, p: 0, qx: -1, qy: 0, ang: Math.PI },
      ghosts: [
        { id: 0, col: COL[0], tx: 13, ty: 11, dx: -1, dy: 0, p: 0, mode: 'normal', wait: 0 },
        { id: 1, col: COL[1], tx: 13, ty: 14, dx: 0, dy: 0, p: 0, mode: 'wait', wait: 1.5 },
        { id: 2, col: COL[2], tx: 11, ty: 14, dx: 0, dy: 0, p: 0, mode: 'wait', wait: 4 },
        { id: 3, col: COL[3], tx: 16, ty: 14, dx: 0, dy: 0, p: 0, mode: 'wait', wait: 7 }
      ],
      pw: 0,
      pwMax: 6,
      modeT: 0,
      combo: 0,
      anim: 0,
      stT: 0,
      pops: []
    }

    setScore(initialScore)
    setLives(3)
    setLevel(1)
    setPowerPercent(0)
    setGameState('ready')
    
    setTimeout(() => setGameState('play'), 1800)
  }

  const free = (M, x, y) => {
    if (y < 0 || y >= H) return false
    const c = M[y][(x + W) % W]
    return c !== '#' && c !== '-'
  }

  const gAllow = (M, o, x, y) => {
    if (y < 0 || y >= H) return false
    const c = M[y][(x + W) % W]
    if (c === '#') return false
    if (c === '-') return o.mode === 'leave' || o.mode === 'eaten'
    return true
  }

  const move = (e, d, chooseFn, M) => {
    while (d > 1e-6) {
      if (e.p === 0) {
        chooseFn(e, M)
        if (!e.dx && !e.dy) return
      }

      const s = Math.min(d, 1 - e.p)
      e.p += s
      d -= s

      if (e.p >= 1 - 1e-6) {
        e.tx = (e.tx + e.dx + W) % W
        e.ty += e.dy
        e.p = 0
      }
    }
  }

  const flip = (e) => {
    if (e.p > 0) {
      e.tx = (e.tx + e.dx + W) % W
      e.ty += e.dy
      e.p = 1 - e.p
    }
    e.dx = -e.dx
    e.dy = -e.dy
  }

  const pChoose = (e, M) => {
    if ((e.qx || e.qy) && free(M, e.tx + e.qx, e.ty + e.qy)) {
      e.dx = e.qx
      e.dy = e.qy
    } else if (!free(M, e.tx + e.dx, e.ty + e.dy)) {
      e.dx = 0
      e.dy = 0
    }
  }

  const pos = (e) => [e.tx + e.dx * e.p, e.ty + e.dy * e.p]

  const setDir = (a, b) => {
    const st = stateRef.current
    if (!st || (gameState !== 'play' && gameState !== 'ready')) return
    
    st.pac.qx = a
    st.pac.qy = b
    
    if ((a && a === -st.pac.dx) || (b && b === -st.pac.dy)) {
      if (st.pac.dx || st.pac.dy) flip(st.pac)
    }
    if (!st.pac.dx && !st.pac.dy && free(st.M, st.pac.tx + a, st.pac.ty + b)) {
      st.pac.dx = a
      st.pac.dy = b
    }
  }

  const scatter = (modeT) => modeT < 108 && modeT % 27 < 7

  const target = (o, pac, ghosts, modeT) => {
    const m = o.mode
    if (m === 'leave') return [13, 11]
    if (m === 'eaten') return [13, 14]
    if (scatter(modeT)) return CORNERS[o.id]

    const px = pac.tx, py = pac.ty
    if (o.id === 0) return [px, py]
    if (o.id === 1) return [px + pac.dx * 4, py + pac.dy * 4]
    if (o.id === 2) {
      const a = px + pac.dx * 2, b = py + pac.dy * 2
      return [2 * a - ghosts[0].tx, 2 * b - ghosts[0].ty]
    }
    return Math.hypot(o.tx - px, o.ty - py) > 6 ? [px, py] : CORNERS[3]
  }

  const gChoose = (o, M, pac, ghosts, modeT, level) => {
    if (o.mode === 'eaten' && o.tx === 13 && o.ty === 14) o.mode = 'leave'
    if (o.mode === 'leave' && o.ty <= 11) o.mode = 'normal'

    let op = DIRS.filter(([x, y]) => 
      !((o.dx || o.dy) && x === -o.dx && y === -o.dy) && 
      gAllow(M, o, o.tx + x, o.ty + y)
    )

    if (!op.length) {
      op = DIRS.filter(([x, y]) => gAllow(M, o, o.tx + x, o.ty + y))
    }

    let d
    if (o.mode === 'fright') {
      d = op[Math.random() * op.length | 0]
    } else {
      const [a, b] = target(o, pac, ghosts, modeT)
      const f = v => Math.hypot(o.tx + v[0] - a, o.ty + v[1] - b)
      d = op.reduce((m, v) => f(v) < f(m) ? v : m)
    }

    o.dx = d[0]
    o.dy = d[1]
  }

  const updateGhost = (o, dt, M, pac, ghosts, modeT, level) => {
    if (o.mode === 'wait') {
      o.wait -= dt
      if (o.wait <= 0) o.mode = 'leave'
      return
    }

    const sp = o.mode === 'eaten' ? 15 : o.mode === 'fright' ? 4.2 : 7 + level * 0.2
    move(o, sp * dt, (e) => gChoose(e, M, pac, ghosts, modeT, level), M)
  }

  const eat = () => {
    const st = stateRef.current
    if (!st) return

    const ex = st.pac.p < 0.5 ? st.pac.tx : (st.pac.tx + st.pac.dx + W) % W
    const ey = st.pac.p < 0.5 ? st.pac.ty : st.pac.ty + st.pac.dy
    const c = st.D[ey]?.[ex]

    if (!c) return

    st.D[ey][ex] = ''
    st.left--

    if (c === 'o') {
      st.score += 50
      st.pwMax = Math.max(2.5, 7 - st.level * 0.7)
      st.pw = st.pwMax
      st.combo = 0
      st.ghosts.forEach(o => {
        if (o.mode === 'normal') {
          flip(o)
          o.mode = 'fright'
        }
      })
    } else {
      st.score += 10
    }

    setScore(st.score)
    onScoreUpdate(st.score)
  }

  const die = () => {
    const st = stateRef.current
    if (!st) return

    setGameState('dying')
    st.stT = 0
    st.lives--
    setLives(st.lives)

    try {
      navigator.vibrate && navigator.vibrate(180)
    } catch(e) {}
  }

  const collide = () => {
    const st = stateRef.current
    if (!st) return

    const a = pos(st.pac)
    for (const o of st.ghosts) {
      if (o.mode === 'wait') continue
      const b = pos(o)
      if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.6) {
        if (o.mode === 'fright') {
          o.mode = 'eaten'
          const v = 200 * 2 ** st.combo++
          st.score += v
          setScore(st.score)
          onScoreUpdate(st.score)
          st.pops.push({ x: b[0], y: b[1], t: 1, s: v })
        } else if (o.mode !== 'eaten') {
          die()
          return
        }
      }
    }
  }

  const update = (dt) => {
    const st = stateRef.current
    if (!st) return

    st.anim += dt

    if (gameState === 'ready') {
      st.stT += dt
      if (st.stT > 1.8) setGameState('play')
      return
    }

    if (gameState === 'dying') {
      st.stT += dt
      if (st.stT > 1.6) {
        if (st.lives <= 0) {
          setGameState('over')
          onGameEnd(st.score)
        } else {
          resetGame()
        }
      }
      return
    }

    if (gameState !== 'play') return

    st.modeT += dt

    if (st.pac.dx || st.pac.dy) {
      st.pac.ang = Math.atan2(st.pac.dy, st.pac.dx)
    }

    move(st.pac, (7.8 + st.level * 0.1) * dt, (e) => pChoose(e, st.M), st.M)
    eat()

    if (st.pw > 0) {
      st.pw -= dt
      setPowerPercent((st.pw / st.pwMax) * 100)
      if (st.pw <= 0) {
        st.ghosts.forEach(o => {
          if (o.mode === 'fright') o.mode = 'normal'
        })
        setPowerPercent(0)
      }
    }

    st.ghosts.forEach(o => updateGhost(o, dt, st.M, st.pac, st.ghosts, st.modeT, st.level))
    collide()

    st.pops.forEach(p => p.t -= dt)
    st.pops = st.pops.filter(p => p.t > 0)

    if (st.left <= 0 && gameState === 'play') {
      st.level++
      setLevel(st.level)
      buildMaze()
      resetGame()
    }

    // Update best score
    if (st.score > best) {
      setBest(st.score)
      try {
        localStorage.setItem('pm_best', st.score)
      } catch(e) {}
    }
  }

  const drawGhost = (ctx, o, anim) => {
    const [x, y] = pos(o)
    const k = T / 32
    const cx = (x + 0.5) * T
    const cy = (y + 0.5) * T
    const r = T * 0.46
    const fr = o.mode === 'fright'
    const ea = o.mode === 'eaten'
    const f = Math.floor(anim * 8) % 2

    if (!ea) {
      ctx.shadowColor = fr ? '#2f4bff' : o.col
      ctx.shadowBlur = 10
      ctx.fillStyle = fr ? ((stateRef.current.pw < 2 && f) ? '#fff' : '#2f4bff') : o.col
      ctx.beginPath()
      ctx.arc(cx, cy - 1, r, Math.PI, 0)
      ctx.lineTo(cx + r, cy + r)

      for (let i = 1; i <= 6; i++) {
        ctx.lineTo(cx + r - i * r / 3, cy + r - ((i + f) % 2 ? 6 * k : 0))
      }
      ctx.closePath()
      ctx.fill()
      ctx.shadowBlur = 0
    }

    if (fr && !ea) {
      ctx.fillStyle = (stateRef.current.pw < 2 && f) ? '#2f4bff' : '#fff'
      ctx.fillRect(cx - 7 * k, cy - 5 * k, 4 * k, 4 * k)
      ctx.fillRect(cx + 3 * k, cy - 5 * k, 4 * k, 4 * k)
    } else {
      ctx.fillStyle = '#fff'
      for (const s of [-1, 1]) {
        ctx.beginPath()
        ctx.arc(cx + s * 5.5 * k, cy - 3 * k, 4.4 * k, 0, 7)
        ctx.fill()
      }

      ctx.fillStyle = '#1b2a8a'
      for (const s of [-1, 1]) {
        ctx.beginPath()
        ctx.arc(cx + s * 5.5 * k + o.dx * 2 * k, cy - 3 * k + o.dy * 2 * k, 2.2 * k, 0, 7)
        ctx.fill()
      }
    }
  }

  const drawPacman = (ctx) => {
    const st = stateRef.current
    if (!st) return

    const [x, y] = pos(st.pac)
    const cx = (x + 0.5) * T
    const cy = (y + 0.5) * T
    const r = T * 0.44

    ctx.shadowColor = '#ffd93b'
    ctx.shadowBlur = 12
    ctx.fillStyle = '#ffd93b'
    ctx.beginPath()

    if (gameState === 'dying') {
      const a = Math.min(st.stT / 1.3, 1) * Math.PI
      if (a >= Math.PI - 0.02) {
        ctx.shadowBlur = 0
        return
      }
      ctx.moveTo(cx, cy)
      ctx.arc(cx, cy, r, -Math.PI / 2 + a, -Math.PI / 2 + 2 * Math.PI - a)
    } else {
      const m = (st.pac.dx || st.pac.dy) ? 0.06 + 0.3 * Math.abs(Math.sin(st.anim * 12)) : 0.25
      ctx.moveTo(cx, cy)
      ctx.arc(cx, cy, r, st.pac.ang + m * Math.PI, st.pac.ang + (2 - m) * Math.PI)
    }

    ctx.closePath()
    ctx.fill()
    ctx.shadowBlur = 0
  }

  const draw = () => {
    const canvas = canvasRef.current
    const wallCanvas = wallCanvasRef.current
    if (!canvas || !wallCanvas) return

    const ctx = canvas.getContext('2d')
    const st = stateRef.current
    if (!st) return

    ctx.clearRect(0, 0, 672, 744)
    ctx.drawImage(wallCanvas, 0, 0)

    // Draw dots
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const c = st.D[y][x]
        if (!c) continue

        ctx.fillStyle = '#ffd8b0'
        ctx.beginPath()

        if (c === 'o') {
          ctx.shadowColor = '#ffd8b0'
          ctx.shadowBlur = 10
          ctx.arc((x + 0.5) * T, (y + 0.5) * T, 4.6 + Math.sin(st.anim * 8) * 1.2, 0, 7)
        } else {
          ctx.arc((x + 0.5) * T, (y + 0.5) * T, 2, 0, 7)
        }

        ctx.fill()
        ctx.shadowBlur = 0
      }
    }

    // Draw ghosts
    if (gameState !== 'dying') {
      st.ghosts.forEach(o => drawGhost(ctx, o, st.anim))
    }

    // Draw Pac-Man
    drawPacman(ctx)

    // Draw score popups
    ctx.font = "12px 'Press Start 2P', monospace"
    ctx.textAlign = 'center'
    st.pops.forEach(p => {
      ctx.fillStyle = '#3be8ff'
      ctx.fillText(p.s, (p.x + 0.5) * T, (p.y + 0.5) * T - (1 - p.t) * 14)
    })

    // Draw ready message
    if (gameState === 'ready') {
      ctx.fillStyle = '#ffd93b'
      ctx.fillText('READY!', W * T / 2, 17.5 * T + 5)
    }
  }

  // Game loop
  useEffect(() => {
    if (!isActive || isPaused) return

    drawWalls()
    resetGame()

    let last = performance.now()
    const loop = (n) => {
      const dt = Math.min((n - last) / 1000, 0.05)
      last = n
      update(dt)
      draw()
      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [isActive, isPaused, gameState])

  // Keyboard controls
  useEffect(() => {
    const handleKey = (e) => {
      const m = {
        ArrowUp: [0, -1],
        w: [0, -1],
        ArrowLeft: [-1, 0],
        a: [-1, 0],
        ArrowDown: [0, 1],
        s: [0, 1],
        ArrowRight: [1, 0],
        d: [1, 0]
      }[e.key]

      if (m) {
        e.preventDefault()
        setDir(...m)
      } else if (e.key === 'p' || e.key === ' ') {
        setIsPaused(p => !p)
      }
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  // Touch controls
  useEffect(() => {
    let sx = null, sy = null

    const handleTouchStart = (e) => {
      sx = e.touches[0].clientX
      sy = e.touches[0].clientY
    }

    const handleTouchMove = (e) => {
      if (sx == null) return
      const a = e.touches[0].clientX - sx
      const b = e.touches[0].clientY - sy

      if (Math.hypot(a, b) > 22) {
        Math.abs(a) > Math.abs(b) 
          ? setDir(Math.sign(a), 0) 
          : setDir(0, Math.sign(b))
        sx = e.touches[0].clientX
        sy = e.touches[0].clientY
      }
    }

    const handleTouchEnd = () => {
      sx = null
      sy = null
    }

    const canvas = canvasRef.current
    if (canvas) {
      canvas.addEventListener('touchstart', handleTouchStart, { passive: true })
      canvas.addEventListener('touchmove', handleTouchMove, { passive: true })
      canvas.addEventListener('touchend', handleTouchEnd, { passive: true })
    }

    return () => {
      if (canvas) {
        canvas.removeEventListener('touchstart', handleTouchStart)
        canvas.removeEventListener('touchmove', handleTouchMove)
        canvas.removeEventListener('touchend', handleTouchEnd)
      }
    }
  }, [])

  return (
    <div className="flex flex-col h-full bg-[#070b16] text-white font-mono">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
        .font-mono { font-family: 'Press Start 2P', monospace; }
      `}</style>

      {/* HUD */}
      <div className="flex items-center gap-2 bg-[#111830] border border-[#263059] rounded-xl p-3 m-2">
        <div className="flex-1">
          <div className="text-[8px] text-[#8791bd]">SCORE</div>
          <div className="text-sm text-[#ffd93b] font-bold mt-1">{score}</div>
        </div>
        <div className="flex-1">
          <div className="text-[8px] text-[#8791bd]">BEST</div>
          <div className="text-sm font-bold mt-1">{best}</div>
        </div>
        <div className="flex-1">
          <div className="text-[8px] text-[#8791bd]">LEVEL</div>
          <div className="text-sm font-bold mt-1">{level}</div>
        </div>
        <button 
          onClick={() => setIsPaused(p => !p)}
          className="w-10 h-10 rounded-xl border border-[#263059] bg-[#1a2243] text-sm"
        >
          {isPaused ? '▶' : '❚❚'}
        </button>
      </div>

      {/* Power and Lives Bar */}
      <div className="flex items-center gap-3 mx-4 mb-2 h-6">
        <div className="flex gap-2 min-w-[76px]">
          {[...Array(Math.max(lives, 0))].map((_, i) => (
            <div 
              key={i}
              className="w-4 h-4 rounded-full bg-[#ffd93b]"
              style={{ clipPath: 'polygon(100% 20%,50% 50%,100% 80%,100% 100%,0 100%,0 0,100% 0)' }}
            />
          ))}
        </div>
        <div className="flex-1 h-2 rounded-lg bg-[#141b36] overflow-hidden">
          <div 
            className="h-full bg-[#4a7bff] rounded-lg transition-all duration-100"
            style={{ width: `${powerPercent}%` }}
          />
        </div>
        <div className="text-[8px] text-[#8791bd] min-w-[56px] text-right">POWER</div>
      </div>

      {/* Game Canvas */}
      <div className="flex-1 flex items-center justify-center relative overflow-hidden">
        <div className="relative">
          <canvas 
            ref={wallCanvasRef}
            width="672"
            height="744"
            className="absolute top-0 left-0 pointer-events-none"
            style={{ display: 'none' }}
          />
          <canvas 
            ref={canvasRef}
            width="672"
            height="744"
            className="bg-black border-y border-[#263059] shadow-[0_0_40px_rgba(74,123,255,0.13)] max-w-full h-auto"
          />
        </div>

        {/* Overlays */}
        {(gameState === 'menu' || gameState === 'over' || isPaused) && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#070b16bb] backdrop-blur-sm p-5">
            <div className="bg-[#111830] border border-[#263059] rounded-2xl p-6 text-center max-w-xs">
              <h1 className="text-2xl font-bold text-[#ffd93b] mb-4">
                {isPaused ? 'PAUSED' : gameState === 'over' ? 'GAME OVER' : 'PAC-MAN'}
              </h1>
              <p className="text-[9px] leading-relaxed text-[#8791bd] mb-5">
                {isPaused 
                  ? 'Your progress is saved while you wait.'
                  : gameState === 'over' 
                  ? `Score ${score}. Best ${best}.`
                  : 'Swipe the maze or use the pad. Eat every dot, grab big pellets to chase ghosts.'
                }
              </p>
              <button
                onClick={() => {
                  if (isPaused) {
                    setIsPaused(false)
                  } else {
                    resetGame()
                  }
                }}
                className="text-xs bg-[#ffd93b] text-[#1b1500] border-0 rounded-xl px-6 py-3 font-bold"
              >
                {isPaused ? 'Resume' : gameState === 'over' ? 'Play again' : 'Play'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Control Pad */}
      <div className="grid grid-cols-3 gap-2 justify-center p-4" style={{ gridTemplateRows: '60px 60px' }}>
        <button 
          onClick={() => setDir(0, -1)}
          className="col-start-2 row-start-1 rounded-2xl border border-[#263059] bg-[#161e3d] text-white text-lg active:bg-[#4a7bff]"
        >
          ▲
        </button>
        <button 
          onClick={() => setDir(-1, 0)}
          className="col-start-1 row-start-2 rounded-2xl border border-[#263059] bg-[#161e3d] text-white text-lg active:bg-[#4a7bff]"
        >
          ◀
        </button>
        <button 
          onClick={() => setDir(0, 1)}
          className="col-start-2 row-start-2 rounded-2xl border border-[#263059] bg-[#161e3d] text-white text-lg active:bg-[#4a7bff]"
        >
          ▼
        </button>
        <button 
          onClick={() => setDir(1, 0)}
          className="col-start-3 row-start-2 rounded-2xl border border-[#263059] bg-[#161e3d] text-white text-lg active:bg-[#4a7bff]"
        >
          ▶
        </button>
      </div>
    </div>
  )
}

export default PacmanGame
