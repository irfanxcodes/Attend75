import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import gameRegistry from '../components/arcade/gameRegistry'
import useAppStore from '../hooks/useAppStore'
import { getLeaderboard, getPersonalBest } from '../services/arcadeApi'

const games = Object.values(gameRegistry)

function ArcadeHome() {
  const { state: { session } } = useAppStore()
  const navigate = useNavigate()
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)

  const [activeIndex, setActiveIndex] = useState(0)
  const [personalBests, setPersonalBests] = useState({})
  const [leaderboards, setLeaderboards] = useState({})
  const [lbLoading, setLbLoading] = useState({})

  // Handle resize
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Fetch personal bests
  useEffect(() => {
    if (!session.token) return
    let cancelled = false
    async function fetchBests() {
      for (const g of games) {
        try {
          const data = await getPersonalBest(session.token, g.slug)
          if (!cancelled && data) {
            setPersonalBests(prev => ({ ...prev, [g.slug]: data.score }))
          }
        } catch { /* ignore */ }
      }
    }
    fetchBests()
    return () => { cancelled = true }
  }, [session.token])

  // Fetch leaderboards for all games
  useEffect(() => {
    if (!session.token) return
    let cancelled = false
    
    async function fetchAllLeaderboards() {
      for (const game of games) {
        setLbLoading(prev => ({ ...prev, [game.slug]: true }))
        try {
          const data = await getLeaderboard(game.slug, session.token)
          if (!cancelled) {
            setLeaderboards(prev => ({
              ...prev,
              [game.slug]: { entries: data?.entries || [], userEntry: data?.user_entry || null }
            }))
          }
        } catch (err) {
          console.error(`Failed to load leaderboard for ${game.slug}`, err)
        } finally {
          if (!cancelled) {
            setLbLoading(prev => ({ ...prev, [game.slug]: false }))
          }
        }
      }
    }
    
    fetchAllLeaderboards()
    return () => { cancelled = true }
  }, [session.token])

  const activeGame = games[activeIndex]
  const activeLeaderboard = leaderboards[activeGame.slug] || { entries: [], userEntry: null }

  return isMobile ? (
    <MobileVerticalFeed
      games={games}
      personalBests={personalBests}
      leaderboards={leaderboards}
      lbLoading={lbLoading}
      navigate={navigate}
    />
  ) : (
    <DesktopHorizontalSwipe
      games={games}
      activeIndex={activeIndex}
      setActiveIndex={setActiveIndex}
      personalBests={personalBests}
      activeLeaderboard={activeLeaderboard}
      navigate={navigate}
    />
  )
}

// ==================== DESKTOP: Horizontal Swipe Cards ====================
function DesktopHorizontalSwipe({ games, activeIndex, setActiveIndex, personalBests, activeLeaderboard, navigate }) {
  const nextCard = () => setActiveIndex((activeIndex + 1) % games.length)
  const prevCard = () => setActiveIndex((activeIndex - 1 + games.length) % games.length)

  const activeGame = games[activeIndex]
  const personalBest = personalBests[activeGame.slug]
  const userRank = activeLeaderboard.userEntry?.rank || null
  const topScore = activeLeaderboard.entries[0]?.score || null

  return (
    <section className="fixed inset-0 flex flex-col items-center justify-center bg-[#1C2030] pb-24">
      {/* Header - centered */}
      <div className="text-center mb-8">
        <h1 className="text-4xl font-extrabold text-white tracking-tight mb-2">Arcade</h1>
        <p className="text-sm text-gray-400">Swipe to explore games</p>
      </div>
      
      {/* Card Display Area - smaller cards */}
      <div className="relative w-full max-w-4xl mb-8">
        <div className="relative h-[400px] flex items-center justify-center">
          {games.map((game, i) => {
            const distFromActive = i - activeIndex
            let className = 'absolute transition-all duration-500 ease-out cursor-pointer'
            let transform = ''
            let opacity = 0
            let zIndex = 0
            let pointerEvents = 'none'
            let filter = 'brightness(0.4)'
            
            if (distFromActive === 0) {
              // Center active card
              transform = 'translateX(0) scale(1)'
              opacity = 1
              zIndex = 30
              pointerEvents = 'auto'
              filter = 'none'
            } else if (distFromActive === -1 || (activeIndex === 0 && i === games.length - 1)) {
              // Left card
              transform = 'translateX(-85%) scale(0.8)'
              opacity = 0.4
              zIndex = 20
              pointerEvents = 'auto'
            } else if (distFromActive === 1 || (activeIndex === games.length - 1 && i === 0)) {
              // Right card
              transform = 'translateX(85%) scale(0.8)'
              opacity = 0.4
              zIndex = 20
              pointerEvents = 'auto'
            }
            
            return (
              <div
                key={game.slug}
                className={className}
                style={{
                  transform,
                  opacity,
                  zIndex,
                  pointerEvents,
                  filter,
                  width: '420px',
                  height: '100%'
                }}
                onClick={() => distFromActive !== 0 && setActiveIndex(i)}
              >
                <DesktopGameCard 
                  game={game} 
                  personalBest={personalBests[game.slug]}
                  userRank={distFromActive === 0 ? userRank : null}
                  topScore={distFromActive === 0 ? topScore : null}
                  navigate={navigate}
                  isActive={distFromActive === 0}
                />
              </div>
            )
          })}
        </div>
      </div>

      {/* Bottom Controls */}
      <div className="flex items-center gap-6 mb-6">
        {/* Left Arrow */}
        <button
          onClick={prevCard}
          className="w-12 h-12 rounded-full bg-[#4A466A] hover:bg-[#5A566A] text-white flex items-center justify-center transition-all hover:scale-110"
        >
          <span className="text-2xl">‹</span>
        </button>
        
        {/* Play Button */}
        <button
          onClick={() => navigate(`/app/arcade/${activeGame.slug}`)}
          className="px-12 py-3.5 rounded-full font-bold text-lg text-black transition-all hover:scale-105 shadow-xl flex items-center gap-2"
          style={{ background: 'linear-gradient(135deg, #B8F77D 0%, #7BE056 100%)' }}
        >
          <span className="text-xl">▶</span>
          <span>Play Now</span>
        </button>
        
        {/* Right Arrow */}
        <button
          onClick={nextCard}
          className="w-12 h-12 rounded-full bg-[#4A466A] hover:bg-[#5A566A] text-white flex items-center justify-center transition-all hover:scale-110"
        >
          <span className="text-2xl">›</span>
        </button>
      </div>
      
      {/* Dot Indicators */}
      <div className="flex justify-center gap-2">
        {games.map((game, i) => (
          <button
            key={game.slug}
            onClick={() => setActiveIndex(i)}
            className={`h-2 rounded-full transition-all duration-300 ${
              i === activeIndex 
                ? 'w-8 bg-white' 
                : 'w-2 bg-white/30 hover:bg-white/50'
            }`}
          />
        ))}
      </div>
    </section>
  )
}

