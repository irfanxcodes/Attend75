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

// Desktop: Horizontal Swipe Cards
function DesktopHorizontalSwipe({ games, activeIndex, setActiveIndex, personalBests, activeLeaderboard, navigate }) {
  const stackRef = useRef(null)
  const [startX, setStartX] = useState(0)

  const handleTouchStart = (e) => {
    setStartX(e.touches[0].clientX)
  }

  const handleTouchEnd = (e) => {
    const endX = e.changedTouches[0].clientX
    const diff = startX - endX
    
    if (Math.abs(diff) > 50) {
      if (diff > 0) nextCard()
      else prevCard()
    }
  }

  const nextCard = () => setActiveIndex((activeIndex + 1) % games.length)
  const prevCard = () => setActiveIndex((activeIndex - 1 + games.length) % games.length)

  const activeGame = games[activeIndex]
  const personalBest = personalBests[activeGame.slug]

  return (
    <section className="arcade-desktop">
      <style>{desktopStyles}</style>
      
      <div className="arcade-desktop-header">
        <h1 className="arcade-desktop-title">Arcade</h1>
        <p className="arcade-desktop-subtitle">Swipe to explore games</p>
      </div>
      
      <div className="arcade-desktop-swipe" ref={stackRef} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        <div className="arcade-desktop-stack">
          {games.map((game, i) => {
            const distFromActive = i - activeIndex
            let className = 'arcade-desktop-card'
            
            if (distFromActive === 0) className += ' center'
            else if (distFromActive === -1 || (activeIndex === 0 && i === games.length - 1)) className += ' left'
            else if (distFromActive === 1 || (activeIndex === games.length - 1 && i === 0)) className += ' right'
            
            return (
              <div key={game.slug} className={className} onClick={() => distFromActive !== 0 && setActiveIndex(i)}>
                <div className="arcade-desktop-card-inner">
                  <div className={`arcade-desktop-card-visual bg-${game.slug}`}>
                    <div className="arcade-desktop-game-icon">{getGameIcon(game.slug)}</div>
                  </div>
                  <div className="arcade-desktop-card-info">
                    <h2 className="arcade-desktop-game-name">{game.title}</h2>
                    <p className="arcade-desktop-game-tagline">{game.description}</p>
                    <div className="arcade-desktop-stats">
                      <div className="arcade-desktop-stat">
                        <span className="arcade-desktop-stat-val">{personalBests[game.slug] ?? '—'}</span>
                        <span className="arcade-desktop-stat-label">Best</span>
                      </div>
                      <div className="arcade-desktop-stat">
                        <span className="arcade-desktop-stat-val">#—</span>
                        <span className="arcade-desktop-stat-label">Rank</span>
                      </div>
                      <div className="arcade-desktop-stat">
                        <span className="arcade-desktop-stat-val">{activeLeaderboard.entries[0]?.score ?? '—'}</span>
                        <span className="arcade-desktop-stat-label">Top</span>
                      </div>
                    </div>
                    <button 
                      className="arcade-desktop-play-btn"
                      onClick={(e) => {
                        e.stopPropagation()
                        navigate(`/app/arcade/${game.slug}`)
                      }}
                    >
                      Play Now
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        
        <div className="arcade-desktop-dots">
          {games.map((game, i) => (
            <div
              key={game.slug}
              className={`arcade-desktop-dot ${i === activeIndex ? 'active' : ''}`}
              onClick={() => setActiveIndex(i)}
            />
          ))}
        </div>
      </div>
      
      <div className="arcade-desktop-nav">
        <button className="arcade-desktop-nav-btn" onClick={prevCard}>‹</button>
        <button className="arcade-desktop-nav-btn primary" onClick={() => navigate(`/app/arcade/${activeGame.slug}`)}>▶</button>
        <button className="arcade-desktop-nav-btn" onClick={nextCard}>›</button>
      </div>
    </section>
  )
}

// Mobile: Vertical Feed (TikTok Style)
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
    <section className="arcade-mobile">
      <style>{mobileStyles}</style>
      
      <div className="arcade-mobile-scroll-indicator">
        {games.map((_, i) => (
          <div key={i} className={`arcade-mobile-scroll-dot ${i === activeSlide ? 'active' : ''}`} />
        ))}
      </div>
      
      <div className="arcade-mobile-feed" ref={feedRef}>
        {games.map((game, index) => {
          const leaderboard = leaderboards[game.slug] || { entries: [] }
          const personalBest = personalBests[game.slug]
          
          return (
            <div key={game.slug} className="arcade-mobile-slide" data-index={index}>
              <div className={`arcade-mobile-content bg-${game.slug}`}>
                <div className="arcade-mobile-top">
                  <h1 className="arcade-mobile-title">{game.title}</h1>
                  <p className="arcade-mobile-subtitle">{game.description}</p>
                  <div className="arcade-mobile-quick-stats">
                    <div className="arcade-mobile-quick-stat">
                      <span className="arcade-mobile-quick-icon">🏆</span>
                      <span>Best: {personalBest ?? '—'}</span>
                    </div>
                    <div className="arcade-mobile-quick-stat">
                      <span className="arcade-mobile-quick-icon">📊</span>
                      <span>Rank #—</span>
                    </div>
                  </div>
                </div>
                
                <div className="arcade-mobile-center">
                  <div className="arcade-mobile-emoji">{getGameIcon(game.slug)}</div>
                </div>
                
                <div className="arcade-mobile-bottom">
                  <div className="arcade-mobile-actions">
                    <button 
                      className="arcade-mobile-play-btn"
                      onClick={() => navigate(`/app/arcade/${game.slug}`)}
                    >
                      <span>▶</span>
                      <span>Play Now</span>
                    </button>
                    <button className="arcade-mobile-more-btn">⋮</button>
                  </div>
                  
                  <div className="arcade-mobile-leaderboard">
                    <div className="arcade-mobile-lb-header">
                      <div className="arcade-mobile-lb-title">
                        <span>🏆</span>
                        <span>Top Players</span>
                      </div>
                      <a href="#" className="arcade-mobile-lb-view-all">View All</a>
                    </div>
                    <div className="arcade-mobile-lb-top3">
                      {leaderboard.entries.slice(0, 3).map((entry, i) => (
                        <div key={entry.rank || i} className={`arcade-mobile-leader ${['first', 'second', 'third'][i]}`}>
                          <span className="arcade-mobile-leader-rank">{entry.rank}</span>
                          <div className="arcade-mobile-leader-name">{entry.username?.split(' ')[0] || 'Player'}</div>
                          <div className="arcade-mobile-leader-score">{entry.score}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

// Helper function to get game icons
function getGameIcon(slug) {
  const icons = {
    flappy: '🐦',
    pacman: '👻',
    stack: '📦',
    geodash: '🟩',
    snake: '🐍'
  }
  return icons[slug] || '🎮'
}

// Desktop Styles
const desktopStyles = `
  .arcade-desktop {
    min-height: 100vh;
    background: #0d0d0d;
    color: white;
    display: flex;
    flex-direction: column;
    padding-bottom: 24px;
  }
  
  .arcade-desktop-header {
    padding: 20px 24px 16px;
  }
  
  .arcade-desktop-title {
    font-size: 28px;
    font-weight: 800;
    margin-bottom: 4px;
  }
  
  .arcade-desktop-subtitle {
    font-size: 13px;
    color: #888;
    font-weight: 500;
  }
  
  .arcade-desktop-swipe {
    flex: 1;
    position: relative;
    padding: 20px 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .arcade-desktop-stack {
    position: relative;
    width: 100%;
    height: 520px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .arcade-desktop-card {
    position: absolute;
    width: 340px;
    height: 520px;
    transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    cursor: pointer;
  }
  
  .arcade-desktop-card.center {
    z-index: 3;
    transform: translateX(0) scale(1);
    opacity: 1;
  }
  
  .arcade-desktop-card.left {
    z-index: 2;
    transform: translateX(-50%) scale(0.9);
    opacity: 0.5;
    pointer-events: none;
  }
  
  .arcade-desktop-card.right {
    z-index: 2;
    transform: translateX(50%) scale(0.9);
    opacity: 0.5;
    pointer-events: none;
  }
  
  .arcade-desktop-card-inner {
    width: 100%;
    height: 100%;
    background: #1a1a1a;
    border-radius: 24px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    box-shadow: 0 20px 60px rgba(0,0,0,0.5);
  }
  
  .arcade-desktop-card-visual {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
  }
  
  .arcade-desktop-card-visual::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.9) 100%);
  }
  
  .bg-flappy { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
  .bg-pacman { background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); }
  .bg-stack { background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); }
  .bg-geodash { background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%); }
  .bg-snake { background: linear-gradient(135deg, #fa709a 0%, #fee140 100%); }
  
  .arcade-desktop-game-icon {
    font-size: 120px;
    position: relative;
    z-index: 1;
    filter: drop-shadow(0 10px 30px rgba(0,0,0,0.5));
  }
  
  .arcade-desktop-card-info {
    padding: 24px;
    background: #1a1a1a;
  }
  
  .arcade-desktop-game-name {
    font-size: 32px;
    font-weight: 900;
    margin-bottom: 8px;
    letter-spacing: -0.5px;
  }
  
  .arcade-desktop-game-tagline {
    font-size: 14px;
    color: #888;
    margin-bottom: 20px;
    font-weight: 500;
  }
  
  .arcade-desktop-stats {
    display: flex;
    gap: 16px;
    margin-bottom: 20px;
  }
  
  .arcade-desktop-stat {
    flex: 1;
    padding: 12px;
    background: #0d0d0d;
    border-radius: 12px;
    text-align: center;
  }
  
  .arcade-desktop-stat-val {
    font-size: 20px;
    font-weight: 800;
    display: block;
    margin-bottom: 2px;
    color: #fff;
  }
  
  .arcade-desktop-stat-label {
    font-size: 10px;
    color: #666;
    text-transform: uppercase;
    font-weight: 700;
    letter-spacing: 0.5px;
  }
  
  .arcade-desktop-play-btn {
    width: 100%;
    padding: 16px;
    border: none;
    border-radius: 16px;
    background: #fff;
    color: #000;
    font-size: 17px;
    font-weight: 800;
    cursor: pointer;
    transition: all 0.2s ease;
  }
  
  .arcade-desktop-play-btn:active {
    transform: scale(0.96);
  }
  
  .arcade-desktop-dots {
    position: absolute;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 6px;
  }
  
  .arcade-desktop-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #333;
    transition: all 0.3s ease;
    cursor: pointer;
  }
  
  .arcade-desktop-dot.active {
    width: 20px;
    border-radius: 3px;
    background: #fff;
  }
  
  .arcade-desktop-nav {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 16px;
    padding: 24px;
  }
  
  .arcade-desktop-nav-btn {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    border: none;
    background: #1a1a1a;
    color: #fff;
    font-size: 24px;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .arcade-desktop-nav-btn:active {
    transform: scale(0.9);
    background: #2a2a2a;
  }
  
  .arcade-desktop-nav-btn.primary {
    width: 64px;
    height: 64px;
    background: #fff;
    color: #000;
    font-size: 28px;
  }
`

// Mobile Styles
const mobileStyles = `
  .arcade-mobile {
    position: relative;
    height: 100vh;
    overflow: hidden;
    background: #000;
    color: white;
  }
  
  .arcade-mobile-scroll-indicator {
    position: fixed;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    flex-direction: column;
    gap: 8px;
    z-index: 10;
  }
  
  .arcade-mobile-scroll-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: rgba(255,255,255,0.3);
    transition: all 0.3s ease;
  }
  
  .arcade-mobile-scroll-dot.active {
    height: 24px;
    border-radius: 4px;
    background: #fff;
  }
  
  .arcade-mobile-feed {
    height: 100vh;
    overflow-y: scroll;
    scroll-snap-type: y mandatory;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }
  
  .arcade-mobile-feed::-webkit-scrollbar {
    display: none;
  }
  
  .arcade-mobile-slide {
    height: 100vh;
    scroll-snap-align: start;
    position: relative;
  }
  
  .arcade-mobile-content {
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 60px 24px 40px;
    position: relative;
  }
  
  .arcade-mobile-content::before {
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(circle at center, transparent 20%, rgba(0,0,0,0.7) 80%);
    z-index: 0;
  }
  
  .arcade-mobile-top,
  .arcade-mobile-center,
  .arcade-mobile-bottom {
    position: relative;
    z-index: 1;
  }
  
  .arcade-mobile-title {
    font-size: 56px;
    font-weight: 900;
    margin-bottom: 12px;
    letter-spacing: -2px;
    text-shadow: 0 4px 20px rgba(0,0,0,0.8);
  }
  
  .arcade-mobile-subtitle {
    font-size: 18px;
    color: rgba(255,255,255,0.85);
    font-weight: 600;
    text-shadow: 0 2px 10px rgba(0,0,0,0.8);
    margin-bottom: 24px;
  }
  
  .arcade-mobile-quick-stats {
    display: inline-flex;
    gap: 12px;
    padding: 12px 18px;
    background: rgba(0,0,0,0.5);
    backdrop-filter: blur(20px);
    border-radius: 16px;
    border: 1px solid rgba(255,255,255,0.1);
  }
  
  .arcade-mobile-quick-stat {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 14px;
    font-weight: 700;
  }
  
  .arcade-mobile-quick-icon {
    font-size: 16px;
  }
  
  .arcade-mobile-center {
    display: flex;
    justify-content: center;
    align-items: center;
  }
  
  .arcade-mobile-emoji {
    font-size: 180px;
    filter: drop-shadow(0 20px 50px rgba(0,0,0,0.6));
    animation: floatSlow 4s ease-in-out infinite;
  }
  
  @keyframes floatSlow {
    0%, 100% { transform: translateY(0) rotate(-2deg); }
    50% { transform: translateY(-20px) rotate(2deg); }
  }
  
  .arcade-mobile-actions {
    display: flex;
    gap: 12px;
    margin-bottom: 20px;
  }
  
  .arcade-mobile-play-btn {
    flex: 1;
    padding: 20px;
    border: none;
    border-radius: 18px;
    background: #fff;
    color: #000;
    font-size: 18px;
    font-weight: 900;
    cursor: pointer;
    transition: transform 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
  }
  
  .arcade-mobile-play-btn:active {
    transform: scale(0.95);
  }
  
  .arcade-mobile-more-btn {
    width: 64px;
    height: 64px;
    border: none;
    border-radius: 18px;
    background: rgba(255,255,255,0.15);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255,255,255,0.2);
    color: #fff;
    font-size: 24px;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .arcade-mobile-more-btn:active {
    transform: scale(0.9);
  }
  
  .arcade-mobile-leaderboard {
    background: rgba(0,0,0,0.5);
    backdrop-filter: blur(20px);
    border-radius: 20px;
    padding: 16px;
    border: 1px solid rgba(255,255,255,0.1);
  }
  
  .arcade-mobile-lb-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }
  
  .arcade-mobile-lb-title {
    font-size: 16px;
    font-weight: 800;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  
  .arcade-mobile-lb-view-all {
    font-size: 12px;
    color: rgba(255,255,255,0.6);
    text-decoration: none;
    font-weight: 700;
  }
  
  .arcade-mobile-lb-top3 {
    display: flex;
    gap: 8px;
  }
  
  .arcade-mobile-leader {
    flex: 1;
    text-align: center;
    padding: 12px 8px;
    background: rgba(255,255,255,0.05);
    border-radius: 12px;
  }
  
  .arcade-mobile-leader-rank {
    font-size: 20px;
    font-weight: 900;
    display: block;
    margin-bottom: 4px;
  }
  
  .arcade-mobile-leader-name {
    font-size: 11px;
    color: rgba(255,255,255,0.7);
    font-weight: 700;
    margin-bottom: 4px;
  }
  
  .arcade-mobile-leader-score {
    font-size: 14px;
    font-weight: 800;
    color: #fff;
  }
  
  .arcade-mobile-leader.first .arcade-mobile-leader-rank {
    color: #fbbf24;
  }
  
  .arcade-mobile-leader.second .arcade-mobile-leader-rank {
    color: #e5e7eb;
  }
  
  .arcade-mobile-leader.third .arcade-mobile-leader-rank {
    color: #fb923c;
  }
`

export default ArcadeHome
