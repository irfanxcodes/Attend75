import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * GeodashGame — Geometry Dash clone embedded via iframe.
 * The game runs at /arcade/geodash/index.html and communicates
 * score events back to the parent via postMessage.
 *
 * Message types received from iframe:
 *   GEODASH_PLAYING        — game started / restarted
 *   GEODASH_SCORE_UPDATE   — live score tick during play (score: number)
 *   GEODASH_SCORE          — final score on death (score: number)
 */
function GeodashGame({ onGameEnd, onScoreUpdate, isActive }) {
  const iframeRef = useRef(null)
  const [status, setStatus] = useState('idle')
  const [highScore, setHighScore] = useState(0)
  const [highCoins, setHighCoins] = useState(0)
  const onGameEndRef    = useRef(onGameEnd)
  const onScoreUpdateRef = useRef(onScoreUpdate)
  useEffect(() => { onGameEndRef.current    = onGameEnd    }, [onGameEnd])
  useEffect(() => { onScoreUpdateRef.current = onScoreUpdate }, [onScoreUpdate])

  const handleMessage = useCallback((e) => {
    if (!e.data || typeof e.data !== 'object') return

    if (e.data.type === 'GEODASH_PLAYING') {
      setStatus('playing')
    }

    if (e.data.type === 'GEODASH_SCORE_UPDATE') {
      onScoreUpdateRef.current(e.data.score, e.data.coins ?? 0)
    }

    if (e.data.type === 'GEODASH_SCORE') {
      const { score, coins = 0 } = e.data
      setStatus('dead')
      setHighScore(prev => Math.max(prev, score))
      setHighCoins(prev => Math.max(prev, coins))
      onGameEndRef.current(score, coins)
    }
  }, [])

  useEffect(() => {
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [handleMessage])

  const prevActiveRef = useRef(isActive)
  useEffect(() => {
    if (isActive && !prevActiveRef.current) {
      setHighScore(0)
      setHighCoins(0)
      setStatus('idle')
      onScoreUpdateRef.current(0, 0)
      if (iframeRef.current) {
        iframeRef.current.src = iframeRef.current.src
      }
    }
    prevActiveRef.current = isActive
  }, [isActive])

  return (
    <div className="absolute inset-0 bg-[#0a0e1a]">
      {highScore > 0 && (
        <div className="absolute top-3 right-3 z-10 rounded-full bg-[#00ff87]/20 px-3 py-1 text-xs font-bold text-[#00ff87] backdrop-blur-sm">
          Best: {highScore}
          {highCoins > 0 && <span className="ml-1.5 text-[#ffd700]">🪙{highCoins}</span>}
        </div>
      )}
      <iframe
        ref={iframeRef}
        src="/arcade/geodash/index.html"
        title="Geometry Dash"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none', display: 'block' }}
        allow="autoplay"
        sandbox="allow-scripts allow-same-origin"
      />
    </div>
  )
}

export default GeodashGame
