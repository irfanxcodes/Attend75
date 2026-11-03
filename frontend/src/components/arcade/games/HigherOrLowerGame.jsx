import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trophy, ArrowUp, ArrowDown } from 'lucide-react'

// ── Constants ──────────────────────────────────────────────────────────────────

const DATA_URL = '/data/higherOrLower.json'
const REVEAL_DURATION = 1600

// ── Utilities ──────────────────────────────────────────────────────────────────

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Flatten all categories into one pool, each item carrying its own display fields.
 * Items from the same category won't be adjacent since we shuffle the full pool.
 */
function buildPool(categories) {
  const items = []
  for (const cat of categories) {
    for (const item of cat.items) {
      items.push({
        ...item,
        stat: cat.stat,
        unit: cat.unit,
        formatSuffix: cat.formatSuffix,
      })
    }
  }
  return shuffle(items)
}

function formatValue(value, unit, formatSuffix) {
  if (formatSuffix === 'M')    return `${unit}${value}${formatSuffix}`
  if (formatSuffix === ' pts') return `${value}${formatSuffix}`
  if (formatSuffix === '/10')  return `${value}${formatSuffix}`
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`
  if (value >= 1_000_000)     return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000)         return `${(value / 1_000).toFixed(1)}K`
  return `${unit}${value}`
}

// ── Animated logo ──────────────────────────────────────────────────────────────

function HolLogo({ size = 'lg' }) {
  const big  = size === 'lg' ? 52 : 36
  const sm   = size === 'lg' ? 13 : 10
  const arr  = size === 'lg' ? 32 : 22
  const arrH = size === 'lg' ? 38 : 26

  return (
    <div className="flex flex-col items-center select-none" style={{ gap: size === 'lg' ? 2 : 1 }}>
      <style>{`
        @keyframes holArrowUp   { 0%,100%{transform:translateY(0);opacity:1} 50%{transform:translateY(-8px);opacity:.7} }
        @keyframes holArrowDown { 0%,100%{transform:translateY(0);opacity:1} 50%{transform:translateY(8px);opacity:.7} }
        @keyframes holGreen     { 0%,100%{text-shadow:0 0 20px rgba(78,240,100,.5)} 50%{text-shadow:0 0 40px rgba(78,240,100,1),0 0 80px rgba(78,240,100,.4)} }
        @keyframes holRed       { 0%,100%{text-shadow:0 0 20px rgba(255,80,80,.5)} 50%{text-shadow:0 0 40px rgba(255,80,80,1),0 0 80px rgba(255,80,80,.4)} }
      `}</style>

      <span style={{ fontSize: sm, letterSpacing:'0.3em', color:'rgba(255,255,255,0.55)', fontWeight:900, textTransform:'uppercase' }}>THE</span>

      {/* HIGHER row */}
      <div className="flex items-center gap-1.5">
        <svg width={arr} height={arrH} viewBox="0 0 32 38" fill="none"
          style={{ animation:'holArrowUp 1.6s ease-in-out infinite', flexShrink:0 }}>
          <path d="M16 2 L30 22 H20 V36 H12 V22 H2 Z" fill="#4EF064" stroke="#2DC04A" strokeWidth="1.5" strokeLinejoin="round"/>
        </svg>
        <span style={{
          fontSize: big, color:'#4EF064', fontWeight:900, lineHeight:1,
          fontFamily:'system-ui,-apple-system,sans-serif', letterSpacing:'-0.02em',
          WebkitTextStroke:`${size==='lg'?'1.5':'1'}px #2DC04A`,
          animation:'holGreen 2s ease-in-out infinite',
        }}>HIGHER</span>
      </div>

      {/* LOWER row */}
      <div className="flex items-center gap-1.5">
        <span style={{
          fontSize: big, color:'#FF5050', fontWeight:900, lineHeight:1,
          fontFamily:'system-ui,-apple-system,sans-serif', letterSpacing:'-0.02em',
          WebkitTextStroke:`${size==='lg'?'1.5':'1'}px #C83030`,
          animation:'holRed 2s ease-in-out infinite', animationDelay:'1s',
        }}>LOWER</span>
        <svg width={arr} height={arrH} viewBox="0 0 32 38" fill="none"
          style={{ animation:'holArrowDown 1.6s ease-in-out infinite', flexShrink:0 }}>
          <path d="M16 36 L30 16 H20 V2 H12 V16 H2 Z" fill="#FF5050" stroke="#C83030" strokeWidth="1.5" strokeLinejoin="round"/>
        </svg>
      </div>

      <span style={{ fontSize: sm+2, letterSpacing:'0.35em', color:'rgba(255,255,255,0.65)', fontWeight:900, textTransform:'uppercase' }}>GAME</span>
    </div>
  )
}

