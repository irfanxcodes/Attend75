/**
 * StorageCapPage — R2 cost-safety dashboard.
 * Redesigned: one glance = understand your situation.
 */
import { useCallback, useEffect, useState } from 'react'
import {
  fetchStorageCaps,
  parseAdminSession,
  resetClassAMonthly,
  resetStorageCapBlock,
  syncStorageCount,
  triggerStorageHealthCheck,
} from '../../services/adminApi'

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtBytes(b) {
  if (b == null) return '—'
  if (b >= 1_073_741_824) return (b / 1_073_741_824).toFixed(2) + ' GB'
  if (b >= 1_048_576)     return (b / 1_048_576).toFixed(1) + ' MB'
  if (b >= 1024)          return (b / 1024).toFixed(1) + ' KB'
  return b + ' B'
}

function fmtN(n) {
  if (n == null) return '—'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M'
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K'
  return n.toLocaleString()
}

function pct(used, cap) {
  if (!cap) return 0
  return Math.min(100, (used / cap) * 100)
}

// ── Colors ────────────────────────────────────────────────────────────────────

function colors(p, hit) {
  if (hit || p >= 100) return { accent: '#FF5B5B', bg: 'rgba(255,91,91,0.10)',  label: 'BLOCKED',  emoji: '🛑' }
  if (p >= 90)         return { accent: '#FF916C', bg: 'rgba(255,145,108,0.10)', label: 'URGENT',   emoji: '🚨' }
  if (p >= 75)         return { accent: '#FFD06B', bg: 'rgba(255,208,107,0.10)', label: 'WARNING',  emoji: '⚠️' }
  if (p >= 50)         return { accent: '#6CB4FF', bg: 'rgba(108,180,255,0.10)', label: 'NOTICE',   emoji: '📌' }
  return               { accent: '#4EF0A0', bg: 'rgba(78,240,160,0.08)',  label: 'SAFE',     emoji: '✓'  }
}

// ── Animated progress bar ─────────────────────────────────────────────────────

function ProgressBar({ value, accent, height = 8 }) {
  return (
    <div
      className="w-full overflow-hidden rounded-full"
      style={{ height, background: 'rgba(255,255,255,0.07)' }}
    >
      <div
        className="h-full rounded-full transition-all duration-700 ease-out"
        style={{ width: `${Math.min(100, value || 0)}%`, background: accent }}
      />
    </div>
  )
}

// ── Big stat card ─────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent = '#F4F1FF' }) {
  return (
    <div className="rounded-xl border border-white/5 bg-[#252136] p-4">
      <p className="text-[10px] uppercase tracking-widest text-[#6E6A88]">{label}</p>
      <p className="mt-1 text-2xl font-bold" style={{ color: accent }}>{value}</p>
      {sub && <p className="mt-0.5 text-[10px] text-[#6E6A88]">{sub}</p>}
    </div>
  )
}

// ── Guard card ────────────────────────────────────────────────────────────────

