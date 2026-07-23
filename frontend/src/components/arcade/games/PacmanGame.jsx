import { useCallback, useEffect, useRef, useState } from 'react'

// === TILE-BASED PAC-MAN — Fixed tick rate, ghosts always move ===
const COLS = 28, MROWS = 31, TILE = 8
const GW = COLS * TILE, GH = MROWS * TILE
const PAC_TICK = 100   // ms per pac move (10 moves/sec)
const GHOST_TICK = 130 // ms per ghost move (slightly slower)
const POWER_MS = 6000
const DIR = { UP: 0, RT: 1, DN: 2, LT: 3 }
const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0], OPP = [2, 3, 0, 1]
const COL = { bg:'#000', wall:'#2121DE', dot:'#FFB897', pow:'#FFB897',
  pac:'#FFFF00', txt:'#FFF', gate:'#FFB8DE',
  gh:['#FF0000','#FFB8FF','#00FFFF','#FFB852'],
  scared:'#2121FF', scare2:'#FFF', eye:'#FFF', pupil:'#00F' }

const MAP = [
  '1111111111111111111111111111',
  '1222222222222112222222222221',
  '1211112111112112111121111121',
  '1311112111112112111121111131',
  '1211112111112112111121111121',
  '1222222222222222222222222221',
  '1211112112111111211211112121',
  '1211112112111111211211112121',
  '1222222112222112222112222221',
  '1111112111100000111121111111',
  '0000012111100000111121000000',
  '0000012110000000001121000000',
  '0000012110111551110121000000',
  '1111110000144444400001111111',
  '0000000000144444400000000000',
  '1111110000144444400001111111',
  '0000012110111111110121000000',
  '0000012110000000001121000000',
  '0000012110111111110121000000',
  '1111112110111111110121111111',
  '1222222222222222222222222221',
  '1211112111112112111121111121',
  '1311112111112112111121111131',
  '1222112222222002222222112221',
  '1112112112111111211211211121',
  '1112112112111111211211211121',
  '1222222112222112222112222221',
  '1211111111112112111111111121',
  '1211111111112112111111111121',
  '1222222222222222222222222221',
  '1111111111111111111111111111',
]

function makeMaze() {
  const m = MAP.map(r => [...r].map(c => '01234'.indexOf(c) >= 0 ? +c : c === '5' ? 5 : 1))
  let dots = 0
  for (let r = 0; r < MROWS; r++) for (let c = 0; c < COLS; c++) if (m[r][c]===2||m[r][c]===3) dots++
  return { grid: m, dots }
}
function ok(grid, c, r) { // can walk?
  if (r<0||r>=MROWS) return false
  if (c<0||c>=COLS) return true // tunnel
  const v = grid[r][c]; return v!==1 && v!==5
}
function okGhost(grid, c, r) {
  if (r<0||r>=MROWS) return false
  if (c<0||c>=COLS) return true
  return grid[r][c] !== 1
}
function wx(c) { return c<0?COLS-1:c>=COLS?0:c }

function initState() {
  const { grid, dots } = makeMaze()
  return {
    grid, dots, eaten: 0, score: 0, lives: 3, tick: 0,
    pac: { c: 14, r: 23, dir: DIR.LT, next: -1 },
    ghosts: [
      { c:14, r:11, dir:DIR.LT, home:0 },   // Blinky - out immediately
      { c:12, r:14, dir:DIR.UP, home:30 },   // Pinky - ~3s
      { c:14, r:14, dir:DIR.DN, home:60 },   // Inky - ~6s
      { c:16, r:14, dir:DIR.UP, home:90 },   // Clyde - ~9s
    ],
    power: 0, combo: 1, over: false, won: false, dead: 0,
    scatter: false, modeT: 0,
  }
}