// ── Landing screen ─────────────────────────────────────────────────────────────

function LandingScreen({ onPlay, onLeaderboard, best }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center px-6"
      style={{ background:'linear-gradient(160deg,#0d0b1e 0%,#1a1035 50%,#0a0e1a 100%)' }}>

      {/* Ambient glow orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute rounded-full" style={{
          width:300, height:300, top:'-5%', left:'-10%',
          background:'radial-gradient(circle,rgba(78,240,100,.12) 0%,transparent 70%)',
          filter:'blur(40px)', animation:'holBgPulse 2.5s ease-in-out infinite',
        }}/>
        <div className="absolute rounded-full" style={{
          width:300, height:300, bottom:'-5%', right:'-10%',
          background:'radial-gradient(circle,rgba(255,80,80,.12) 0%,transparent 70%)',
          filter:'blur(40px)', animation:'holBgPulse 2.5s ease-in-out infinite', animationDelay:'1.25s',
        }}/>
      </div>

      <style>{`
        @keyframes holBgPulse { 0%,100%{opacity:.8} 50%{opacity:1.4} }
        @keyframes holFadeIn  { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
      `}</style>

      {/* Logo */}
      <div style={{ animation:'holFadeIn .5s ease-out' }}>
        <HolLogo size="lg" />
      </div>

      {/* Tagline */}
      <div className="text-center mt-6 mb-8" style={{ animation:'holFadeIn .5s ease-out .1s both' }}>
        <p className="text-white font-bold text-base">Which one is higher?</p>
        <p className="text-white/40 text-sm mt-1">272 items across 11 categories. Mixed randomly.</p>
        {best > 0 && (
          <div className="inline-flex items-center gap-2 mt-3 px-4 py-1.5 rounded-full"
            style={{ background:'rgba(255,215,0,.1)', border:'1px solid rgba(255,215,0,.25)' }}>
            <span style={{ color:'#FFD700', fontSize:13, fontWeight:700 }}>🏆 Your best: {best}</span>
          </div>
        )}
      </div>

      {/* CTA buttons */}
      <div className="flex flex-col gap-3 w-full max-w-xs" style={{ animation:'holFadeIn .5s ease-out .2s both' }}>
        <button
          type="button"
          onClick={onPlay}
          className="w-full py-4 rounded-2xl font-black text-base text-black active:scale-95 transition-transform flex items-center justify-center gap-2"
          style={{
            background:'linear-gradient(135deg,#4EF0A0 0%,#2BC87A 100%)',
            boxShadow:'0 4px 0 rgba(0,0,0,.3),0 8px 24px rgba(78,240,160,.4)',
          }}
        >
          <ArrowUp size={20} strokeWidth={3}/>
          Play
          <ArrowDown size={20} strokeWidth={3}/>
        </button>

        <button
          type="button"
          onClick={onLeaderboard}
          className="w-full py-3.5 rounded-2xl font-bold text-sm active:scale-95 transition-transform flex items-center justify-center gap-2"
          style={{
            background:'rgba(255,215,0,.08)',
            border:'1px solid rgba(255,215,0,.25)',
            color:'#FFD700',
          }}
        >
          <Trophy size={16}/>
          Leaderboard
        </button>
      </div>

      {/* Credits */}
      <p className="absolute bottom-3 text-center"
        style={{ fontSize:10, color:'rgba(255,255,255,.18)' }}>
        Images: Wikimedia CC · flagcdn.com · PokeAPI · TMDB · Steam
      </p>
    </div>
  )
}

// ── Card ───────────────────────────────────────────────────────────────────────

