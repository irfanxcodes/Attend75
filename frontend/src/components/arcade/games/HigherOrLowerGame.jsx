import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trophy } from 'lucide-react'

// ── Constants ──────────────────────────────────────────────────────────────────
const DATA_URL = '/data/higherOrLower.json'
const REVEAL_DURATION = 1800   // ms — time the answer is shown before next card

// ── Utilities ──────────────────────────────────────────────────────────────────
function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function getCategoryPool(categories) {
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

// ── Witty messages (like the real game) ───────────────────────────────────────
function getScoreMessage(score) {
  if (score === 0)  return "You didn't even get one? Come on, give it another shot."
  if (score === 1)  return "Did we make it too hard for you? The average score is 3.2. We're pretty embarrassed for you right now."
  if (score <= 3)   return "The average score is 3.2 so you're about average. Can you do better?"
  if (score <= 6)   return "Not bad! The average score is 3.2 so you're doing better than most. Keep it up!"
  if (score <= 9)   return "Excellent! The average score is 3.2 so you're pretty good! We're impressed — that's a score worth sharing."
  if (score <= 14)  return `Wow, ${score}?! You're in a league of your own. The average is just 3.2. Incredible.`
  return `${score}?! Are you even human? The average is 3.2. We're speechless.`
}

// ── Count-up hook ─────────────────────────────────────────────────────────────
function useCountUp(target, duration = 1200, active = false) {
  const [display, setDisplay] = useState(0)
  const rafRef = useRef(null)
  useEffect(() => {
    if (!active) { setDisplay(0); return }
    const start = performance.now()
    const step = (now) => {
      const t = Math.min((now - start) / duration, 1)
      // ease-out cubic
      const ease = 1 - Math.pow(1 - t, 3)
      setDisplay(Math.round(ease * target))
      if (t < 1) rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafRef.current)
  }, [target, duration, active])
  return display
}

// ── Global CSS injected once ──────────────────────────────────────────────────
const GLOBAL_CSS = `
  @keyframes hol-fadeIn    { from{opacity:0}                                   to{opacity:1} }
  @keyframes hol-slideUp   { from{opacity:0;transform:translateY(32px)}         to{opacity:1;transform:translateY(0)} }
  @keyframes hol-slideDown { from{opacity:0;transform:translateY(-32px)}        to{opacity:1;transform:translateY(0)} }
  @keyframes hol-popIn     { from{opacity:0;transform:scale(0.6)}              to{opacity:1;transform:scale(1)} }
  @keyframes hol-popBounce { 0%{transform:scale(0)}40%{transform:scale(1.18)}70%{transform:scale(0.92)}100%{transform:scale(1)} }
  @keyframes hol-flashGreen{ 0%{background:rgba(78,240,100,0)}30%{background:rgba(78,240,100,0.38)}100%{background:rgba(78,240,100,0)} }
  @keyframes hol-flashRed  { 0%{background:rgba(255,80,80,0)}30%{background:rgba(255,80,80,0.38)}100%{background:rgba(255,80,80,0)} }
  @keyframes hol-vsFloat   { 0%,100%{transform:translate(-50%,-50%) scale(1)} 50%{transform:translate(-50%,-50%) scale(1.08)} }
  @keyframes hol-cardIn    { from{opacity:0;transform:translateY(44px) scale(0.97)} to{opacity:1;transform:translateY(0) scale(1)} }
  @keyframes hol-shake     { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-8px)} 40%{transform:translateX(8px)} 60%{transform:translateX(-6px)} 80%{transform:translateX(6px)} }
  @keyframes hol-spin      { to{transform:rotate(360deg)} }
  @keyframes hol-scoreIn   { 0%{opacity:0;transform:scale(0.4) translateY(20px)} 60%{transform:scale(1.12) translateY(-6px)} 100%{opacity:1;transform:scale(1) translateY(0)} }
  @keyframes hol-glowPulse { 0%,100%{text-shadow:0 0 20px rgba(255,215,0,0.4)} 50%{text-shadow:0 0 48px rgba(255,215,0,0.9),0 0 80px rgba(255,215,0,0.4)} }
  @keyframes hol-btnIn     { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
  @keyframes hol-newBest   { 0%{transform:scale(0) rotate(-12deg)}60%{transform:scale(1.15) rotate(3deg)}100%{transform:scale(1) rotate(0deg)} }
  @keyframes hol-barFill   { from{width:0} to{width:var(--bar-w)} }
`

// ── Top card ──────────────────────────────────────────────────────────────────
function TopCard({ item, animKey }) {
  const [imgFailed, setImgFailed] = useState(false)
  useEffect(() => { setImgFailed(false) }, [item?.id])
  if (!item) return null
  const displayValue = formatValue(item.value, item.unit, item.formatSuffix)

  return (
    <div key={animKey} className="absolute inset-0" style={{ background: '#111', animation: 'hol-slideDown 0.5s cubic-bezier(0.22,1,0.36,1) both' }}>
      {!imgFailed ? (
        <>
          <img src={item.image} alt={item.name} loading="lazy" onError={() => setImgFailed(true)}
            className="w-full h-full object-cover" />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom,rgba(0,0,0,0.2),rgba(0,0,0,0.6))' }} />
        </>
      ) : (
        <div className="w-full h-full flex items-center justify-center text-5xl" style={{ background: '#1a1a1a' }}>🎯</div>
      )}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
        <h2 className="text-2xl font-bold text-white leading-tight mb-1" style={{ textShadow: '0 2px 10px rgba(0,0,0,0.9)', animation: 'hol-slideDown 0.5s 0.05s both' }}>
          "{item.name}"
        </h2>
        <p className="text-white/80 text-sm mb-1" style={{ textShadow: '0 2px 6px rgba(0,0,0,0.9)' }}>has</p>
        <p className="text-4xl font-black leading-none mb-1"
          style={{ color: '#FFD700', textShadow: '0 2px 12px rgba(0,0,0,0.9)', animation: 'hol-popIn 0.4s 0.1s cubic-bezier(0.34,1.56,0.64,1) both' }}>
          {displayValue}
        </p>
        <p className="text-white/80 text-sm" style={{ textShadow: '0 2px 6px rgba(0,0,0,0.9)' }}>{item.stat}</p>
        {item.hint && (
          <p className="text-white/55 text-xs mt-1 max-w-[220px]" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.9)' }}>{item.hint}</p>
        )}
      </div>
      {item.imageCredit && (
        <span className="absolute bottom-2 right-3 text-white/35 text-[10px]">Image: {item.imageCredit}</span>
      )}
    </div>
  )
}