// Ghost targeting (classic rules)
function target(i, g, pac, blinky, scatter) {
  const corners = [[25,0],[2,0],[27,30],[0,30]]
  if (scatter) return corners[i]
  switch(i) {
    case 0: return [pac.c, pac.r]
    case 1: return [pac.c+DX[pac.dir]*4, pac.r+DY[pac.dir]*4]
    case 2: {
      const ax=pac.c+DX[pac.dir]*2, ay=pac.r+DY[pac.dir]*2
      return [ax+(ax-blinky.c), ay+(ay-blinky.r)]
    }
    case 3: {
      const d=Math.abs(g.c-pac.c)+Math.abs(g.r-pac.r)
      return d>8?[pac.c,pac.r]:corners[3]
    }
    default: return [pac.c, pac.r]
  }
}

// Move ghost ONE tile (called every ghost tick)
function moveGhost(g, i, state) {
  const { grid, pac, ghosts, scatter, power } = state
  const scared = power > 0

  // Still in house? Count down and exit
  if (g.home > 0) { g.home--; return }

  // Leaving house: move to exit tile (14, 11)
  if (g.r >= 12 && g.r <= 15 && g.c >= 11 && g.c <= 17) {
    // Move toward col 14 first
    if (g.c < 14) { g.c++; return }
    if (g.c > 14) { g.c--; return }
    // Then move up to row 11
    if (g.r > 11) { g.r--; return }
  }

  // Get target tile
  const [tx, ty] = scared
    ? [Math.floor(Math.random()*COLS), Math.floor(Math.random()*MROWS)]
    : target(i, g, pac, ghosts[0], scatter)

  // Find best direction (no reversal unless only option)
  let bestD = -1, bestDist = Infinity
  const valid = []
  for (let d = 0; d < 4; d++) {
    if (d === OPP[g.dir]) continue // no 180
    const nc = wx(g.c + DX[d]), nr = g.r + DY[d]
    if (!okGhost(grid, nc, nr)) continue
    valid.push(d)
    const dist = (nc-tx)**2 + (nr-ty)**2
    if (dist < bestDist) { bestDist = dist; bestD = d }
  }

  // Dead end? Allow reversal
  if (valid.length === 0) bestD = OPP[g.dir]
  if (bestD < 0) bestD = g.dir // fallback: keep going

  g.dir = bestD
  g.c = wx(g.c + DX[g.dir])
  g.r = g.r + DY[g.dir]
}

// Move pac one tile (called every pac tick)
function movePac(state) {
  const { grid, pac } = state
  // Try queued direction
  if (pac.next >= 0) {
    const nc = wx(pac.c+DX[pac.next]), nr = pac.r+DY[pac.next]
    if (ok(grid, nc, nr)) { pac.dir = pac.next; pac.next = -1 }
  }
  // Move in current direction
  const nc = wx(pac.c+DX[pac.dir]), nr = pac.r+DY[pac.dir]
  if (ok(grid, nc, nr)) { pac.c = nc; pac.r = nr }
}

// Full game tick (called from intervals)
function gameTick(state, isPacTick, isGhostTick) {
  if (state.over || state.won || state.dead > 0) return
  state.tick++
  state.modeT++
  if (state.scatter && state.modeT > 70) { state.scatter=false; state.modeT=0 }
  else if (!state.scatter && state.modeT > 200) { state.scatter=true; state.modeT=0 }

  if (isPacTick) {
    movePac(state)
    // Eat
    const cell = state.grid[state.pac.r]?.[state.pac.c]
    if (cell === 2) { state.grid[state.pac.r][state.pac.c]=0; state.score+=10; state.eaten++ }
    else if (cell === 3) {
      state.grid[state.pac.r][state.pac.c]=0; state.score+=50; state.eaten++
      state.power = POWER_MS; state.combo = 1
      for (const g of state.ghosts) if (g.home<=0) g.dir = OPP[g.dir]
    }
  }

  if (isGhostTick) {
    for (let i = 0; i < state.ghosts.length; i++) moveGhost(state.ghosts[i], i, state)
  }

  // Collision
  for (const g of state.ghosts) {
    if (g.home > 0) continue
    if (g.c === state.pac.c && g.r === state.pac.r) {
      if (state.power > 0) {
        state.score += 200 * state.combo; state.combo *= 2
        g.c = 14; g.r = 14; g.home = 20
      } else {
        state.lives--; state.dead = 1500
        if (state.lives <= 0) state.over = true
      }
    }
  }
  if (state.eaten >= state.dots) { state.won = true; state.over = true }
}