function Card({ item, revealed, side, correct }) {
  const [imgFailed, setImgFailed] = useState(false)
  useEffect(() => { setImgFailed(false) }, [item?.id])
  if (!item) return null

  const displayValue = formatValue(item.value, item.unit, item.formatSuffix)

  let ringStyle = {}
  if (revealed && side === 'right') {
    ringStyle = { boxShadow: correct ? '0 0 0 3px #4EF0A0' : '0 0 0 3px #FF6B6B' }
  }

  return (
    <div className="relative flex flex-col rounded-2xl overflow-hidden"
      style={{
        background:'linear-gradient(160deg,#1e1b3a 0%,#141229 100%)',
        border:'1px solid rgba(255,255,255,0.08)',
        flex:1, minHeight:240,
        transition:'box-shadow 0.3s',
        ...ringStyle,
      }}>

      {/* Image */}
      <div className="relative w-full" style={{ aspectRatio:'4/3', overflow:'hidden' }}>
        {!imgFailed ? (
          <img src={item.image} alt={item.name} loading="lazy"
            onError={() => setImgFailed(true)}
            className="w-full h-full object-cover" style={{ display:'block' }}/>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl"
            style={{ background:'#1e1b3a' }}>🎯</div>
        )}
        <div className="absolute inset-x-0 bottom-0"
          style={{ height:'65%', background:'linear-gradient(to top,#141229,transparent)' }}/>
      </div>

      {/* Name + hint */}
      <div className="relative z-10 flex flex-col items-center gap-0.5 px-2 pb-1 -mt-8 text-center">
        <p className="text-white font-bold text-sm leading-tight">{item.name}</p>
        {item.hint && <p className="text-white/45 text-xs leading-snug">{item.hint}</p>}
      </div>

      {/* Stat */}
      <div className="w-full px-2 pb-3 pt-1.5 flex flex-col items-center gap-0.5">
        <span className="text-white/45 text-xs uppercase tracking-widest leading-none">{item.stat}</span>
        {side === 'left' || revealed ? (
          <span className="text-xl font-black leading-tight" style={{
            color: revealed && side === 'right' ? (correct ? '#4EF0A0' : '#FF6B6B') : '#FFD700',
          }}>{displayValue}</span>
        ) : (
          <span className="text-2xl font-black text-white/25">?</span>
        )}
      </div>
    </div>
  )
}

// ── VS divider ─────────────────────────────────────────────────────────────────

function VsDivider() {
  return (
    <div className="flex-shrink-0 flex items-center justify-center" style={{ width:36 }}>
      <div className="flex items-center justify-center rounded-full text-xs font-black text-white"
        style={{
          width:32, height:32,
          background:'linear-gradient(135deg,#6C47FF,#FF47C0)',
          boxShadow:'0 4px 12px rgba(108,71,255,0.5)',
        }}>VS</div>
    </div>
  )
}

// ── Game Over overlay ──────────────────────────────────────────────────────────