function GuardCard({ icon, title, used, cap, usedLabel, capLabel, remaining, remainingLabel,
                     pctVal, hit, note, children }) {
  const c = colors(pctVal, hit)
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      className="rounded-2xl border p-5 transition-all"
      style={{ background: c.bg, borderColor: hit ? c.accent + '55' : 'rgba(255,255,255,0.06)' }}
    >
      {/* Header row */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <span className="text-xl">{icon}</span>
          <div>
            <p className="text-sm font-semibold text-[#F4F1FF]">{title}</p>
            <span
              className="inline-block mt-0.5 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider"
              style={{ background: c.accent + '22', color: c.accent }}
            >
              {c.emoji} {c.label}
            </span>
          </div>
        </div>
        {/* Big percentage */}
        <p className="text-3xl font-extrabold tabular-nums shrink-0" style={{ color: c.accent }}>
          {pctVal.toFixed(1)}%
        </p>
      </div>

      {/* Progress bar */}
      <ProgressBar value={pctVal} accent={c.accent} height={10} />

      {/* Used / remaining */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-white/5 px-3 py-2 text-center">
          <p className="text-[9px] uppercase tracking-wide text-[#6E6A88]">{usedLabel || 'Used'}</p>
          <p className="mt-0.5 text-sm font-bold text-[#F4F1FF]">{used}</p>
        </div>
        <div className="rounded-lg bg-white/5 px-3 py-2 text-center">
          <p className="text-[9px] uppercase tracking-wide text-[#6E6A88]">{remainingLabel || 'Remaining'}</p>
          <p className="mt-0.5 text-sm font-bold" style={{ color: c.accent }}>{remaining}</p>
        </div>
        <div className="rounded-lg bg-white/5 px-3 py-2 text-center">
          <p className="text-[9px] uppercase tracking-wide text-[#6E6A88]">{capLabel || 'Hard Cap'}</p>
          <p className="mt-0.5 text-sm font-bold text-[#9895B5]">{cap}</p>
        </div>
      </div>

      {/* Actions */}
      {children && <div className="mt-3 flex flex-wrap gap-2">{children}</div>}

      {/* Collapsible note */}
      {note && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            className="text-[10px] text-[#6E6A88] hover:text-[#9895B5] transition-colors flex items-center gap-1"
          >
            {expanded ? '▲' : '▼'} Technical details
          </button>
          {expanded && (
            <p className="mt-1.5 text-[10px] leading-relaxed text-[#6E6A88] border-t border-white/5 pt-2">
              {note}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Action button ─────────────────────────────────────────────────────────────

function Btn({ label, onClick, danger, loading, small }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={`rounded-lg font-medium transition disabled:opacity-40 ${
        small ? 'px-2.5 py-1 text-[10px]' : 'px-3.5 py-1.5 text-[11px]'
      } ${
        danger
          ? 'border border-[#FF5B5B]/30 bg-[#FF5B5B]/10 text-[#FF5B5B] hover:bg-[#FF5B5B]/20'
          : 'border border-white/10 bg-white/5 text-[#D8D4E7] hover:bg-white/10'
      }`}
    >
      {loading ? '…' : label}
    </button>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function StorageCapPage() {
  const session = parseAdminSession()
  const token   = session?.sessionToken

  const [caps, setCaps]     = useState(null)
  const [loading, setLoad]  = useState(true)
  const [error, setError]   = useState('')
  const [busy, setBusy]     = useState('')
  const [msg, setMsg]       = useState('')

  const load = useCallback(async () => {
    if (!token) return
    setLoad(true); setError('')
    try { setCaps(await fetchStorageCaps(token)) }
    catch (e) { setError(e.message || 'Failed') }
    finally { setLoad(false) }
  }, [token])

  useEffect(() => { load() }, [load])

  async function act(key, fn) {
    setBusy(key); setMsg('')
    try { const r = await fn(); setMsg(r?.message || 'Done.'); await load() }
    catch (e) { setMsg('Error: ' + (e.message || '?')) }
    finally { setBusy('') }
  }

  if (loading) return (
    <div className="flex h-48 items-center justify-center">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#FF916C] border-t-transparent" />
    </div>
  )

  if (error) return (
    <div className="rounded-xl border border-[#FF5B5B]/30 bg-[#FF5B5B]/10 p-4 text-sm text-[#FF5B5B]">
      {error} <button onClick={load} className="ml-3 underline">Retry</button>
    </div>
  )

  if (!caps) return null

  const bytes   = caps.storage_bytes || {}
  const classA  = caps.class_a_ops   || {}
  const slides  = caps.slide_count   || {}
  const combined = caps.combined     || {}
  const allCaps = combined.all_caps  || {}

  const bPct = bytes.used_percent   || 0
  const aPct = classA.used_percent  || 0
  const sPct = slides.used_percent  || 0
  const worstPct = Math.max(bPct, aPct, sPct)
  const isBlocked = combined.hard_cap_hit
  const overallColors = colors(worstPct, isBlocked)

  const freeUsedPct = pct(bytes.reserved_bytes || 0, 10 * 1024 * 1024 * 1024) // vs actual 10 GB free tier

  return (
    <div className="space-y-5 max-w-3xl">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[#F4F1FF]">R2 Storage Safety</h2>
          <p className="mt-0.5 text-xs text-[#6E6A88]">
            Cloudflare R2 free tier monitoring — 3 guards protect your $0/month plan
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Btn label="📲 Push alert" onClick={() => act('health', () => triggerStorageHealthCheck(token))} loading={busy === 'health'} small />
          <Btn label="↻ Refresh"    onClick={load} disabled={!!busy} small />
        </div>
      </div>

      {/* ── Overall health banner ── */}
      <div
        className="rounded-2xl p-5 flex items-center gap-5"
        style={{ background: overallColors.bg, border: `1px solid ${overallColors.accent}33` }}
      >
        {/* Overall ring */}
        <div className="shrink-0 flex flex-col items-center gap-1.5">
          <svg width="72" height="72" viewBox="0 0 64 64" className="-rotate-90">
            <circle cx="32" cy="32" r="26" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="8"/>
            <circle cx="32" cy="32" r="26" fill="none"
              stroke={overallColors.accent} strokeWidth="8"
              strokeDasharray={`${2 * Math.PI * 26 * Math.min(100, worstPct) / 100} ${2 * Math.PI * 26}`}
              strokeLinecap="round"
              style={{ transition: 'stroke-dasharray 0.8s ease' }}
            />
          </svg>
          <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: overallColors.accent }}>
            {overallColors.emoji} {overallColors.label}
          </p>
        </div>

        <div className="flex-1">
          <p className="text-2xl font-extrabold tabular-nums" style={{ color: overallColors.accent }}>
            {worstPct.toFixed(1)}% <span className="text-sm font-normal text-[#9895B5]">of worst guard</span>
          </p>
          <p className="mt-1 text-[11px] text-[#9895B5]">
            {isBlocked
              ? '🛑 All slide uploads are currently BLOCKED. Raise the cap and reset below.'
              : worstPct >= 75
              ? 'Getting close — consider raising the cap soon.'
              : 'All guards are within safe limits. No action needed.'}
          </p>
          {combined.last_alert_sent_at && (
            <p className="mt-1.5 text-[10px] text-[#6E6A88]">
              Last push alert: {new Date(combined.last_alert_sent_at).toLocaleString()}
            </p>
          )}
        </div>

        {/* 4 quick stats */}
        <div className="shrink-0 grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-white/5 px-3 py-2 text-center">
            <p className="text-[9px] text-[#6E6A88] uppercase tracking-wide">Slides in R2</p>
            <p className="text-base font-bold text-[#F4F1FF]">{fmtN(slides.slides_real_db)}</p>
          </div>
          <div className="rounded-lg bg-white/5 px-3 py-2 text-center">
            <p className="text-[9px] text-[#6E6A88] uppercase tracking-wide">Storage used</p>
            <p className="text-base font-bold text-[#F4F1FF]">{fmtBytes(bytes.reserved_bytes)}</p>
          </div>
          <div className="rounded-lg bg-white/5 px-3 py-2 text-center">
            <p className="text-[9px] text-[#6E6A88] uppercase tracking-wide">Writes this mo.</p>
            <p className="text-base font-bold text-[#F4F1FF]">{fmtN(classA.reserved_ops)}</p>
          </div>
          <div className="rounded-lg bg-white/5 px-3 py-2 text-center">
            <p className="text-[9px] text-[#6E6A88] uppercase tracking-wide">Free tier used</p>
            <p className="text-base font-bold" style={{ color: overallColors.accent }}>
              {freeUsedPct.toFixed(1)}%
            </p>
          </div>
        </div>
      </div>

      {/* ── Blocked banner ── */}
      {isBlocked && (
        <div className="rounded-xl border border-[#FF5B5B]/40 bg-[#FF5B5B]/10 px-4 py-3.5 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-[#FF5B5B]">🛑 Uploads are BLOCKED</p>
            <p className="mt-0.5 text-[11px] text-[#FF5B5B]/80">
              Raise the cap in server <code className="font-mono">.env</code>, restart backend, then reset below.
            </p>
            {combined.hard_cap_hit_at && (
              <p className="mt-0.5 text-[10px] text-[#6E6A88]">Blocked since: {new Date(combined.hard_cap_hit_at).toLocaleString()}</p>
            )}
          </div>
          <Btn danger label="Reset all blocks" loading={busy === 'all'}
            onClick={() => act('all', () => resetStorageCapBlock(token, 'all'))} />
        </div>
      )}

      {/* ── Feedback message ── */}
      {msg && (
        <div className={`rounded-lg border px-3 py-2 text-[11px] ${
          msg.startsWith('Error')
            ? 'border-[#FF5B5B]/30 bg-[#FF5B5B]/10 text-[#FF5B5B]'
            : 'border-[#4EF0A0]/25 bg-[#4EF0A0]/8 text-[#4EF0A0]'
        }`}>{msg}</div>
      )}

      {/* ── Free tier comparison ── */}
      <div className="rounded-2xl border border-white/5 bg-[#1e1832] p-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-[#6E6A88] mb-3">
          Cloudflare R2 Free Tier — what you get at $0/month
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: '💾 Storage',   free: '10 GB',    cap: fmtBytes(allCaps.bytes),   used: fmtBytes(bytes.reserved_bytes),   pctVal: bPct, hit: bytes.cap_hit },
            { label: '✍️ Writes',    free: '1M / mo',  cap: fmtN(allCaps.class_a)+'/mo', used: fmtN(classA.reserved_ops)+' PUTs', pctVal: aPct, hit: classA.cap_hit },
            { label: '📖 Reads',     free: '10M / mo', cap: fmtN(allCaps.class_b)+'/mo', used: 'Via CF cache', pctVal: 0, hit: false },
            { label: '🚀 Egress',    free: '∞ Free',   cap: 'No limit',                used: 'Zero cost',       pctVal: 0, hit: false },
          ].map(({ label, free, cap, used, pctVal, hit }) => {
            const c = colors(pctVal, hit)
            return (
              <div key={label} className="rounded-xl border border-white/5 bg-[#252136] p-3">
                <p className="text-[10px] font-semibold text-[#9895B5]">{label}</p>
                <p className="text-lg font-bold text-[#4EF0A0] mt-0.5">{free}</p>
                <div className="mt-2">
                  <ProgressBar value={pctVal} accent={c.accent} height={5} />
                </div>
                <div className="mt-1.5 flex justify-between text-[9px]">
                  <span style={{ color: c.accent }}>{used}</span>
                  <span className="text-[#6E6A88]">cap {cap}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Guard 1 — Bytes ── */}
      <GuardCard
        icon="💾"
        title="Storage Bytes"
        pctVal={bPct}
        hit={bytes.cap_hit}
        used={fmtBytes(bytes.reserved_bytes)}
        remaining={fmtBytes(bytes.remaining_bytes)}
        cap={fmtBytes(bytes.hard_cap_bytes)}
        capLabel="Your cap"
        note={`PRIMARY billing guard. Tracks actual WebP bytes committed to R2 before they upload. Env var: R2_STORAGE_HARD_CAP_BYTES. R2 free tier is 10 GB; your internal cap is set at ~75% (${fmtBytes(bytes.hard_cap_bytes)}) as a safety margin.`}
      >
        {bytes.cap_hit && (
          <Btn danger label="Reset byte block" loading={busy === 'bytes'}
            onClick={() => act('bytes', () => resetStorageCapBlock(token, 'bytes'))} />
        )}
      </GuardCard>

      {/* ── Guard 2 — Writes ── */}
      <GuardCard
        icon="✍️"
        title="Writes This Month (Class A PUTs)"
        pctVal={aPct}
        hit={classA.cap_hit}
        used={fmtN(classA.reserved_ops) + ' PUTs'}
        remaining={fmtN(classA.remaining_ops) + ' left'}
        cap={fmtN(classA.hard_cap_ops) + ' / month'}
        usedLabel={classA.month ? `${classA.year}-${String(classA.month).padStart(2,'0')}` : 'This month'}
        capLabel="Monthly cap"
        note={`1 PUT per slide uploaded. R2 free tier is 1M PUTs/month; your cap is ${fmtN(classA.hard_cap_ops)}/mo. Counter auto-resets at UTC month rollover. Env var: R2_CLASS_A_HARD_CAP.`}
      >
        <div className="flex flex-wrap gap-2">
          {classA.cap_hit && (
            <Btn danger label="Reset write block" loading={busy === 'class_a'}
              onClick={() => act('class_a', () => resetStorageCapBlock(token, 'class_a'))} />
          )}
          <Btn label="Reset monthly counter" loading={busy === 'class_a_monthly'}
            onClick={() => act('class_a_monthly', () => resetClassAMonthly(token))} />
        </div>
      </GuardCard>

      {/* ── Guard 3 — Slide count ── */}
      <GuardCard
        icon="🖼️"
        title="Total Slide Count"
        pctVal={sPct}
        hit={slides.cap_hit}
        used={fmtN(slides.slides_real_db) + ' slides'}
        remaining={fmtN(slides.remaining_slides) + ' remaining'}
        cap={fmtN(slides.hard_cap_slides) + ' max'}
        usedLabel="Actual (DB)"
        capLabel="Slide cap"
        note={`Secondary guard — a simple slide count as a belt-and-suspenders check. Guard 1 (bytes) is the real billing protection. Env var: STORAGE_HARD_CAP_SLIDES. Tracked counter: ${fmtN(slides.slides_tracked)} (may drift if slides are manually deleted — use Sync to recalculate).`}
      >
        <div className="flex flex-wrap gap-2">
          {slides.cap_hit && (
            <Btn danger label="Reset slide block" loading={busy === 'slides'}
              onClick={() => act('slides', () => resetStorageCapBlock(token, 'slides'))} />
          )}
          <Btn label="Sync count from DB" loading={busy === 'sync'}
            onClick={() => act('sync', () => syncStorageCount(token))} />
        </div>
      </GuardCard>

      {/* ── Reads (Class B) — not tracked ── */}
      <div className="rounded-2xl border border-white/5 bg-[#1e1832] p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[#F4F1FF]">📖 Reads (Class B GETs) — not tracked by us</p>
            <p className="mt-2 text-[11px] leading-relaxed text-[#6E6A88] max-w-lg">
              When a student views a slide, the browser fetches it directly from the Cloudflare CDN — our backend is bypassed entirely so we can't count it.
              Every slide is served with <span className="font-mono text-[#D8D4E7]">Cache-Control: max-age=31536000</span> — after the first load
              it's cached at the CF edge, so subsequent students hit the CDN not R2. At ~500 students this is well under the 10M free reads/month.
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-white/5 px-2.5 py-0.5 text-[9px] font-bold text-[#6E6A88] uppercase tracking-wider">
            ESTIMATED
          </span>
        </div>
        <a
          href="https://dash.cloudflare.com"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-[#6CB4FF] hover:underline underline-offset-2"
        >
          Check actual reads → Cloudflare Dashboard → R2 → attend75-slides → Metrics
          <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
            <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
        </a>
      </div>

      {/* ── Alert thresholds ── */}
      <div className="rounded-2xl border border-white/5 bg-[#1e1832] p-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-[#6E6A88] mb-3">
          Push alerts sent to your device
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { pctLabel: '50%', label: 'Notice',  accent: '#6CB4FF' },
            { pctLabel: '75%', label: 'Warning', accent: '#FFD06B' },
            { pctLabel: '90%', label: 'Urgent',  accent: '#FF916C' },
            { pctLabel: '100%',label: 'Blocked', accent: '#FF5B5B' },
          ].map(({ pctLabel, label, accent }) => (
            <div key={label} className="rounded-xl p-3 text-center" style={{ background: accent + '14', border: `1px solid ${accent}30` }}>
              <p className="text-xl font-extrabold" style={{ color: accent }}>{pctLabel}</p>
              <p className="text-[11px] font-semibold mt-0.5" style={{ color: accent }}>{label}</p>
              <p className="text-[9px] text-[#6E6A88] mt-0.5">
                {pctLabel === '100%' ? 'Uploads blocked' : 'Push sent'}
              </p>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
