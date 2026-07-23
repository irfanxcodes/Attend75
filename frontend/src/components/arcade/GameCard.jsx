import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

/**
 * GameCard displays a game's metadata with a play button on the Arcade home screen.
 *
 * Props:
 * - game: { slug, title, description, thumbnail, maxScore }
 * - personalBest: number | null
 */
function GameCard({ game, personalBest }) {
  const navigate = useNavigate()
  const [imgError, setImgError] = useState(false)

  function handlePlay() {
    navigate(`/app/arcade/${game.slug}`)
  }

  return (
    <div className="group rounded-2xl bg-[#4A466A] ring-1 ring-white/5 overflow-hidden transition-all duration-200 hover:scale-[1.02] hover:brightness-110 active:scale-[0.98]">
      {/* Thumbnail */}
      <div className="relative aspect-video w-full overflow-hidden bg-[#302A52]">
        {!imgError ? (
          <img
            src={game.thumbnail}
            alt={`${game.title} thumbnail`}
            className="h-full w-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <span className="text-3xl">🎮</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-col gap-2 p-3 md:p-4">
        <h3 className="text-base font-bold text-[#F7F4FF]">{game.title}</h3>
        <p className="text-sm text-[#9F9AB5] line-clamp-2">{game.description}</p>

        <div className="mt-1 flex items-center justify-between">
          <span className="text-xs font-semibold text-[#4EF0A0]">
            {personalBest != null ? `Best: ${personalBest}` : 'No score yet'}
          </span>
          <button
            type="button"
            onClick={handlePlay}
            className="rounded-lg bg-[#FF916C] px-4 py-1.5 text-xs font-bold text-[#201C31] transition-colors hover:bg-[#FFA588] active:bg-[#E87D5A]"
          >
            Play
          </button>
        </div>
      </div>
    </div>
  )
}

export default GameCard
