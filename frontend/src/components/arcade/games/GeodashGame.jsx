import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trophy } from 'lucide-react'

function GeodashGame({ onGameEnd, onScoreUpdate, isActive }) {
  const navigate     = useNavigate()
  const iframeRef    = useRef(null)
  const endCalledRef = useRef(false)

  const [gameStatus, setGameStatus] = useState('idle')
  const [score,      setScore]      = useState(0)
  const [runCoins,   setRunCoins]   = useState(0)
  const [pct,        setPct]        = useState(0)
  const [best,       setBest]       = useState(0)
  const [curLevel,   setCurLevel]   = useState(1)    // 1-4
  const [curLabel,   setCurLabel]   = useState('Easy')
  const [subResult,  setSubResult]  = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const onGameEndRef     = useRef(onGameEnd)
  const onScoreUpdateRef = useRef(onScoreUpdate)
  useEffect(() => { onGameEndRef.current     = onGameEnd     }, [onGameEnd])
  useEffect(() => { onScoreUpdateRef.current = onScoreUpdate }, [onScoreUpdate])

  const sendCmd = useCallback((type, extra = {}) => {
    try { iframeRef.current?.contentWindow?.postMessage({ type, ...extra }, '*') } catch {}
  }, [])

  const handleMessage = useCallback((e) => {
    if (!e.data || typeof e.data !== 'object') return
    const { type } = e.data

    if (type === 'GEODASH_PLAYING') {
      setGameStatus('playing')
      setScore(0); setRunCoins(0); setPct(0); setSubResult(null)
      endCalledRef.current = false
      if (e.data.level) setCurLevel(e.data.level)
      if (e.data.label) setCurLabel(e.data.label)
    }

    if (type === 'GEODASH_SCORE_UPDATE') {
      const s = e.data.score ?? 0
      setScore(s); setRunCoins(e.data.coins ?? 0); setPct(e.data.pct ?? 0)
      onScoreUpdateRef.current(s, e.data.coins ?? 0)
    }

    if (type === 'GEODASH_SCORE') {
      const s     = e.data.score  ?? 0
      const c     = e.data.coins  ?? 0
      const p     = e.data.pct    ?? 0
      const lvl   = e.data.level  ?? curLevel
      const lbl   = e.data.label  ?? curLabel
      setScore(s); setRunCoins(c); setPct(p)
      setCurLevel(lvl); setCurLabel(lbl)
      setBest(prev => Math.max(prev, s))
      setGameStatus(e.data.win ? 'win' : 'dead')
      if (!endCalledRef.current) {
        endCalledRef.current = true
        onGameEndRef.current(s, c)
      }
    }
  }, [curLevel, curLabel])

  useEffect(() => {
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [handleMessage])

  const prevActiveRef = useRef(isActive)
  useEffect(() => {
    if (isActive && !prevActiveRef.current) {
      setBest(0); setScore(0); setRunCoins(0); setPct(0)
      setGameStatus('idle'); setSubResult(null)
      endCalledRef.current = false
      onScoreUpdateRef.current(0, 0)
      if (iframeRef.current) iframeRef.current.src = iframeRef.current.src
    }
    prevActiveRef.current = isActive
  }, [isActive])

  const handlePlayAgain = useCallback(() => {
    setGameStatus('playing')
    setScore(0); setRunCoins(0); setPct(0); setSubResult(null)
    endCalledRef.current = false
    sendCmd('GEODASH_RESTART')
    onScoreUpdateRef.current(0, 0)
  }, [sendCmd])

  const handleLeaderboard = useCallback(() => {
    navigate('/app/arcade/geodash?view=leaderboard')
  }, [navigate])

  // Level badge colours
  const levelColors = ['#2338d6','#8b1a1a','#0a2a4a','#1a0a2a']
  const lvlColor = levelColors[(curLevel - 1) % 4]

  return (
    <div className="absolute inset-0" style={{ background: '#10122b' }}>
      <iframe
        ref={iframeRef}
        src="/arcade/geodash/index.html"
        title="Geo Runner"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none', display: 'block' }}
        allow="autoplay"
        sandbox="allow-scripts allow-same-origin"
      />

      {/* ── Game Over / Win overlay ── */}
      {(gameStatus === 'dead' || gameStatus === 'win') && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ background: 'rgba(10,12,32,0.72)', backdropFilter: 'blur(6px)' }}
        >
          <div
            className="w-[88%] max-w-sm rounded-2xl p-6 flex flex-col gap-4"
            style={{
              background: '#1b1d3a',
              border: '1px solid rgba(255,255,255,0.1)',
              boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
            }}
          >
            {/* Level badge */}
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ background: lvlColor, boxShadow: `0 0 8px ${lvlColor}` }}
              />
              <span className="text-xs font-bold tracking-widest uppercase text-white/50">
                Level {curLevel} · {curLabel}
              </span>
            </div>

            {/* Title */}
            <h2 className="text-center text-xl font-bold text-white tracking-wide -mt-1">
              {gameStatus === 'win' ? '🎉 Level Complete!' : 'Game Over'}
            </h2>

            {/* Stats */}
            <div className="flex justify-between items-end">
              <div className="flex flex-col items-start">
                <span className="text-[11px] font-bold tracking-widest text-white/40 uppercase mb-0.5">Score</span>
                <span className="text-4xl font-black text-white leading-none">{score}</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-[11px] font-bold tracking-widest text-white/40 uppercase mb-0.5">Best</span>
                <span className="text-4xl font-black leading-none" style={{ color: '#FF916C' }}>{best}</span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-[11px] font-bold tracking-widest text-white/40 uppercase mb-0.5">Progress</span>
                <span className="text-4xl font-black leading-none" style={{ color: '#ffd23f' }}>{pct}%</span>
              </div>
            </div>

            {/* Coins row */}
            {runCoins > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
                style={{ background: 'rgba(255,215,0,0.08)', border: '1px solid rgba(255,215,0,0.15)' }}>
                <div className="w-4 h-4 rounded-full" style={{ background: '#ffd23f', border: '2px solid #10122b', outline: '2px solid #f3efe6' }} />
                <span className="text-sm font-bold text-white">{runCoins} coins collected</span>
                <span className="text-xs text-white/40 ml-auto">+{runCoins * 50} pts</span>
              </div>
            )}

            {/* Score breakdown */}
            <div className="text-xs text-white/30 -mt-1">
              {pct}% × 100{runCoins > 0 ? ` + ${runCoins} coins × 50` : ''}{gameStatus === 'win' ? ' + completion bonus' : ''}
            </div>

            {/* Submission result */}
            {subResult && (
              <div className="rounded-xl px-4 py-2.5 text-center"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <span className="text-sm text-white/60">Rank </span>
                <span className="text-sm font-black" style={{ color: '#4EF0A0' }}>#{subResult.rank}</span>
                <span className="text-sm text-white/40 mx-2">·</span>
                <span className="text-sm text-white/60">PB </span>
                <span className="text-sm font-black text-white">{subResult.personal_best}</span>
              </div>
            )}
            {submitting && <p className="text-center text-xs text-white/40">Saving score…</p>}

            {/* Play Again */}
            <button
              onClick={handlePlayAgain}
              className="w-full py-4 rounded-full font-black text-white transition-transform active:scale-[0.97]"
              style={{
                background: 'linear-gradient(135deg, #FF916C 0%, #e06040 100%)',
                fontSize: 17,
                boxShadow: '0 4px 16px rgba(255,100,60,0.35)',
              }}
            >
              Play Again
            </button>

            {/* Leaderboard */}
            <button
              onClick={handleLeaderboard}
              className="w-full py-3 rounded-full flex items-center justify-center gap-2 font-semibold transition-transform active:scale-[0.97]"
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.12)',
                color: 'rgba(255,255,255,0.65)',
                fontSize: 15,
              }}
            >
              <Trophy size={15} />
              Leaderboard
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default GeodashGame