// ── Bottom card ───────────────────────────────────────────────────────────────
function BottomCard({ item, leftItem, revealed, correct, phase, locked, onGuess, animKey }) {
  const [imgFailed, setImgFailed] = useState(false)
  useEffect(() => { setImgFailed(false) }, [item?.id])
  if (!item) return null
  const displayValue = formatValue(item.value, item.unit, item.formatSuffix)

  return (
    <div key={animKey} className="absolute inset-0" style={{ background: '#111', animation: 'hol-cardIn 0.55s cubic-bezier(0.22,1,0.36,1) both' }}>
      {!imgFailed ? (
        <>
          <img src={item.image} alt={item.name} loading="lazy" onError={() => setImgFailed(true)}
            className="w-full h-full object-cover"
            style={{ filter: revealed ? 'none' : 'grayscale(55%)', transition: 'filter 0.5s ease' }} />
          <div className="absolute inset-0"
            style={{ background: 'linear-gradient(to bottom,rgba(0,0,0,0.25),rgba(0,0,0,0.65))' }} />
        </>
      ) : (
        <div className="w-full h-full flex items-center justify-center text-5xl" style={{ background: '#1a1a1a' }}>🎯</div>
      )}

      {/* Correct / wrong full-card flash */}
      {revealed && (
        <div className="absolute inset-0 pointer-events-none"
          style={{ animation: `${correct ? 'hol-flashGreen' : 'hol-flashRed'} 0.6s ease-out both` }} />
      )}

      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
        <h2 className="text-2xl font-bold text-white leading-tight mb-1"
          style={{ textShadow: '0 2px 10px rgba(0,0,0,0.9)', animation: 'hol-cardIn 0.55s 0.04s both' }}>
          "{item.name}"
        </h2>
        <p className="text-white/80 text-sm mb-2" style={{ textShadow: '0 2px 6px rgba(0,0,0,0.9)' }}>has</p>

        {revealed ? (
          <div style={{ animation: 'hol-popBounce 0.55s cubic-bezier(0.34,1.56,0.64,1) both' }}>
            <p className="text-4xl font-black leading-none mb-1"
              style={{ color: correct ? '#4EF064' : '#FF5050', textShadow: '0 2px 16px rgba(0,0,0,0.9)' }}>
              {displayValue}
            </p>
            <p className="text-white/85 text-sm" style={{ textShadow: '0 2px 6px rgba(0,0,0,0.9)' }}>{item.stat}</p>
          </div>
        ) : (
          <div style={{ animation: 'hol-slideUp 0.4s 0.15s both' }}>
            {phase === 'playing' && (
              <div className="flex flex-col gap-3 w-full" style={{ minWidth: 200 }}>
                <button type="button" onClick={() => onGuess('higher')} disabled={locked}
                  className="flex items-center justify-between px-6 py-3 rounded-full font-black text-base active:scale-95 transition-all disabled:opacity-40"
                  style={{ background: 'rgba(0,0,0,0.6)', border: '2px solid rgba(255,255,255,0.75)', backdropFilter: 'blur(8px)' }}>
                  <span style={{ color: '#FFD700' }}>Higher</span>
                  <span className="text-white text-lg ml-3">▲</span>
                </button>
                <button type="button" onClick={() => onGuess('lower')} disabled={locked}
                  className="flex items-center justify-between px-6 py-3 rounded-full font-black text-base active:scale-95 transition-all disabled:opacity-40"
                  style={{ background: 'rgba(0,0,0,0.6)', border: '2px solid rgba(255,255,255,0.75)', backdropFilter: 'blur(8px)' }}>
                  <span style={{ color: '#FFD700' }}>Lower</span>
                  <span className="text-white text-lg ml-3">▼</span>
                </button>
              </div>
            )}
            <p className="text-white/75 text-sm mt-3" style={{ textShadow: '0 2px 6px rgba(0,0,0,0.9)' }}>
              searches than {leftItem?.name || 'previous'}
            </p>
          </div>
        )}
      </div>

      {item.imageCredit && (
        <span className="absolute bottom-2 right-3 text-white/35 text-[10px]">Image: {item.imageCredit}</span>
      )}
    </div>
  )
}

