import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import gameRegistry from '../components/arcade/gameRegistry'
import useAppStore from '../hooks/useAppStore'
import { getLeaderboard, getPersonalBest } from '../services/arcadeApi'

const games = Object.values(gameRegistry)

function ArcadeHome() {
  const { state: { session } } = useAppStore()
  const navigate = useNavigate()

  const [activeIndex, setActiveIndex] = useState(0)
  const [personalBests, setPersonalBests] = useState({})
  const [leaderboard, setLeaderboard] = useState({ entries: [], userEntry: null })
  const [lbLoading, setLbLoading] = useState(true)
  const [lbError, setLbError] = useState(null)
  const touchStartRef = useRef(null)
  const containerRef = useRef(null)

  const activeGame = games[activeIndex]

  // Fetch personal bests
  useEffect(() => {
    if (!session.token) return
    let cancelled = false
    async function fetchBests() {
      for (const g of Object.values(gameRegistry)) {
        try {
          const data = await getPersonalBest(session.token, g.slug)
          if (!cancelled && data) setPersonalBests(prev => ({ ...prev, [g.slug]: data.score }))
        } catch { /* ignore */ }
      }
    }
    fetchBests()
    return () => { cancelled = true }
  }, [session.token])

  // Fetch leaderboard for active game
  const fetchLb = useCallback(async () => {
    setLbLoading(true)
    setLbError(null)
    try {
      const data = await getLeaderboard(activeGame.slug, session.token)
      setLeaderboard({ entries: data?.entries || [], userEntry: data?.user_entry || null })
    } catch (err) {
      setLbError(err.message || 'Unable to load leaderboard.')
    } finally {
      setLbLoading(false)
    }
  }, [activeGame.slug, session.token])

  useEffect(() => { fetchLb() }, [fetchLb])

  // Swipe handling
  const handleTouchStart = (e) => {
    touchStartRef.current = e.touches[0].clientX
  }
  const handleTouchEnd = (e) => {
    if (touchStartRef.current === null) return
    const diff = e.changedTouches[0].clientX - touchStartRef.current
    if (Math.abs(diff) > 50) {
      if (diff < 0 && activeIndex < games.length - 1) setActiveIndex(i => i + 1)
      else if (diff > 0 && activeIndex > 0) setActiveIndex(i => i - 1)
    }
    touchStartRef.current = null
  }

  const personalBest = personalBests[activeGame.slug] ?? null

  return (
    <section className="space-y-5 pb-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold text-[#F7F4FF]">Arcade</h1>
        <p className="text-xs text-[#9F9AB5]">Quick games between classes</p>
      </div>

      {/* Stacked Game Cards */}
      <div
        ref={containerRef}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="relative"
        style={{ paddingTop: `${(games.length - 1) * 18}px` }}
      >
        {/* Background stacked cards (peek strips behind the active card) */}
        {games.map((game, i) => {
          const distFromActive = i - activeIndex
          // Only show cards that are behind or at the active position
          if (distFromActive > 0) return null // cards "below" the deck not visible
          if (i === activeIndex) return null // active card rendered separately

          const stackOffset = (activeIndex - i) // how many cards behind
          const topOffset = (games.length - 1 - stackOffset) * 18
          const scaleVal = 1 - stackOffset * 0.04
          const opacity = 1 - stackOffset * 0.3

          return (
            <div
              key={game.slug}
              className="absolute left-0 right-0 overflow-hidden rounded-2xl ring-1 ring-white/10 cursor-pointer"
              style={{
                top: `${topOffset}px`,
                transform: `scale(${scaleVal})`,
                transformOrigin: 'top center',
                opacity: Math.max(opacity, 0.4),
                zIndex: i,
              }}
              onClick={() => setActiveIndex(i)}
            >
              <GameHeroCard game={game} personalBest={personalBests[game.slug] ?? null} navigate={navigate} />
            </div>
          )
        })}

        {/* Active card (front of stack) */}
        <div
          className="relative overflow-hidden rounded-2xl ring-1 ring-white/10 transition-all duration-300"
          style={{ zIndex: games.length }}
        >
          <GameHeroCard game={activeGame} personalBest={personalBests[activeGame.slug] ?? null} navigate={navigate} />
        </div>

        {/* Dot indicators */}
        {games.length > 1 && (
          <div className="mt-3 flex justify-center gap-1.5">
            {games.map((g, i) => (
              <button
                key={g.slug}
                type="button"
                onClick={() => setActiveIndex(i)}
                className={`h-2 rounded-full transition-all ${i === activeIndex ? 'w-5 bg-[#FF916C]' : 'w-2 bg-white/30'}`}
                aria-label={`Go to ${g.title}`}
              />
            ))}
          </div>
        )}
      </div>


      {/* Leaderboard Section — updates based on active game */}
      <div className="rounded-2xl bg-[#4A466A] ring-1 ring-white/5">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <h2 className="text-base font-bold text-[#F7F4FF]">Leaderboard — {activeGame.title}</h2>
          <button type="button" onClick={fetchLb} className="text-[10px] font-semibold text-[#9F9AB5] transition-colors hover:text-[#F7F4FF]">
            Refresh
          </button>
        </div>
        <div className="px-3 py-2">
          {lbLoading && <LeaderboardSkeleton />}
          {lbError && (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <p className="text-sm text-[#9F9AB5]">{lbError}</p>
              <button onClick={fetchLb} className="rounded-lg bg-[#FF916C]/20 px-4 py-1.5 text-xs font-semibold text-[#FF916C]">Retry</button>
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
                <LeaderboardRow key={entry.rank} entry={entry} isCurrentUser={leaderboard.userEntry?.user_id === entry.user_id} />
              ))}
            </div>
          )}
        </div>
        {!lbLoading && !lbError && leaderboard.userEntry && !leaderboard.entries.some(e => e.user_id === leaderboard.userEntry.user_id) && (
          <div className="border-t border-[#FF916C]/30 bg-[#3E3A5C] px-3 py-2">
            <LeaderboardRow entry={leaderboard.userEntry} isCurrentUser />
          </div>
        )}
      </div>
    </section>
  )
}

