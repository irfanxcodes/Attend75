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

// ── Top card (left item — always fully revealed) ───────────────────────────────

function TopCard({ item }) {
  const [imgFailed, setImgFailed] = useState(false)
  useEffect(() => { setImgFailed(false) }, [item?.id])
  if (!item) return null

  const displayValue = formatValue(item.value, item.unit, item.formatSuffix)

  return (
    <div className="absolute inset-0" style={{ background: '#111' }}>
      {/* Background image */}
      {!imgFailed ? (
        <>
          <img src={item.image} alt={item.name} loading="lazy"
            onError={() => setImgFailed(true)}
            className="w-full h-full object-cover" />
          <div className="absolute inset-0"
            style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.25), rgba(0,0,0,0.55))' }} />
        </>
      ) : (
        <div className="w-full h-full flex items-center justify-center text-5xl"
          style={{ background: '#1a1a1a' }}>🎯</div>
      )}

      {/* Text content — vertically centred */}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
        <h2 className="text-2xl font-bold text-white leading-tight mb-1"
          style={{ textShadow: '0 2px 10px rgba(0,0,0,0.9)' }}>
          "{item.name}"
        </h2>
        <p className="text-white text-sm mb-1" style={{ textShadow: '0 2px 6px rgba(0,0,0,0.9)' }}>has</p>
        <p className="text-4xl font-black leading-none mb-1"
          style={{ color: '#FFD700', textShadow: '0 2px 12px rgba(0,0,0,0.9)' }}>
          {displayValue}
        </p>
        <p className="text-white/90 text-sm" style={{ textShadow: '0 2px 6px rgba(0,0,0,0.9)' }}>
          {item.stat}
        </p>
        {item.hint && (
          <p className="text-white/60 text-xs mt-1 max-w-[220px]"
            style={{ textShadow: '0 2px 4px rgba(0,0,0,0.9)' }}>
            {item.hint}
          </p>
        )}
      </div>

      {/* Image credit */}
      {item.imageCredit && (
        <span className="absolute bottom-2 right-3 text-white/40 text-[10px]">
          Image: {item.imageCredit}
        </span>
      )}
    </div>
  )
}

// ── Bottom card (right item — hidden until reveal) ─────────────────────────────

