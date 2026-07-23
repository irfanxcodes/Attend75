import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import gameRegistry from '../components/arcade/gameRegistry'
import useAppStore from '../hooks/useAppStore'
import { getLeaderboard, getPersonalBest } from '../services/arcadeApi'

function ArcadeHome() {
  const {
    state: { session },
  } = useAppStore()
  const navigate = useNavigate()

  const [personalBests, setPersonalBests] = useState({})
  const [leaderboard, setLeaderboard] = useState({ entries: [], userEntry: null })
  const [lbLoading, setLbLoading] = useState(true)
  const [lbError, setLbError] = useState(null)

  // Currently we only have one game — flappy
  const game = Object.values(gameRegistry)[0]

  useEffect(() => {
    if (!session.token) return
    let cancelled = false

    async function fetchBests() {
      try {
        const data = await getPersonalBest(session.token, game.slug)
        if (!cancelled && data) {
          setPersonalBests((prev) => ({ ...prev, [game.slug]: data.score }))
        }
      } catch {
        // Silently ignore
      }
    }

    fetchBests()
    return () => { cancelled = true }
  }, [session.token, game.slug])

  const fetchLb = useCallback(async () => {
    setLbLoading(true)
    setLbError(null)
    try {
      const data = await getLeaderboard(game.slug, session.token)
      setLeaderboard({ entries: data?.entries || [], userEntry: data?.user_entry || null })
    } catch (err) {
      setLbError(err.message || 'Unable to load leaderboard.')
    } finally {
      setLbLoading(false)
    }
  }, [game.slug, session.token])

  useEffect(() => {
    fetchLb()
  }, [fetchLb])

  const personalBest = personalBests[game.slug] ?? null

  return (
    <section className="space-y-5 pb-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-extrabold text-[#F7F4FF]">Arcade</h1>
        <p className="text-xs text-[#9F9AB5]">Quick games between classes</p>
      </div>

      {/* Game Hero Card */}
      <div className="overflow-hidden rounded-2xl ring-1 ring-white/10">
        {/* Colorful game scene */}
        <div
          className="relative flex h-52 flex-col items-center justify-center overflow-hidden"
          style={{
            background: 'linear-gradient(180deg, #B8E8F0 0%, #87CEEB 40%, #A8E6CF 100%)',
          }}
        >
          {/* Clouds */}
          <div className="absolute left-[5%] top-[15%] h-6 w-16 rounded-full bg-white/60" />
          <div className="absolute left-[2%] top-[20%] h-5 w-10 rounded-full bg-white/40" />
          <div className="absolute right-[10%] top-[10%] h-5 w-12 rounded-full bg-white/50" />
          <div className="absolute right-[5%] top-[14%] h-4 w-8 rounded-full bg-white/35" />

          {/* Pipes */}
          <div className="absolute bottom-0 left-[20%] flex flex-col items-center">
            <div className="h-14 w-10 rounded-t-md bg-[#4EC04E] ring-1 ring-[#3A9A3A]/50" />
            <div className="h-2 w-12 rounded-sm bg-[#3A9A3A]" />
          </div>
          <div className="absolute bottom-0 right-[22%] flex flex-col items-center">
            <div className="h-20 w-10 rounded-t-md bg-[#4EC04E] ring-1 ring-[#3A9A3A]/50" />
            <div className="h-2 w-12 rounded-sm bg-[#3A9A3A]" />
          </div>
          {/* Top pipe */}
          <div className="absolute top-0 right-[22%] flex flex-col items-center">
            <div className="h-2 w-12 rounded-sm bg-[#3A9A3A]" />
            <div className="h-10 w-10 rounded-b-md bg-[#4EC04E] ring-1 ring-[#3A9A3A]/50" />
          </div>

          {/* Ground */}
          <div className="absolute bottom-0 left-0 right-0 h-6 bg-[#8BC34A]" />
          <div className="absolute bottom-5 left-0 right-0 h-1 bg-[#7CB342]/50" />

          {/* Player character - flying */}
          <div className="relative z-10 -mt-4">
            <svg width="56" height="56" viewBox="0 0 64 64" fill="none">
              <rect x="12" y="14" width="42" height="42" rx="12" fill="rgba(0,0,0,0.15)" />
              <rect x="9" y="11" width="42" height="42" rx="12" fill="#FF916C" />
              <rect x="9" y="11" width="42" height="42" rx="12" stroke="#E07A58" strokeWidth="2.5" fill="none" />
              <circle cx="38" cy="28" r="9" fill="white" />
              <circle cx="40" cy="28" r="5" fill="#1D183E" />
              <circle cx="42" cy="26" r="1.5" fill="white" />
            </svg>
          </div>

          {/* Game title overlay */}
          <div className="relative z-10 mt-2">
            <span className="text-lg font-extrabold tracking-wider text-[#2D5F2D] drop-shadow-sm">
              {game.title}
            </span>
          </div>
        </div>

        {/* Game info + join button */}
        <div className="bg-[#4A466A] px-4 py-4">
          <div className="flex items-center gap-3">
            {/* Small game icon */}
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#302A52] ring-1 ring-white/10">
              <svg width="28" height="28" viewBox="0 0 64 64" fill="none">
                <rect x="9" y="11" width="42" height="42" rx="12" fill="#FF916C" />
                <rect x="9" y="11" width="42" height="42" rx="12" stroke="#E07A58" strokeWidth="2" fill="none" />
                <circle cx="38" cy="28" r="7" fill="white" />
                <circle cx="40" cy="28" r="4" fill="#1D183E" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9F9AB5]">This week's game</p>
              <h2 className="text-base font-bold text-[#F7F4FF]">{game.title}</h2>
            </div>
            <span className="text-xs font-semibold text-[#4EF0A0]">
              {personalBest != null ? `Best: ${personalBest}` : ''}
            </span>
          </div>

          {/* Join Challenge Button */}
          <button
            type="button"
            onClick={() => navigate(`/app/arcade/${game.slug}`)}
            className="mt-3 w-full rounded-full py-3 text-sm font-bold text-[#1C2030] transition-all active:scale-[0.97]"
            style={{
              background: 'linear-gradient(135deg, #B8F77D 0%, #7BE056 100%)',
              boxShadow: '0 4px 14px rgba(123, 224, 86, 0.3)',
            }}
          >
            Join Challenge
          </button>
        </div>
      </div>

      {/* Leaderboard Section */}
      <div className="rounded-2xl bg-[#4A466A] ring-1 ring-white/5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <h2 className="text-base font-bold text-[#F7F4FF]">Leaderboard</h2>
          <button
            type="button"
            onClick={fetchLb}
            className="text-[10px] font-semibold text-[#9F9AB5] transition-colors hover:text-[#F7F4FF]"
          >
            Refresh
          </button>
        </div>

        {/* Content */}
        <div className="px-3 py-2">
          {lbLoading && <LeaderboardSkeleton />}
          {lbError && (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <p className="text-sm text-[#9F9AB5]">{lbError}</p>
              <button
                onClick={fetchLb}
                className="rounded-lg bg-[#FF916C]/20 px-4 py-1.5 text-xs font-semibold text-[#FF916C] transition-colors hover:bg-[#FF916C]/30"
              >
                Retry
              </button>
            </div>
          )}
          {!lbLoading && !lbError && leaderboard.entries.length === 0 && (
            <div className="py-8 text-center">
              <p className="text-sm text-[#9F9AB5]">No scores yet. Be the first to play!</p>
            </div>
          )}
          {!lbLoading && !lbError && leaderboard.entries.length > 0 && (
            <div className="space-y-1.5">
              {leaderboard.entries.map((entry) => (
                <LeaderboardRow
                  key={entry.rank}
                  entry={entry}
                  isCurrentUser={leaderboard.userEntry?.rank === entry.rank}
                />
              ))}
            </div>
          )}
        </div>

        {/* Pinned user row if outside displayed list */}
        {!lbLoading && !lbError && leaderboard.userEntry &&
          !leaderboard.entries.some((e) => e.rank === leaderboard.userEntry.rank) && (
            <div className="border-t border-[#FF916C]/30 bg-[#3E3A5C] px-3 py-2">
              <LeaderboardRow entry={leaderboard.userEntry} isCurrentUser isPinned />
            </div>
          )}
      </div>
    </section>
  )
}

