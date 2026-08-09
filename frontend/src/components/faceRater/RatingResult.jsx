import { useEffect, useState } from 'react'
import TierBadge from './TierBadge'
import CategoryCard from './CategoryCard'
import GlowUpTips from './GlowUpTips'

const API_BASE = import.meta.env.VITE_API_URL ?? ''

// ── Helpers ───────────────────────────────────────────────────────────────────

// ── Username generator ────────────────────────────────────────────────────────
// Generates a memorable anonymous username like "SilentFox42" stored in sessionStorage

const ADJECTIVES = ['Silent', 'Cosmic', 'Neon', 'Shadow', 'Sleek', 'Chill', 'Bold', 'Swift', 'Rare', 'Dark', 'Cool', 'Wild', 'Calm', 'Keen', 'Bright']
const NOUNS      = ['Fox', 'Wolf', 'Hawk', 'Lynx', 'Bear', 'Tiger', 'Raven', 'Drake', 'Viper', 'Shark', 'Ghost', 'Storm', 'Blaze', 'Frost', 'Pulse']

function generateUsername() {
  try {
    const k = 'attend75.faceRater.username'
    const existing = sessionStorage.getItem(k)
    if (existing) return existing
    const adj  = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]
    const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)]
    const num  = Math.floor(Math.random() * 90) + 10   // 10–99
    const name = `${adj}${noun}${num}`
    sessionStorage.setItem(k, name)
    return name
  } catch {
    return 'Anonymous'
  }
}

function generateAnonId() {
  try {
    const k = 'attend75.faceRater.anonId'
    const existing = sessionStorage.getItem(k)
    if (existing) return existing
    const id = crypto.randomUUID()
    sessionStorage.setItem(k, id)
    return id
  } catch { return crypto.randomUUID() }
}

function confidenceLabel(c) {
  if (c >= 0.75) return { text: 'High', color: 'text-emerald-400' }
  if (c >= 0.5)  return { text: 'Medium', color: 'text-amber-400' }
  return { text: 'Low', color: 'text-red-400' }
}

// Translate raw metric values into plain friendly descriptions
function symmetryReadout(v) {
  if (v >= 0.90) return 'Very symmetric'
  if (v >= 0.80) return 'Well balanced'
  if (v >= 0.70) return 'Slightly asymmetric'
  return 'Asymmetric'
}
function skinSmoothnessReadout(v) {
  if (v < 0) return '—'
  if (v >= 0.80) return 'Very smooth'
  if (v >= 0.60) return 'Mostly smooth'
  if (v >= 0.40) return 'Some texture'
  return 'Textured'
}
function skinUniformityReadout(v) {
  if (v < 0) return '—'
  if (v >= 0.75) return 'Very even tone'
  if (v >= 0.55) return 'Mostly even'
  if (v >= 0.35) return 'Slight variation'
  return 'Uneven tone'
}
function oilinessReadout(v) {
  if (v < 0) return '—'
  if (v <= 0.05) return 'Matte skin'
  if (v <= 0.15) return 'Normal'
  if (v <= 0.25) return 'Slightly oily'
  return 'Oily'
}
function canthalReadout(v) {
  if (typeof v !== 'number') return '—'
  if (v >= 5) return 'Upward tilt'
  if (v >= 1) return 'Slight upward'
  if (v >= -1) return 'Neutral'
  return 'Downward tilt'
}
function faceShapeReadout(s) {
  const map = { oval: 'Oval', square: 'Square', heart: 'Heart', oblong: 'Oblong' }
  return map[s] ?? (s ? s.charAt(0).toUpperCase() + s.slice(1) : '—')
}

