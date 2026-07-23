import { Suspense } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import gameRegistry from '../components/arcade/gameRegistry'
import GameLayout from '../components/arcade/GameLayout'
import Leaderboard from '../components/arcade/Leaderboard'
import useAppStore from '../hooks/useAppStore'

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
      {({ onGameEnd, onScoreUpdate, onRestart, isActive }) => (
        <Suspense
          fallback={
            <div className="flex items-center justify-center py-16">
              <span className="text-sm text-[#F7F4FF]/60">Loading game...</span>
            </div>
          }
        >
          <GameComponent
            onGameEnd={onGameEnd}
            onScoreUpdate={onScoreUpdate}
            isActive={isActive}
          />
        </Suspense>
      )}
    </GameLayout>
  )
}

export default ArcadeGamePage