function BottomCard({ item, leftItem, revealed, correct, phase, locked, onGuess }) {
  const [imgFailed, setImgFailed] = useState(false)
  useEffect(() => { setImgFailed(false) }, [item?.id])
  if (!item) return null

  const displayValue = formatValue(item.value, item.unit, item.formatSuffix)

  return (
    <div className="absolute inset-0" style={{ background: '#111' }}>
      {/* Background image — desaturated until revealed */}
      {!imgFailed ? (
        <>
          <img src={item.image} alt={item.name} loading="lazy"
            onError={() => setImgFailed(true)}
            className="w-full h-full object-cover"
            style={{ filter: revealed ? 'none' : 'grayscale(60%)' }} />
          <div className="absolute inset-0"
            style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.3), rgba(0,0,0,0.6))' }} />
        </>
      ) : (
        <div className="w-full h-full flex items-center justify-center text-5xl"
          style={{ background: '#1a1a1a' }}>🎯</div>
      )}

      {/* Text content — vertically centred */}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
        <h2 className="text-2xl font-bold text-white leading-tight mb-1"
          style={{ textShadow: '0 2px 10px rgba(0,0,0,0.9)' }}>
          "{item.name}"
        </h2>
        <p className="text-white text-sm mb-2" style={{ textShadow: '0 2px 6px rgba(0,0,0,0.9)' }}>has</p>

        {revealed ? (
          <>
            <p className="text-4xl font-black leading-none mb-1"
              style={{
                color: correct ? '#4EF064' : '#FF5050',
                textShadow: '0 2px 12px rgba(0,0,0,0.9)',
              }}>
              {displayValue}
            </p>
            <p className="text-white/90 text-sm" style={{ textShadow: '0 2px 6px rgba(0,0,0,0.9)' }}>
              {item.stat}
            </p>
          </>
        ) : (
          <>
            {/* Buttons — shown before reveal */}
            {phase === 'playing' && (
              <div className="flex flex-col gap-3 w-full max-w-[200px]">
                <button type="button" onClick={() => onGuess('higher')} disabled={locked}
                  className="flex items-center justify-between px-5 py-3 rounded-full font-black text-base active:scale-95 transition-all disabled:opacity-50"
                  style={{
                    background: 'rgba(0,0,0,0.55)',
                    border: '2px solid rgba(255,255,255,0.7)',
                    backdropFilter: 'blur(6px)',
                  }}>
                  <span style={{ color: '#FFD700' }}>Higher</span>
                  <span className="text-white text-lg">▲</span>
                </button>
                <button type="button" onClick={() => onGuess('lower')} disabled={locked}
                  className="flex items-center justify-between px-5 py-3 rounded-full font-black text-base active:scale-95 transition-all disabled:opacity-50"
                  style={{
                    background: 'rgba(0,0,0,0.55)',
                    border: '2px solid rgba(255,255,255,0.7)',
                    backdropFilter: 'blur(6px)',
                  }}>
                  <span style={{ color: '#FFD700' }}>Lower</span>
                  <span className="text-white text-lg">▼</span>
                </button>
              </div>
            )}
            {/* Comparison label below buttons */}
            <p className="text-white/80 text-sm mt-3" style={{ textShadow: '0 2px 6px rgba(0,0,0,0.9)' }}>
              searches than {leftItem?.name || 'previous'}
            </p>
          </>
        )}
      </div>

      {/* Image credit */}
      {item.imageCredit && (
        <span className="absolute bottom-2 right-3 text-white/40 text-[10px]">
          Image: {item.imageCredit}
        </span>
      )}
    </div>
  )
}

// ── VS divider ─────────────────────────────────────────────────────────────────

function VsDivider() {
  return (
    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-30 pointer-events-none">
      <div className="flex items-center justify-center rounded-full text-sm font-black text-black"
        style={{
          width: 44, height: 44,
          background: '#fff',
          boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
        }}>VS</div>
    </div>
  )
}

// ── Witty score messages ───────────────────────────────────────────────────────

function getScoreMessage(score) {
  if (score === 0) return "You didn't even get one? Come on, give it another shot."
  if (score <= 2)  return "Did we make it too hard for you? The average score is 3.2. We're pretty embarrassed for you right now."
  if (score <= 5)  return `Not bad! The average score is 3.2 so you're doing alright. Keep going!`
  if (score <= 9)  return `Excellent! The average score is 3.2 so you're pretty good! We're impressed — that's a score worth sharing.`
  return `Wow, ${score}?! You're in a league of your own. The average is just 3.2. Incredible.`
}

// ── Game Over full-screen ──────────────────────────────────────────────────────