function buildRows(m) {
  return [
    {
      icon: '🔀',
      label: 'Facial Symmetry',
      description: 'How balanced your left and right sides are',
      value: symmetryReadout(m.symmetryScore),
      barValue: typeof m.symmetryScore === 'number' ? m.symmetryScore : null,
    },
    {
      icon: '💎',
      label: 'Face Shape',
      description: 'Based on face width vs height and jaw proportions',
      value: faceShapeReadout(m.faceShape),
      barValue: null,
    },
    {
      icon: '👁️',
      label: 'Eye Tilt',
      description: 'Angle of your outer eye corners — upward tilt is associated with sharp eyes',
      value: canthalReadout(m.canthalTiltAngle),
      barValue: m.canthalTiltAngle != null
        ? Math.min(1, Math.max(0, (m.canthalTiltAngle + 15) / 30))
        : null,
    },
    {
      icon: '✨',
      label: 'Skin Smoothness',
      description: 'Texture of your skin based on the camera feed',
      value: skinSmoothnessReadout(m.skinSmoothnessScore),
      barValue: m.skinSmoothnessScore >= 0 ? m.skinSmoothnessScore : null,
    },
    {
      icon: '🎨',
      label: 'Skin Evenness',
      description: 'How uniform your skin tone looks',
      value: skinUniformityReadout(m.skinUniformityScore),
      barValue: m.skinUniformityScore >= 0 ? m.skinUniformityScore : null,
    },
    {
      icon: '💧',
      label: 'Skin Oiliness',
      description: 'Brightness of highlights — proxy for oiliness',
      value: oilinessReadout(m.specularHighlightRatio),
      barValue: m.specularHighlightRatio >= 0
        ? Math.max(0, 1 - m.specularHighlightRatio * 4)
        : null,
    },
  ]
}

// ── Leaderboard ───────────────────────────────────────────────────────────────

function useLeaderboard() {
  const [entries, setEntries]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [error,   setError]     = useState(null)
  const [offline, setOffline]   = useState(!navigator.onLine)

  useEffect(() => {
    if (!navigator.onLine) { setOffline(true); setLoading(false); return }
    fetch(`${API_BASE}/api/face-rater/leaderboard`)
      .then((r) => r.json())
      .then((d) => setEntries((d.data ?? []).slice(0, 10)))
      .catch(() => setError('Unable to load'))
      .finally(() => setLoading(false))
  }, [])

  return { entries, loading, error, offline }
}