// --- Game Hero Card (per game) ---
function GameHeroCard({ game, personalBest, navigate }) {
  if (game.slug === 'flappy') return <FlappyHeroCard game={game} personalBest={personalBest} navigate={navigate} />
  if (game.slug === 'pacman') return <PacmanHeroCard game={game} personalBest={personalBest} navigate={navigate} />
  if (game.slug === 'stack') return <StackHeroCard game={game} personalBest={personalBest} navigate={navigate} />
  if (game.slug === 'helix') return <HelixHeroCard game={game} personalBest={personalBest} navigate={navigate} />
  return <GenericHeroCard game={game} personalBest={personalBest} navigate={navigate} />
}

function FlappyHeroCard({ game, personalBest, navigate }) {
  return (
    <div>
      <div className="relative flex h-52 flex-col items-center justify-center overflow-hidden" style={{ background: 'linear-gradient(180deg, #B8E8F0 0%, #87CEEB 40%, #A8E6CF 100%)' }}>
        <div className="absolute left-[5%] top-[15%] h-6 w-16 rounded-full bg-white/60" />
        <div className="absolute left-[2%] top-[20%] h-5 w-10 rounded-full bg-white/40" />
        <div className="absolute right-[10%] top-[10%] h-5 w-12 rounded-full bg-white/50" />
        <div className="absolute right-[5%] top-[14%] h-4 w-8 rounded-full bg-white/35" />
        <div className="absolute bottom-0 left-[20%] flex flex-col items-center">
          <div className="h-14 w-10 rounded-t-md bg-[#4EC04E] ring-1 ring-[#3A9A3A]/50" />
          <div className="h-2 w-12 rounded-sm bg-[#3A9A3A]" />
        </div>
        <div className="absolute bottom-0 right-[22%] flex flex-col items-center">
          <div className="h-20 w-10 rounded-t-md bg-[#4EC04E] ring-1 ring-[#3A9A3A]/50" />
          <div className="h-2 w-12 rounded-sm bg-[#3A9A3A]" />
        </div>
        <div className="absolute top-0 right-[22%] flex flex-col items-center">
          <div className="h-2 w-12 rounded-sm bg-[#3A9A3A]" />
          <div className="h-10 w-10 rounded-b-md bg-[#4EC04E] ring-1 ring-[#3A9A3A]/50" />
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-6 bg-[#8BC34A]" />
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
        <div className="relative z-10 mt-2">
          <span className="text-lg font-extrabold tracking-wider text-[#2D5F2D] drop-shadow-sm">{game.title}</span>
        </div>
      </div>
      <CardFooter game={game} personalBest={personalBest} navigate={navigate} />
    </div>
  )
}

function PacmanHeroCard({ game, personalBest, navigate }) {
  return (
    <div>
      <div className="relative flex h-52 flex-col items-center justify-center overflow-hidden bg-black">
        {/* Maze-like blue lines background */}
        <div className="absolute inset-0 opacity-30">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="absolute h-0.5 bg-[#2121DE]" style={{ top: `${12 + i * 12}%`, left: '8%', right: '8%' }} />
          ))}
          {[...Array(6)].map((_, i) => (
            <div key={i} className="absolute w-0.5 bg-[#2121DE]" style={{ left: `${15 + i * 14}%`, top: '8%', bottom: '8%' }} />
          ))}
        </div>

        {/* Pac-Man character */}
        <div className="relative z-10 -mt-2">
          <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
            <path d="M32 4 C50 4 60 18 60 32 C60 46 50 60 32 60 C14 60 4 46 4 32 C4 18 14 4 32 4 Z" fill="#FFFF00" />
            <path d="M32 32 L58 18 L58 46 Z" fill="#000" />
            <circle cx="30" cy="18" r="4" fill="#000" />
          </svg>
        </div>

        {/* Ghosts */}
        <div className="relative z-10 mt-2 flex gap-3">
          <span className="text-2xl">👻</span>
          <span className="text-2xl" style={{ filter: 'hue-rotate(180deg)' }}>👻</span>
          <span className="text-2xl" style={{ filter: 'hue-rotate(90deg)' }}>👻</span>
          <span className="text-2xl" style={{ filter: 'hue-rotate(270deg)' }}>👻</span>
        </div>

        {/* Dots trail */}
        <div className="absolute bottom-[30%] left-[10%] flex gap-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-1.5 w-1.5 rounded-full bg-[#FFB8AE]" />
          ))}
        </div>

        <div className="relative z-10 mt-3">
          <span className="text-lg font-extrabold tracking-wider text-[#FFFF00] drop-shadow-sm">{game.title}</span>
        </div>
      </div>
      <CardFooter game={game} personalBest={personalBest} navigate={navigate} />
    </div>
  )
}