function DesktopGameCard({ game, personalBest, userRank, topScore, navigate, isActive }) {
  return (
    <div className="h-full rounded-3xl overflow-hidden relative shadow-2xl bg-[#2A2640]">
      {/* Game Visual - full card background */}
      <div className="absolute inset-0">
        <GameVisual game={game} personalBest={personalBest} />
      </div>
      
      {/* Dark overlay gradient for text readability */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/75" />
      
      {/* Content overlay */}
      <div className="absolute inset-0 flex flex-col justify-between p-6">
        {/* Top badge */}
        <div>
          <span className="inline-block px-4 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider bg-white/20 backdrop-blur-md text-white">
            {game.slug === 'flappy' ? "This week's game" : 'Classic arcade'}
          </span>
        </div>
        
        {/* Bottom info */}
        <div>
          {/* Game title */}
          <h2 className="text-3xl font-black text-white mb-2 drop-shadow-lg">{game.title}</h2>
          <p className="text-white/90 text-sm mb-5 drop-shadow">{game.description}</p>
          
          {/* Stats row - only on active card, smaller */}
          {isActive && (personalBest || userRank || topScore) && (
            <div className="grid grid-cols-3 gap-2.5">
              {/* Personal Best */}
              {personalBest && (
                <div className="rounded-xl bg-white/15 backdrop-blur-md p-3 text-center border border-white/20">
                  <div className="text-2xl font-bold text-white">{personalBest}</div>
                  <div className="text-[10px] text-white/70 uppercase tracking-wider mt-0.5">Best</div>
                </div>
              )}
              
              {/* User Rank */}
              {userRank && (
                <div className="rounded-xl bg-white/15 backdrop-blur-md p-3 text-center border border-white/20">
                  <div className="text-2xl font-bold text-white">#{userRank}</div>
                  <div className="text-[10px] text-white/70 uppercase tracking-wider mt-0.5">Rank</div>
                </div>
              )}
              
              {/* Top Score */}
              {topScore && (
                <div className="rounded-xl bg-white/15 backdrop-blur-md p-3 text-center border border-white/20">
                  <div className="text-2xl font-bold text-white">{topScore}</div>
                  <div className="text-[10px] text-white/70 uppercase tracking-wider mt-0.5">Top</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}


// ==================== MOBILE: Vertical Feed ====================
function MobileVerticalFeed({ games, personalBests, leaderboards, lbLoading, navigate }) {
  const feedRef = useRef(null)
  const [activeSlide, setActiveSlide] = useState(0)

  useEffect(() => {
    const handleScroll = () => {
      if (!feedRef.current) return
      const scrollPosition = feedRef.current.scrollTop
      const slideHeight = window.innerHeight
      const currentIndex = Math.round(scrollPosition / slideHeight)
      setActiveSlide(currentIndex)
    }

    const feed = feedRef.current
    if (feed) {
      feed.addEventListener('scroll', handleScroll)
      return () => feed.removeEventListener('scroll', handleScroll)
    }
  }, [])

  return (
    <div className="fixed inset-0 bg-[#1C2030]">
      {/* CSS Animations */}
      <style>{`
        @keyframes float {
          0%, 100% { 
            transform: translateY(0px);
          }
          50% { 
            transform: translateY(-15px);
          }
        }
        
        @keyframes bounce-slow {
          0%, 100% { 
            transform: translateY(0px) rotate(45deg);
          }
          50% { 
            transform: translateY(-12px) rotate(45deg);
          }
        }
        
        @keyframes swing {
          0%, 100% { 
            transform: translateX(-50%) rotate(-15deg);
          }
          50% { 
            transform: translateX(-50%) rotate(15deg);
          }
        }
        
        @keyframes blink {
          0%, 100% { 
            opacity: 0.2;
          }
          50% { 
            opacity: 1;
          }
        }
        
        .animate-float {
          animation: float 2.5s ease-in-out infinite;
        }
        
        .animate-bounce-slow {
          animation: bounce-slow 1.5s ease-in-out infinite;
        }
      `}</style>
      
      {/* Scroll Indicators */}
      <div className="fixed right-4 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-2">
        {games.map((_, i) => (
          <div
            key={i}
            className={`w-1.5 rounded-full transition-all ${
              i === activeSlide 
                ? 'h-8 bg-[#FF916C]' 
                : 'h-1.5 bg-white/30'
            }`}
          />
        ))}
      </div>
      
      {/* Scrollable Feed */}
      <div 
        ref={feedRef}
        className="h-full overflow-y-scroll snap-y snap-mandatory scrollbar-hide"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {games.map((game, index) => {
          const leaderboard = leaderboards[game.slug] || { entries: [] }
          const personalBest = personalBests[game.slug]
          
          return (
            <div 
              key={game.slug} 
              className="h-screen snap-start flex flex-col relative"
            >
              <MobileGameSlide 
                game={game}
                personalBest={personalBest}
                leaderboard={leaderboard}
                navigate={navigate}
              />
            </div>
          )
        })}
      </div>
      
      <style>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  )
}

function MobileGameSlide({ game, personalBest, leaderboard, navigate }) {
  const leaderboardRef = useRef(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const checkScroll = () => {
    if (leaderboardRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = leaderboardRef.current
      setCanScrollLeft(scrollLeft > 10)
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10)
    }
  }

  useEffect(() => {
    checkScroll()
  }, [leaderboard])

  return (
    <div className="h-full flex flex-col relative overflow-hidden">
      {/* Back Button - Fixed Top Left - Smaller */}
      <button
        onClick={() => navigate('/app')}
        className="fixed top-4 left-4 z-50 px-4 py-2 rounded-full font-bold text-sm bg-gradient-to-b from-[#B8F77D] to-[#7BE056] text-black shadow-lg border-2 border-black/20 flex items-center gap-1.5 active:scale-95 transition-transform"
        style={{
          boxShadow: '0 3px 0 0 rgba(0,0,0,0.2), 0 6px 12px rgba(0,0,0,0.3), inset 0 -2px 0 rgba(0,0,0,0.2), inset 0 2px 0 rgba(255,255,255,0.4)'
        }}
      >
        <span className="text-lg">←</span>
        <span>BACK</span>
      </button>

      {/* Game Visual Background */}
      <div className="absolute inset-0">
        <GameVisual game={game} personalBest={personalBest} fullscreen />
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/30 to-black/90" />
      </div>
      
      {/* Content */}
      <div className="relative z-10 flex-1 flex flex-col justify-between p-6 pt-16 pb-8">
        {/* Top: Title & Stats */}
        <div>
          <h1 className="text-5xl font-black text-white mb-3 tracking-tight drop-shadow-lg">
            {game.title}
          </h1>
          <p className="text-lg text-white/80 mb-4">{game.description}</p>
          {personalBest && (
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-black/40 backdrop-blur-md">
              <span className="text-sm font-bold text-[#4EF0A0]">Your Best: {personalBest}</span>
            </div>
          )}
        </div>
        
        {/* Bottom: Action & Leaderboard */}
        <div className="space-y-3">
          {/* Play Button */}
          <button
            onClick={() => navigate(`/app/arcade/${game.slug}`)}
            className="w-full py-4 rounded-2xl font-bold text-lg text-[#1C2030] shadow-xl transition-transform active:scale-95"
            style={{ background: 'linear-gradient(135deg, #B8F77D 0%, #7BE056 100%)' }}
          >
            ▶ Play Now
          </button>
          
          {/* Compact Scrollable Leaderboard */}
          {leaderboard.entries.length > 0 && (
            <div className="rounded-2xl bg-black/40 backdrop-blur-md overflow-hidden">
              {/* Header - compact */}
              <div className="flex items-center justify-between px-4 py-2 border-b border-white/10">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  🏆 Leaderboard
                </span>
                {canScrollRight && (
                  <span className="text-[10px] text-white/50 flex items-center gap-1">
                    Swipe <span className="animate-pulse">→</span>
                  </span>
                )}
              </div>
              
              {/* Scrollable Player Cards - compact */}
              <div className="relative">
                {/* Left fade indicator */}
                {canScrollLeft && (
                  <div className="absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-black/60 to-transparent z-10 pointer-events-none" />
                )}
                
                {/* Right fade indicator */}
                {canScrollRight && (
                  <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-black/60 to-transparent z-10 pointer-events-none" />
                )}
                
                {/* Horizontal scroll container - reduced height */}
                <div 
                  ref={leaderboardRef}
                  onScroll={checkScroll}
                  className="flex gap-2 overflow-x-auto px-3 py-3 snap-x snap-mandatory scrollbar-hide"
                  style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                >
                  {leaderboard.entries.slice(0, 10).map((entry, i) => {
                    const isUserEntry = leaderboard.userEntry && entry.rank === leaderboard.userEntry.rank
                    const isTopThree = entry.rank <= 3
                    
                    return (
                      <div 
                        key={i} 
                        className={`flex-shrink-0 w-[110px] rounded-lg p-2.5 snap-start transition-all ${
                          isUserEntry 
                            ? 'bg-gradient-to-br from-[#FFB366]/30 to-[#FF916C]/30 ring-1 ring-[#FF916C]/50' 
                            : isTopThree
                            ? 'bg-white/10'
                            : 'bg-white/5'
                        }`}
                      >
                        {/* Rank badge - smaller */}
                        <div className="flex items-center justify-between mb-1.5">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                            entry.rank === 1 ? 'bg-gradient-to-br from-[#FFD700] to-[#FFA500] text-[#1C2030]' :
                            entry.rank === 2 ? 'bg-gradient-to-br from-[#C0C0C0] to-[#A0A0A0] text-[#1C2030]' :
                            entry.rank === 3 ? 'bg-gradient-to-br from-[#CD7F32] to-[#B8860B] text-[#1C2030]' :
                            'bg-white/10 text-white'
                          }`}>
                            {entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : entry.rank}
                          </div>
                          {isUserEntry && (
                            <span className="text-[9px] font-bold text-[#FF916C] bg-[#FF916C]/20 px-1.5 py-0.5 rounded-full">
                              YOU
                            </span>
                          )}
                        </div>
                        
                        {/* Player name - smaller */}
                        <div className="text-xs font-semibold text-white/90 truncate mb-1">
                          {entry.username?.split(' ')[0] || 'Anonymous'}
                        </div>
                        
                        {/* Score - compact */}
                        <div className="flex items-baseline gap-0.5">
                          <span className="text-lg font-bold text-[#4EF0A0]">{entry.score}</span>
                          <span className="text-[9px] text-white/50">pts</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
              
              {/* User's rank if not in top 10 - compact */}
              {leaderboard.userEntry && leaderboard.userEntry.rank > 10 && (
                <div className="px-3 pb-2 pt-1 border-t border-white/10">
                  <div className="text-[9px] text-white/50 mb-1">Your Rank:</div>
                  <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-gradient-to-r from-[#FFB366]/20 to-[#FF916C]/20 ring-1 ring-[#FF916C]/30">
                    <span className="text-xs font-bold text-white">#{leaderboard.userEntry.rank}</span>
                    <span className="flex-1 text-xs text-white/90 truncate">
                      {leaderboard.userEntry.username?.split(' ')[0] || 'You'}
                    </span>
                    <span className="text-xs font-bold text-[#4EF0A0]">{leaderboard.userEntry.score}</span>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

// ==================== Game Visuals (Reused from Original) ====================
function GameVisual({ game, personalBest, fullscreen = false }) {
  const heightClass = fullscreen ? 'h-full' : 'h-full'
  
  if (game.slug === 'flappy') {
    return (
      <div className={`relative flex flex-col items-center justify-center overflow-hidden ${heightClass}`} style={{ background: 'linear-gradient(180deg, #B8E8F0 0%, #87CEEB 40%, #A8E6CF 100%)' }}>
        {/* Clouds */}
        <div className="absolute left-[5%] top-[15%] h-7 w-20 rounded-full bg-white/60" />
        <div className="absolute right-[10%] top-[10%] h-6 w-14 rounded-full bg-white/50" />
        {/* Pipes */}
        <div className="absolute bottom-0 left-[20%] flex flex-col items-center">
          <div className="h-16 w-11 rounded-t-md bg-[#4EC04E] ring-1 ring-[#3A9A3A]/50" />
          <div className="h-2.5 w-14 rounded-sm bg-[#3A9A3A]" />
        </div>
        <div className="absolute bottom-0 right-[22%] flex flex-col items-center">
          <div className="h-24 w-11 rounded-t-md bg-[#4EC04E] ring-1 ring-[#3A9A3A]/50" />
          <div className="h-2.5 w-14 rounded-sm bg-[#3A9A3A]" />
        </div>
        {/* Ground */}
        <div className="absolute bottom-0 left-0 right-0 h-7 bg-[#8BC34A]" />
        {/* Bird - show on mobile too */}
        <div className="relative z-10" style={{ animation: 'float 2.5s ease-in-out infinite' }}>
          <svg width={fullscreen ? "80" : "64"} height={fullscreen ? "80" : "64"} viewBox="0 0 64 64" fill="none">
            <rect x="12" y="14" width="42" height="42" rx="12" fill="rgba(0,0,0,0.15)" />
            <rect x="9" y="11" width="42" height="42" rx="12" fill="#FF916C" />
            <rect x="9" y="11" width="42" height="42" rx="12" stroke="#E07A58" strokeWidth="2.5" fill="none" />
            <circle cx="38" cy="28" r="9" fill="white" />
            <circle cx="40" cy="28" r="5" fill="#1D183E" />
            <circle cx="42" cy="26" r="1.5" fill="white" />
          </svg>
        </div>
      </div>
    )
  }
  
  if (game.slug === 'pacman') {
    return (
      <div className={`relative flex flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-[#0D0D33] to-[#1a1a4d] ${heightClass}`}>
        {/* Maze background - more visible */}
        <div className="absolute inset-0 opacity-40">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="absolute h-1 bg-[#3333FF] rounded" style={{ top: `${12 + i * 12}%`, left: '8%', right: '8%' }} />
          ))}
          {[...Array(6)].map((_, i) => (
            <div key={`v${i}`} className="absolute w-1 bg-[#3333FF] rounded" style={{ left: `${15 + i * 14}%`, top: '8%', bottom: '8%' }} />
          ))}
        </div>
        
        {/* Pellets scattered around */}
        <div className="absolute inset-0">
          {[20, 40, 60, 80].map((top, i) => (
            <div key={`pellet-${i}`} className="absolute flex gap-8" style={{ top: `${top}%`, left: '15%', right: '15%' }}>
              {[...Array(4)].map((_, j) => (
                <div key={j} className="w-2 h-2 rounded-full bg-[#FFB8AE] opacity-60" />
              ))}
            </div>
          ))}
        </div>
        
        {/* Pac-Man - larger and animated */}
        <div className="relative z-10" style={{ animation: 'float 2s ease-in-out infinite' }}>
          <svg width={fullscreen ? "120" : "90"} height={fullscreen ? "120" : "90"} viewBox="0 0 100 100" fill="none">
            {/* Shadow */}
            <ellipse cx="50" cy="90" rx="35" ry="8" fill="rgba(0,0,0,0.3)" />
            {/* Pac-Man body - perfect circle with wedge cut out */}
            <defs>
              <radialGradient id="pacGradient">
                <stop offset="0%" stopColor="#FFFF00" />
                <stop offset="70%" stopColor="#FFFF00" />
                <stop offset="100%" stopColor="#FFD700" />
              </radialGradient>
            </defs>
            {/* Main circle */}
            <circle cx="50" cy="52" r="42" fill="url(#pacGradient)" />
            {/* Mouth wedge - simple filled polygon */}
            <polygon points="50,52 92,35 92,69" fill="#0D0D33" stroke="none" />
            {/* Eye */}
            <circle cx="45" cy="32" r="7" fill="#000" />
            <circle cx="47" cy="30" r="3" fill="#fff" />
          </svg>
        </div>
        
        {/* Ghosts below - colorful and animated */}
        {fullscreen && (
          <div className="relative z-10 mt-6 flex gap-4">
            {['#FF0000', '#00FFFF', '#FFB8FF', '#FFB852'].map((color, i) => (
              <div key={i} style={{ animation: `float ${2 + i * 0.2}s ease-in-out infinite` }}>
                <svg width="40" height="45" viewBox="0 0 40 45" fill="none">
                  {/* Ghost body */}
                  <path d="M20 5 C10 5 5 10 5 20 L5 35 L8 40 L12 35 L16 40 L20 35 L24 40 L28 35 L32 40 L35 35 L35 20 C35 10 30 5 20 5 Z" fill={color} />
                  {/* Eyes */}
                  <ellipse cx="14" cy="18" rx="4" ry="5" fill="white" />
                  <ellipse cx="26" cy="18" rx="4" ry="5" fill="white" />
                  <circle cx="15" cy="19" r="2" fill="#000080" />
                  <circle cx="27" cy="19" r="2" fill="#000080" />
                </svg>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }
  
  if (game.slug === 'snake') {
    return (
      <div className={`relative flex flex-col items-center justify-center overflow-hidden ${heightClass}`} style={{ background: 'linear-gradient(135deg, #1a2332 0%, #2d3748 50%, #1a2332 100%)' }}>
        {/* Animated gradient orbs in background */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-[10%] left-[10%] w-32 h-32 rounded-full bg-[#4EF0A0]/10 blur-[40px]" style={{ animation: 'float 4s ease-in-out infinite' }} />
          <div className="absolute top-[60%] right-[15%] w-40 h-40 rounded-full bg-[#4EF0A0]/8 blur-[50px]" style={{ animation: 'float 5s ease-in-out infinite', animationDelay: '1s' }} />
          <div className="absolute bottom-[20%] left-[20%] w-36 h-36 rounded-full bg-[#60FFA8]/8 blur-[45px]" style={{ animation: 'float 4.5s ease-in-out infinite', animationDelay: '2s' }} />
        </div>
        
        {/* Subtle dotted pattern */}
        <div className="absolute inset-0 opacity-5">
          {[...Array(12)].map((_, i) => (
            <div key={`row-${i}`} className="flex justify-around" style={{ marginTop: '8%' }}>
              {[...Array(8)].map((_, j) => (
                <div key={`dot-${i}-${j}`} className="w-1 h-1 rounded-full bg-[#4EF0A0]" />
              ))}
            </div>
          ))}
        </div>
        
        {/* Smooth organic snake */}
        <div className="relative z-10 flex items-center" style={{ animation: 'float 2.8s ease-in-out infinite' }}>
          {/* Snake head - rounded with gradient and eyes */}
          <div className={`${fullscreen ? 'h-12 w-12' : 'h-10 w-10'} relative rounded-[20px] flex items-center justify-center`}
            style={{ 
              background: 'linear-gradient(135deg, #60FFA8 0%, #4EF0A0 50%, #2DC078 100%)',
              boxShadow: '0 0 20px rgba(78, 240, 160, 0.5), inset 0 2px 6px rgba(255,255,255,0.3), inset 0 -2px 4px rgba(0,0,0,0.2)'
            }}
          >
            {/* Eyes */}
            <div className="flex gap-1.5">
              <div className={`${fullscreen ? 'h-2.5 w-2.5' : 'h-2 w-2'} rounded-full bg-[#1A1A2E] relative`}>
                <div className="absolute top-0 right-0 w-1 h-1 rounded-full bg-white/80" />
              </div>
              <div className={`${fullscreen ? 'h-2.5 w-2.5' : 'h-2 w-2'} rounded-full bg-[#1A1A2E] relative`}>
                <div className="absolute top-0 right-0 w-1 h-1 rounded-full bg-white/80" />
              </div>
            </div>
            {/* Tongue */}
            <div className="absolute left-full top-1/2 -translate-y-1/2 ml-0.5">
              <div className="w-3 h-0.5 bg-[#FF6B6B] rounded-full" />
            </div>
          </div>
          
          {/* Snake body segments - smooth curved connection */}
          <div className="flex items-center -ml-2">
            {[...Array(5)].map((_, i) => {
              const size = fullscreen ? 11 - i * 0.4 : 9 - i * 0.3;
              const opacity = 1 - i * 0.12;
              const greenIntensity = 160 - i * 15;
              
              return (
                <div 
                  key={i} 
                  className="rounded-[18px] -ml-1.5"
                  style={{ 
                    width: `${size * 4}px`,
                    height: `${size * 4}px`,
                    background: `linear-gradient(135deg, rgba(96, 255, 168, ${opacity}) 0%, rgba(78, 240, ${greenIntensity}, ${opacity}) 50%, rgba(45, 192, 120, ${opacity * 0.9}) 100%)`,
                    boxShadow: `0 0 ${12 - i * 2}px rgba(78, 240, 160, ${0.3 - i * 0.04})`,
                    opacity: opacity
                  }}
                />
              );
            })}
          </div>
        </div>
        
        {/* Enhanced food - apple/fruit style */}
        <div className={`relative z-10 ${fullscreen ? 'mt-8' : 'mt-6'}`}>
          <div className={`${fullscreen ? 'h-10 w-10' : 'h-8 w-8'} relative rounded-full`}
            style={{ 
              background: 'linear-gradient(135deg, #FF916C 0%, #FF6B4A 50%, #E8553D 100%)',
              boxShadow: '0 0 24px rgba(255, 145, 108, 0.7), 0 4px 12px rgba(0,0,0,0.3), inset -3px -3px 6px rgba(0,0,0,0.2), inset 3px 3px 6px rgba(255,255,255,0.3)'
            }}
          >
            {/* Highlight shine */}
            <div className="absolute top-[20%] left-[25%] w-[35%] h-[35%] rounded-full bg-white/40 blur-[2px]" />
            {/* Leaf on top */}
            <div className="absolute -top-1 left-1/2 -translate-x-1/2">
              <div className="w-2 h-3 rounded-full bg-[#4EF0A0] transform -rotate-12" style={{ clipPath: 'polygon(50% 0%, 100% 100%, 0% 100%)' }} />
            </div>
          </div>
        </div>
      </div>
    )
  }
  
  if (game.slug === 'geodash') {
    return (
      <div className={`relative flex flex-col items-center justify-center overflow-hidden bg-[#0a0e1a] ${heightClass}`}>
        {/* Blinking stars */}
        <div className="absolute inset-0">
          {[...Array(30)].map((_, i) => {
            const size = Math.random() > 0.7 ? 2 : 1;
            const left = Math.random() * 100;
            const top = Math.random() * 100;
            const duration = 2 + Math.random() * 3;
            const delay = Math.random() * 2;
            
            return (
              <div
                key={i}
                className="absolute rounded-full bg-white"
                style={{
                  width: `${size}px`,
                  height: `${size}px`,
                  left: `${left}%`,
                  top: `${top}%`,
                  animation: `blink ${duration}s ease-in-out infinite`,
                  animationDelay: `${delay}s`
                }}
              />
            );
          })}
        </div>
        
        {/* Ground with glow */}
        <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-[#1a4a7a] to-transparent" />
        <div className="absolute bottom-12 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#00ff87] to-transparent shadow-[0_0_8px_rgba(0,255,135,0.6)]" />
        
        {/* Spikes with gradient */}
        {[15, 32, 52, 72, 88].map((left, i) => (
          <div key={i} className="absolute bottom-12" style={{ left: `${left}%` }}>
            <div className="w-0 h-0" style={{ 
              borderLeft: '10px solid transparent', 
              borderRight: '10px solid transparent', 
              borderBottom: '18px solid #e0e0e0',
              filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))'
            }} />
          </div>
        ))}
        
        {/* Main Cube - centered and animated */}
        <div 
          className={`relative ${fullscreen ? 'h-16 w-16' : 'h-12 w-12'} rounded-md flex items-center justify-center`}
          style={{ 
            background: 'linear-gradient(135deg, #00ff87 0%, #00d9ff 50%, #00ff87 100%)',
            animation: 'bounce-slow 1.5s ease-in-out infinite',
            boxShadow: '0 0 20px rgba(0,255,135,0.6), inset 0 0 10px rgba(255,255,255,0.3)',
            border: '3px solid rgba(0,0,0,0.4)',
            transform: 'rotate(45deg)'
          }}
        >
          {/* Inner highlight */}
          <div className={`${fullscreen ? 'h-8 w-8' : 'h-6 w-6'} rounded-sm bg-gradient-to-br from-white/40 to-transparent`} />
          
          {/* Corner accents */}
          <div className="absolute top-1 left-1 w-2 h-2 bg-white/60 rounded-sm" style={{ transform: 'rotate(-45deg)' }} />
          <div className="absolute bottom-1 right-1 w-2 h-2 bg-black/20 rounded-sm" style={{ transform: 'rotate(-45deg)' }} />
        </div>
        
        {/* Trail particles behind cube */}
        {fullscreen && [0, 1, 2].map((i) => (
          <div 
            key={`trail-${i}`}
            className="absolute w-3 h-3 rounded-sm"
            style={{
              left: `${30 - (i * 8)}%`,
              top: '50%',
              background: 'linear-gradient(135deg, #00ff87, #00d9ff)',
              opacity: 0.3 - (i * 0.1),
              transform: 'rotate(45deg)',
              animation: `float ${1.5 + i * 0.2}s ease-in-out infinite`,
              animationDelay: `${i * 0.1}s`
            }}
          />
        ))}
      </div>
    )
  }
  
  if (game.slug === 'stack') {
    return (
      <div className={`relative flex flex-col items-center justify-center overflow-hidden ${heightClass}`} style={{ background: 'linear-gradient(180deg, #87CEEB 0%, #B8E8F8 50%, #E8F4FD 100%)' }}>
        {/* Enhanced clouds with depth */}
        <div className="absolute inset-0 overflow-hidden">
          {/* Large background clouds */}
          <div className="absolute top-[8%] left-[-5%] h-16 w-36 rounded-full bg-white/40 blur-[3px]" />
          <div className="absolute top-[12%] left-[0%] h-14 w-28 rounded-full bg-white/50 blur-[2px]" />
          <div className="absolute top-[5%] right-[0%] h-14 w-32 rounded-full bg-white/45 blur-[3px]" />
          <div className="absolute top-[10%] right-[5%] h-12 w-24 rounded-full bg-white/55 blur-[2px]" />
          
          {/* Mid-layer clouds */}
          <div className="absolute top-[30%] right-[-3%] h-20 w-40 rounded-full bg-white/50 blur-[2px]" />
          <div className="absolute top-[34%] right-[2%] h-16 w-32 rounded-full bg-white/60 blur-[1px]" />
          <div className="absolute bottom-[25%] left-[-2%] h-18 w-36 rounded-full bg-white/45 blur-[2px]" />
          <div className="absolute bottom-[28%] left-[3%] h-14 w-28 rounded-full bg-white/55 blur-[1px]" />
          
          {/* Small accent clouds */}
          <div className="absolute top-[20%] left-[15%] h-8 w-16 rounded-full bg-white/60 blur-[1px]" />
          <div className="absolute bottom-[40%] right-[12%] h-10 w-20 rounded-full bg-white/50 blur-[1px]" />
        </div>
        
        {/* Swinging block with crane/rope */}
        <div className="absolute" style={{ top: fullscreen ? '28%' : '25%', left: '50%', transform: 'translateX(-50%)' }}>
          {/* Rope */}
          <div className="absolute top-[-60px] left-1/2 w-0.5 h-[60px] bg-gray-700/60" style={{ transform: 'translateX(-50%)' }} />
          <div className="absolute top-[-64px] left-1/2 w-1 h-1 rounded-full bg-gray-800" style={{ transform: 'translateX(-50%)' }} />
          
          {/* Animated swinging block with 3D depth */}
          <div style={{ animation: 'swing 2.2s ease-in-out infinite', transformOrigin: 'center top' }}>
            <div className={`${fullscreen ? 'h-[22px] w-24' : 'h-[18px] w-20'} relative`}>
              {/* 3D block layers */}
              <div className="absolute inset-0 rounded-lg" style={{ 
                background: 'linear-gradient(135deg, #FFE066 0%, #FFD700 100%)',
                boxShadow: '0 4px 8px rgba(0,0,0,0.2), inset 0 -2px 4px rgba(0,0,0,0.15), inset 0 2px 4px rgba(255,255,255,0.4)'
              }} />
              {/* Top highlight */}
              <div className="absolute top-0 left-[10%] right-[10%] h-[30%] bg-gradient-to-b from-white/40 to-transparent rounded-t-lg" />
              {/* Side shadow */}
              <div className="absolute bottom-0 right-0 w-[20%] h-[40%] bg-gradient-to-l from-black/20 to-transparent rounded-br-lg" />
            </div>
          </div>
        </div>
        
        {/* Enhanced 3D stacked tower */}
        <div className={`relative z-10 flex flex-col items-center ${fullscreen ? 'mt-12' : 'mt-8'}`} style={{ animation: 'float 2.8s ease-in-out infinite' }}>
          {[
            { w: fullscreen ? 'w-24' : 'w-20', h: fullscreen ? 'h-[22px]' : 'h-[18px]', color1: '#FF6B9D', color2: '#C2185B', highlight: '#FFB3D1' },
            { w: fullscreen ? 'w-28' : 'w-24', h: fullscreen ? 'h-[22px]' : 'h-[18px]', color1: '#FF9A5C', color2: '#D84315', highlight: '#FFCAA8' },
            { w: fullscreen ? 'w-32' : 'w-28', h: fullscreen ? 'h-[22px]' : 'h-[18px]', color1: '#AED581', color2: '#558B2F', highlight: '#D4EFA7' },
            { w: fullscreen ? 'w-36' : 'w-32', h: fullscreen ? 'h-[22px]' : 'h-[18px]', color1: '#CE93D8', color2: '#7B1FA2', highlight: '#E1BEE7' },
            { w: fullscreen ? 'w-40' : 'w-36', h: fullscreen ? 'h-[24px]' : 'h-[20px]', color1: '#4FC3F7', color2: '#0277BD', highlight: '#A8E0F8' },
          ].map((block, i) => (
            <div key={i} className={`${block.w} ${block.h} relative rounded-lg overflow-hidden`} style={{ 
              marginTop: i === 0 ? '0' : '-2px',
              boxShadow: '0 4px 8px rgba(0,0,0,0.15)'
            }}>
              {/* Main gradient */}
              <div className="absolute inset-0" style={{ 
                background: `linear-gradient(135deg, ${block.color1} 0%, ${block.color2} 100%)`
              }} />
              {/* Top highlight */}
              <div className="absolute top-0 left-[8%] right-[8%] h-[35%] rounded-t-lg" style={{
                background: `linear-gradient(to bottom, ${block.highlight}40, transparent)`
              }} />
              {/* Bottom shadow */}
              <div className="absolute bottom-0 left-0 right-0 h-[25%]" style={{
                background: 'linear-gradient(to top, rgba(0,0,0,0.2), transparent)'
              }} />
              {/* Side depth */}
              <div className="absolute top-[15%] bottom-[15%] right-0 w-[15%]" style={{
                background: 'linear-gradient(to left, rgba(0,0,0,0.15), transparent)'
              }} />
              {/* Shine effect */}
              <div className="absolute top-[20%] left-[15%] w-[30%] h-[40%] rounded-full" style={{
                background: 'radial-gradient(circle, rgba(255,255,255,0.3) 0%, transparent 70%)'
              }} />
            </div>
          ))}
        </div>
        
        {/* Shadow under tower */}
        <div className={`absolute ${fullscreen ? 'bottom-[15%]' : 'bottom-[20%]'}`}>
          <div className={`${fullscreen ? 'w-48 h-4' : 'w-40 h-3'} rounded-full bg-black/10 blur-[4px]`} />
        </div>
      </div>
    )
  }
  
  return (
    <div className={`relative flex flex-col items-center justify-center overflow-hidden bg-[#302A52] ${heightClass}`}>
      <span className={fullscreen ? "text-7xl" : "text-5xl"}>🎮</span>
    </div>
  )
}

export default ArcadeHome
