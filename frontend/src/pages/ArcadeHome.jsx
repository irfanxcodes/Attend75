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

  return (
    <>
      {/* Back Button - Fixed at top left */}
      <button
        onClick={() => navigate('/app/dashboard')}
        className="fixed top-4 left-4 z-50 w-10 h-10 rounded-full bg-[#4A466A] hover:bg-[#5A566A] text-white flex items-center justify-center transition-all hover:scale-110 shadow-lg"
        aria-label="Back to dashboard"
      >
        <span className="text-xl">←</span>
      </button>

      {isMobile ? (
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
      )}
    </>
  )
}

// ==================== DESKTOP: Horizontal Swipe Cards ====================
function DesktopHorizontalSwipe({ games, activeIndex, setActiveIndex, personalBests, activeLeaderboard, navigate }) {
  const nextCard = () => setActiveIndex((activeIndex + 1) % games.length)
  const prevCard = () => setActiveIndex((activeIndex - 1 + games.length) % games.length)

  const activeGame = games[activeIndex]
  const personalBest = personalBests[activeGame.slug]

  return (
    <section className="min-h-screen flex flex-col px-6 py-6 pb-24 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-extrabold text-[#F7F4FF] tracking-tight">Arcade</h1>
        <p className="text-sm text-[#9F9AB5] mt-1">Swipe through games</p>
      </div>
      
      {/* Card Display Area */}
      <div className="flex-1 flex items-center justify-center relative">
        <div className="relative w-full max-w-lg">
          {/* Card Stack */}
          <div className="relative h-[480px] flex items-center justify-center">
            {games.map((game, i) => {
              const distFromActive = i - activeIndex
              let className = 'absolute inset-0 transition-all duration-500 ease-out'
              let transform = ''
              let opacity = 0
              let zIndex = 0
              let pointerEvents = 'none'
              
              if (distFromActive === 0) {
                // Center active card
                transform = 'translateX(0) scale(1) rotateY(0deg)'
                opacity = 1
                zIndex = 30
                pointerEvents = 'auto'
              } else if (distFromActive === -1 || (activeIndex === 0 && i === games.length - 1)) {
                // Left card
                transform = 'translateX(-120%) scale(0.85) rotateY(25deg)'
                opacity = 0.4
                zIndex = 20
                pointerEvents = 'auto'
              } else if (distFromActive === 1 || (activeIndex === games.length - 1 && i === 0)) {
                // Right card
                transform = 'translateX(120%) scale(0.85) rotateY(-25deg)'
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
                    transformStyle: 'preserve-3d',
                  }}
                  onClick={() => distFromActive !== 0 && setActiveIndex(i)}
                >
                  <DesktopGameCard 
                    game={game} 
                    personalBest={personalBests[game.slug]} 
                    navigate={navigate}
                    isActive={distFromActive === 0}
                  />
                </div>
              )
            })}
          </div>
          
          {/* Navigation Buttons */}
          <button
            onClick={prevCard}
            className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-16 w-12 h-12 rounded-full bg-[#4A466A] hover:bg-[#5A566A] text-white flex items-center justify-center transition-all hover:scale-110 shadow-lg"
          >
            <span className="text-2xl">‹</span>
          </button>
          <button
            onClick={nextCard}
            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-16 w-12 h-12 rounded-full bg-[#4A466A] hover:bg-[#5A566A] text-white flex items-center justify-center transition-all hover:scale-110 shadow-lg"
          >
            <span className="text-2xl">›</span>
          </button>
          
          {/* Dot Indicators */}
          <div className="flex justify-center gap-2 mt-6">
            {games.map((game, i) => (
              <button
                key={game.slug}
                onClick={() => setActiveIndex(i)}
                className={`h-2 rounded-full transition-all duration-300 ${
                  i === activeIndex 
                    ? 'w-8 bg-[#FF916C]' 
                    : 'w-2 bg-white/30 hover:bg-white/50'
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Leaderboard */}
      <div className="max-w-lg mx-auto w-full">
        <DesktopLeaderboard 
          game={activeGame} 
          leaderboard={activeLeaderboard}
        />
      </div>
    </section>
  )
}

function DesktopGameCard({ game, personalBest, navigate, isActive }) {
  return (
    <div className="h-full rounded-3xl overflow-hidden bg-[#4A466A] shadow-2xl ring-1 ring-white/10">
      {/* Game Visual */}
      <div className="h-64 relative">
        <GameVisual game={game} personalBest={personalBest} />
      </div>
      
      {/* Card Info */}
      <div className="p-6 space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#9F9AB5] mb-1">
            {game.slug === 'flappy' ? "This week's game" : 'Classic arcade'}
          </p>
          <h2 className="text-2xl font-bold text-[#F7F4FF]">{game.title}</h2>
          <p className="text-sm text-[#9F9AB5] mt-1">{game.description}</p>
        </div>
        
        {personalBest && (
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#4EF0A0]/10">
            <span className="text-xs font-semibold text-[#4EF0A0]">Your Best: {personalBest}</span>
          </div>
        )}
        
        <button
          onClick={() => navigate(`/app/arcade/${game.slug}`)}
          className="w-full py-3.5 rounded-full font-bold text-[#1C2030] transition-all hover:scale-105 active:scale-95 shadow-lg"
          style={{ background: 'linear-gradient(135deg, #B8F77D 0%, #7BE056 100%)' }}
        >
          Play Now
        </button>
      </div>
    </div>
  )
}

function DesktopLeaderboard({ game, leaderboard }) {
  return (
    <div className="rounded-2xl bg-[#4A466A] ring-1 ring-white/5 overflow-hidden">
      <div className="px-5 py-4 border-b border-white/10">
        <h3 className="text-lg font-bold text-[#F7F4FF]">Top Players — {game.title}</h3>
      </div>
      <div className="p-4">
        {leaderboard.entries.length === 0 ? (
          <div className="text-center py-8 text-[#9F9AB5] text-sm">
            No scores yet. Be the first!
          </div>
        ) : (
          <div className="space-y-2">
            {leaderboard.entries.slice(0, 5).map((entry) => (
              <div key={entry.rank} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[#3E3A5C]/50">
                <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-sm font-bold text-[#F7F4FF]">
                  {entry.rank}
                </div>
                <span className="flex-1 text-sm font-medium text-[#F7F4FF] truncate">
                  {entry.username?.split(' ')[0] || 'Anonymous'}
                </span>
                <span className="text-sm font-bold text-[#4EF0A0]">{entry.score}</span>
              </div>
            ))}
          </div>
        )}
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
  return (
    <div className="h-full flex flex-col relative overflow-hidden">
      {/* Game Visual Background */}
      <div className="absolute inset-0">
        <GameVisual game={game} personalBest={personalBest} fullscreen />
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/30 to-black/90" />
      </div>
      
      {/* Content */}
      <div className="relative z-10 flex-1 flex flex-col justify-between p-6 pt-16 pb-24">
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
        
        {/* Bottom: Action & Leaderboard Preview */}
        <div className="space-y-4">
          {/* Play Button */}
          <button
            onClick={() => navigate(`/app/arcade/${game.slug}`)}
            className="w-full py-4 rounded-2xl font-bold text-lg text-[#1C2030] shadow-xl transition-transform active:scale-95"
            style={{ background: 'linear-gradient(135deg, #B8F77D 0%, #7BE056 100%)' }}
          >
            ▶ Play Now
          </button>
          
          {/* Mini Leaderboard */}
          {leaderboard.entries.length > 0 && (
            <div className="rounded-2xl bg-black/40 backdrop-blur-md p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-bold text-white">🏆 Top Players</span>
                <span className="text-xs text-white/60">Swipe for more →</span>
              </div>
              <div className="space-y-2">
                {leaderboard.entries.slice(0, 3).map((entry, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <span className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold text-white">
                      {entry.rank}
                    </span>
                    <span className="flex-1 text-white/90 truncate">
                      {entry.username?.split(' ')[0] || 'Anonymous'}
                    </span>
                    <span className="font-bold text-[#4EF0A0]">{entry.score}</span>
                  </div>
                ))}
              </div>
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
        <div className="absolute left-[5%] top-[15%] h-7 w-20 rounded-full bg-white/60" />
        <div className="absolute right-[10%] top-[10%] h-6 w-14 rounded-full bg-white/50" />
        <div className="absolute bottom-0 left-[20%] flex flex-col items-center">
          <div className="h-16 w-11 rounded-t-md bg-[#4EC04E] ring-1 ring-[#3A9A3A]/50" />
          <div className="h-2.5 w-14 rounded-sm bg-[#3A9A3A]" />
        </div>
        {!fullscreen && (
          <div className="relative z-10">
            <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
              <rect x="9" y="11" width="42" height="42" rx="12" fill="#FF916C" />
              <circle cx="38" cy="28" r="9" fill="white" />
              <circle cx="40" cy="28" r="5" fill="#1D183E" />
            </svg>
          </div>
        )}
      </div>
    )
  }
  
  if (game.slug === 'pacman') {
    return (
      <div className={`relative flex flex-col items-center justify-center overflow-hidden bg-black ${heightClass}`}>
        <div className="absolute inset-0 opacity-20">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="absolute h-0.5 bg-[#2121DE]" style={{ top: `${12 + i * 12}%`, left: '8%', right: '8%' }} />
          ))}
        </div>
        {!fullscreen && (
          <svg width="70" height="70" viewBox="0 0 64 64" fill="none">
            <path d="M32 4 C50 4 60 18 60 32 C60 46 50 60 32 60 C14 60 4 46 4 32 C4 18 14 4 32 4 Z" fill="#FFFF00" />
            <path d="M32 32 L58 18 L58 46 Z" fill="#000" />
            <circle cx="30" cy="18" r="4" fill="#000" />
          </svg>
        )}
      </div>
    )
  }
  
  if (game.slug === 'snake') {
    return (
      <div className={`relative flex flex-col items-center justify-center overflow-hidden bg-[#1A1A2E] ${heightClass}`}>
        <div className="absolute inset-0 opacity-10">
          {[...Array(10)].map((_, i) => (
            <div key={'h'+i} className="absolute h-px bg-[#4EF0A0]" style={{ top: `${10 + i * 9}%`, left: '5%', right: '5%' }} />
          ))}
        </div>
      </div>
    )
  }
  
  if (game.slug === 'geodash') {
    return (
      <div className={`relative flex flex-col items-center justify-center overflow-hidden bg-[#0a1628] ${heightClass}`}>
        <div className="absolute bottom-0 left-0 right-0 h-10 bg-[#1a4a7a]" />
        {!fullscreen && (
          <div className="relative z-10">
            <div className="h-8 w-8 rounded-sm bg-[#00ff87] shadow-[0_0_12px_rgba(0,255,135,0.5)]" />
          </div>
        )}
      </div>
    )
  }
  
  if (game.slug === 'stack') {
    return (
      <div className={`relative flex flex-col items-center justify-end overflow-hidden ${heightClass}`} style={{ background: 'linear-gradient(180deg, #7EC8E3 0%, #B8E8F8 50%, #E8F4FD 100%)' }}>
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-[10%] left-[5%] h-11 w-26 rounded-full bg-white/70 blur-[2px]" />
          <div className="absolute top-[8%] right-[8%] h-10 w-22 rounded-full bg-white/60 blur-[2px]" />
        </div>
      </div>
    )
  }
  
  return (
    <div className={`relative flex flex-col items-center justify-center overflow-hidden bg-[#302A52] ${heightClass}`}>
      <span className="text-5xl">🎮</span>
    </div>
  )
}

export default ArcadeHome
