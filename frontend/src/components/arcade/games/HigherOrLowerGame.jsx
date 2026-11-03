import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trophy, ArrowUp, ArrowDown, ChevronRight } from 'lucide-react'

// ── Constants ─────────────────────────────────────────────────────────────────

const DATA_URL = '/data/higherOrLower.json'

// How long (ms) to show the reveal animation before moving to the next round
const REVEAL_DURATION = 1600

// ── Utilities ─────────────────────────────────────────────────────────────────

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Format a raw number into a readable display string.
 * e.g. 1_428_000_000 → "1.43B"  |  330 (M suffix) → "330M"
 */
function formatValue(value, unit, formatSuffix) {
  // If the category already stores values in millions (YouTubers, Movies)
  // the suffix drives display, not the raw magnitude.
  if (formatSuffix === 'M') {
    return `${unit}${value}${formatSuffix}`
  }
  if (formatSuffix === ' pts') {
    return `${value}${formatSuffix}`
  }
  if (formatSuffix === ' m') {
    return `${value.toLocaleString()}${formatSuffix}`
  }

  // Raw large numbers (populations)
  if (value >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(2)}B`
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`
  }
  return `${value}`
}

// ── Sub-components ────────────────────────────────────────────────────────────

/**
 * A single card — left (known) or right (mystery).
 * The right card shows "?" until revealed.
 */
function Card({ item, stat, unit, formatSuffix, revealed, side, correct }) {
  const [imgFailed, setImgFailed] = useState(false)

  // Reset imgFailed when the item changes
  useEffect(() => { setImgFailed(false) }, [item?.id])

  if (!item) return null

  const displayValue = formatValue(item.value, unit, formatSuffix)

  // Feedback ring colour
  let ringStyle = {}
  if (revealed && side === 'right') {
    ringStyle = correct
      ? { boxShadow: '0 0 0 3px #4EF0A0' }
      : { boxShadow: '0 0 0 3px #FF6B6B' }
  }

  return (
    <div
      className="relative flex flex-col items-center justify-between rounded-2xl overflow-hidden"
      style={{
        background: 'linear-gradient(160deg, #1e1b3a 0%, #141229 100%)',
        border: '1px solid rgba(255,255,255,0.08)',
        minHeight: 260,
        flex: 1,
        transition: 'box-shadow 0.3s',
        ...ringStyle,
      }}
    >
      {/* Image */}
      <div className="relative w-full" style={{ aspectRatio: '4/3', overflow: 'hidden' }}>
        {!imgFailed ? (
          <img
            src={item.image}
            alt={item.name}
            loading="lazy"
            onError={() => setImgFailed(true)}
            className="w-full h-full object-cover"
            style={{ display: 'block' }}
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center text-5xl"
            style={{ background: '#1e1b3a' }}
          >
            {item.emoji ?? '🎯'}
          </div>
        )}

        {/* Dark gradient over image bottom */}
        <div
          className="absolute inset-x-0 bottom-0"
          style={{ height: '60%', background: 'linear-gradient(to top, #141229, transparent)' }}
        />
      </div>

      {/* Name + hint */}
      <div className="relative z-10 flex flex-col items-center gap-1 px-3 pb-1 -mt-8 text-center">
        <p className="text-white font-bold text-base leading-tight">{item.name}</p>
        {item.hint && (
          <p className="text-white/50 text-xs leading-snug">{item.hint}</p>
        )}
      </div>

      {/* Stat row */}
      <div className="w-full px-3 pb-4 pt-2 flex flex-col items-center gap-0.5">
        <span className="text-white/50 text-xs uppercase tracking-widest">{stat}</span>
        {side === 'left' || revealed ? (
          <span
            className="text-2xl font-black"
            style={{
              color: revealed && side === 'right'
                ? (correct ? '#4EF0A0' : '#FF6B6B')
                : '#FFD700',
            }}
          >
            {displayValue}
          </span>
        ) : (
          <span className="text-3xl font-black text-white/30">?</span>
        )}
      </div>
    </div>
  )
}

/**
 * VS divider shown between the two cards.
 */
function VsDivider() {
  return (
    <div className="flex-shrink-0 flex items-center justify-center" style={{ width: 40 }}>
      <div
        className="flex items-center justify-center rounded-full text-xs font-black text-white"
        style={{
          width: 36, height: 36,
          background: 'linear-gradient(135deg, #6C47FF, #FF47C0)',
          boxShadow: '0 4px 12px rgba(108,71,255,0.5)',
          flexShrink: 0,
        }}
      >
        VS
      </div>
    </div>
  )
}

