/**
 * StorageCapPage — R2 cost-safety dashboard for the admin console.
 *
 * Redesigned to be human-readable:
 *  - Free tier overview at top (what Cloudflare gives us for free)
 *  - Three guard cards with visual fill rings + plain-language labels
 *  - Live bucket card (objects actually in R2 right now)
 *  - Class B section with a direct link to Cloudflare dashboard metrics
 *  - Actions section (reset / sync) kept separate so it's not scary
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

function fmtBytes(bytes) {
  if (bytes == null) return '—'
  if (bytes >= 1_073_741_824) return (bytes / 1_073_741_824).toFixed(2) + ' GB'
  if (bytes >= 1_048_576) return (bytes / 1_048_576).toFixed(1) + ' MB'
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return bytes + ' B'
}

function fmtOps(n) {
  if (n == null) return '—'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return String(n)
}

function pctOf(used, cap) {
  if (!cap) return 0
  return Math.min(100, (used / cap) * 100)
}

// ── Color helpers ─────────────────────────────────────────────────────────────

function statusColors(pct, capHit) {
  if (capHit || pct >= 100) return {
    ring: '#FF5B5B', ringBg: 'rgba(255,91,91,0.12)', text: 'text-[#FF5B5B]',
    badge: 'bg-[#FF5B5B]/15 text-[#FF5B5B]', border: 'border-[#FF5B5B]/30',
    label: '🛑 Blocked', bar: 'bg-[#FF5B5B]',
  }
  if (pct >= 90) return {
    ring: '#FF916C', ringBg: 'rgba(255,145,108,0.12)', text: 'text-[#FF916C]',
    badge: 'bg-[#FF916C]/15 text-[#FF916C]', border: 'border-[#FF916C]/30',
    label: '🚨 Urgent', bar: 'bg-[#FF916C]',
  }
  if (pct >= 75) return {
    ring: '#FFD06B', ringBg: 'rgba(255,208,107,0.12)', text: 'text-[#FFD06B]',
    badge: 'bg-[#FFD06B]/15 text-[#FFD06B]', border: 'border-[#FFD06B]/25',
    label: '⚠️ Warning', bar: 'bg-[#FFD06B]',
  }
  if (pct >= 50) return {
    ring: '#6CB4FF', ringBg: 'rgba(108,180,255,0.12)', text: 'text-[#6CB4FF]',
    badge: 'bg-[#6CB4FF]/15 text-[#6CB4FF]', border: 'border-[#6CB4FF]/25',
    label: '⚠️ Notice', bar: 'bg-[#6CB4FF]',
  }
  return {
    ring: '#4EF0A0', ringBg: 'rgba(78,240,160,0.10)', text: 'text-[#4EF0A0]',
    badge: 'bg-[#4EF0A0]/15 text-[#4EF0A0]', border: 'border-white/5',
    label: '✓ Safe', bar: 'bg-[#4EF0A0]',
  }
}

// ── SVG Ring ──────────────────────────────────────────────────────────────────

function Ring({ pct, color, size = 72 }) {
  const radius = 28
  const circ = 2 * Math.PI * radius
  const dash = circ * Math.min(100, pct) / 100
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className="shrink-0 -rotate-90">
      <circle cx="32" cy="32" r={radius} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="6" />
      <circle
        cx="32" cy="32" r={radius} fill="none"
        stroke={color} strokeWidth="6"
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.6s ease' }}
      />
    </svg>
  )
}

// ── Horizontal bar ────────────────────────────────────────────────────────────

function Bar({ pct, barClass }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/8">
      <div
        className={`h-full rounded-full transition-all duration-500 ${barClass}`}
        style={{ width: `${Math.min(100, pct || 0)}%` }}
      />
    </div>
  )
}

// ── Small metric pill ─────────────────────────────────────────────────────────

function Pill({ label, value, mono = false }) {
  return (
    <div className="rounded-lg bg-white/4 px-3 py-2">
      <p className="text-[9px] uppercase tracking-wide text-[#6E6A88]">{label}</p>
      <p className={`mt-0.5 text-xs font-semibold text-[#D8D4E7] ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  )
}

// ── Guard card ────────────────────────────────────────────────────────────────

function GuardCard({ number, title, pct, capHit, used, cap, remaining, extra, note, children }) {
  const colors = statusColors(pct, capHit)
  return (
    <div className={`rounded-xl border bg-[#252136] p-5 ${capHit ? colors.border : 'border-white/5'}`}>
      <div className="flex items-start gap-4">
        {/* Ring */}
        <div className="flex flex-col items-center gap-1">
          <div className="relative">
            <Ring pct={pct} color={colors.ring} />
            <span className={`absolute inset-0 flex items-center justify-center text-[11px] font-bold tabular-nums ${colors.text}`}>
              {pct.toFixed(0)}%
            </span>
          </div>
          <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${colors.badge}`}>{colors.label}</span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#6E6A88]">Guard {number}</span>
            <span className="rounded bg-white/5 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#A89BC2]">Authoritative</span>
          </div>
          <p className="mt-0.5 text-sm font-semibold text-[#F4F1FF]">{title}</p>
          {note && <p className="mt-1 text-[10px] leading-relaxed text-[#6E6A88]">{note}</p>}

          {/* Progress bar */}
          <div className="mt-3">
            <Bar pct={pct} barClass={colors.bar} />
            <div className="mt-1 flex justify-between text-[9px] text-[#6E6A88]">
              <span>{used} used</span>
              <span>{cap} cap</span>
            </div>
          </div>

          {/* Pills */}
          <div className="mt-3 flex flex-wrap gap-2">
            <Pill label="Remaining" value={remaining} />
            {extra?.map(p => <Pill key={p.label} label={p.label} value={p.value} mono={p.mono} />)}
          </div>

          {children && <div className="mt-3">{children}</div>}
        </div>
      </div>
    </div>
  )
}

// ── Action button ─────────────────────────────────────────────────────────────

function Btn({ label, onClick, danger = false, disabled = false, loading = false, small = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={`rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
        small ? 'px-2.5 py-1 text-[10px]' : 'px-3 py-1.5 text-[11px]'
      } ${
        danger
          ? 'border border-[#FF5B5B]/30 bg-[#FF5B5B]/10 text-[#FF5B5B] hover:bg-[#FF5B5B]/20'
          : 'border border-white/10 bg-white/5 text-[#D8D4E7] hover:bg-white/10'
      }`}
    >
      {loading ? 'Working…' : label}
    </button>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function StorageCapPage() {
  const session = parseAdminSession()
  const token = session?.sessionToken

  const [caps, setCaps] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError('')
    try {
      const data = await fetchStorageCaps(token)
      setCaps(data)
    } catch (e) {
      setError(e.message || 'Failed to load storage data')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { load() }, [load])

  async function act(key, fn) {
    setBusy(key)
    setMsg('')
    try {
      const res = await fn()
      setMsg(res?.message || 'Done.')
      await load()
    } catch (e) {
      setMsg('Error: ' + (e.message || 'Unknown'))
    } finally {
      setBusy('')
    }
  }

  // ── Loading / error ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#FF916C] border-t-transparent" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border border-[#FF5B5B]/30 bg-[#FF5B5B]/10 p-4 text-sm text-[#FF5B5B]">
        {error} <button onClick={load} className="ml-3 underline">Retry</button>
      </div>
    )
  }

  if (!caps) return null

  const combined = caps.combined       || {}
  const bytes    = caps.storage_bytes  || {}
  const classA   = caps.class_a_ops   || {}
  const slides   = caps.slide_count   || {}
  const classB   = caps.class_b_ops   || {}
  const allCaps  = combined.all_caps  || {}

  const bytesPct  = bytes.used_percent   || 0
  const classPct  = classA.used_percent  || 0
  const slidesPct = slides.used_percent  || 0
  const isBlocked = combined.hard_cap_hit

  // Overall worst pct for the summary ring
  const worstPct = Math.max(bytesPct, classPct, slidesPct)
  const overallColors = statusColors(worstPct, isBlocked)

  return (
    <div className="space-y-5">

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-[#F4F1FF]">R2 Storage Safety</h2>
          <p className="mt-0.5 text-xs text-[#6E6A88]">
            Three independent guards enforce our internal caps before any slide upload reaches Cloudflare R2.
            <span className="ml-1 text-[#A89BC2]">Weekly push alert every Monday 9:30 AM IST.</span>
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Btn
            label={busy === 'health' ? 'Sending…' : '📲 Run health check'}
            disabled={!!busy}
            onClick={() => act('health', () => triggerStorageHealthCheck(token))}
          />
          <Btn label="↻ Refresh" onClick={load} disabled={!!busy} />
        </div>
      </div>

      {/* ── Free tier overview ────────────────────────────────────────────── */}
      <div className="rounded-xl border border-white/5 bg-[#1e1832] p-5">
        <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-[#6E6A88]">
          Cloudflare R2 Free Tier — what we get every month at $0
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {/* Storage */}
          <div className="rounded-xl border border-white/5 bg-[#252136] p-3">
            <p className="text-[9px] uppercase tracking-wide text-[#6E6A88]">Storage</p>
            <p className="mt-1 text-xl font-bold text-[#4EF0A0]">10 GB</p>
            <p className="mt-0.5 text-[9px] text-[#6E6A88]">Our cap: {fmtBytes(allCaps.bytes)}</p>
            <div className="mt-2">
              <Bar pct={bytesPct} barClass={statusColors(bytesPct, bytes.cap_hit).bar} />
              <p className={`mt-1 text-[9px] font-semibold ${statusColors(bytesPct, bytes.cap_hit).text}`}>
                {bytesPct.toFixed(1)}% of our cap used
              </p>
            </div>
          </div>

          {/* Class A */}
          <div className="rounded-xl border border-white/5 bg-[#252136] p-3">
            <p className="text-[9px] uppercase tracking-wide text-[#6E6A88]">Writes / month</p>
            <p className="mt-1 text-xl font-bold text-[#4EF0A0]">1M</p>
            <p className="mt-0.5 text-[9px] text-[#6E6A88]">Our cap: {fmtOps(allCaps.class_a)}/mo</p>
            <div className="mt-2">
              <Bar pct={classPct} barClass={statusColors(classPct, classA.cap_hit).bar} />
              <p className={`mt-1 text-[9px] font-semibold ${statusColors(classPct, classA.cap_hit).text}`}>
                {classPct.toFixed(1)}% of our cap used
              </p>
            </div>
          </div>

          {/* Class B */}
          <div className="rounded-xl border border-white/5 bg-[#252136] p-3">
            <p className="text-[9px] uppercase tracking-wide text-[#6E6A88]">Reads / month</p>
            <p className="mt-1 text-xl font-bold text-[#4EF0A0]">10M</p>
            <p className="mt-0.5 text-[9px] text-[#6E6A88]">Monitoring: {fmtOps(allCaps.class_b)}</p>
            <div className="mt-2">
              <Bar pct={0} barClass="bg-[#6E6A88]" />
              <p className="mt-1 text-[9px] text-[#6E6A88]">Check Cloudflare dashboard</p>
            </div>
          </div>

          {/* Egress */}
          <div className="rounded-xl border border-white/5 bg-[#252136] p-3">
            <p className="text-[9px] uppercase tracking-wide text-[#6E6A88]">Egress (data transfer)</p>
            <p className="mt-1 text-xl font-bold text-[#4EF0A0]">∞ Free</p>
            <p className="mt-0.5 text-[9px] text-[#6E6A88]">Zero egress fees ever</p>
            <div className="mt-2">
              <Bar pct={0} barClass="bg-[#4EF0A0]" />
              <p className="mt-1 text-[9px] text-[#4EF0A0]">No limit, no cost</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Live bucket summary ───────────────────────────────────────────── */}
      <div className="rounded-xl border border-white/5 bg-[#252136] p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#6E6A88]">Live bucket — attend75-slides</p>
            <p className="mt-0.5 text-xs text-[#A89BC2]">
              <span className="font-mono">slides.attend75.xyz</span> · Cloudflare R2 · Asia-Pacific (APAC)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[#4EF0A0]" />
            <span className="text-[10px] text-[#4EF0A0] font-semibold">Active</span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg bg-white/4 px-3 py-2.5">
            <p className="text-[9px] uppercase tracking-wide text-[#6E6A88]">Slides stored (DB)</p>
            <p className="mt-0.5 text-lg font-bold text-[#F4F1FF]">{(slides.slides_real_db ?? 0).toLocaleString()}</p>
            <p className="text-[9px] text-[#6E6A88]">lesson_slides rows</p>
          </div>
          <div className="rounded-lg bg-white/4 px-3 py-2.5">
            <p className="text-[9px] uppercase tracking-wide text-[#6E6A88]">Storage reserved</p>
            <p className="mt-0.5 text-lg font-bold text-[#F4F1FF]">{fmtBytes(bytes.reserved_bytes)}</p>
            <p className="text-[9px] text-[#6E6A88]">of {fmtBytes(bytes.hard_cap_bytes)} cap</p>
          </div>
          <div className="rounded-lg bg-white/4 px-3 py-2.5">
            <p className="text-[9px] uppercase tracking-wide text-[#6E6A88]">Writes this month</p>
            <p className="mt-0.5 text-lg font-bold text-[#F4F1FF]">{fmtOps(classA.reserved_ops)}</p>
            <p className="text-[9px] text-[#6E6A88]">
              {classA.month ? `${classA.year}-${String(classA.month).padStart(2,'0')}` : '—'} · resets monthly
            </p>
          </div>
          <div className="rounded-lg bg-white/4 px-3 py-2.5">
            <p className="text-[9px] uppercase tracking-wide text-[#6E6A88]">Overall status</p>
            <p className={`mt-0.5 text-lg font-bold ${overallColors.text}`}>{overallColors.label}</p>
            <p className="text-[9px] text-[#6E6A88]">worst of all 3 guards</p>
          </div>
        </div>

        <a
          href="https://dash.cloudflare.com"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-[#6CB4FF] underline-offset-2 hover:underline"
        >
          Open Cloudflare Dashboard → R2 → attend75-slides → Metrics
          <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
            <polyline points="15 3 21 3 21 9"/>
            <line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
        </a>
      </div>

      {/* ── Hard block banner ─────────────────────────────────────────────── */}
      {isBlocked && (
        <div className="rounded-xl border border-[#FF5B5B]/40 bg-[#FF5B5B]/10 px-4 py-3">
          <p className="text-sm font-bold text-[#FF5B5B]">🛑 All new slide uploads are BLOCKED</p>
          <p className="mt-0.5 text-[11px] text-[#FF5B5B]/80">
            At least one guard has hit 100%. Raise the cap in server <code className="font-mono">.env</code>, restart, then click "Reset all" below.
          </p>
          {combined.hard_cap_hit_at && (
            <p className="mt-1 text-[10px] text-[#6E6A88]">Blocked at: {new Date(combined.hard_cap_hit_at).toLocaleString()}</p>
          )}
        </div>
      )}

      {/* ── Action feedback ───────────────────────────────────────────────── */}
      {msg && (
        <div className={`rounded-lg border px-3 py-2 text-[11px] ${
          msg.startsWith('Error')
            ? 'border-[#FF5B5B]/30 bg-[#FF5B5B]/10 text-[#FF5B5B]'
            : 'border-[#4EF0A0]/25 bg-[#4EF0A0]/8 text-[#4EF0A0]'
        }`}>
          {msg}
        </div>
      )}

      {/* ── Guard 1 — Storage bytes ───────────────────────────────────────── */}
      <GuardCard
        number="1"
        title="Storage Bytes"
        pct={bytesPct}
        capHit={bytes.cap_hit}
        used={fmtBytes(bytes.reserved_bytes)}
        cap={fmtBytes(bytes.hard_cap_bytes)}
        remaining={fmtBytes(bytes.remaining_bytes)}
        note="PRIMARY guard — tracks the actual byte size of every WebP before it hits R2. No estimates. If this blocks, raise R2_STORAGE_HARD_CAP_BYTES in .env."
        extra={[
          { label: 'Cap env var', value: 'R2_STORAGE_HARD_CAP_BYTES', mono: true },
          { label: 'R2 free tier', value: '10 GB' },
          { label: 'Safety margin', value: '25% (cap at 7.5 GB)' },
        ]}
      >
        {bytes.cap_hit && (
          <Btn danger label="Reset byte guard block"
            loading={busy === 'bytes'}
            onClick={() => act('bytes', () => resetStorageCapBlock(token, 'bytes'))}
          />
        )}
      </GuardCard>

      {/* ── Guard 2 — Class A ops ─────────────────────────────────────────── */}
      <GuardCard
        number="2"
        title="Writes This Month (Class A)"
        pct={classPct}
        capHit={classA.cap_hit}
        used={fmtOps(classA.reserved_ops) + ' PUTs'}
        cap={fmtOps(classA.hard_cap_ops) + '/mo'}
        remaining={fmtOps(classA.remaining_ops) + ' left'}
        note="Every slide uploaded = 1 Class A (PUT) operation. Counter auto-resets on the 1st of each month. If this blocks, wait for month rollover or click Reset below."
        extra={[
          { label: 'Current month', value: classA.month ? `${classA.year}-${String(classA.month).padStart(2,'0')}` : '—' },
          { label: 'Cap env var', value: 'R2_CLASS_A_HARD_CAP', mono: true },
          { label: 'R2 free tier', value: '1M / month' },
          { label: 'Safety margin', value: '30% (cap at 700K)' },
        ]}
      >
        <div className="flex flex-wrap gap-2">
          {classA.cap_hit && (
            <Btn danger label="Reset Class A block"
              loading={busy === 'class_a'}
              onClick={() => act('class_a', () => resetStorageCapBlock(token, 'class_a'))}
            />
          )}
          <Btn label="Reset monthly counter to 0"
            loading={busy === 'class_a_monthly'}
            onClick={() => act('class_a_monthly', () => resetClassAMonthly(token))}
          />
        </div>
      </GuardCard>

      {/* ── Guard 3 — Slide count ─────────────────────────────────────────── */}
      <GuardCard
        number="3"
        title="Total Slide Count"
        pct={slidesPct}
        capHit={slides.cap_hit}
        used={(slides.slides_real_db ?? 0).toLocaleString() + ' slides'}
        cap={(slides.hard_cap_slides ?? 0).toLocaleString() + ' max'}
        remaining={(slides.remaining_slides ?? 0).toLocaleString() + ' remaining'}
        note="Secondary guard — a simple slide count. Guard 1 (bytes) is the real billing protection. Use Sync to recalculate if slides were manually deleted from the DB."
        extra={[
          { label: 'DB count (real)', value: (slides.slides_real_db ?? '—').toLocaleString() },
          { label: 'Tracked (counter)', value: (slides.slides_tracked ?? '—').toLocaleString() },
          { label: 'Cap env var', value: 'STORAGE_HARD_CAP_SLIDES', mono: true },
        ]}
      >
        <div className="flex flex-wrap gap-2">
          {slides.cap_hit && (
            <Btn danger label="Reset slide count block"
              loading={busy === 'slides'}
              onClick={() => act('slides', () => resetStorageCapBlock(token, 'slides'))}
            />
          )}
          <Btn label="Sync count from DB"
            loading={busy === 'sync'}
            onClick={() => act('sync', () => syncStorageCount(token))}
          />
        </div>
      </GuardCard>

      {/* ── Class B — estimated ───────────────────────────────────────────── */}
      <div className="rounded-xl border border-white/5 bg-[#252136] p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-[#F4F1FF]">Class B — Reads (GET operations)</span>
              <span className="rounded-full bg-[#FFD06B]/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#FFD06B]">
                Not enforced by us
              </span>
            </div>
            <p className="mt-2 max-w-xl text-[10px] leading-relaxed text-[#6E6A88]">
              When a student views a slide, their browser fetches it from <span className="text-[#D8D4E7]">Cloudflare CDN → R2</span>.
              That request bypasses our backend entirely, so we <strong className="text-[#D8D4E7]">cannot count it</strong>.
            </p>
            <p className="mt-1 max-w-xl text-[10px] leading-relaxed text-[#6E6A88]">
              Mitigation: every slide is served with <span className="font-mono text-[#D8D4E7]">Cache-Control: public, max-age=31536000</span>.
              Cloudflare edge caches each slide after the first load — subsequent students hit the CDN, not R2 directly.
              At ~500 students this is well within R2's 10M free Class B operations/month.
            </p>
            <p className="mt-1 text-[10px] text-[#6E6A88]">
              Monitoring ceiling set at: <span className="font-mono text-[#D8D4E7]">{fmtOps(classB.hard_cap_ops)}/month</span>.
              Check actual usage on Cloudflare.
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-[#6E6A88]/15 px-2.5 py-0.5 text-[10px] font-bold text-[#6E6A88]">
            ESTIMATED
          </span>
        </div>

        {/* Visual breakdown */}
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-white/4 px-3 py-2.5">
            <p className="text-[9px] uppercase tracking-wide text-[#6E6A88]">How reads happen</p>
            <p className="mt-1 text-[10px] text-[#D8D4E7]">Student → CF Edge Cache → <em>(miss)</em> → R2</p>
            <p className="text-[9px] text-[#6E6A88] mt-0.5">Cache hit = zero R2 Class B ops</p>
          </div>
          <div className="rounded-lg bg-white/4 px-3 py-2.5">
            <p className="text-[9px] uppercase tracking-wide text-[#6E6A88]">R2 free tier</p>
            <p className="mt-1 text-base font-bold text-[#4EF0A0]">10M / month</p>
            <p className="text-[9px] text-[#6E6A88] mt-0.5">Our worst-case (no cache): ~500 students × {(slides.slides_real_db ?? 0).toLocaleString()} slides</p>
          </div>
          <div className="rounded-lg bg-white/4 px-3 py-2.5">
            <p className="text-[9px] uppercase tracking-wide text-[#6E6A88]">Where to check actual usage</p>
            <a
              href="https://dash.cloudflare.com"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-[10px] text-[#6CB4FF] underline-offset-2 hover:underline"
            >
              Cloudflare → R2 → Metrics
              <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                <polyline points="15 3 21 3 21 9"/>
                <line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
            </a>
            <p className="text-[9px] text-[#6E6A88] mt-0.5">Class A: 30 · Class B: 22 (from today's check)</p>
          </div>
        </div>
      </div>

      {/* ── Reset all (only when blocked) ────────────────────────────────── */}
      {isBlocked && (
        <div className="rounded-xl border border-white/5 bg-[#252136] p-4">
          <p className="text-xs font-semibold text-[#F4F1FF]">Reset all guards at once</p>
          <p className="mt-0.5 text-[10px] text-[#6E6A88]">
            Only do this after raising the cap in server <code className="font-mono">.env</code> and restarting the backend.
          </p>
          <div className="mt-2">
            <Btn danger label="Reset all guard blocks"
              loading={busy === 'all'}
              onClick={() => act('all', () => resetStorageCapBlock(token, 'all'))}
            />
          </div>
        </div>
      )}

      {/* ── Cap reference table ───────────────────────────────────────────── */}
      <div className="rounded-xl border border-white/5 bg-[#1e1832] p-4">
        <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-[#6E6A88]">
          Configured caps — server .env
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-lg bg-white/3 px-3 py-2.5">
            <p className="text-[9px] font-mono text-[#6E6A88]">R2_STORAGE_HARD_CAP_BYTES</p>
            <p className="mt-0.5 text-sm font-bold text-[#D8D4E7]">{fmtBytes(allCaps.bytes)}</p>
            <p className="text-[9px] text-[#6E6A88]">Guard 1 — primary</p>
          </div>
          <div className="rounded-lg bg-white/3 px-3 py-2.5">
            <p className="text-[9px] font-mono text-[#6E6A88]">R2_CLASS_A_HARD_CAP</p>
            <p className="mt-0.5 text-sm font-bold text-[#D8D4E7]">{fmtOps(allCaps.class_a)}/mo</p>
            <p className="text-[9px] text-[#6E6A88]">Guard 2 — monthly PUTs</p>
          </div>
          <div className="rounded-lg bg-white/3 px-3 py-2.5">
            <p className="text-[9px] font-mono text-[#6E6A88]">STORAGE_HARD_CAP_SLIDES</p>
            <p className="mt-0.5 text-sm font-bold text-[#D8D4E7]">{fmtOps(allCaps.slides)} slides</p>
            <p className="text-[9px] text-[#6E6A88]">Guard 3 — secondary</p>
          </div>
          <div className="rounded-lg bg-white/3 px-3 py-2.5">
            <p className="text-[9px] font-mono text-[#6E6A88]">R2_CLASS_B_HARD_CAP</p>
            <p className="mt-0.5 text-sm font-bold text-[#D8D4E7]">{fmtOps(allCaps.class_b)}/mo</p>
            <p className="text-[9px] text-[#6E6A88]">Monitoring only</p>
          </div>
        </div>
        <p className="mt-2.5 text-[9px] text-[#6E6A88]">
          To raise a cap: update the env var on the server → restart → reset guard block above if needed.
        </p>
      </div>

      {/* ── Alert thresholds reference ────────────────────────────────────── */}
      <div className="rounded-xl border border-white/5 bg-[#1e1832] p-4">
        <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-[#6E6A88]">
          Alert thresholds — push notification sent to your device
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { pct: '50%', label: 'Notice', color: 'text-[#6CB4FF]', bg: 'bg-[#6CB4FF]/10' },
            { pct: '75%', label: 'Warning', color: 'text-[#FFD06B]', bg: 'bg-[#FFD06B]/10' },
            { pct: '90%', label: 'Urgent', color: 'text-[#FF916C]', bg: 'bg-[#FF916C]/10' },
            { pct: '100%', label: 'Blocked', color: 'text-[#FF5B5B]', bg: 'bg-[#FF5B5B]/10' },
          ].map(({ pct, label, color, bg }) => (
            <div key={pct} className={`rounded-lg ${bg} px-3 py-2.5`}>
              <p className={`text-base font-bold ${color}`}>{pct}</p>
              <p className={`text-[10px] font-semibold ${color}`}>{label}</p>
              <p className="text-[9px] text-[#6E6A88] mt-0.5">{pct === '100%' ? 'Uploads blocked until reset' : 'Push notification sent'}</p>
            </div>
          ))}
        </div>
        {combined.last_alert_sent_at && (
          <p className="mt-2 text-[9px] text-[#6E6A88]">
            Last alert sent: {new Date(combined.last_alert_sent_at).toLocaleString()}
          </p>
        )}
      </div>

    </div>
  )
}