function GameOverOverlay({ score, best, onPlayAgain, onLeaderboard, onBack }) {
  const isNewBest = score > 0 && score >= best
  const message   = getScoreMessage(score)

  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center px-6"
      style={{
        background: 'rgba(0,0,0,0.82)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        zIndex: 20,
        animation: 'holFadeIn 0.35s ease-out',
      }}
    >
      <style>{`
        @keyframes holFadeIn   { from { opacity:0 }                          to { opacity:1 } }
        @keyframes holPopIn    { from { opacity:0; transform:scale(0.7) }    to { opacity:1; transform:scale(1) } }
        @keyframes holSlideUp  { from { opacity:0; transform:translateY(28px) } to { opacity:1; transform:translateY(0) } }
      `}</style>

      {/* Score block */}
      <div className="flex flex-col items-center text-center"
        style={{ animation: 'holPopIn 0.4s cubic-bezier(0.34,1.56,0.64,1) both' }}>
        <p className="text-white font-bold text-lg tracking-wide mb-1">You scored:</p>
        <p className="font-black leading-none"
          style={{
            fontSize: 96,
            color: '#FFD700',
            textShadow: '0 4px 32px rgba(255,215,0,0.4)',
            lineHeight: 1,
          }}>
          {score}
        </p>
        {isNewBest && (
          <span className="mt-2 px-4 py-1 rounded-full text-xs font-black tracking-widest uppercase"
            style={{ background: 'rgba(255,215,0,0.2)', border: '1px solid rgba(255,215,0,0.5)', color: '#FFD700' }}>
            🏆 New Best!
          </span>
        )}
      </div>

      {/* Message */}
      <p className="text-white text-center text-sm leading-relaxed mt-6 max-w-xs"
        style={{ animation: 'holSlideUp 0.4s 0.1s ease-out both' }}>
        {message}
      </p>

      {/* Buttons */}
      <div className="flex flex-col gap-3 w-full max-w-xs mt-8"
        style={{ animation: 'holSlideUp 0.4s 0.18s ease-out both' }}>

        {/* Play Again */}
        <button type="button" onClick={onPlayAgain}
          className="w-full py-4 rounded-full font-black text-base text-black active:scale-95 transition-transform"
          style={{
            background: 'linear-gradient(180deg,#B8F77D 0%,#7BE056 100%)',
            boxShadow: '0 4px 0 #3a7a1a, 0 6px 20px rgba(123,224,86,0.35)',
          }}>
          ↺ Play Again
        </button>

        {/* Back to menu */}
        <button type="button" onClick={onBack}
          className="w-full py-3.5 rounded-full font-bold text-base text-white active:scale-95 transition-transform"
          style={{
            background: 'transparent',
            border: '2px solid rgba(255,255,255,0.3)',
          }}>
          Back to menu
        </button>

        {/* Leaderboard */}
        <button type="button" onClick={onLeaderboard}
          className="w-full py-3.5 rounded-full font-bold text-base active:scale-95 transition-transform flex items-center justify-center gap-2"
          style={{
            background: 'transparent',
            border: '2px solid rgba(255,215,0,0.4)',
            color: '#FFD700',
          }}>
          <Trophy size={16} />
          Leaderboard
        </button>
      </div>

      {/* Best score footnote */}
      {best > 0 && (
        <p className="mt-5 text-white/35 text-xs"
          style={{ animation: 'holSlideUp 0.4s 0.25s ease-out both' }}>
          Your best: {best}
        </p>
      )}
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

      {/* Score bar — always visible at top */}
      <div className="flex-shrink-0 flex items-center justify-between px-4"
        style={{
          height: 44,
          background: 'rgba(0,0,0,0.85)',
          paddingTop: 'env(safe-area-inset-top,0px)',
          zIndex: 30,
        }}>
        <span className="text-white font-bold text-sm">High Score: {best}</span>
        <span className="text-white font-bold text-sm">Score: {score}</span>
      </div>

      {/* Stacked cards — each takes exactly half the remaining height */}
      <div className="relative flex flex-col flex-1 min-h-0">

        {/* TOP card — left item, always revealed */}
        <div className="relative flex-1 min-h-0">
          <TopCard item={leftItem} />
        </div>

        {/* VS badge — centred on the seam */}
        <VsDivider />

        {/* BOTTOM card — right item */}
        <div className="relative flex-1 min-h-0">
          <BottomCard
            item={rightItem}
            leftItem={leftItem}
            revealed={!!reveal}
            correct={reveal === 'correct'}
            phase={phase}
            locked={locked}
            onGuess={handleGuess}
          />
        </div>

        {/* Game over overlay */}
        {phase === 'gameover' && (
          <GameOverOverlay
            score={score}
            best={best}
            onPlayAgain={handlePlayAgain}
            onLeaderboard={handleLeaderboard}
            onBack={handleGoHome}
          />
        )}
      </div>

      <style>{`
        @keyframes holFadeIn  { from{opacity:0} to{opacity:1} }
        @keyframes holSlideUp { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
      `}</style>
    </div>
  )
}
