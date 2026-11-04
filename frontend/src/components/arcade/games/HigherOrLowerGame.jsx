import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trophy } from 'lucide-react'

// ── Constants ──────────────────────────────────────────────────────────────────
// Fixed: removed prevActiveRef reference

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
 * Each round picks two items from the SAME category.
 * We store categories as-is and pick randomly per round.
 * The flat pool is no longer needed — removed.
 */
function getCategoryPool(categories) {
  // Return categories with their meta attached to each item for convenience
  return categories.map(cat => ({
    ...cat,
    items: cat.items.map(item => ({
      ...item,
      stat: cat.stat,
      unit: cat.unit,
      formatSuffix: cat.formatSuffix,
    })),
  }))
}

/** Pick a random category, return a shuffled copy of its items. */
function pickCategory(categories) {
  const cat = categories[Math.floor(Math.random() * categories.length)]
  return { cat, shuffled: shuffle(cat.items) }
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

// ── Simple logo for top bar ───────────────────────────────────────────────────

function HolLogo() {
  return (
    <div className="flex items-center gap-1 select-none">
      <span className="text-lg font-black tracking-tight" style={{ color:'#4EF064' }}>HIGHER</span>
      <span className="text-lg font-black tracking-tight" style={{ color:'#FF5050' }}>LOWER↓</span>
      <span className="text-xs font-bold tracking-widest text-white/40 ml-1">GAME</span>
    </div>
  )
}

// ── Landing screen ─────────────────────────────────────────────────────────────

// ── Card ───────────────────────────────────────────────────────────────────────

function Card({ item, revealed, side, correct, leftItem }) {
  const [imgFailed, setImgFailed] = useState(false)
  useEffect(() => { setImgFailed(false) }, [item?.id])
  if (!item) return null

  const displayValue = formatValue(item.value, item.unit, item.formatSuffix)
  const showValue = side === 'left' || revealed

  return (
    <div className="relative flex-1 flex flex-col justify-center items-center"
      style={{
        background: '#000',
      }}>

      {/* Full Background Image */}
      <div className="absolute inset-0">
        {!imgFailed ? (
          <>
            <img src={item.image} alt={item.name} loading="lazy"
              onError={() => setImgFailed(true)}
              className="w-full h-full object-cover"/>
            {/* Subtle overlay - keep images visible */}
            <div className="absolute inset-0" style={{ 
              background: 'linear-gradient(to bottom, rgba(0,0,0,0.3), rgba(0,0,0,0.5))'
            }}/>
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl"
            style={{ background:'#1a1a1a' }}>🎯</div>
        )}
      </div>

      {/* Content Overlay - minimal, small text */}
      <div className="relative z-10 flex flex-col items-center justify-center text-center px-4">
        {/* Name - small */}
        <h2 className="text-2xl font-bold text-white mb-2 leading-tight" 
          style={{ 
            textShadow: '0 2px 8px rgba(0,0,0,0.9)'
          }}>
          "{item.name}"
        </h2>
        
        <p className="text-white text-sm mb-1" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.9)' }}>has</p>

        {/* Value - medium size */}
        {showValue ? (
          <p className="text-4xl font-black mb-1 leading-none" style={{
            color: revealed && side === 'right' 
              ? (correct ? '#4EF064' : '#FF5050') 
              : '#FFD700',
            textShadow: '0 2px 12px rgba(0,0,0,0.9)',
          }}>{displayValue}</p>
        ) : (
          <p className="text-4xl font-black text-white/30 mb-1" 
            style={{ textShadow: '0 2px 8px rgba(0,0,0,0.9)' }}>?</p>
        )}

        {/* Stat label - very small */}
        <p className="text-white/90 text-xs leading-snug max-w-[200px]" 
          style={{ textShadow: '0 2px 4px rgba(0,0,0,0.9)' }}>
          {side === 'left' ? item.stat : (revealed ? item.stat : `searches than ${leftItem?.name || 'previous'}`)}
        </p>

        {/* Hint - tiny */}
        {side === 'left' && item.hint && (
          <p className="text-white/70 text-xs mt-1 max-w-[200px]" 
            style={{ textShadow: '0 2px 4px rgba(0,0,0,0.9)' }}>
            {item.hint}
          </p>
        )}
      </div>
    </div>
  )
}

// ── VS divider ─────────────────────────────────────────────────────────────────

