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

  // Swipe handling with improved sensitivity
  const handleTouchStart = (e) => {
    touchStartRef.current = e.touches[0].clientX
  }
  const handleTouchEnd = (e) => {
    if (touchStartRef.current === null) return
    const diff = e.changedTouches[0].clientX - touchStartRef.current
    if (Math.abs(diff) > 40) { // Slightly more sensitive
      if (diff < 0 && activeIndex < games.length - 1) setActiveIndex(i => i + 1)
      else if (diff > 0 && activeIndex > 0) setActiveIndex(i => i - 1)
    }
    touchStartRef.current = null
  }

  const personalBest = personalBests[activeGame.slug] ?? null

  return (
    <section className="space-y-6 pb-6">
      {/* Header - improved spacing */}
      <div className="px-1">
        <h1 className="text-2xl font-extrabold text-[#F7F4FF] tracking-tight">Arcade</h1>
        <p className="text-xs text-[#9F9AB5] mt-0.5">Quick games between classes</p>
      </div>

      {/* Stacked Game Cards - enhanced animations */}
      <div
        ref={containerRef}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="relative"
        style={{ paddingTop: `${(games.length - 1) * 20}px` }}
      >
        {/* Background stacked cards */}
        {games.map((game, i) => {
          const distFromActive = i - activeIndex
          if (distFromActive > 0) return null
          if (i === activeIndex) return null

          const stackOffset = (activeIndex - i)
          const topOffset = (games.length - 1 - stackOffset) * 20
          const scaleVal = 1 - stackOffset * 0.035
          const opacity = 1 - stackOffset * 0.25

          return (
            <div
              key={game.slug}
              className="absolute left-0 right-0 overflow-hidden rounded-[20px] ring-1 ring-white/10 cursor-pointer transition-all duration-300 hover:ring-white/20"
              style={{
                top: `${topOffset}px`,
                transform: `scale(${scaleVal})`,
                transformOrigin: 'top center',
                opacity: Math.max(opacity, 0.5),
                zIndex: i,
              }}
              onClick={() => setActiveIndex(i)}
            >
              <GameHeroCard game={game} personalBest={personalBests[game.slug] ?? null} navigate={navigate} />
            </div>
          )
        })}

        {/* Active card - smooth entrance */}
        <div
          key={`active-${activeGame.slug}`}
          className="relative overflow-hidden rounded-[20px] ring-1 ring-white/10 transition-all duration-400 shadow-2xl"
          style={{ 
            zIndex: games.length,
            animation: 'slideInUp 0.3s ease-out'
          }}
        >
          <GameHeroCard game={activeGame} personalBest={personalBests[activeGame.slug] ?? null} navigate={navigate} />
        </div>

        {/* Dot indicators - refined */}
        {games.length > 1 && (
          <div className="mt-4 flex justify-center gap-2">
            {games.map((g, i) => (
              <button
                key={g.slug}
                type="button"
                onClick={() => setActiveIndex(i)}
                className={`h-2 rounded-full transition-all duration-300 ${
                  i === activeIndex 
                    ? 'w-6 bg-[#FF916C] shadow-[0_0_8px_rgba(255,145,108,0.5)]' 
                    : 'w-2 bg-white/30 hover:bg-white/50'
                }`}
                aria-label={`Go to ${g.title}`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Leaderboard Section - enhanced design */}
      <div className="rounded-[20px] bg-[#4A466A] ring-1 ring-white/5 overflow-hidden shadow-lg">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5">
          <h2 className="text-base font-bold text-[#F7F4FF]">Leaderboard — {activeGame.title}</h2>
          <button 
            type="button" 
            onClick={fetchLb} 
            className="text-[10px] font-semibold text-[#9F9AB5] transition-all hover:text-[#F7F4FF] hover:scale-105 active:scale-95"
          >
            Refresh
          </button>
        </div>
        <div className="px-4 py-3">
          {lbLoading && <LeaderboardSkeleton />}
          {lbError && (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <p className="text-sm text-[#9F9AB5]">{lbError}</p>
              <button 
                onClick={fetchLb} 
                className="rounded-xl bg-[#FF916C]/20 px-5 py-2 text-xs font-semibold text-[#FF916C] transition-all hover:bg-[#FF916C]/30 active:scale-95"
              >
                Retry
              </button>
            </div>
          )}
          {!lbLoading && !lbError && leaderboard.entries.length === 0 && (
            <div className="py-10 text-center">
              <p className="text-sm text-[#9F9AB5]">No scores yet. Be the first to play!</p>
            </div>
          )}
          {!lbLoading && !lbError && leaderboard.entries.length > 0 && (
            <div className="space-y-2">
              {leaderboard.entries.map((entry) => (
                <LeaderboardRow 
                  key={entry.rank} 
                  entry={entry} 
                  isCurrentUser={leaderboard.userEntry?.user_id === entry.user_id} 
                />
              ))}
            </div>
          )}
        </div>
        {!lbLoading && !lbError && leaderboard.userEntry && !leaderboard.entries.some(e => e.user_id === leaderboard.userEntry.user_id) && (
          <div className="border-t border-[#FF916C]/30 bg-[#3E3A5C] px-4 py-3">
            <LeaderboardRow entry={leaderboard.userEntry} isCurrentUser />
          </div>
        )}
      </div>

      {/* CSS Animations */}
      <style>{`
        @keyframes slideInUp {
          from {
            opacity: 0.8;
            transform: translateY(10px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </section>
  )
}

// --- Game Hero Card (per game) ---
function GameHeroCard({ game, personalBest, navigate }) {
  if (game.slug === 'flappy')  return <FlappyHeroCard  game={game} personalBest={personalBest} navigate={navigate} />
  if (game.slug === 'pacman')  return <PacmanHeroCard  game={game} personalBest={personalBest} navigate={navigate} />
  if (game.slug === 'stack')   return <StackHeroCard   game={game} personalBest={personalBest} navigate={navigate} />
  if (game.slug === 'geodash') return <GeodashHeroCard game={game} personalBest={personalBest} navigate={navigate} />
  if (game.slug === 'snake')   return <SnakeHeroCard   game={game} personalBest={personalBest} navigate={navigate} />
  return <GenericHeroCard game={game} personalBest={personalBest} navigate={navigate} />
}

function FlappyHeroCard({ game, personalBest, navigate }) {
  return (
    <div>
      <div className="relative flex h-56 flex-col items-center justify-center overflow-hidden" style={{ background: 'linear-gradient(180deg, #B8E8F0 0%, #87CEEB 40%, #A8E6CF 100%)' }}>
        {/* Clouds - slightly larger */}
        <div className="absolute left-[5%] top-[15%] h-7 w-20 rounded-full bg-white/60" />
        <div className="absolute left-[2%] top-[20%] h-6 w-12 rounded-full bg-white/40" />
        <div className="absolute right-[10%] top-[10%] h-6 w-14 rounded-full bg-white/50" />
        <div className="absolute right-[5%] top-[14%] h-5 w-10 rounded-full bg-white/35" />
        
        {/* Pipes */}
        <div className="absolute bottom-0 left-[20%] flex flex-col items-center">
          <div className="h-16 w-11 rounded-t-md bg-[#4EC04E] ring-1 ring-[#3A9A3A]/50" />
          <div className="h-2.5 w-14 rounded-sm bg-[#3A9A3A]" />
        </div>
        <div className="absolute bottom-0 right-[22%] flex flex-col items-center">
          <div className="h-24 w-11 rounded-t-md bg-[#4EC04E] ring-1 ring-[#3A9A3A]/50" />
          <div className="h-2.5 w-14 rounded-sm bg-[#3A9A3A]" />
        </div>
        <div className="absolute top-0 right-[22%] flex flex-col items-center">
          <div className="h-2.5 w-14 rounded-sm bg-[#3A9A3A]" />
          <div className="h-12 w-11 rounded-b-md bg-[#4EC04E] ring-1 ring-[#3A9A3A]/50" />
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-7 bg-[#8BC34A]" />
        
        {/* Bird - slightly larger */}
        <div className="relative z-10 -mt-4">
          <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
            <rect x="12" y="14" width="42" height="42" rx="12" fill="rgba(0,0,0,0.15)" />
            <rect x="9" y="11" width="42" height="42" rx="12" fill="#FF916C" />
            <rect x="9" y="11" width="42" height="42" rx="12" stroke="#E07A58" strokeWidth="2.5" fill="none" />
            <circle cx="38" cy="28" r="9" fill="white" />
            <circle cx="40" cy="28" r="5" fill="#1D183E" />
            <circle cx="42" cy="26" r="1.5" fill="white" />
          </svg>
        </div>
        <div className="relative z-10 mt-2">
          <span className="text-xl font-extrabold tracking-wider text-[#2D5F2D] drop-shadow-sm">{game.title}</span>
        </div>
      </div>
      <CardFooter game={game} personalBest={personalBest} navigate={navigate} />
    </div>
  )
}

function PacmanHeroCard({ game, personalBest, navigate }) {
  return (
    <div>
      <div className="relative flex h-56 flex-col items-center justify-center overflow-hidden bg-black">
        {/* Maze background */}
        <div className="absolute inset-0 opacity-30">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="absolute h-0.5 bg-[#2121DE]" style={{ top: `${12 + i * 12}%`, left: '8%', right: '8%' }} />
          ))}
          {[...Array(6)].map((_, i) => (
            <div key={i} className="absolute w-0.5 bg-[#2121DE]" style={{ left: `${15 + i * 14}%`, top: '8%', bottom: '8%' }} />
          ))}
        </div>

        {/* Pac-Man */}
        <div className="relative z-10 -mt-2">
          <svg width="70" height="70" viewBox="0 0 64 64" fill="none">
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
            <div key={i} className="h-2 w-2 rounded-full bg-[#FFB8AE]" />
          ))}
        </div>

        <div className="relative z-10 mt-3">
          <span className="text-xl font-extrabold tracking-wider text-[#FFFF00] drop-shadow-sm">{game.title}</span>
        </div>
      </div>
      <CardFooter game={game} personalBest={personalBest} navigate={navigate} />
    </div>
  )
}

function GeodashHeroCard({ game, personalBest, navigate }) {
  return (
    <div>
      <div className="relative flex h-56 flex-col items-center justify-center overflow-hidden bg-[#0a1628]">
        {/* Grid lines */}
        <div className="absolute inset-0 opacity-10">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="absolute top-0 bottom-0 w-px bg-[#00ff87]" style={{ left: `${15 + i * 14}%` }} />
          ))}
        </div>
        {/* Ground */}
        <div className="absolute bottom-0 left-0 right-0 h-10 bg-[#1a4a7a]" />
        <div className="absolute bottom-10 left-0 right-0 h-0.5 bg-white" />
        {/* Spikes */}
        {[20, 35, 55, 70].map((left, i) => (
          <div key={i} className="absolute bottom-10" style={{ left: `${left}%` }}>
            <div className="w-0 h-0" style={{ borderLeft: '9px solid transparent', borderRight: '9px solid transparent', borderBottom: '16px solid #ccc' }} />
          </div>
        ))}
        {/* Player cube */}
        <div className="absolute bottom-[44px] left-[12%] h-8 w-8 rounded-sm bg-[#00ff87] border-2 border-black flex items-center justify-center shadow-[0_0_12px_rgba(0,255,135,0.5)]">
          <div className="h-3.5 w-3.5 bg-white rounded-sm opacity-60" />
        </div>
        {/* Title */}
        <div className="relative z-10 mb-12 text-center">
          <span className="text-xl font-extrabold tracking-wider text-[#00ff87] drop-shadow-[0_0_10px_rgba(0,255,135,0.6)]">{game.title}</span>
        </div>
        {/* Score badge */}
        {personalBest != null && (
          <div className="absolute top-3 left-3 rounded-lg bg-[#00ff87]/15 px-2.5 py-1.5 backdrop-blur-sm">
            <span className="text-[10px] font-bold text-[#00ff87]">BEST {personalBest}</span>
          </div>
        )}
      </div>
      <CardFooter game={game} personalBest={personalBest} navigate={navigate} />
    </div>
  )
}

function SnakeHeroCard({ game, personalBest, navigate }) {
  return (
    <div>
      <div className="relative flex h-56 flex-col items-center justify-center overflow-hidden bg-[#1A1A2E]">
        {/* Grid lines */}
        <div className="absolute inset-0 opacity-10">
          {[...Array(10)].map((_, i) => (
            <div key={'h'+i} className="absolute h-px bg-[#4EF0A0]" style={{ top: `${10 + i * 9}%`, left: '5%', right: '5%' }} />
          ))}
          {[...Array(10)].map((_, i) => (
            <div key={'v'+i} className="absolute w-px bg-[#4EF0A0]" style={{ left: `${10 + i * 9}%`, top: '5%', bottom: '5%' }} />
          ))}
        </div>
        {/* Snake */}
        <div className="relative z-10 flex flex-col items-center gap-1">
          <div className="flex items-center gap-1">
            {/* Head */}
            <div className="h-7 w-7 rounded-md bg-[#4EF0A0] ring-1 ring-[#1A9A58] flex items-center justify-center shadow-[0_0_10px_rgba(78,240,160,0.4)]">
              <div className="flex gap-0.5">
                <div className="h-1.5 w-1.5 rounded-full bg-[#1A1A2E]" />
                <div className="h-1.5 w-1.5 rounded-full bg-[#1A1A2E]" />
              </div>
            </div>
            {/* Body */}
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-6 w-6 rounded-sm" style={{ backgroundColor: `rgba(45,192,120,${1 - i * 0.15})` }} />
            ))}
          </div>
          {/* Food */}
          <div className="mt-3 h-6 w-6 rounded-full bg-[#FF916C] shadow-[0_0_14px_rgba(255,145,108,0.6)]" />
        </div>
        {/* Title */}
        <div className="absolute bottom-5 left-0 right-0 text-center">
          <span className="text-xl font-extrabold tracking-wider text-[#4EF0A0] drop-shadow-[0_0_10px_rgba(78,240,160,0.5)]">{game.title}</span>
        </div>
        {personalBest != null && (
          <div className="absolute top-3 left-3 rounded-lg bg-[#4EF0A0]/15 px-2.5 py-1.5 backdrop-blur-sm">
            <span className="text-[10px] font-bold text-[#4EF0A0]">BEST {personalBest}</span>
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
      <div className="relative flex h-56 flex-col items-center justify-center overflow-hidden bg-[#302A52]">
        <span className="text-5xl">🎮</span>
        <span className="mt-2 text-xl font-extrabold text-[#F7F4FF]">{game.title}</span>
      </div>
      <CardFooter game={game} personalBest={personalBest} navigate={navigate} />
    </div>
  )
}

function StackHeroCard({ game, personalBest, navigate }) {
  return (
    <div>
      <div className="relative flex h-56 flex-col items-center justify-end overflow-hidden" style={{ background: 'linear-gradient(180deg, #7EC8E3 0%, #B8E8F8 50%, #E8F4FD 100%)' }}>
        {/* Clouds background */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-[10%] left-[5%] h-11 w-26 rounded-full bg-white/70 blur-[2px]" />
          <div className="absolute top-[15%] left-[15%] h-8 w-18 rounded-full bg-white/50 blur-[1px]" />
          <div className="absolute top-[8%] right-[8%] h-10 w-22 rounded-full bg-white/60 blur-[2px]" />
          <div className="absolute top-[20%] right-[20%] h-7 w-16 rounded-full bg-white/40 blur-[1px]" />
          <div className="absolute bottom-[25%] left-[10%] h-9 w-22 rounded-full bg-white/50 blur-[1px]" />
          <div className="absolute bottom-[30%] right-[5%] h-11 w-30 rounded-full bg-white/60 blur-[2px]" />
        </div>

        {/* City silhouette */}
        <div className="absolute bottom-0 left-0 right-0 flex items-end justify-center opacity-15">
          {[40, 55, 35, 70, 45, 60, 38, 50, 65, 42].map((h, i) => (
            <div key={i} className="bg-[#2D5F8A]" style={{ width: '8%', height: `${h}px`, marginRight: '1px' }} />
          ))}
        </div>

        {/* Swinging block */}
        <div className="absolute top-[28%] left-[32%]">
          <div className="h-5 w-13 rounded-sm shadow-md" style={{ background: 'linear-gradient(180deg, #FFE066, #FFD700)' }} />
        </div>

        {/* Stacked tower */}
        <div className="relative z-10 mb-4 flex flex-col items-center">
          {[
            { w: 'w-16', bg: 'linear-gradient(180deg, #FFE066, #CC9900)', shadow: true },
            { w: 'w-[70px]', bg: 'linear-gradient(180deg, #FF9A5C, #D84315)' },
            { w: 'w-[74px]', bg: 'linear-gradient(180deg, #AED581, #558B2F)' },
            { w: 'w-[78px]', bg: 'linear-gradient(180deg, #CE93D8, #7B1FA2)' },
            { w: 'w-20', bg: 'linear-gradient(180deg, #4FC3F7, #0277BD)' },
          ].map((blk, i) => (
            <div key={i} className={`${blk.w} h-[15px] rounded-[2px] ${blk.shadow ? 'shadow-lg' : 'shadow-sm'} -mt-[1px]`} style={{ background: blk.bg }} />
          ))}
        </div>

        {/* Combo text */}
        <div className="absolute top-[35%] right-[12%] rotate-[-5deg]">
          <span className="text-sm font-extrabold text-[#FF6B35] drop-shadow-md">COMBO</span>
          <br />
          <span className="text-xl font-black text-[#FF6B35] drop-shadow-md">x15!</span>
        </div>

        {/* Game title */}
        <div className="relative z-10 mb-12">
          <span className="text-xl font-extrabold tracking-wider text-[#2D4A5C] drop-shadow-sm">{game.title}</span>
        </div>

        {/* Floor badge */}
        <div className="absolute top-3 left-3 rounded-lg bg-[#2D5F8A]/80 px-2.5 py-1.5 backdrop-blur-sm">
          <span className="text-[10px] font-bold text-white/80">FLOOR</span>
          <span className="ml-1 text-xs font-black text-white">185</span>
        </div>
      </div>
      <CardFooter game={game} personalBest={personalBest} navigate={navigate} />
    </div>
  )
}

function CardFooter({ game, personalBest, navigate }) {
  const destination = game.externalRoute ?? `/app/arcade/${game.slug}`
  const isExternal  = !!game.externalRoute
  return (
    <div className="bg-[#4A466A] px-5 py-5 pb-9">
      <div className="flex items-center gap-3">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[#302A52] ring-1 ring-white/10">
          {game.slug === 'flappy' ? (
            <svg width="32" height="32" viewBox="0 0 64 64" fill="none">
              <rect x="9" y="11" width="42" height="42" rx="12" fill="#FF916C" />
              <rect x="9" y="11" width="42" height="42" rx="12" stroke="#E07A58" strokeWidth="2" fill="none" />
              <circle cx="38" cy="28" r="7" fill="white" />
              <circle cx="40" cy="28" r="4" fill="#1D183E" />
            </svg>
          ) : game.slug === 'pacman' ? (
            <svg width="32" height="32" viewBox="0 0 64 64" fill="none">
              <path d="M32 8 C48 8 56 20 56 32 C56 44 48 56 32 56 C16 56 8 44 8 32 C8 20 16 8 32 8 Z" fill="#FFFF00" />
              <path d="M32 32 L54 20 L54 44 Z" fill="#302A52" />
            </svg>
          ) : game.slug === 'stack' ? (
            <svg width="32" height="32" viewBox="0 0 64 64" fill="none">
              <rect x="18" y="40" width="28" height="8" fill="#FFD700" rx="1" />
              <rect x="20" y="32" width="24" height="8" fill="#FFC107" rx="1" />
              <rect x="22" y="24" width="20" height="8" fill="#FF9800" rx="1" />
              <rect x="24" y="16" width="16" height="8" fill="#FF5722" rx="1" />
            </svg>
          ) : game.slug === 'geodash' ? (
            <svg width="32" height="32" viewBox="0 0 64 64" fill="none">
              <rect x="8" y="44" width="48" height="6" fill="#1a4a7a" rx="1"/>
              <polygon points="16,44 22,30 28,44" fill="#ccc"/>
              <polygon points="32,44 38,30 44,44" fill="#ccc"/>
              <rect x="8" y="34" width="10" height="10" fill="#00ff87" rx="2"/>
              <rect x="11" y="37" width="4" height="4" fill="white" rx="1" opacity="0.6"/>
            </svg>
          ) : game.slug === 'snake' ? (
            <span className="text-2xl">🐍</span>
          ) : (
            <span className="text-xl">🎮</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9F9AB5]">
            {isExternal ? 'Face rating' : game.slug === 'flappy' ? "This week's game" : 'Classic arcade'}
          </p>
          <h2 className="text-base font-bold text-[#F7F4FF] mt-0.5">{game.title}</h2>
        </div>
        <span className="text-xs font-semibold text-[#4EF0A0]">
          {personalBest != null
            ? isExternal ? `Best: ${personalBest}/10` : `Best: ${personalBest}`
            : ''}
        </span>
      </div>
      <button
        type="button"
        onClick={() => navigate(destination)}
        className="mt-4 w-full rounded-full py-3.5 text-sm font-bold text-[#1C2030] transition-all active:scale-[0.97] hover:shadow-lg"
        style={{ background: 'linear-gradient(135deg, #B8F77D 0%, #7BE056 100%)', boxShadow: '0 4px 14px rgba(123, 224, 86, 0.3)' }}
      >
        {isExternal ? 'Get Mogged 🪞' : 'Play Now'}
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
    <div className={['flex items-center gap-3 rounded-xl px-3.5 py-3', isCurrentUser ? 'bg-[#FF916C]/10 ring-1 ring-[#FF916C]/30' : 'bg-[#3E3A5C]/50'].join(' ')}>
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${getMedalColor(entry.rank)}`}>{entry.rank}</div>
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-[#F7F4FF]">
        {(entry.username || 'Anonymous').split(' ')[0]}
        {isCurrentUser && <span className="ml-1.5 text-[10px] text-[#FF916C]">(you)</span>}
      </span>
      <span className="shrink-0 text-sm font-bold text-[#4EF0A0]">{entry.score}</span>
    </div>
  )
}

function LeaderboardSkeleton() {
  return (
    <div className="space-y-2 py-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex animate-pulse items-center gap-3 rounded-xl bg-[#3E3A5C]/50 px-3.5 py-3">
          <div className="h-9 w-9 rounded-full bg-white/10" />
          <div className="h-4 flex-1 rounded bg-white/10" />
          <div className="h-4 w-12 rounded bg-white/10" />
        </div>
      ))}
    </div>
  )
}

export default ArcadeHome