// ── VS badge ──────────────────────────────────────────────────────────────────
function VsDivider({ pulse }) {
  return (
    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-30 pointer-events-none"
      style={{ animation: pulse ? 'hol-popBounce 0.45s cubic-bezier(0.34,1.56,0.64,1) both' : 'hol-vsFloat 3s ease-in-out infinite' }}>
      <div className="flex items-center justify-center rounded-full text-sm font-black text-black"
        style={{ width: 46, height: 46, background: '#fff', boxShadow: '0 4px 20px rgba(0,0,0,0.65)' }}>
        VS
      </div>
    </div>
  )
}

// ── Game Over screen ──────────────────────────────────────────────────────────
function GameOverOverlay({ score, best, onPlayAgain, onLeaderboard, onBack }) {
  const isNewBest = score > 0 && score >= best
  const message   = getScoreMessage(score)
  const displayed = useCountUp(score, 1000, true)

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center px-6 overflow-y-auto"
      style={{
        background: 'rgba(0,0,0,0.78)',
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
        zIndex: 20,
        animation: 'hol-fadeIn 0.4s ease-out both',
      }}>

      {/* "You scored:" label */}
      <p className="text-white font-bold text-lg tracking-wide mb-1"
        style={{ animation: 'hol-slideDown 0.5s 0.05s both' }}>
        You scored:
      </p>

      {/* Big score number — counts up */}
      <div style={{ animation: 'hol-scoreIn 0.6s 0.15s cubic-bezier(0.34,1.56,0.64,1) both' }}>
        <p className="font-black"
          style={{
            fontSize: 108,
            lineHeight: 1,
            color: '#FFD700',
            animation: 'hol-glowPulse 2s 0.75s ease-in-out infinite',
          }}>
          {displayed}
        </p>
      </div>

      {/* New best badge */}
      {isNewBest && (
        <div className="mt-2 px-4 py-1 rounded-full text-xs font-black tracking-widest uppercase"
          style={{
            background: 'rgba(255,215,0,0.18)',
            border: '1px solid rgba(255,215,0,0.6)',
            color: '#FFD700',
            animation: 'hol-newBest 0.6s 0.7s cubic-bezier(0.34,1.56,0.64,1) both',
          }}>
          🏆 New Best!
        </div>
      )}

      {/* Witty message */}
      <p className="text-white text-center text-sm leading-relaxed mt-5 max-w-[280px]"
        style={{ animation: 'hol-slideUp 0.5s 0.3s ease-out both' }}>
        {message}
      </p>

      {/* Score bar vs best */}
      {best > 0 && !isNewBest && (
        <div className="w-full max-w-xs mt-4" style={{ animation: 'hol-slideUp 0.5s 0.35s ease-out both' }}>
          <div className="flex justify-between text-xs text-white/40 mb-1">
            <span>This game</span>
            <span>Your best: {best}</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
            <div className="h-full rounded-full"
              style={{
                width: `${Math.min(100, (score / best) * 100)}%`,
                background: 'linear-gradient(90deg,#4EF064,#FFD700)',
                transition: 'width 1s 0.5s ease-out',
              }} />
          </div>
        </div>
      )}

      {/* Buttons */}
      <div className="flex flex-col gap-3 w-full max-w-xs mt-7">
        <button type="button" onClick={onPlayAgain}
          className="w-full py-4 rounded-full font-black text-base text-black active:scale-95 transition-transform"
          style={{
            background: 'linear-gradient(180deg,#B8F77D 0%,#7BE056 100%)',
            boxShadow: '0 4px 0 #3a7a1a, 0 8px 24px rgba(123,224,86,0.4)',
            animation: 'hol-btnIn 0.45s 0.42s ease-out both',
          }}>
          ↺  Play Again
        </button>

        <button type="button" onClick={onBack}
          className="w-full py-3.5 rounded-full font-bold text-base text-white active:scale-95 transition-transform"
          style={{
            background: 'transparent',
            border: '2px solid rgba(255,255,255,0.28)',
            animation: 'hol-btnIn 0.45s 0.5s ease-out both',
          }}>
          Back to menu
        </button>

        <button type="button" onClick={onLeaderboard}
          className="w-full py-3.5 rounded-full font-bold text-base active:scale-95 transition-transform flex items-center justify-center gap-2"
          style={{
            background: 'transparent',
            border: '2px solid rgba(255,215,0,0.38)',
            color: '#FFD700',
            animation: 'hol-btnIn 0.45s 0.58s ease-out both',
          }}>
          <Trophy size={16} />
          Leaderboard
        </button>
      </div>

      <div style={{ height: 24 }} />
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function HigherOrLowerGame({ onGameEnd, onScoreUpdate, isActive }) {
  const navigate = useNavigate()

  const [categories,   setCategories]   = useState([])
  const [dataError,    setDataError]    = useState(null)
  const [dataLoading,  setDataLoading]  = useState(true)

  const [phase,      setPhase]      = useState('home')
  const [deck,       setDeck]       = useState([])
  const [leftItem,   setLeftItem]   = useState(null)
  const [rightItem,  setRightItem]  = useState(null)
  const [score,      setScore]      = useState(0)
  const [best,       setBest]       = useState(0)
  const [streak,     setStreak]     = useState(0)
  const [reveal,     setReveal]     = useState(null)   // null | 'correct' | 'wrong'
  const [locked,     setLocked]     = useState(false)

  // animKey increments each round to re-trigger card entrance animations
  const [animKey, setAnimKey] = useState(0)
  // vsPulse triggers a VS badge bounce on each guess
  const [vsPulse, setVsPulse] = useState(false)

  const onGameEndRef     = useRef(onGameEnd)
  const onScoreUpdateRef = useRef(onScoreUpdate)
  useEffect(() => { onGameEndRef.current     = onGameEnd     }, [onGameEnd])
  useEffect(() => { onScoreUpdateRef.current = onScoreUpdate }, [onScoreUpdate])
  const endCalledRef = useRef(false)

  // Load data
  useEffect(() => {
    fetch(DATA_URL)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(d => { setCategories(getCategoryPool(d.categories ?? [])); setDataLoading(false) })
      .catch(err => { setDataError(err.message); setDataLoading(false) })
  }, [])

  // Prefetch next image
  useEffect(() => {
    if (deck.length > 0 && deck[0]?.image) { const i = new Image(); i.src = deck[0].image }
  }, [deck])

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
    setAnimKey(k => k + 1)
    endCalledRef.current = false
    setPhase('playing')
    onScoreUpdateRef.current(0)
  }, [categories])

  const handleGuess = useCallback((guess) => {
    if (locked || reveal || phase !== 'playing') return
    setLocked(true)

    // VS badge bounce on each guess
    setVsPulse(true)
    setTimeout(() => setVsPulse(false), 500)

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
        setAnimKey(k => k + 1)

        if (deck.length === 0) {
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

  // Keyboard
  useEffect(() => {
    if (phase !== 'playing') return
    const onKey = (e) => {
      if (e.key === 'ArrowUp'   || e.key === 'h') handleGuess('higher')
      if (e.key === 'ArrowDown' || e.key === 'l') handleGuess('lower')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, handleGuess])

  // Auto-start once data loads
  const hasStartedRef = useRef(false)
  useEffect(() => {
    if (categories.length > 0 && phase === 'home' && !hasStartedRef.current) {
      hasStartedRef.current = true
      startGame()
    }
  }, [categories, phase, startGame])

  const handlePlayAgain   = useCallback(() => { hasStartedRef.current = false; startGame() }, [startGame])
  const handleLeaderboard = useCallback(() => navigate('/app/arcade/higherorlower?view=leaderboard'), [navigate])
  const handleGoHome      = useCallback(() => navigate('/app/arcade'), [navigate])

  if (dataLoading) {
    return (
      <div className="absolute inset-0 flex items-center justify-center" style={{ background: '#0a0e1a' }}>
        <div className="flex flex-col items-center gap-3">
          <div style={{ width:40, height:40, borderRadius:'50%', border:'3px solid rgba(255,255,255,0.1)', borderTopColor:'#FFD700', animation:'hol-spin 0.8s linear infinite' }} />
          <p className="text-white/40 text-sm">Loading…</p>
        </div>
        <style>{GLOBAL_CSS}</style>
      </div>
    )
  }

  if (dataError) {
    return (
      <div className="absolute inset-0 flex items-center justify-center p-6" style={{ background: '#0a0e1a' }}>
        <div className="text-center">
          <p className="text-white/60 text-sm mb-4">Failed to load game data.</p>
          <button type="button" onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-xl text-sm font-bold text-black"
            style={{ background: '#B8F77D' }}>Retry</button>
        </div>
        <style>{GLOBAL_CSS}</style>
      </div>
    )
  }

  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden" style={{ background: '#000' }}>
      <style>{GLOBAL_CSS}</style>

      {/* Score bar */}
      <div className="flex-shrink-0 flex items-center justify-between px-4"
        style={{ height: 44, background: 'rgba(0,0,0,0.88)', paddingTop: 'env(safe-area-inset-top,0px)', zIndex: 30 }}>
        <span className="text-white font-bold text-sm" style={{ animation: 'hol-slideDown 0.4s both' }}>
          High Score: {best}
        </span>
        <span key={score} className="text-white font-bold text-sm"
          style={{ animation: score > 0 ? 'hol-popBounce 0.4s cubic-bezier(0.34,1.56,0.64,1) both' : undefined }}>
          Score: {score}
        </span>
      </div>

      {/* Stacked cards */}
      <div className="relative flex flex-col flex-1 min-h-0">

        <div className="relative flex-1 min-h-0">
          <TopCard item={leftItem} animKey={animKey} />
        </div>

        <VsDivider pulse={vsPulse} />

        <div className="relative flex-1 min-h-0">
          <BottomCard
            item={rightItem}
            leftItem={leftItem}
            revealed={!!reveal}
            correct={reveal === 'correct'}
            phase={phase}
            locked={locked}
            onGuess={handleGuess}
            animKey={animKey}
          />
        </div>

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
    </div>
  )
}
