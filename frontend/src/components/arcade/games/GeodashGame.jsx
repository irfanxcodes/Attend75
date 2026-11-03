import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trophy } from 'lucide-react'

/**
 * GeodashGame — Geometry Dash / Geo Runner via iframe.
 * The iframe posts messages back to us; we handle game-over UI in React
 * so it matches the app style and the game stays paused until Play Again.
 */
function GeodashGame({ onGameEnd, onScoreUpdate, isActive }) {
  const navigate    = useRef(useNavigate()).current
  const iframeRef   = useRef(null)
  const endCalledRef = useRef(false)

  const [gameStatus,   setGameStatus]   = useState('idle')   // idle | playing | dead
  const [score,        setScore]        = useState(0)
  const [runCoins,     setRunCoins]     = useState(0)
  const [best,         setBest]         = useState(0)
  const [submitting,   setSubmitting]   = useState(false)
  const [subResult,    setSubResult]    = useState(null)

  const onGameEndRef     = useRef(onGameEnd)
  const onScoreUpdateRef = useRef(onScoreUpdate)
  useEffect(() => { onGameEndRef.current     = onGameEnd     }, [onGameEnd])
  useEffect(() => { onScoreUpdateRef.current = onScoreUpdate }, [onScoreUpdate])

  // Send a command to the iframe
  const sendCmd = useCallback((cmd) => {
    try { iframeRef.current?.contentWindow?.postMessage({ type: cmd }, '*') } catch {}
  }, [])

  const handleMessage = useCallback((e) => {
    if (!e.data || typeof e.data !== 'object') return
    const { type } = e.data

    if (type === 'GEODASH_PLAYING') {
      setGameStatus('playing')
      setScore(0); setRunCoins(0); setSubResult(null)
      endCalledRef.current = false
    }

    if (type === 'GEODASH_SCORE_UPDATE') {
      const s = e.data.score ?? 0
      const c = e.data.coins ?? 0
      setScore(s); setRunCoins(c)
      onScoreUpdateRef.current(s, c)
    }

    if (type === 'GEODASH_SCORE') {
      const s = e.data.score ?? 0
      const c = e.data.coins ?? 0
      setScore(s); setRunCoins(c)
      setBest(prev => Math.max(prev, s))
      setGameStatus('dead')
      if (!endCalledRef.current) {
        endCalledRef.current = true
        onGameEndRef.current(s, c)
      }
    }
  }, [])

  useEffect(() => {
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [handleMessage])

  // Restart when isActive flips back on (parent called handleRestart)
  const prevActiveRef = useRef(isActive)
  useEffect(() => {
    if (isActive && !prevActiveRef.current) {
      setBest(0); setScore(0); setRunCoins(0)
      setGameStatus('idle'); setSubResult(null)
      endCalledRef.current = false
      onScoreUpdateRef.current(0, 0)
      if (iframeRef.current) iframeRef.current.src = iframeRef.current.src
    }
    prevActiveRef.current = isActive
  }, [isActive])

  // Tell iframe to restart (Play Again from our modal)
  const handlePlayAgain = useCallback(() => {
    setGameStatus('playing')
    setScore(0); setRunCoins(0); setSubResult(null)
    endCalledRef.current = false
    sendCmd('GEODASH_RESTART')
    onScoreUpdateRef.current(0, 0)
  }, [sendCmd])

  const handleLeaderboard = useCallback(() => {
    navigate('/app/arcade/geodash?view=leaderboard')
  }, [navigate])

  return (
    <div className="absolute inset-0 bg-[#10122b]">
      {/* iframe fills full area */}
      <iframe
        ref={iframeRef}
        src="/arcade/geodash/index.html"
        title="Geo Runner"
        style={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%',
          border: 'none', display: 'block',
        }}
        allow="autoplay"
        sandbox="allow-scripts allow-same-origin"
      />

      {/* ── Game Over overlay — rendered in React, covers iframe ── */}
      {gameStatus === 'dead' && (
        <div
          className="absolute inset-0 flex items-center justify-center p-4"
          style={{ 
            background: 'rgba(0,0,0,0.85)', 
            backdropFilter: 'blur(8px)',
            animation: 'fadeIn 0.3s ease-out'
          }}
        >
          <style>{`
            @keyframes fadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            @keyframes slideUp {
              from { 
                opacity: 0;
                transform: translateY(20px);
              }
              to { 
                opacity: 1;
                transform: translateY(0);
              }
            }
            @keyframes float {
              0%, 100% { transform: translateY(0px); }
              50% { transform: translateY(-10px); }
            }
          `}</style>
          
          <div
            className="w-full max-w-lg relative"
            style={{
              animation: 'slideUp 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)'
            }}
          >
            {/* Floating emoji */}
            <div 
              className="absolute -top-8 -right-8 text-6xl"
              style={{
                animation: 'float 3s ease-in-out infinite',
                transform: 'rotate(12deg)'
              }}
            >
              😵
            </div>

            {/* Main card with yellow border */}
            <div
              className="relative p-8"
              style={{
                background: '#1a1e38',
                border: '5px solid #ffd23f',
                boxShadow: '0 24px 64px rgba(0,0,0,0.6)'
              }}
            >
              {/* Title */}
              <h2 className="text-4xl font-black text-white mb-7" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
                Game over
              </h2>

              {/* Stats row */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                {/* Score */}
                <div>
                  <div className="text-xs font-bold text-white/60 uppercase tracking-wider mb-2">SCORE</div>
                  <div className="text-5xl font-black text-white leading-none">{score}</div>
                </div>

                {/* Best */}
                <div>
                  <div className="text-xs font-bold text-white/60 uppercase tracking-wider mb-2">BEST</div>
                  <div className="text-5xl font-black text-white leading-none">{best}</div>
                </div>

                {/* Rank */}
                <div>
                  <div className="text-xs font-bold text-white/60 uppercase tracking-wider mb-2">RANK</div>
                  <div className="text-5xl font-black leading-none" style={{ color: '#ffd23f' }}>
                    {subResult ? `#${subResult.rank}` : '#217'}
                  </div>
                </div>
              </div>

              {/* Progress bar */}
              <div className="mb-7">
                <div className="relative h-2 mb-2.5" style={{ background: '#2d3250' }}>
                  <div 
                    className="absolute top-0 left-0 h-full transition-all duration-300"
                    style={{ 
                      width: `${best > 0 ? Math.min((score / best) * 100, 100) : 0}%`,
                      background: '#545d7a'
                    }}
                  />
                  {/* Current position marker (cube) */}
                  <div 
                    className="absolute transition-all duration-300"
                    style={{ 
                      left: `${best > 0 ? Math.min((score / best) * 100, 100) : 0}%`,
                      top: '50%',
                      transform: 'translate(-50%, -50%)',
                      width: '18px',
                      height: '18px',
                      background: '#ffd23f',
                      border: '2px solid #1a1e38'
                    }}
                  />
                  {/* Best position marker (flag) */}
                  <div 
                    className="absolute"
                    style={{ 
                      right: '-1px',
                      top: '50%',
                      transform: 'translateY(-50%)'
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                      <path d="M3 2V18M3 2L13 6.5L3 11V2Z" fill="white" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                </div>
                <div className="flex justify-between text-xs font-bold text-white/60 uppercase tracking-wide">
                  <span>YOU</span>
                  <span>BEST</span>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex flex-col gap-3">
                {/* Play Again */}
                <button
                  onClick={handlePlayAgain}
                  className="w-full py-4 font-black text-black transition-all duration-200 hover:brightness-110 active:scale-[0.98] uppercase"
                  style={{
                    background: '#ffd23f',
                    fontSize: 17,
                    border: 'none',
                    letterSpacing: '0.02em'
                  }}
                >
                  Play again
                </button>

                {/* Leaderboard */}
                <button
                  onClick={handleLeaderboard}
                  className="w-full py-4 flex items-center justify-center gap-2 font-bold transition-all duration-200 hover:bg-white/5 active:scale-[0.98] uppercase"
                  style={{
                    background: 'transparent',
                    border: '3px solid #ffffff',
                    color: '#ffffff',
                    fontSize: 15,
                    letterSpacing: '0.02em'
                  }}
                >
                  <Trophy size={17} strokeWidth={2.5} />
                  Leaderboard
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default GeodashGame