function VsDivider() {
  return (
    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-30">
      <div className="flex items-center justify-center rounded-full text-sm font-black text-black"
        style={{
          width:44, height:44,
          background:'#fff',
          boxShadow:'0 4px 16px rgba(0,0,0,0.6)',
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
  const [categories, setCategories] = useState([])  // enriched category list
  const [dataError, setDataError]   = useState(null)
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
      .then(d => { setCategories(getCategoryPool(d.categories ?? [])); setDataLoading(false) })
      .catch(err => { setDataError(err.message); setDataLoading(false) })
  }, [])

  // ── Prefetch next card image ─────────────────────────────────────────────────
  useEffect(() => {
    if (deck.length > 0 && deck[0]?.image) {
      const img = new Image(); img.src = deck[0].image
    }
  }, [deck])  // ── Start / restart ──────────────────────────────────────────────────────────
  const startGame = useCallback(() => {
    if (categories.length === 0) return
    const { shuffled } = pickCategory(categories)
    const [left, right, ...rest] = shuffled
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
  }, [categories])

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
          // Current category exhausted — pick a new random category
          const { shuffled } = pickCategory(categories)
          setDeck(shuffled.slice(1))
          setLeftItem(rightItem)
          setRightItem(shuffled[0])
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
  }, [locked, reveal, phase, rightItem, leftItem, score, streak, deck, categories])

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

  // ── Start game when data loads OR when becoming active ──
  const hasStartedRef = useRef(false)
  useEffect(() => {
    // Start once when data loads (auto-start on first mount)
    if (categories.length > 0 && phase === 'home' && !hasStartedRef.current) {
      hasStartedRef.current = true
      startGame()
    }
  }, [categories, phase, startGame])

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const handlePlayAgain  = useCallback(() => startGame(), [startGame])
  const handleLeaderboard = useCallback(() => navigate('/app/arcade/higherorlower?view=leaderboard'), [navigate])
  // Back button goes to arcade home, not internal landing screen
  const handleGoHome = useCallback(() => navigate('/app/arcade'), [navigate])

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

  // ── Playing + Game Over ───────────────────────────────────────────────────────
  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden"
      style={{ background:'#000' }}>

      {/* Top bar - floating over content */}
      <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-4"
        style={{ 
          height:56, 
          background:'linear-gradient(to bottom, rgba(0,0,0,0.8), transparent)',
          paddingTop:'env(safe-area-inset-top,0px)' 
        }}>
        
        <button type="button" onClick={handleGoHome}
          className="flex items-center gap-2 px-4 py-2 rounded-full font-bold text-sm active:scale-95 transition-transform"
          style={{ background:'#B8F77D', color:'#000' }}
          aria-label="Back to Home">
          <span>←</span><span>BACK</span>
        </button>

        {/* High Score */}
        {best > 0 && (
          <div className="px-3 py-1.5 rounded-full text-sm font-bold text-white"
            style={{ background:'rgba(0,0,0,0.6)', backdropFilter:'blur(10px)' }}>
            High Score: {best}
          </div>
        )}

        {/* Current Score */}
        <div className="px-4 py-2 rounded-full text-base font-black text-white"
          style={{ background:'rgba(0,0,0,0.6)', backdropFilter:'blur(10px)' }}>
          Score: {score}
        </div>
      </div>

      {/* Body - Horizontal side-by-side layout */}
      <div className="flex-1 flex items-center" style={{ height: 'calc(100vh - 56px)' }}>
        <div className="relative flex w-full h-full">

          {/* Left Card */}
          <Card item={leftItem} revealed={true} side="left" correct={false} leftItem={leftItem}/>
          
          {/* VS Divider - absolutely positioned in center */}
          <VsDivider/>
          
          {/* Right Card - with buttons overlay */}
          <div className="relative flex-1">
            <Card item={rightItem} revealed={!!reveal} side="right" correct={reveal === 'correct'} leftItem={leftItem}/>
            
            {/* Transparent buttons overlaid on bottom of right card */}
            {phase === 'playing' && !reveal && (
              <div className="absolute inset-x-0 bottom-0 z-20 px-4 pb-6">
                <div className="flex flex-col gap-2 max-w-xs mx-auto">
                  <button type="button" onClick={() => handleGuess('higher')} disabled={locked}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-full font-bold text-base active:scale-95 transition-all disabled:opacity-50"
                    style={{ 
                      background:'rgba(255,255,255,0.2)',
                      border:'2px solid rgba(255,255,255,0.6)',
                      backdropFilter:'blur(8px)',
                      color:'#fff'
                    }}>
                    <span className="text-lg">▲</span>
                    <span style={{ color:'#FFD700', fontWeight:900 }}>Higher</span>
                  </button>
                  
                  <button type="button" onClick={() => handleGuess('lower')} disabled={locked}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-full font-bold text-base active:scale-95 transition-all disabled:opacity-50"
                    style={{ 
                      background:'rgba(255,255,255,0.2)',
                      border:'2px solid rgba(255,255,255,0.6)',
                      backdropFilter:'blur(8px)',
                      color:'#fff'
                    }}>
                    <span className="text-lg">▼</span>
                    <span style={{ color:'#FFD700', fontWeight:900 }}>Lower</span>
                  </button>
                </div>
              </div>
            )}

            {/* Feedback banner */}
            {reveal && (
              <div className="absolute inset-x-0 bottom-0 z-20 px-4 pb-6">
                <div className="py-3 rounded-full text-center font-black text-lg max-w-xs mx-auto"
                  style={{
                    background: reveal === 'correct' 
                      ? 'rgba(78,240,100,0.9)' 
                      : 'rgba(255,80,80,0.9)',
                    color: '#000',
                    backdropFilter:'blur(8px)',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
                    animation:'holFadeIn 0.3s ease-out',
                  }}>
                  {reveal === 'correct' ? '✓ Correct!' : '✗ Wrong!'}
                </div>
              </div>
            )}
          </div>

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
        @keyframes holFadeIn { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
      `}</style>
    </div>
  )
}