// === RENDERING (smooth interpolation between tiles) ===
function draw(ctx, state, scale, animT) {
  const s = TILE * scale
  const { grid, pac, ghosts, tick, power } = state
  const scared = power > 0

  ctx.fillStyle = COL.bg
  ctx.fillRect(0, 0, COLS*s, (MROWS+2)*s)

  // Walls (outline style)
  ctx.strokeStyle = COL.wall
  ctx.lineWidth = Math.max(1.5, s*0.18)
  ctx.lineCap = 'round'
  for (let r=0;r<MROWS;r++) for (let c=0;c<COLS;c++) {
    if (grid[r][c]!==1) continue
    const x=c*s, y=r*s
    const up=r>0&&grid[r-1][c]!==1, dn=r<MROWS-1&&grid[r+1][c]!==1
    const lt=c>0&&grid[r][c-1]!==1, rt=c<COLS-1&&grid[r][c+1]!==1
    ctx.beginPath()
    if(up){ctx.moveTo(x,y+1);ctx.lineTo(x+s,y+1)}
    if(dn){ctx.moveTo(x,y+s-1);ctx.lineTo(x+s,y+s-1)}
    if(lt){ctx.moveTo(x+1,y);ctx.lineTo(x+1,y+s)}
    if(rt){ctx.moveTo(x+s-1,y);ctx.lineTo(x+s-1,y+s)}
    ctx.stroke()
  }
  // Gate
  for(let r=0;r<MROWS;r++) for(let c=0;c<COLS;c++)
    if(grid[r][c]===5){ctx.fillStyle=COL.gate;ctx.fillRect(c*s,r*s+s*0.35,s,s*0.3)}

  // Dots
  for(let r=0;r<MROWS;r++) for(let c=0;c<COLS;c++){
    const v=grid[r][c]
    if(v===2){ctx.fillStyle=COL.dot;ctx.beginPath();ctx.arc(c*s+s/2,r*s+s/2,s*0.13,0,6.28);ctx.fill()}
    else if(v===3&&tick%30<20){ctx.fillStyle=COL.pow;ctx.beginPath();ctx.arc(c*s+s/2,r*s+s/2,s*0.35,0,6.28);ctx.fill()}
  }

  // Pac-Man (smooth mouth)
  if (state.dead <= 0) {
    const px=pac.c*s+s/2, py=pac.r*s+s/2, pr=s*0.45
    const mouth = 0.08 + Math.abs(Math.sin(animT*8))*0.32
    const ang = [Math.PI*1.5, 0, Math.PI*0.5, Math.PI][pac.dir]
    ctx.fillStyle=COL.pac
    ctx.beginPath();ctx.moveTo(px,py)
    ctx.arc(px,py,pr,ang+mouth,ang+Math.PI*2-mouth)
    ctx.closePath();ctx.fill()
  }

  // Ghosts
  for(let i=0;i<ghosts.length;i++){
    const g=ghosts[i]
    if(g.home>15) continue
    const gx=g.c*s+s/2, gy=g.r*s+s/2, gr=s*0.44
    const blink = power<2000&&power>0&&tick%14<7
    const color = scared?(blink?COL.scare2:COL.scared):COL.gh[i]
    ctx.fillStyle=color
    ctx.beginPath()
    ctx.arc(gx,gy-gr*0.1,gr,Math.PI,0)
    ctx.lineTo(gx+gr,gy+gr*0.7)
    for(let j=0;j<3;j++){const sx=gx+gr-j*(gr*2/3);ctx.lineTo(sx-gr/3,j%2===0?gy+gr*0.45:gy+gr*0.7)}
    ctx.lineTo(gx-gr,gy+gr*0.7);ctx.closePath();ctx.fill()
    if(!scared){
      const er=gr*0.22,pr2=gr*0.11,ox=gr*0.28,ey=gy-gr*0.15
      const pdx=DX[g.dir]*pr2,pdy=DY[g.dir]*pr2
      ctx.fillStyle=COL.eye;ctx.beginPath()
      ctx.arc(gx-ox,ey,er,0,6.28);ctx.arc(gx+ox,ey,er,0,6.28);ctx.fill()
      ctx.fillStyle=COL.pupil;ctx.beginPath()
      ctx.arc(gx-ox+pdx,ey+pdy,pr2,0,6.28);ctx.arc(gx+ox+pdx,ey+pdy,pr2,0,6.28);ctx.fill()
    }
  }

  // HUD
  const hy=MROWS*s+4
  ctx.fillStyle=COL.txt;ctx.font=`bold ${Math.max(9,s*1.1)}px monospace`;ctx.textAlign='left'
  ctx.fillText(`SCORE ${state.score}`,4,hy+s)
  for(let i=0;i<state.lives;i++){
    const lx=COLS*s-12-i*s*2
    ctx.fillStyle=COL.pac;ctx.beginPath();ctx.moveTo(lx,hy+s*0.6)
    ctx.arc(lx,hy+s*0.6,s*0.5,0.25,6.03);ctx.closePath();ctx.fill()
  }
  if(power>0){ctx.fillStyle=power<2000?'#F33':'#33F';ctx.fillRect(4,hy+s*1.6,(COLS*s-8)*(power/POWER_MS),3)}
  if(state.over){
    ctx.fillStyle='rgba(0,0,0,0.75)';ctx.fillRect(0,GH*0.4,COLS*s,s*4)
    ctx.fillStyle=state.won?'#0F0':COL.pac;ctx.font=`bold ${s*2.2}px monospace`;ctx.textAlign='center'
    ctx.fillText(state.won?'YOU WIN!':'GAME OVER',COLS*s/2,GH*0.4+s*3)
  }
}