function HelixHeroCard({ game, personalBest, navigate }) {
  return (
    <div>
      <div className="relative flex h-52 flex-col items-center justify-center overflow-hidden bg-[#1A1A2E]">
        {/* Glowing rings */}
        <div className="absolute inset-0 flex items-center justify-center">
          {[90, 70, 50, 30].map((r, i) => (
            <div key={i} className="absolute rounded-full border-2 border-opacity-30"
              style={{ width: r * 2, height: r * 2, borderColor: ['#FF6B6B','#FF9F43','#48DBFB','#5F27CD'][i], opacity: 0.4 - i * 0.08 }} />
          ))}
        </div>
        {/* Platform slices */}
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="absolute rounded-full"
            style={{
              width: 160, height: 22,
              top: `${28 + i * 22}%`,
              left: '50%', transform: `translateX(-50%) rotate(${i * 25}deg)`,
              background: ['#FF6B6B','#FF9F43','#48DBFB','#1DD1A1'][i],
              opacity: 0.85,
              clipPath: 'inset(0 30% 0 0 round 50%)',
            }} />
        ))}
        {/* Ball */}
        <div className="relative z-10 h-5 w-5 rounded-full bg-white shadow-[0_0_12px_4px_rgba(255,255,255,0.6)]" style={{ marginTop: '-10px' }} />
        <div className="relative z-10 mt-3">
          <span className="text-lg font-extrabold tracking-wider text-white drop-shadow-md">{game.title}</span>
        </div>
        {personalBest != null && (
          <div className="absolute top-3 left-3 rounded-md bg-black/50 px-2 py-1">
            <span className="text-[9px] font-bold text-[#48DBFB]">BEST {personalBest}</span>
          </div>
        )}
      </div>
      <CardFooter game={game} personalBest={personalBest} navigate={navigate} />
    </div>
  )
}