/**
 * Category selector shown at the start.
 */
function CategoryPicker({ categories, onPick }) {
  return (
    <div className="flex flex-col items-center gap-6 px-4 py-8 w-full max-w-sm mx-auto">
      <div className="text-center">
        <h2 className="text-2xl font-black text-white mb-1">Higher or Lower</h2>
        <p className="text-white/50 text-sm">Pick a category to start</p>
      </div>
      <div className="flex flex-col gap-3 w-full">
        {categories.map(cat => (
          <button
            key={cat.id}
            type="button"
            onClick={() => onPick(cat)}
            className="flex items-center gap-4 rounded-2xl px-5 py-4 text-left active:scale-95 transition-transform"
            style={{
              background: 'linear-gradient(135deg, #1e1b3a 0%, #141229 100%)',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            <span className="text-3xl">{cat.emoji}</span>
            <div className="flex flex-col">
              <span className="text-white font-bold text-sm">{cat.label}</span>
              <span className="text-white/40 text-xs">{cat.items.length} items • {cat.stat}</span>
            </div>
            <ChevronRight size={16} className="ml-auto text-white/30" />
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * Game over overlay — shown after a wrong answer.
 */
function GameOverOverlay({ score, best, onPlayAgain, onLeaderboard, onChangeCategory, isSubmitting, submissionResult }) {
  return (
    <div
      className="absolute inset-0 flex items-center justify-center p-4"
      style={{
        background: 'rgba(0,0,0,0.88)',
        backdropFilter: 'blur(10px)',
        animation: 'holFadeIn 0.3s ease-out',
        zIndex: 20,
      }}
    >
      <style>{`
        @keyframes holFadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes holSlideUp { from { opacity: 0; transform: translateY(24px) } to { opacity: 1; transform: translateY(0) } }
      `}</style>

      <div
        className="flex flex-col items-center gap-5 rounded-3xl px-6 py-8 w-full max-w-xs"
        style={{
          background: 'linear-gradient(160deg, #1e1b3a 0%, #0e0c1e 100%)',
          border: '1px solid rgba(255,255,255,0.1)',
          animation: 'holSlideUp 0.35s ease-out',
          boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
        }}
      >
        {/* Title */}
        <div className="text-center">
          <div className="text-4xl mb-2">😬</div>
          <h2 className="text-xl font-black text-white">Game Over</h2>
          <p className="text-white/40 text-sm mt-1">Better luck next time!</p>
        </div>

        {/* Score grid */}
        <div className="w-full grid grid-cols-2 gap-3">
          <div
            className="flex flex-col items-center gap-1 rounded-2xl py-4"
            style={{ background: 'rgba(255,255,255,0.05)' }}
          >
            <span className="text-white/50 text-xs uppercase tracking-widest">Score</span>
            <span className="text-3xl font-black text-white">{score}</span>
          </div>
          <div
            className="flex flex-col items-center gap-1 rounded-2xl py-4"
            style={{ background: 'rgba(255,255,255,0.05)' }}
          >
            <span className="text-white/50 text-xs uppercase tracking-widest">Best</span>
            <span className="text-3xl font-black" style={{ color: '#FFD700' }}>{best}</span>
          </div>
        </div>

        {/* Rank result from server */}
        {!isSubmitting && submissionResult && (
          <div
            className="w-full flex flex-col items-center gap-1 rounded-2xl py-3"
            style={{ background: 'rgba(78,240,160,0.1)', border: '1px solid rgba(78,240,160,0.2)' }}
          >
            <span className="text-xs text-white/50 uppercase tracking-widest">Your rank</span>
            <span className="text-xl font-black" style={{ color: '#4EF0A0' }}>
              #{submissionResult.rank ?? '—'}
            </span>
          </div>
        )}
        {isSubmitting && (
          <p className="text-white/30 text-xs">Saving score…</p>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-3 w-full">
          <button
            type="button"
            onClick={onPlayAgain}
            className="w-full py-3.5 rounded-2xl font-black text-sm text-black active:scale-95 transition-transform"
            style={{
              background: 'linear-gradient(180deg, #B8F77D 0%, #7BE056 100%)',
              boxShadow: '0 3px 0 rgba(0,0,0,0.3)',
            }}
          >
            ↺ Play Again
          </button>
          <button
            type="button"
            onClick={onChangeCategory}
            className="w-full py-3 rounded-2xl font-bold text-sm text-white active:scale-95 transition-transform"
            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
          >
            Change Category
          </button>
          <button
            type="button"
            onClick={onLeaderboard}
            className="w-full py-3 rounded-2xl font-bold text-sm active:scale-95 transition-transform flex items-center justify-center gap-2"
            style={{ background: 'rgba(255,215,0,0.1)', border: '1px solid rgba(255,215,0,0.25)', color: '#FFD700' }}
          >
            <Trophy size={15} />
            Leaderboard
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

/**
 * HigherOrLowerGame
 *
 * selfManaged: true — owns its own top-bar, game-over overlay, and restart logic.
 *
 * Props from GameLayout:
 *   onGameEnd(score)      — called once when the player loses
 *   onScoreUpdate(score)  — called every correct guess
 *   isActive              — flips to true when GameLayout restarts
 */
export default function HigherOrLowerGame({ onGameEnd, onScoreUpdate, isActive }) {
  const navigate = useNavigate()

  // ── Data ───────────────────────────────────────────────────────────────────
  const [categories, setCategories]     = useState([])
  const [dataError, setDataError]       = useState(null)
  const [dataLoading, setDataLoading]   = useState(true)

  // ── Game state ─────────────────────────────────────────────────────────────
  const [phase, setPhase]               = useState('pick')   // pick | playing | gameover
  const [category, setCategory]         = useState(null)
  const [deck, setDeck]                 = useState([])       // shuffled items remaining
  const [leftItem, setLeftItem]         = useState(null)
  const [rightItem, setRightItem]       = useState(null)
  const [score, setScore]               = useState(0)
  const [best, setBest]                 = useState(0)
  const [streak, setStreak]             = useState(0)

  // Reveal state: null | 'correct' | 'wrong'
  const [reveal, setReveal]             = useState(null)
  const [locked, setLocked]             = useState(false)    // prevent double-tap during reveal

  // Submission state — we fire onGameEnd for score persistence but don't await
  // a result back, so these stay false/null. Kept as state so startGame can reset them.
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submissionResult, setSubmissionResult] = useState(null)

  // Keep stable refs for callbacks (avoids stale closures)
  const onGameEndRef     = useRef(onGameEnd)
  const onScoreUpdateRef = useRef(onScoreUpdate)
  useEffect(() => { onGameEndRef.current     = onGameEnd     }, [onGameEnd])
  useEffect(() => { onScoreUpdateRef.current = onScoreUpdate }, [onScoreUpdate])

  const endCalledRef = useRef(false)

  // ── Load data once ─────────────────────────────────────────────────────────
  useEffect(() => {
    fetch(DATA_URL)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(d => {
        setCategories(d.categories ?? [])
        setDataLoading(false)
      })
      .catch(err => {
        setDataError(err.message)
        setDataLoading(false)
      })
  }, [])

  // ── Prefetch next image while current round plays ──────────────────────────
  // This is the "lazy load" trick: we only prefetch one card ahead, not all 500.
  useEffect(() => {
    if (deck.length > 0) {
      const next = deck[0]
      if (next?.image) {
        const img = new Image()
        img.src = next.image
      }
    }
  }, [deck])

  // ── Start a game with a given category ────────────────────────────────────
  const startGame = useCallback((cat) => {
    const shuffled = shuffle(cat.items)
    const [left, right, ...rest] = shuffled
    setCategory(cat)
    setDeck(rest)
    setLeftItem(left)
    setRightItem(right)
    setScore(0)
    setStreak(0)
    setReveal(null)
    setLocked(false)
    setSubmissionResult(null)
    setIsSubmitting(false)
    endCalledRef.current = false
    setPhase('playing')
    onScoreUpdateRef.current(0)
    // NOTE: best is intentionally NOT reset here — it persists across rounds
  }, [])

  // ── Handle a guess ─────────────────────────────────────────────────────────
  const handleGuess = useCallback((guess) => {
    if (locked || reveal || phase !== 'playing') return
    setLocked(true)

    // Ties count as correct for both directions — no unfair losses on equal values
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

      // After reveal animation: slide right card → left, draw next card
      setTimeout(() => {
        setReveal(null)
        setLocked(false)

        if (deck.length === 0) {
          // Ran out of items — reshuffle the category (excluding current pair)
          const reshuffled = shuffle(category.items.filter(
            i => i.id !== rightItem.id
          ))
          setDeck(reshuffled.slice(1))
          setLeftItem(rightItem)
          setRightItem(reshuffled[0])
        } else {
          const [next, ...rest] = deck
          setDeck(rest)
          setLeftItem(rightItem)
          setRightItem(next)
        }
      }, REVEAL_DURATION)

    } else {
      // Wrong — brief pause to show the wrong answer, then game over
      setTimeout(() => {
        const finalScore = score
        setBest(prev => Math.max(prev, finalScore))
        setPhase('gameover')
        if (!endCalledRef.current) {
          endCalledRef.current = true
          // GameLayout.handleGameEnd is void — it handles submission internally.
          // We just fire it; rank/personal-best display is handled by GameLayout's
          // own overlay for non-selfManaged games. Here we skip that and show our
          // own overlay, so we just call it for side-effects (score persistence).
          try { onGameEndRef.current(finalScore) } catch { /* ignore */ }
          setIsSubmitting(false)
        }
      }, REVEAL_DURATION)
    }
  }, [locked, reveal, phase, rightItem, leftItem, score, streak, deck, category])

  // ── Keyboard support ───────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'playing') return
    function onKey(e) {
      if (e.key === 'ArrowUp'   || e.key === 'h') handleGuess('higher')
      if (e.key === 'ArrowDown' || e.key === 'l') handleGuess('lower')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, handleGuess])

  // ── isActive restart (GameLayout's "Play Again" or ad-continue) ───────────
  const prevActiveRef = useRef(isActive)
  useEffect(() => {
    if (isActive && !prevActiveRef.current && category) {
      startGame(category)
    }
    prevActiveRef.current = isActive
  }, [isActive, category, startGame])

  // ── Play Again (in-component) ─────────────────────────────────────────────
  const handlePlayAgain = useCallback(() => {
    if (category) startGame(category)
  }, [category, startGame])

  const handleChangeCategory = useCallback(() => {
    setPhase('pick')
    setCategory(null)
    endCalledRef.current = false
  }, [])

  const handleLeaderboard = useCallback(() => {
    navigate('/app/arcade/higherorlower?view=leaderboard')
  }, [navigate])

  // ── Render ─────────────────────────────────────────────────────────────────

  // Loading state
  if (dataLoading) {
    return (
      <div className="absolute inset-0 flex items-center justify-center"
        style={{ background: '#0a0e1a' }}>
        <div className="flex flex-col items-center gap-3">
          <div
            className="rounded-full"
            style={{
              width: 40, height: 40,
              border: '3px solid rgba(255,255,255,0.1)',
              borderTopColor: '#6C47FF',
              animation: 'spin 0.8s linear infinite',
            }}
          />
          <p className="text-white/40 text-sm">Loading…</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  // Error state
  if (dataError) {
    return (
      <div className="absolute inset-0 flex items-center justify-center p-6"
        style={{ background: '#0a0e1a' }}>
        <div className="text-center">
          <p className="text-white/60 text-sm mb-4">Failed to load game data.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-xl text-sm font-bold text-black"
            style={{ background: '#B8F77D' }}
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      className="absolute inset-0 flex flex-col overflow-hidden"
      style={{ background: 'linear-gradient(160deg, #0d0b1e 0%, #0a0e1a 100%)' }}
    >
      {/* ── Custom top bar (selfManaged) ── */}
      <div
        className="flex-shrink-0 flex items-center gap-3 px-3"
        style={{
          height: 52,
          background: 'rgba(10,14,26,0.95)',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          paddingTop: 'env(safe-area-inset-top, 0px)',
        }}
      >
        <button
          type="button"
          onClick={() => navigate('/app/arcade')}
          className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full font-bold text-xs text-black active:scale-95 transition-transform"
          style={{
            background: 'linear-gradient(180deg, #B8F77D 0%, #7BE056 100%)',
            boxShadow: '0 2px 0 rgba(0,0,0,0.25)',
          }}
          aria-label="Back to Arcade"
        >
          <span className="text-sm">←</span>
          <span>BACK</span>
        </button>

        <h1 className="flex-1 text-center text-sm font-bold text-white truncate">
          Higher or Lower
        </h1>

        {/* Score pill */}
        <div className="flex-shrink-0 min-w-[64px] flex justify-end">
          {phase === 'playing' && score > 0 && (
            <div
              className="px-3 py-1.5 rounded-full text-xs font-bold"
              style={{
                background: 'rgba(78,240,160,0.12)',
                border: '1px solid rgba(78,240,160,0.25)',
                color: '#4EF0A0',
              }}
            >
              {score}
            </div>
          )}
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-y-auto">

        {/* Category picker */}
        {phase === 'pick' && (
          <CategoryPicker categories={categories} onPick={startGame} />
        )}

        {/* Playing / gameover */}
        {(phase === 'playing' || phase === 'gameover') && category && (
          <div className="relative flex flex-col" style={{ minHeight: '100%' }}>

            {/* Category badge + score */}
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
              <div
                className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold text-white"
                style={{ background: 'rgba(255,255,255,0.07)' }}
              >
                <span>{category.emoji}</span>
                <span>{category.label}</span>
              </div>
              <div className="flex items-center gap-3">
                {streak >= 3 && phase === 'playing' && (
                  <div
                    className="px-2.5 py-1 rounded-full text-xs font-bold"
                    style={{ background: 'rgba(255,140,0,0.15)', color: '#FF8C00', border: '1px solid rgba(255,140,0,0.3)' }}
                  >
                    🔥 {streak}
                  </div>
                )}
                <div
                  className="px-3 py-1.5 rounded-full text-sm font-black text-white"
                  style={{ background: 'rgba(255,255,255,0.07)' }}
                >
                  {score}
                </div>
              </div>
            </div>

            {/* Cards row */}
            <div className="flex items-stretch gap-0 px-3 pb-3" style={{ minHeight: 300 }}>
              {/* Left card — always revealed */}
              <Card
                item={leftItem}
                stat={category.stat}
                unit={category.unit}
                formatSuffix={category.formatSuffix}
                revealed={true}
                side="left"
              />

              <VsDivider />

              {/* Right card — mystery until revealed */}
              <Card
                item={rightItem}
                stat={category.stat}
                unit={category.unit}
                formatSuffix={category.formatSuffix}
                revealed={!!reveal}
                side="right"
                correct={reveal === 'correct'}
              />
            </div>

            {/* Feedback banner */}
            {reveal && (
              <div
                className="mx-4 mb-3 py-3 rounded-2xl text-center font-black text-sm"
                style={{
                  background: reveal === 'correct'
                    ? 'rgba(78,240,160,0.15)'
                    : 'rgba(255,107,107,0.15)',
                  border: `1px solid ${reveal === 'correct' ? 'rgba(78,240,160,0.3)' : 'rgba(255,107,107,0.3)'}`,
                  color: reveal === 'correct' ? '#4EF0A0' : '#FF6B6B',
                  animation: 'holFadeIn 0.2s ease-out',
                }}
              >
                {reveal === 'correct' ? '✓ Correct!' : '✗ Wrong!'}
              </div>
            )}

            {/* Guess buttons */}
            {phase === 'playing' && !reveal && (
              <div className="flex gap-3 px-4 pb-5">
                <button
                  type="button"
                  onClick={() => handleGuess('higher')}
                  disabled={locked}
                  className="flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl font-black text-sm active:scale-95 transition-transform disabled:opacity-50"
                  style={{
                    background: 'linear-gradient(135deg, #4EF0A0 0%, #2BC87A 100%)',
                    color: '#000',
                    boxShadow: '0 4px 0 rgba(0,0,0,0.3), 0 8px 20px rgba(78,240,160,0.3)',
                  }}
                >
                  <ArrowUp size={18} strokeWidth={3} />
                  Higher
                </button>
                <button
                  type="button"
                  onClick={() => handleGuess('lower')}
                  disabled={locked}
                  className="flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl font-black text-sm active:scale-95 transition-transform disabled:opacity-50"
                  style={{
                    background: 'linear-gradient(135deg, #FF6B6B 0%, #E04444 100%)',
                    color: '#fff',
                    boxShadow: '0 4px 0 rgba(0,0,0,0.3), 0 8px 20px rgba(255,107,107,0.3)',
                  }}
                >
                  <ArrowDown size={18} strokeWidth={3} />
                  Lower
                </button>
              </div>
            )}

            {/* Keyboard hint */}
            {phase === 'playing' && !reveal && (
              <p className="text-center text-white/20 text-xs pb-4">
                ↑ / ↓ keys also work
              </p>
            )}

            {/* Game over overlay */}
            {phase === 'gameover' && (
              <GameOverOverlay
                score={score}
                best={best}
                onPlayAgain={handlePlayAgain}
                onLeaderboard={handleLeaderboard}
                onChangeCategory={handleChangeCategory}
                isSubmitting={isSubmitting}
                submissionResult={submissionResult}
              />
            )}
          </div>
        )}
      </div>

      {/* Credits */}
      <div
        className="flex-shrink-0 text-center py-1.5"
        style={{
          background: 'rgba(0,0,0,0.3)',
          fontSize: 10,
          color: 'rgba(255,255,255,0.2)',
          paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 6px)',
        }}
      >
        Images: Wikimedia CC · flagcdn.com · PokeAPI · TMDB
      </div>

      <style>{`
        @keyframes holFadeIn { from { opacity: 0 } to { opacity: 1 } }
      `}</style>
    </div>
  )
}