// === REACT COMPONENT ===
function PacmanGame({ onGameEnd, onScoreUpdate, isActive }) {
  const canvasRef = useRef(null)
  const stRef = useRef(null)
  const pacIntRef = useRef(null)
  const ghostIntRef = useRef(null)
  const rafRef = useRef(null)
  const endRef = useRef(false)
  const prevScore = useRef(0)
  const pausedRef = useRef(false)
  const [paused, setPaused] = useState(false)
  const scaleRef = useRef(1)

  const setup = useCallback(() => {
    const cv = canvasRef.current; if(!cv) return
    const ctr = cv.parentElement; if(!ctr) return
    const maxW = Math.min(ctr.clientWidth, 600)
    const scale = maxW / GW; scaleRef.current = scale
    const dpr = window.devicePixelRatio||1
    const h = (MROWS*TILE+TILE*2.5)*scale
    cv.style.width=`${maxW}px`;cv.style.height=`${h}px`
    cv.width=Math.round(maxW*dpr);cv.height=Math.round(h*dpr)
    const ctx=cv.getContext('2d');if(ctx) ctx.setTransform(dpr,0,0,dpr,0,0)
  },[])

  const start = useCallback(()=>{
    stRef.current = initState(); prevScore.current=0; endRef.current=false
    pausedRef.current=false; setPaused(false)
  },[])

  // Game ticks via intervals (pac moves faster than ghosts)
  useEffect(()=>{
    setup(); start()

    pacIntRef.current = setInterval(()=>{
      const st=stRef.current; if(!st||pausedRef.current) return
      gameTick(st, true, false)
      if(st.power>0) st.power -= PAC_TICK
      if(st.dead>0){st.dead-=PAC_TICK;if(st.dead<=0&&!st.over){
        st.pac={c:14,r:23,dir:DIR.LT,next:-1}
        st.ghosts=[{c:14,r:11,dir:DIR.LT,home:0},{c:12,r:14,dir:DIR.UP,home:10},{c:14,r:14,dir:DIR.DN,home:30},{c:16,r:14,dir:DIR.UP,home:50}]
      }}
      if(st.score!==prevScore.current){prevScore.current=st.score;onScoreUpdate(st.score)}
      if(st.over&&!endRef.current){endRef.current=true;onGameEnd(st.score)}
    }, PAC_TICK)

    ghostIntRef.current = setInterval(()=>{
      const st=stRef.current; if(!st||pausedRef.current) return
      gameTick(st, false, true)
    }, GHOST_TICK)

    // Render loop (60fps visual)
    let animT = 0
    const renderLoop = (ts) => {
      animT = ts/1000
      const cv=canvasRef.current; if(!cv) return
      const ctx=cv.getContext('2d'); const st=stRef.current
      if(ctx&&st) draw(ctx,st,scaleRef.current,animT)
      rafRef.current = requestAnimationFrame(renderLoop)
    }
    rafRef.current = requestAnimationFrame(renderLoop)

    const onKey = (e) => {
      const st=stRef.current;if(!st||st.over) return
      const map={ArrowUp:DIR.UP,ArrowRight:DIR.RT,ArrowDown:DIR.DN,ArrowLeft:DIR.LT,w:DIR.UP,d:DIR.RT,s:DIR.DN,a:DIR.LT}
      const d=map[e.key];if(d!==undefined){e.preventDefault();st.pac.next=d}
    }
    const tRef = {x:0,y:0}
    const onTS = (e)=>{e.preventDefault();tRef.x=e.touches[0].clientX;tRef.y=e.touches[0].clientY}
    const onTM = (e)=>{
      e.preventDefault();const st=stRef.current;if(!st||st.over) return
      const dx=e.touches[0].clientX-tRef.x,dy=e.touches[0].clientY-tRef.y
      if(Math.abs(dx)>10||Math.abs(dy)>10){
        st.pac.next=Math.abs(dx)>Math.abs(dy)?(dx>0?DIR.RT:DIR.LT):(dy>0?DIR.DN:DIR.UP)
        tRef.x=e.touches[0].clientX;tRef.y=e.touches[0].clientY
      }
    }
    const onVis=()=>{if(document.hidden){pausedRef.current=true;setPaused(true)}else{pausedRef.current=false;setPaused(false)}}

    window.addEventListener('keydown',onKey)
    canvasRef.current?.addEventListener('touchstart',onTS,{passive:false})
    canvasRef.current?.addEventListener('touchmove',onTM,{passive:false})
    document.addEventListener('visibilitychange',onVis)
    window.addEventListener('resize',setup)

    return ()=>{
      clearInterval(pacIntRef.current);clearInterval(ghostIntRef.current)
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('keydown',onKey)
      document.removeEventListener('visibilitychange',onVis)
      window.removeEventListener('resize',setup)
    }
  },[setup,start,onGameEnd,onScoreUpdate])

  const pRef = useRef(isActive)
  useEffect(()=>{
    if(isActive&&!pRef.current){start();onScoreUpdate(0)}
    pRef.current=isActive
  },[isActive,start,onScoreUpdate])

  return (
    <div className="relative w-full overflow-hidden rounded-xl bg-black">
      <canvas ref={canvasRef} className="mx-auto block touch-none rounded-xl" aria-label="Pac-Man" />
      {paused&&<div className="absolute inset-0 flex items-center justify-center bg-black/80 rounded-xl"><span className="text-xl font-bold text-yellow-400">PAUSED</span></div>}
    </div>
  )
}
export default PacmanGame