function GenericHeroCard({ game, personalBest, navigate }) {
  return (
    <div>
      <div className="relative flex h-52 flex-col items-center justify-center overflow-hidden bg-[#302A52]">
        <span className="text-5xl">🎮</span>
        <span className="mt-2 text-lg font-extrabold text-[#F7F4FF]">{game.title}</span>
      </div>
      <CardFooter game={game} personalBest={personalBest} navigate={navigate} />
    </div>
  )
}

function StackHeroCard({ game, personalBest, navigate }) {
  return (
    <div>
      <div className="relative flex h-52 flex-col items-center justify-end overflow-hidden" style={{ background: 'linear-gradient(180deg, #7EC8E3 0%, #B8E8F8 50%, #E8F4FD 100%)' }}>
        {/* Clouds background */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-[10%] left-[5%] h-10 w-24 rounded-full bg-white/70 blur-[2px]" />
          <div className="absolute top-[15%] left-[15%] h-7 w-16 rounded-full bg-white/50 blur-[1px]" />
          <div className="absolute top-[8%] right-[8%] h-9 w-20 rounded-full bg-white/60 blur-[2px]" />
          <div className="absolute top-[20%] right-[20%] h-6 w-14 rounded-full bg-white/40 blur-[1px]" />
          <div className="absolute bottom-[25%] left-[10%] h-8 w-20 rounded-full bg-white/50 blur-[1px]" />
          <div className="absolute bottom-[30%] right-[5%] h-10 w-28 rounded-full bg-white/60 blur-[2px]" />
        </div>

        {/* City silhouette in distance */}
        <div className="absolute bottom-0 left-0 right-0 flex items-end justify-center opacity-15">
          {[40, 55, 35, 70, 45, 60, 38, 50, 65, 42].map((h, i) => (
            <div key={i} className="bg-[#2D5F8A]" style={{ width: '8%', height: `${h}px`, marginRight: '1px' }} />
          ))}
        </div>

        {/* Swinging block (in the air) */}
        <div className="absolute top-[28%] left-[32%]">
          <div className="h-5 w-12 rounded-sm shadow-md" style={{ background: 'linear-gradient(180deg, #FFE066, #FFD700)' }} />
        </div>

        {/* Stacked tower - 3D-ish blocks with gradients */}
        <div className="relative z-10 mb-4 flex flex-col items-center">
          {[
            { w: 'w-16', bg: 'linear-gradient(180deg, #FFE066, #CC9900)', shadow: true },
            { w: 'w-[70px]', bg: 'linear-gradient(180deg, #FF9A5C, #D84315)' },
            { w: 'w-[74px]', bg: 'linear-gradient(180deg, #AED581, #558B2F)' },
            { w: 'w-[78px]', bg: 'linear-gradient(180deg, #CE93D8, #7B1FA2)' },
            { w: 'w-20', bg: 'linear-gradient(180deg, #4FC3F7, #0277BD)' },
          ].map((blk, i) => (
            <div key={i} className={`${blk.w} h-[14px] rounded-[2px] ${blk.shadow ? 'shadow-lg' : 'shadow-sm'} -mt-[1px]`} style={{ background: blk.bg }} />
          ))}
        </div>

        {/* Combo text */}
        <div className="absolute top-[35%] right-[12%] rotate-[-5deg]">
          <span className="text-sm font-extrabold text-[#FF6B35] drop-shadow-md">COMBO</span>
          <br />
          <span className="text-lg font-black text-[#FF6B35] drop-shadow-md">x15!</span>
        </div>

        {/* Game title */}
        <div className="relative z-10 mb-12">
          <span className="text-lg font-extrabold tracking-wider text-[#2D4A5C] drop-shadow-sm">{game.title}</span>
        </div>

        {/* Floor badge (top-left corner) */}
        <div className="absolute top-3 left-3 rounded-md bg-[#2D5F8A]/80 px-2 py-1 backdrop-blur-sm">
          <span className="text-[9px] font-bold text-white/80">FLOOR</span>
          <span className="ml-1 text-xs font-black text-white">185</span>
        </div>
      </div>
      <CardFooter game={game} personalBest={personalBest} navigate={navigate} />
    </div>
  )
}

function CardFooter({ game, personalBest, navigate }) {
  return (
    <div className="bg-[#4A466A] px-4 py-4 pb-8">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#302A52] ring-1 ring-white/10">
          {game.slug === 'flappy' ? (
            <svg width="28" height="28" viewBox="0 0 64 64" fill="none">
              <rect x="9" y="11" width="42" height="42" rx="12" fill="#FF916C" />
              <rect x="9" y="11" width="42" height="42" rx="12" stroke="#E07A58" strokeWidth="2" fill="none" />
              <circle cx="38" cy="28" r="7" fill="white" />
              <circle cx="40" cy="28" r="4" fill="#1D183E" />
            </svg>
          ) : game.slug === 'pacman' ? (
            <svg width="28" height="28" viewBox="0 0 64 64" fill="none">
              <path d="M32 8 C48 8 56 20 56 32 C56 44 48 56 32 56 C16 56 8 44 8 32 C8 20 16 8 32 8 Z" fill="#FFFF00" />
              <path d="M32 32 L54 20 L54 44 Z" fill="#302A52" />
            </svg>
          ) : game.slug === 'stack' ? (
            <svg width="28" height="28" viewBox="0 0 64 64" fill="none">
              <rect x="18" y="40" width="28" height="8" fill="#FFD700" rx="1" />
              <rect x="20" y="32" width="24" height="8" fill="#FFC107" rx="1" />
              <rect x="22" y="24" width="20" height="8" fill="#FF9800" rx="1" />
              <rect x="24" y="16" width="16" height="8" fill="#FF5722" rx="1" />
            </svg>
          ) : game.slug === 'helix' ? (
            <svg width="28" height="28" viewBox="0 0 64 64" fill="none">
              <circle cx="32" cy="32" r="24" stroke="#48DBFB" strokeWidth="3" fill="none" opacity="0.6"/>
              <circle cx="32" cy="32" r="16" stroke="#FF6B6B" strokeWidth="3" fill="none" opacity="0.6"/>
              <circle cx="32" cy="32" r="8" stroke="#FF9F43" strokeWidth="3" fill="none" opacity="0.6"/>
              <circle cx="32" cy="32" r="4" fill="white"/>
            </svg>
          ) : (
            <span className="text-xl">🎮</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9F9AB5]">
            {game.slug === 'flappy' ? "This week's game" : 'Classic arcade'}
          </p>
          <h2 className="text-base font-bold text-[#F7F4FF]">{game.title}</h2>
        </div>
        <span className="text-xs font-semibold text-[#4EF0A0]">
          {personalBest != null ? `Best: ${personalBest}` : ''}
        </span>
      </div>
      <button
        type="button"
        onClick={() => navigate(`/app/arcade/${game.slug}`)}
        className="mt-3 w-full rounded-full py-3 text-sm font-bold text-[#1C2030] transition-all active:scale-[0.97]"
        style={{ background: 'linear-gradient(135deg, #B8F77D 0%, #7BE056 100%)', boxShadow: '0 4px 14px rgba(123, 224, 86, 0.3)' }}
      >
        Play Now
      </button>
    </div>
  )
}

function LeaderboardRow({ entry, isCurrentUser }) {
  const getMedalColor = (rank) => {
    if (rank === 1) return 'bg-yellow-500/20 text-yellow-400'
    if (rank === 2) return 'bg-gray-400/20 text-gray-300'
    if (rank === 3) return 'bg-amber-600/20 text-amber-500'
    return 'bg-white/5 text-[#9F9AB5]'
  }
  return (
    <div className={['flex items-center gap-3 rounded-xl px-3 py-2.5', isCurrentUser ? 'bg-[#FF916C]/10 ring-1 ring-[#FF916C]/30' : 'bg-[#3E3A5C]/50'].join(' ')}>
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${getMedalColor(entry.rank)}`}>{entry.rank}</div>
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-[#F7F4FF]">
        {(entry.username || 'Anonymous').split(' ')[0]}
        {isCurrentUser && <span className="ml-1 text-[10px] text-[#FF916C]">(you)</span>}
      </span>
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
