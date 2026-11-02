import { Suspense, useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import gameRegistry from '../components/arcade/gameRegistry'
import GameLayout from '../components/arcade/GameLayout'
import Leaderboard from '../components/arcade/Leaderboard'
import useAppStore from '../hooks/useAppStore'

// ── Countdown loader shown while the game chunk is lazy-loading ──────────────
function CountdownLoader({ gameTitle }) {
  const [count, setCount] = useState(3)

  useEffect(() => {
    if (count <= 0) return
    const t = setTimeout(() => setCount(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [count])

  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center"
      style={{ background: '#0a0e1a' }}
    >
      {/* Game title */}
      <p className="text-white/40 text-sm font-semibold tracking-widest uppercase mb-8">
        {gameTitle}
      </p>

      {/* Countdown number */}
      {count > 0 ? (
        <div
          key={count}
          className="flex items-center justify-center rounded-full text-white font-black"
          style={{
            width: 120, height: 120,
            fontSize: 72,
            background: 'rgba(255,255,255,0.06)',
            border: '3px solid rgba(255,255,255,0.15)',
            boxShadow: '0 0 60px rgba(78,240,160,0.15)',
            animation: 'cd-pop 0.35s cubic-bezier(0.34,1.56,0.64,1)',
          }}
        >
          {count}
        </div>
      ) : (
        <div
          className="flex items-center justify-center rounded-full font-black text-[#4EF0A0]"
          style={{
            width: 120, height: 120,
            fontSize: 22,
            background: 'rgba(78,240,160,0.1)',
            border: '3px solid rgba(78,240,160,0.35)',
            boxShadow: '0 0 60px rgba(78,240,160,0.25)',
            animation: 'cd-pop 0.35s cubic-bezier(0.34,1.56,0.64,1)',
            letterSpacing: '0.05em',
          }}
        >
          GO!
        </div>
      )}

      {/* Loading bar */}
      <div className="mt-10 w-40 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
        <div
          className="h-full rounded-full"
          style={{
            background: 'linear-gradient(90deg, #4EF0A0, #7BE056)',
            width: count === 3 ? '20%' : count === 2 ? '55%' : count === 1 ? '85%' : '100%',
            transition: 'width 0.9s ease',
          }}
        />
      </div>
      <p className="text-white/25 text-xs mt-3">Loading…</p>

      {/* Animation keyframes */}
      <style>{`
        @keyframes cd-pop {
          0%   { transform: scale(0.5); opacity: 0; }
          100% { transform: scale(1);   opacity: 1; }
        }
      `}</style>
    </div>
  )
}

/**
 * ArcadeGamePage — resolves a game slug from the URL and renders the
 * appropriate game component inside GameLayout, or the Leaderboard view.
 *
 * Routes: /app/arcade/:gameSlug
 * Query params: ?view=leaderboard → shows leaderboard instead of game
 */
function ArcadeGamePage() {
  const { gameSlug } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { state } = useAppStore()
  const token = state.session.token

  const game = gameRegistry[gameSlug]

  // Redirect to arcade home if the slug doesn't match any registered game
  if (!game) {
    return <Navigate to="/app/arcade" replace />
  }

  const showLeaderboard = searchParams.get('view') === 'leaderboard'
  const GameComponent = game.component

  // Full-page leaderboard view (not inside GameLayout)
  if (showLeaderboard) {
    return (
      <section className="flex flex-col gap-4 pb-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(`/app/arcade/${gameSlug}`)}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-[#F7F4FF] transition hover:bg-white/10 active:scale-95"
            aria-label="Back to game"
          >
            <ArrowLeft size={18} />
          </button>
          <h1 className="text-xl font-bold text-[#F7F4FF]">Leaderboard</h1>
        </div>

        {/* Leaderboard content */}
        <Leaderboard gameSlug={gameSlug} token={token} />
      </section>
    )
  }

  return (
    <GameLayout gameSlug={gameSlug}>
      {({ onGameEnd, onScoreUpdate, onRestart, isActive, initialScore }) => (
        <Suspense fallback={<CountdownLoader gameTitle={game.title} />}>
          <GameComponent
            onGameEnd={onGameEnd}
            onScoreUpdate={onScoreUpdate}
            isActive={isActive}
            initialScore={initialScore}
          />
        </Suspense>
      )}
    </GameLayout>
  )
}

export default ArcadeGamePage
