import { useCallback, useEffect, useState } from 'react'
import { getLeaderboard } from '../../services/arcadeApi'

/**
 * Leaderboard component for arcade games.
 *
 * Fetches and displays the ranked list of top players for a given game,
 * highlights the current user's entry, and shows a pinned footer if
 * the user's rank is outside the displayed entries.
 *
 * Props:
 *   gameSlug  - Game identifier (e.g. "flappy")
 *   token     - Session token (string or null)
 *   onClose   - Optional callback for modal dismiss
 */
function Leaderboard({ gameSlug, token, onClose }) {
  const [entries, setEntries] = useState([])
  const [userEntry, setUserEntry] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchLeaderboard = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getLeaderboard(gameSlug, token)
      setEntries(data?.entries || [])
      setUserEntry(data?.user_entry || null)
    } catch (err) {
      setError(err.message || 'Unable to load leaderboard.')
    } finally {
      setLoading(false)
    }
  }, [gameSlug, token])

  useEffect(() => {
    fetchLeaderboard()
  }, [fetchLeaderboard])

  // Check if the user's entry is already visible in the main list
  const userVisibleInList =
    userEntry && entries.some((entry) => entry.user_id === userEntry.user_id)

  return (
    <div className="flex flex-col rounded-2xl bg-[#4A466A] ring-1 ring-white/5 overflow-hidden">
      {/* Header */}
      {onClose && (
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 className="text-lg font-bold text-[#F7F4FF]">Leaderboard</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-[#9F9AB5] transition-colors hover:bg-white/10 hover:text-[#F7F4FF]"
            aria-label="Close leaderboard"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      )}

      {/* Content */}
      <div className="px-3 py-3">
        {loading && <LoadingState />}
        {error && <ErrorState message={error} onRetry={fetchLeaderboard} />}
        {!loading && !error && entries.length === 0 && <EmptyState />}
        {!loading && !error && entries.length > 0 && (
          <div className="space-y-2">
            {entries.map((entry) => (
              <LeaderboardRow
                key={entry.rank}
                entry={entry}
                isCurrentUser={userEntry != null && entry.user_id === userEntry.user_id}
              />
            ))}
          </div>
        )}
      </div>

      {/* Pinned footer for user outside displayed list */}
      {!loading && !error && userEntry && !userVisibleInList && (
        <div className="border-t border-[#FF916C]/30 bg-[#3E3A5C] px-3 py-3">
          <LeaderboardRow entry={userEntry} isCurrentUser isPinned />
        </div>
      )}
    </div>
  )
}

/**
 * Single leaderboard row entry.
 */
function LeaderboardRow({ entry, isCurrentUser, isPinned }) {
  const getMedalColor = (rank) => {
    if (rank === 1) return 'bg-yellow-500/20 text-yellow-400 ring-yellow-500/30'
    if (rank === 2) return 'bg-gray-400/20 text-gray-300 ring-gray-400/30'
    if (rank === 3) return 'bg-amber-600/20 text-amber-500 ring-amber-600/30'
    return 'bg-white/5 text-[#9F9AB5] ring-transparent'
  }

  return (
    <div
      className={[
        'flex items-center gap-3 rounded-xl px-3 py-3 transition-colors',
        isCurrentUser
          ? 'bg-[#FF916C]/10 ring-1 ring-[#FF916C]/40'
          : 'bg-[#3E3A5C]/60',
      ].join(' ')}
    >
      {/* Rank badge */}
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ring-1 ${getMedalColor(entry.rank)}`}
      >
        {entry.rank}
      </div>

      {/* Username */}
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-[#F7F4FF]">
        {entry.username || 'Anonymous'}
        {isCurrentUser && <span className="ml-1.5 text-[10px] font-semibold text-[#FF916C]">(you)</span>}
      </span>

      {/* Score + coins */}
      <div className="shrink-0 flex flex-col items-end gap-0.5">
        <span className="text-base font-bold text-[#4EF0A0]">{entry.score}</span>
        {entry.coins > 0 && (
          <span className="text-[10px] font-semibold text-[#ffd700]">🪙 {entry.coins}</span>
        )}
      </div>
    </div>
  )
}

/**
 * Loading skeleton state.
 */
function LoadingState() {
  return (
    <div className="space-y-2 py-2" aria-label="Loading leaderboard">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex animate-pulse items-center gap-3 rounded-xl bg-[#3E3A5C]/60 px-3 py-3">
          <div className="h-9 w-9 rounded-full bg-white/10" />
          <div className="h-4 flex-1 rounded bg-white/10" />
          <div className="h-4 w-12 rounded bg-white/10" />
        </div>
      ))}
    </div>
  )
}

/**
 * Error state with retry.
 */
function ErrorState({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-10 w-10 text-[#FF5B5B]/70"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      <p className="text-sm text-[#9F9AB5]">{message}</p>
      <button
        onClick={onRetry}
        className="rounded-lg bg-[#FF916C]/20 px-4 py-2 text-sm font-semibold text-[#FF916C] transition-colors hover:bg-[#FF916C]/30"
      >
        Retry
      </button>
    </div>
  )
}

/**
 * Empty state when no scores exist.
 */
function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-10 w-10 text-[#9F9AB5]/50"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <p className="text-sm text-[#9F9AB5]">No scores yet. Be the first to play!</p>
    </div>
  )
}

export default Leaderboard