function GameOverOverlay({ score, best, onPlayAgain, onLeaderboard }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center p-4"
      style={{
        background:'rgba(0,0,0,0.88)', backdropFilter:'blur(10px)',
        animation:'holFadeIn 0.3s ease-out', zIndex:20,
      }}>
      <style>{`
        @keyframes holFadeIn  { from{opacity:0} to{opacity:1} }
        @keyframes holSlideUp { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
      `}</style>

      <div className="flex flex-col items-center gap-5 rounded-3xl px-6 py-8 w-full max-w-xs"
        style={{
          background:'linear-gradient(160deg,#1e1b3a 0%,#0e0c1e 100%)',
          border:'1px solid rgba(255,255,255,0.1)',
          animation:'holSlideUp 0.35s ease-out',
          boxShadow:'0 24px 64px rgba(0,0,0,0.6)',
        }}>

        <div className="text-center">
          <div className="text-4xl mb-2">😬</div>
          <h2 className="text-xl font-black text-white">Game Over</h2>
          <p className="text-white/40 text-sm mt-1">Better luck next time!</p>
        </div>

        {/* Score / Best */}
        <div className="w-full grid grid-cols-2 gap-3">
          {[['Score', score, 'text-white'], ['Best', best, '#FFD700']].map(([label, val, color]) => (
            <div key={label} className="flex flex-col items-center gap-1 rounded-2xl py-4"
              style={{ background:'rgba(255,255,255,0.05)' }}>
              <span className="text-white/50 text-xs uppercase tracking-widest">{label}</span>
              <span className="text-3xl font-black" style={{ color: color === 'text-white' ? '#fff' : color }}>{val}</span>
            </div>
          ))}
        </div>

        {/* Buttons */}
        <div className="flex flex-col gap-3 w-full">
          <button type="button" onClick={onPlayAgain}
            className="w-full py-3.5 rounded-2xl font-black text-sm text-black active:scale-95 transition-transform"
            style={{ background:'linear-gradient(180deg,#B8F77D 0%,#7BE056 100%)', boxShadow:'0 3px 0 rgba(0,0,0,0.3)' }}>
            ↺ Play Again
          </button>
          <button type="button" onClick={onLeaderboard}
            className="w-full py-3 rounded-2xl font-bold text-sm active:scale-95 transition-transform flex items-center justify-center gap-2"
            style={{ background:'rgba(255,215,0,0.1)', border:'1px solid rgba(255,215,0,0.25)', color:'#FFD700' }}>
            <Trophy size={15}/>
            Leaderboard
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function HigherOrLowerGame({ onGameEnd, onScoreUpdate, isActive }) {
  const navigate = useNavigate()

  // ── Data ────────────────────────────────────────────────────────────────────
  const [allItems, setAllItems]   = useState([])   // full flat pool (loaded once)
  const [dataError, setDataError] = useState(null)
  const [dataLoading, setDataLoading] = useState(true)

  // ── Game state ──────────────────────────────────────────────────────────────
  // phase: 'home' | 'playing' | 'gameover'
  const [phase, setPhase]       = useState('home')
  const [deck, setDeck]         = useState([])
  const [leftItem, setLeftItem] = useState(null)
  const [rightItem, setRightItem] = useState(null)
  const [score, setScore]       = useState(0)
  const [best, setBest]         = useState(0)
  const [streak, setStreak]     = useState(0)
  const [reveal, setReveal]     = useState(null)   // null | 'correct' | 'wrong'
  const [locked, setLocked]     = useState(false)

  const onGameEndRef     = useRef(onGameEnd)
  const onScoreUpdateRef = useRef(onScoreUpdate)
  useEffect(() => { onGameEndRef.current     = onGameEnd     }, [onGameEnd])
  useEffect(() => { onScoreUpdateRef.current = onScoreUpdate }, [onScoreUpdate])
  const endCalledRef = useRef(false)

  // ── Load data once ──────────────────────────────────────────────────────────
  useEffect(() => {
    fetch(DATA_URL)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(d => { setAllItems(buildPool(d.categories ?? [])); setDataLoading(false) })
      .catch(err => { setDataError(err.message); setDataLoading(false) })
  }, [])

  // ── Prefetch next card image ─────────────────────────────────────────────────
  useEffect(() => {
    if (deck.length > 0 && deck[0]?.image) {
      const img = new Image(); img.src = deck[0].image
    }
  }, [deck])

  // ── Start / restart ──────────────────────────────────────────────────────────
  const startGame = useCallback(() => {
    if (allItems.length < 2) return
    const pool = shuffle(allItems)
    const [left, right, ...rest] = pool
    setDeck(rest)
    setLeftItem(left)
    setRightItem(right)
    setScore(0)
    setStreak(0)
    setReveal(null)
    setLocked(false)
    endCalledRef.current = false
    setPhase('playing')
    onScoreUpdateRef.current(0)
  }, [allItems])

  // ── Guess ────────────────────────────────────────────────────────────────────
  const handleGuess = useCallback((guess) => {
    if (locked || reveal || phase !== 'playing') return
    setLocked(true)

    const isTie     = rightItem.value === leftItem.value
    const isHigher  = rightItem.value > leftItem.value
    const isCorrect = isTie || (guess === 'higher' ? isHigher : !isHigher)

    setReveal(isCorrect ? 'correct' : 'wrong')

    if (isCorrect) {
      const newScore  = score + 1
      const newStreak = streak + 1
      setScore(newScore)
      setStreak(newStreak)
      onScoreUpdateRef.current(newScore)

      setTimeout(() => {
        setReveal(null)
        setLocked(false)
        if (deck.length === 0) {
          // Pool exhausted — reshuffle everything except the current right card
          const fresh = shuffle(allItems.filter(i => i.id !== rightItem.id))
          setDeck(fresh.slice(1))
          setLeftItem(rightItem)
          setRightItem(fresh[0])
        } else {
          const [next, ...rest] = deck
          setDeck(rest)
          setLeftItem(rightItem)
          setRightItem(next)
        }
      }, REVEAL_DURATION)

    } else {
      setTimeout(() => {
        const finalScore = score
        setBest(prev => Math.max(prev, finalScore))
        setPhase('gameover')
        if (!endCalledRef.current) {
          endCalledRef.current = true
          try { onGameEndRef.current(finalScore) } catch { /* ignore */ }
        }
      }, REVEAL_DURATION)
    }
  }, [locked, reveal, phase, rightItem, leftItem, score, streak, deck, allItems])

  // ── Keyboard ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'playing') return
    const onKey = (e) => {
      if (e.key === 'ArrowUp'   || e.key === 'h') handleGuess('higher')
      if (e.key === 'ArrowDown' || e.key === 'l') handleGuess('lower')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, handleGuess])

  // ── isActive restart from GameLayout ────────────────────────────────────────
  const prevActiveRef = useRef(isActive)
  useEffect(() => {
    if (isActive && !prevActiveRef.current && allItems.length > 0) startGame()
    prevActiveRef.current = isActive
  }, [isActive, allItems, startGame])

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const handlePlayAgain  = useCallback(() => startGame(), [startGame])
  const handleLeaderboard = useCallback(() => navigate('/app/arcade/higherorlower?view=leaderboard'), [navigate])
  const handleGoHome     = useCallback(() => { setPhase('home'); endCalledRef.current = false }, [])

  // ── Loading / Error ───────────────────────────────────────────────────────────
  if (dataLoading) {
    return (
      <div className="absolute inset-0 flex items-center justify-center" style={{ background:'#0a0e1a' }}>
        <div className="flex flex-col items-center gap-3">
          <div className="rounded-full" style={{
            width:40, height:40,
            border:'3px solid rgba(255,255,255,0.1)', borderTopColor:'#6C47FF',
            animation:'spin 0.8s linear infinite',
          }}/>
          <p className="text-white/40 text-sm">Loading…</p>
        </div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    )
  }
  if (dataError) {
    return (
      <div className="absolute inset-0 flex items-center justify-center p-6" style={{ background:'#0a0e1a' }}>
        <div className="text-center">
          <p className="text-white/60 text-sm mb-4">Failed to load game data.</p>
          <button type="button" onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-xl text-sm font-bold text-black"
            style={{ background:'#B8F77D' }}>Retry</button>
        </div>
      </div>
    )
  }

  // ── Home screen ───────────────────────────────────────────────────────────────
  if (phase === 'home') {
    return (
      <div className="absolute inset-0 flex flex-col" style={{ background:'#0a0e1a' }}>
        {/* Top bar */}
        <div className="flex-shrink-0 flex items-center px-3 gap-3"
          style={{ height:52, background:'rgba(10,14,26,0.95)', borderBottom:'1px solid rgba(255,255,255,0.07)', paddingTop:'env(safe-area-inset-top,0px)' }}>
          <button type="button" onClick={() => navigate('/app/arcade')}
            className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full font-bold text-xs text-black active:scale-95 transition-transform"
            style={{ background:'linear-gradient(180deg,#B8F77D 0%,#7BE056 100%)', boxShadow:'0 2px 0 rgba(0,0,0,0.25)' }}
            aria-label="Back to Arcade">
            <span className="text-sm">←</span><span>BACK</span>
          </button>
          <h1 className="flex-1 text-center text-sm font-bold text-white truncate">Higher or Lower</h1>
          <div className="min-w-[64px]"/>
        </div>
        <LandingScreen onPlay={startGame} onLeaderboard={handleLeaderboard} best={best}/>
      </div>
    )
  }

  // ── Playing + Game Over ───────────────────────────────────────────────────────
  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden"
      style={{ background:'linear-gradient(160deg,#0d0b1e 0%,#0a0e1a 100%)' }}>

      {/* Top bar */}
      <div className="flex-shrink-0 flex items-center gap-3 px-3"
        style={{ height:52, background:'rgba(10,14,26,0.95)', borderBottom:'1px solid rgba(255,255,255,0.07)', paddingTop:'env(safe-area-inset-top,0px)' }}>
        <button type="button" onClick={handleGoHome}
          className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full font-bold text-xs text-black active:scale-95 transition-transform"
          style={{ background:'linear-gradient(180deg,#B8F77D 0%,#7BE056 100%)', boxShadow:'0 2px 0 rgba(0,0,0,0.25)' }}
          aria-label="Back to Home">
          <span className="text-sm">←</span><span>BACK</span>
        </button>

        {/* Mini logo in top bar */}
        <div className="flex-1 flex justify-center">
          <HolLogo size="sm"/>
        </div>

        {/* Score pill */}
        <div className="flex-shrink-0 min-w-[64px] flex justify-end">
          {phase === 'playing' && score > 0 && (
            <div className="px-3 py-1.5 rounded-full text-xs font-bold"
              style={{ background:'rgba(78,240,160,0.12)', border:'1px solid rgba(78,240,160,0.25)', color:'#4EF0A0' }}>
              {score}
            </div>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        <div className="relative flex flex-col" style={{ minHeight:'100%' }}>

          {/* Streak + score row */}
          <div className="flex items-center justify-end px-4 pt-2 pb-1 gap-2">
            {streak >= 3 && phase === 'playing' && (
              <div className="px-2.5 py-1 rounded-full text-xs font-bold"
                style={{ background:'rgba(255,140,0,.15)', color:'#FF8C00', border:'1px solid rgba(255,140,0,.3)' }}>
                🔥 {streak}
              </div>
            )}
            <div className="px-3 py-1.5 rounded-full text-sm font-black text-white"
              style={{ background:'rgba(255,255,255,0.07)' }}>
              {score}
            </div>
          </div>

          {/* Cards */}
          <div className="flex items-stretch px-3 pb-2" style={{ minHeight:260 }}>
            <Card item={leftItem}  revealed={true}    side="left"  correct={false}/>
            <VsDivider/>
            <Card item={rightItem} revealed={!!reveal} side="right" correct={reveal === 'correct'}/>
          </div>

          {/* Feedback banner */}
          {reveal && (
            <div className="mx-4 mb-3 py-2.5 rounded-2xl text-center font-black text-sm"
              style={{
                background: reveal === 'correct' ? 'rgba(78,240,160,0.15)' : 'rgba(255,107,107,0.15)',
                border:`1px solid ${reveal === 'correct' ? 'rgba(78,240,160,0.3)' : 'rgba(255,107,107,0.3)'}`,
                color: reveal === 'correct' ? '#4EF0A0' : '#FF6B6B',
                animation:'holFadeIn 0.2s ease-out',
              }}>
              {reveal === 'correct' ? '✓ Correct!' : '✗ Wrong!'}
            </div>
          )}

          {/* Guess buttons */}
          {phase === 'playing' && !reveal && (
            <div className="flex gap-3 px-4 pb-4">
              <button type="button" onClick={() => handleGuess('higher')} disabled={locked}
                className="flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl font-black text-sm active:scale-95 transition-transform disabled:opacity-50"
                style={{ background:'linear-gradient(135deg,#4EF0A0 0%,#2BC87A 100%)', color:'#000', boxShadow:'0 4px 0 rgba(0,0,0,0.3),0 8px 20px rgba(78,240,160,0.3)' }}>
                <ArrowUp size={18} strokeWidth={3}/> Higher
              </button>
              <button type="button" onClick={() => handleGuess('lower')} disabled={locked}
                className="flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl font-black text-sm active:scale-95 transition-transform disabled:opacity-50"
                style={{ background:'linear-gradient(135deg,#FF6B6B 0%,#E04444 100%)', color:'#fff', boxShadow:'0 4px 0 rgba(0,0,0,0.3),0 8px 20px rgba(255,107,107,0.3)' }}>
                <ArrowDown size={18} strokeWidth={3}/> Lower
              </button>
            </div>
          )}

          {phase === 'playing' && !reveal && (
            <p className="text-center text-white/20 text-xs pb-3">↑ / ↓ keys also work</p>
          )}

          {/* Game over overlay */}
          {phase === 'gameover' && (
            <GameOverOverlay
              score={score}
              best={best}
              onPlayAgain={handlePlayAgain}
              onLeaderboard={handleLeaderboard}
            />
          )}
        </div>
      </div>

      <style>{`
        @keyframes holFadeIn { from{opacity:0} to{opacity:1} }
      `}</style>
    </div>
  )
}