function LeaderboardRow({ entry, isCurrentUser, isPinned }) {
  const getMedalColor = (rank) => {
    if (rank === 1) return 'bg-yellow-500/20 text-yellow-400'
    if (rank === 2) return 'bg-gray-400/20 text-gray-300'
    if (rank === 3) return 'bg-amber-600/20 text-amber-500'
    return 'bg-white/5 text-[#9F9AB5]'
  }

  return (
    <div
      className={[
        'flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors',
        isCurrentUser ? 'bg-[#FF916C]/10 ring-1 ring-[#FF916C]/30' : 'bg-[#3E3A5C]/50',
      ].join(' ')}
    >
      {/* Rank badge */}
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${getMedalColor(entry.rank)}`}>
        {entry.rank}
      </div>

      {/* Username */}
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-[#F7F4FF]">
        {entry.username}
        {isCurrentUser && <span className="ml-1 text-[10px] text-[#FF916C]">(you)</span>}
      </span>

      {/* Score */}
      <span className="shrink-0 text-sm font-bold text-[#4EF0A0]">{entry.score}</span>
    </div>
  )
}

function LeaderboardSkeleton() {
  return (
    <div className="space-y-1.5 py-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex animate-pulse items-center gap-3 rounded-xl bg-[#3E3A5C]/50 px-3 py-2.5">
          <div className="h-8 w-8 rounded-full bg-white/10" />
          <div className="h-4 flex-1 rounded bg-white/10" />
          <div className="h-4 w-10 rounded bg-white/10" />
        </div>
      ))}
    </div>
  )
}

export default ArcadeHome