function Leaderboard({ score, tier }) {
  const { entries, loading, error, offline } = useLeaderboard()

  // Persist across "Scan Again" within the same browser session
  const [submitted,  setSubmitted]  = useState(() => {
    try { return sessionStorage.getItem('attend75.faceRater.submitted') === 'true' } catch { return false }
  })
  const [myUsername, setMyUsername] = useState(() => {
    try { return sessionStorage.getItem('attend75.faceRater.username') } catch { return null }
  })
  const [submitErr,  setSubmitErr]  = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const MEDAL   = { 1: '🥇', 2: '🥈', 3: '🥉' }
  const isUpdate = submitted   // already joined — show "Update My Score"

  async function submit() {
    if (submitting) return
    setSubmitting(true)
    setSubmitErr(null)
    const username = generateUsername()
    setMyUsername(username)
    try {
      const res = await fetch(`${API_BASE}/api/face-rater/score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ anonymous_id: generateAnonId(), score, tier, username }),
      })
      if (!res.ok) throw new Error()
      setSubmitted(true)
      try {
        sessionStorage.setItem('attend75.faceRater.submitted', 'true')
        sessionStorage.setItem('attend75.faceRater.username', username)
      } catch {}
    } catch { setSubmitErr('Could not submit — try again') }
    finally { setSubmitting(false) }
  }

  if (offline) return (
    <p className="py-3 text-center text-xs text-[#9F9AB5]">Leaderboard unavailable offline</p>
  )

  return (
    <div className="space-y-3">
      {/* Status badge when already on the board */}
      {submitted && !submitting && (
        <div className="rounded-2xl bg-[#FF916C]/10 border border-[#FF916C]/20 px-4 py-2.5 text-center">
          <p className="text-xs font-bold text-[#FF916C]">
            ✓ On the leaderboard as <span className="text-[#F7F4FF]">{myUsername}</span>
          </p>
        </div>
      )}

      {/* Join / Update button */}
      <div className="flex flex-col items-center gap-1.5">
        <button
          type="button" onClick={submit} disabled={submitting}
          className="w-full rounded-full bg-[#FF916C]/15 border border-[#FF916C]/30 px-5 py-2.5 text-sm font-bold text-[#FF916C] transition-colors hover:bg-[#FF916C]/25 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FF916C]"
        >
          {submitting
            ? (isUpdate ? 'Updating…' : 'Joining…')
            : isUpdate
              ? '🔄 Update My Score'
              : '🏆 Join the Leaderboard Anonymously'}
        </button>
        {!isUpdate && (
          <p className="text-[10px] text-[#9F9AB5]">
            You'll appear as a random name — no image, no account linked
          </p>
        )}
        {submitErr && <p className="text-xs text-orange-300">{submitErr}</p>}
      </div>

      {loading && (
        <div className="space-y-1.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex animate-pulse items-center gap-3 rounded-xl bg-white/5 px-3 py-2.5">
              <div className="h-7 w-7 rounded-full bg-white/10" />
              <div className="h-3 flex-1 rounded bg-white/10" />
              <div className="h-3 w-10 rounded bg-white/10" />
            </div>
          ))}
        </div>
      )}
      {error && <p className="text-center text-xs text-[#9F9AB5]">{error}</p>}
      {!loading && !error && entries.length === 0 && (
        <p className="text-center text-xs text-[#9F9AB5]">No scores yet — be the first!</p>
      )}
      {!loading && !error && entries.length > 0 && (
        <ul className="space-y-1.5" role="list">
          {entries.map((e) => {
            const isMe = myUsername && e.username === myUsername
            return (
              <li
                key={e.rank}
                className={[
                  'flex items-center gap-3 rounded-xl px-3 py-2.5',
                  isMe ? 'bg-[#FF916C]/10 ring-1 ring-[#FF916C]/25' : 'bg-white/5',
                ].join(' ')}
              >
                <span className="w-6 shrink-0 text-center text-sm">
                  {MEDAL[e.rank] ?? <span className="text-xs font-bold text-[#9F9AB5]">{e.rank}</span>}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-[#D8D4E7]">
                  {e.username || e.anonymous_id_short + '…'}
                  {isMe && <span className="ml-1.5 text-[10px] text-[#FF916C]">(you)</span>}
                </span>
                <span className="shrink-0 text-sm font-black text-[#4EF0A0]">{e.score.toFixed(1)}</span>
                <span className="shrink-0 text-[10px] text-[#9F9AB5]">{e.tier}</span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function RatingResult({ result, onScanAgain }) {
  const { score, confidence, tier, measurements: m, tips, modelName, scoreBand } = result
  const conf  = confidenceLabel(confidence)
  const rows  = buildRows(m)

  return (
    <div className="space-y-5">

      {/* ── Score card ── */}
      <TierBadge tier={tier} score={score} />

      {/* ── Meta row ── */}
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-[#9F9AB5]">
        <span>
          Scan quality:{' '}
          <span className={`font-bold ${conf.color}`}>{conf.text}</span>
        </span>
        {scoreBand != null && scoreBand > 0 && (
          <span>
            Range:{' '}
            <span className="font-bold text-[#F7F4FF]">
              {Math.max(0, score - scoreBand).toFixed(1)}–{Math.min(10, score + scoreBand).toFixed(1)}
            </span>
          </span>
        )}
        <span className="text-[#9F9AB5]/60">{modelName}</span>
      </div>

      {/* ── Face breakdown ── */}
      <section aria-labelledby="breakdown-heading">
        <h2 id="breakdown-heading" className="mb-3 text-sm font-bold uppercase tracking-widest text-[#9F9AB5]">
          Your Face Breakdown
        </h2>
        <dl className="space-y-2">
          {rows.map((row) => (
            <CategoryCard key={row.label} {...row} />
          ))}
        </dl>
      </section>

      {/* ── Tips ── */}
      <GlowUpTips tips={tips} />

      {/* ── Leaderboard ── */}
      <section aria-labelledby="lb-heading" className="rounded-2xl bg-[#302A52]/70 p-4 ring-1 ring-white/5">
        <h2 id="lb-heading" className="mb-3 text-sm font-bold uppercase tracking-widest text-[#9F9AB5]">
          Mog Leaderboard 🏆
        </h2>
        <Leaderboard score={score} tier={tier} />
      </section>

      {/* ── Disclaimer ── */}
      <p className="text-center text-[10px] leading-relaxed text-[#9F9AB5]/50">
        Score is a heuristic based on facial symmetry and skin texture. Not a scientific measure of attractiveness. Results vary with lighting conditions.
      </p>

      {/* ── Scan Again ── */}
      <button
        type="button" onClick={onScanAgain}
        className="w-full rounded-full border border-white/15 bg-white/5 py-3.5 text-sm font-bold text-[#F7F4FF] transition-all hover:bg-white/10 active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FF916C]"
      >
        🔄 Scan Again
      </button>
    </div>
  )
}
