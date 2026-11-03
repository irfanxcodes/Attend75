import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trophy, Coins, Target, Award, TrendingUp } from 'lucide-react'

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
            background: 'rgba(6,8,24,0.85)', 
            backdropFilter: 'blur(12px)',
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
            @keyframes scaleIn {
              from { 
                opacity: 0;
                transform: scale(0.9);
              }
              to { 
                opacity: 1;
                transform: scale(1);
              }
            }
            @keyframes shimmer {
              0% { background-position: -200% center; }
              100% { background-position: 200% center; }
            }
          `}</style>
          
          <div
            className="w-full max-w-md flex flex-col gap-5"
            style={{
              animation: 'slideUp 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)'
            }}
          >
            {/* Header with gradient title */}
            <div className="text-center">
              <div 
                className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-3"
                style={{
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  boxShadow: '0 8px 32px rgba(102,126,234,0.3)',
                  animation: 'scaleIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.1s backwards'
                }}
              >
                <Trophy size={32} strokeWidth={2.5} className="text-white" />
              </div>
              <h2 
                className="text-3xl font-black tracking-tight mb-1"
                style={{
                  background: 'linear-gradient(135deg, #ffffff 0%, #a0a0ff 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  animation: 'slideUp 0.4s ease-out 0.15s backwards'
                }}
              >
                Game Over
              </h2>
              <p 
                className="text-sm text-white/50"
                style={{
                  animation: 'slideUp 0.4s ease-out 0.2s backwards'
                }}
              >
                Great run! Keep pushing your limits
              </p>
            </div>

            {/* Main card */}
            <div
              className="rounded-3xl p-6 flex flex-col gap-5"
              style={{
                background: 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)',
                border: '1px solid rgba(255,255,255,0.15)',
                boxShadow: '0 24px 64px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)',
                backdropFilter: 'blur(20px)',
                animation: 'scaleIn 0.4s ease-out 0.25s backwards'
              }}
            >
              {/* Primary score - bigger and centered */}
              <div className="text-center py-4">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <Target size={18} className="text-white/50" />
                  <span className="text-xs font-bold tracking-widest text-white/50 uppercase">
                    Your Score
                  </span>
                </div>
                <div 
                  className="text-7xl font-black leading-none mb-1"
                  style={{
                    background: 'linear-gradient(135deg, #4ade80 0%, #3b82f6 50%, #a855f7 100%)',
                    backgroundSize: '200% auto',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                    animation: 'shimmer 3s linear infinite'
                  }}
                >
                  {score}
                </div>
                {score > best && (
                  <div 
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full"
                    style={{
                      background: 'rgba(74,222,128,0.15)',
                      border: '1px solid rgba(74,222,128,0.3)'
                    }}
                  >
                    <Award size={14} className="text-green-400" />
                    <span className="text-xs font-bold text-green-400">NEW RECORD!</span>
                  </div>
                )}
              </div>

              {/* Divider */}
              <div style={{ height: 1, background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.1) 50%, transparent 100%)' }} />

              {/* Stats grid - 2 columns */}
              <div className="grid grid-cols-2 gap-3">
                {/* Best Score */}
                <div 
                  className="rounded-2xl p-4 flex flex-col gap-2"
                  style={{
                    background: 'rgba(255,145,108,0.1)',
                    border: '1px solid rgba(255,145,108,0.2)'
                  }}
                >
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-8 h-8 rounded-full flex items-center justify-center"
                      style={{ background: 'rgba(255,145,108,0.2)' }}
                    >
                      <TrendingUp size={16} className="text-[#FF916C]" />
                    </div>
                    <span className="text-xs font-bold text-white/60 uppercase tracking-wide">
                      Best
                    </span>
                  </div>
                  <span className="text-3xl font-black text-[#FF916C] leading-none">
                    {best}
                  </span>
                </div>

                {/* Coins collected */}
                <div 
                  className="rounded-2xl p-4 flex flex-col gap-2"
                  style={{
                    background: 'rgba(255,210,63,0.1)',
                    border: '1px solid rgba(255,210,63,0.2)'
                  }}
                >
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-8 h-8 rounded-full flex items-center justify-center"
                      style={{ background: 'rgba(255,210,63,0.2)' }}
                    >
                      <Coins size={16} className="text-[#ffd23f]" />
                    </div>
                    <span className="text-xs font-bold text-white/60 uppercase tracking-wide">
                      Coins
                    </span>
                  </div>
                  <span className="text-3xl font-black text-[#ffd23f] leading-none">
                    {runCoins}
                  </span>
                </div>
              </div>

              {/* Rank info */}
              {subResult && (
                <div 
                  className="rounded-2xl p-4 flex items-center justify-between"
                  style={{
                    background: 'linear-gradient(135deg, rgba(78,240,160,0.15) 0%, rgba(59,130,246,0.15) 100%)',
                    border: '1px solid rgba(78,240,160,0.25)'
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-10 h-10 rounded-full flex items-center justify-center font-black text-lg"
                      style={{
                        background: 'linear-gradient(135deg, #4EF0A0 0%, #3b82f6 100%)',
                        color: '#0a0c20'
                      }}
                    >
                      {subResult.rank}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white/50 uppercase tracking-wide">
                        Global Rank
                      </div>
                      <div className="text-sm font-semibold text-white">
                        Personal Best: <span className="font-black">{subResult.personal_best}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {submitting && (
                <div className="text-center">
                  <div 
                    className="inline-block w-5 h-5 border-3 border-white/20 border-t-white rounded-full"
                    style={{ animation: 'spin 0.8s linear infinite' }}
                  />
                  <style>{`
                    @keyframes spin {
                      to { transform: rotate(360deg); }
                    }
                  `}</style>
                  <p className="text-xs text-white/50 mt-2">Saving your score...</p>
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex flex-col gap-3">
              {/* Play Again - primary */}
              <button
                onClick={handlePlayAgain}
                className="w-full py-4 rounded-2xl font-black text-white transition-all duration-200 active:scale-[0.97] hover:shadow-2xl"
                style={{
                  background: 'linear-gradient(135deg, #FF916C 0%, #F3722C 100%)',
                  fontSize: 17,
                  boxShadow: '0 8px 32px rgba(255,145,108,0.4)',
                  letterSpacing: '0.02em'
                }}
              >
                🎮 Play Again
              </button>

              {/* Leaderboard - secondary */}
              <button
                onClick={handleLeaderboard}
                className="w-full py-4 rounded-2xl flex items-center justify-center gap-2 font-bold transition-all duration-200 active:scale-[0.97]"
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  color: 'rgba(255,255,255,0.8)',
                  fontSize: 16
                }}
              >
                <Trophy size={18} strokeWidth={2.5} />
                View Leaderboard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default GeodashGame
