/**
 * StudyMe Analytics Admin Page
 * Shows: uploads, subjects, slide feedback, failures, LLM usage, chain status
 */
import { useCallback, useEffect, useState } from 'react'
import { fetchStudyMeAdminAnalytics, parseAdminSession } from '../../services/adminApi'

// ── Helpers ───────────────────────────────────────────────────────────────────

function pct(n, total) {
  if (!total) return 0
  return Math.min(100, Math.round((n / total) * 100))
}

function Bar({ value, max, color = '#FF916C', height = 6 }) {
  const p = max ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="w-full rounded-full overflow-hidden" style={{ height, background: 'rgba(255,255,255,0.07)' }}>
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${p}%`, background: color }} />
    </div>
  )
}

function Stat({ label, value, sub, accent = '#F4F1FF', small }) {
  return (
    <div className="rounded-xl border border-white/5 bg-[#252136] p-3.5">
      <p className="text-[10px] uppercase tracking-widest text-[#6E6A88]">{label}</p>
      <p className={`mt-0.5 font-bold ${small ? 'text-lg' : 'text-2xl'}`} style={{ color: accent }}>{value}</p>
      {sub && <p className="mt-0.5 text-[10px] text-[#6E6A88]">{sub}</p>}
    </div>
  )
}

function SectionHeader({ title, sub }) {
  return (
    <div className="mb-3">
      <h3 className="text-sm font-bold text-[#F4F1FF]">{title}</h3>
      {sub && <p className="text-[11px] text-[#6E6A88] mt-0.5">{sub}</p>}
    </div>
  )
}

function Card({ children, className = '' }) {
  return (
    <div className={`rounded-2xl border border-white/5 bg-[#252136] p-4 ${className}`}>
      {children}
    </div>
  )
}

// ── Status pill ───────────────────────────────────────────────────────────────

const STATUS_COLORS = {
  healthy:   { bg: 'bg-[#4EF0A0]/10', text: 'text-[#4EF0A0]', label: '✓ Healthy' },
  exhausted: { bg: 'bg-[#FF5B5B]/10', text: 'text-[#FF5B5B]', label: '✗ Exhausted' },
  no_key:    { bg: 'bg-white/5',       text: 'text-[#6E6A88]', label: '— No key' },
}

function StatusPill({ status }) {
  const c = STATUS_COLORS[status] || STATUS_COLORS.no_key
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function StudyMeAnalyticsPage() {
  const session = parseAdminSession()
  const token   = session?.sessionToken

  const [data, setData]     = useState(null)
  const [loading, setLoad]  = useState(true)
  const [error, setError]   = useState('')

  const load = useCallback(async () => {
    if (!token) return
    setLoad(true); setError('')
    try { setData(await fetchStudyMeAdminAnalytics(token)) }
    catch (e) { setError(e.message || 'Failed to load') }
    finally { setLoad(false) }
  }, [token])

  useEffect(() => { load() }, [load])

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

  if (!data) return null

  const { uploads, slide_feedback: sf, llm } = data
  const chapters = uploads?.chapters || {}
  const handouts = uploads?.handouts || {}
  const failures = uploads?.recent_failures || []
  const byProg   = uploads?.subjects_by_program || {}
  const status   = chapters.status_breakdown || {}

  const totalUploads = (handouts.total || 0) + (chapters.total || 0) + (chapters.notes || 0)

  return (
    <div className="space-y-6 max-w-4xl">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[#F4F1FF]">StudyMe Analytics</h2>
          <p className="mt-0.5 text-xs text-[#6E6A88]">Uploads · Subjects · Slide feedback · Failures · LLM usage</p>
        </div>
        <button onClick={load}
          className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] text-[#D8D4E7] hover:bg-white/10 transition">
          ↻ Refresh
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 1 — Upload counts
      ══════════════════════════════════════════════════════════════════ */}
      <div>
        <SectionHeader title="1 · Upload Counts" sub="Course handouts, chapter lessons, and notes uploads" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <Stat label="Total uploads"       value={totalUploads}          accent="#FF916C" />
          <Stat label="Handouts (syllabus)" value={handouts.total || 0}   accent="#4EF0A0"
                sub={`${handouts.ready || 0} ready · ${handouts.failed || 0} failed`} />
          <Stat label="Chapter lessons"     value={chapters.total || 0}   accent="#6CB4FF"
                sub={`${(status.ready||0)+(status.ready_low_coverage||0)} ready`} />
          <Stat label="Notes Solver"        value={chapters.notes || 0}   accent="#A78BFA" />
        </div>

        {/* Status breakdown bar */}
        <Card>
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#6E6A88] mb-3">Chapter upload pipeline status</p>
          <div className="space-y-2">
            {[
              { key: 'ready',              label: 'Ready',            color: '#4EF0A0' },
              { key: 'ready_low_coverage', label: 'Ready (low cov.)', color: '#FFD06B' },
              { key: 'processing',         label: 'Processing',       color: '#6CB4FF' },
              { key: 'pending',            label: 'Pending',          color: '#9895B5' },
              { key: 'failed',             label: 'Failed',           color: '#FF5B5B' },
            ].map(({ key, label, color }) => {
              const n = status[key] || 0
              const total = chapters.total + chapters.notes || 1
              return (
                <div key={key} className="flex items-center gap-3">
                  <span className="w-28 shrink-0 text-[11px] text-[#9895B5]">{label}</span>
                  <div className="flex-1"><Bar value={n} max={total} color={color} /></div>
                  <span className="w-10 text-right text-[11px] font-bold" style={{ color }}>{n}</span>
                </div>
              )
            })}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span className="text-[11px] text-[#6E6A88]">Failure rate:</span>
            <span className="text-sm font-bold" style={{ color: (chapters.failure_rate_pct || 0) > 20 ? '#FF5B5B' : '#4EF0A0' }}>
              {chapters.failure_rate_pct || 0}%
            </span>
          </div>
        </Card>

        {/* By program */}
        {Object.keys(chapters.by_program || {}).length > 0 && (
          <Card className="mt-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#6E6A88] mb-3">Chapter uploads by program</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(chapters.by_program).sort((a,b) => b[1]-a[1]).map(([prog, cnt]) => (
                <div key={prog} className="rounded-lg bg-white/5 px-3 py-1.5 flex items-center gap-2">
                  <span className="text-[12px] font-semibold text-[#F4F1FF]">{prog}</span>
                  <span className="text-[11px] text-[#FF916C] font-bold">{cnt}</span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 2 — Subject inventory
      ══════════════════════════════════════════════════════════════════ */}
      <div>
        <SectionHeader title="2 · Subjects by Program & Semester" sub="Which subjects have uploads, and from which cohort" />
        {Object.keys(byProg).length === 0 ? (
          <Card><p className="text-[12px] text-[#6E6A88]">No program/semester data yet.</p></Card>
        ) : (
          <div className="space-y-3">
            {Object.entries(byProg).map(([prog, semesters]) => (
              <Card key={prog}>
                <p className="text-sm font-bold text-[#F4F1FF] mb-3">{prog}</p>
                <div className="space-y-3">
                  {Object.entries(semesters).sort().map(([sem, subjects]) => (
                    <div key={sem}>
                      <p className="text-[10px] uppercase tracking-widest text-[#6E6A88] mb-1.5">{sem}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {subjects.map(s => (
                          <span key={s.subject}
                            className="rounded-full bg-[#FF916C]/10 border border-[#FF916C]/20 px-2.5 py-1 text-[11px] font-medium text-[#FF916C]">
                            {s.subject}
                            <span className="ml-1.5 text-[#9895B5]">{s.uploads}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 3 — Slide feedback
      ══════════════════════════════════════════════════════════════════ */}
      <div>
        <SectionHeader title="3 · Slide Script Feedback" sub="Student thumbs up/down on AI teaching scripts" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
          <Stat label="Total ratings"   value={sf?.total || 0} />
          <Stat label="👍 Thumbs up"    value={sf?.thumbs_up || 0}   accent="#4EF0A0" />
          <Stat label="👎 Thumbs down"  value={sf?.thumbs_down || 0} accent="#FF5B5B" />
          <Stat label="Positive rate"
            value={`${sf?.positive_rate_pct || 0}%`}
            accent={(sf?.positive_rate_pct || 0) >= 70 ? '#4EF0A0' : '#FF916C'} />
        </div>

        {sf?.total > 0 && (
          <div className="grid sm:grid-cols-2 gap-3">
            {/* Reason breakdown */}
            {Object.keys(sf.reason_breakdown || {}).length > 0 && (
              <Card>
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#6E6A88] mb-3">Negative feedback reasons</p>
                <div className="space-y-2">
                  {Object.entries(sf.reason_breakdown).map(([reason, cnt]) => (
                    <div key={reason} className="flex items-center gap-2">
                      <span className="flex-1 text-[12px] text-[#9895B5] capitalize">{reason.replace(/_/g,' ')}</span>
                      <Bar value={cnt} max={sf.thumbs_down} color="#FF5B5B" height={5} />
                      <span className="w-6 text-right text-[11px] font-bold text-[#FF5B5B]">{cnt}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Worst uploads */}
            {sf.worst_uploads?.length > 0 && (
              <Card>
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#6E6A88] mb-3">Most disliked uploads</p>
                <div className="space-y-2">
                  {sf.worst_uploads.slice(0, 5).map((w, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="flex-1 min-w-0">
                        <p className="text-[12px] font-medium text-[#F4F1FF] truncate">{w.chapter_title || w.subject_id}</p>
                        <p className="text-[10px] text-[#6E6A88]">{w.thumbs_down} 👎 · {w.total} total</p>
                      </span>
                      <span className="shrink-0 text-sm font-bold text-[#FF5B5B]">{w.negative_rate_pct}%</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 4 — Failures
      ══════════════════════════════════════════════════════════════════ */}
      <div>
        <SectionHeader title="4 · Recent Upload Failures"
          sub={`Failure rate: ${chapters.failure_rate_pct || 0}% — last ${failures.length} failures`} />
        {failures.length === 0 ? (
          <Card><p className="text-[12px] text-[#4EF0A0]">✓ No recent failures.</p></Card>
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="text-left py-2 text-[10px] uppercase tracking-wider text-[#6E6A88] font-medium">Subject</th>
                  <th className="text-left py-2 text-[10px] uppercase tracking-wider text-[#6E6A88] font-medium">Program · Sem</th>
                  <th className="text-left py-2 text-[10px] uppercase tracking-wider text-[#6E6A88] font-medium">Type</th>
                  <th className="text-left py-2 text-[10px] uppercase tracking-wider text-[#6E6A88] font-medium">Error</th>
                </tr>
              </thead>
              <tbody>
                {failures.map((f, i) => (
                  <tr key={i} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                    <td className="py-2 pr-3">
                      <p className="font-medium text-[#F4F1FF]">{f.subject_id}</p>
                      {f.chapter_title && <p className="text-[10px] text-[#6E6A88] truncate max-w-[120px]">{f.chapter_title}</p>}
                    </td>
                    <td className="py-2 pr-3 text-[#9895B5] whitespace-nowrap">
                      {f.program} · {f.semester}
                    </td>
                    <td className="py-2 pr-3">
                      <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${
                        f.upload_type === 'notes'
                          ? 'bg-[#A78BFA]/10 text-[#A78BFA]'
                          : 'bg-[#6CB4FF]/10 text-[#6CB4FF]'
                      }`}>
                        {f.upload_type}
                      </span>
                    </td>
                    <td className="py-2 text-[#FF7B7B] max-w-[220px]">
                      <p className="truncate text-[11px]">{f.error_message || '—'}</p>
                      <p className="text-[10px] text-[#6E6A88]">{f.uploaded_at?.slice(0,10)}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 5 — LLM Usage
      ══════════════════════════════════════════════════════════════════ */}
      <div>
        <SectionHeader title="5 · AI / LLM Usage"
          sub={`${llm?.total_calls || 0} total calls · ${llm?.total_calls_24h || 0} in last 24h`} />

        {llm?.note && (
          <div className="mb-3 rounded-lg border border-[#FFD06B]/25 bg-[#FFD06B]/8 px-3 py-2 text-[11px] text-[#FFD06B]">
            ℹ️ {llm.note}
          </div>
        )}

        {/* Quick stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
          <Stat label="Total calls"      value={llm?.total_calls || 0} />
          <Stat label="Last 24h"         value={llm?.total_calls_24h || 0} accent="#6CB4FF" />
          <Stat label="Exhausted models" value={(llm?.exhausted_models || []).length}
            accent={(llm?.exhausted_models || []).length > 0 ? '#FF5B5B' : '#4EF0A0'} />
          <Stat label="Providers active"
            value={Object.values(llm?.key_status || {}).filter(Boolean).length + ' / ' + Object.keys(llm?.key_status || {}).length} />
        </div>

        {/* By call type */}
        {Object.keys(llm?.by_type || {}).length > 0 && (
          <Card className="mb-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#6E6A88] mb-3">Calls by type</p>
            <div className="space-y-2">
              {Object.entries(llm.by_type).sort((a,b) => b[1].total - a[1].total).map(([type, s]) => (
                <div key={type} className="flex items-center gap-3">
                  <span className="w-28 shrink-0 text-[12px] font-medium text-[#9895B5] capitalize">{type}</span>
                  <div className="flex-1">
                    <Bar value={s.success} max={s.total} color="#4EF0A0" height={6} />
                  </div>
                  <span className="w-8 text-right text-[12px] font-bold text-[#F4F1FF]">{s.total}</span>
                  {s.failed > 0 && (
                    <span className="text-[10px] text-[#FF5B5B]">{s.failed}✗</span>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Per model */}
        {(llm?.by_model || []).length > 0 && (
          <Card className="mb-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#6E6A88] mb-3">Usage per model</p>
            <div className="space-y-2.5">
              {llm.by_model.map(m => (
                <div key={m.model} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[12px] font-medium text-[#F4F1FF] truncate">{m.model}</span>
                      {(llm.exhausted_models || []).includes(m.model) && (
                        <span className="shrink-0 rounded-full bg-[#FF5B5B]/10 px-1.5 py-0.5 text-[9px] font-bold text-[#FF5B5B]">EXHAUSTED</span>
                      )}
                    </div>
                    <Bar value={m.success_calls} max={m.total_calls} color="#4EF0A0" height={4} />
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[12px] font-bold text-[#F4F1FF]">{m.total_calls}</p>
                    <p className="text-[10px] text-[#4EF0A0]">{m.success_rate_pct}%</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Provider key status */}
        <Card className="mb-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#6E6A88] mb-3">API key status</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {Object.entries(llm?.key_status || {}).map(([provider, configured]) => (
              <div key={provider} className="flex items-center gap-2 rounded-lg bg-white/4 px-3 py-2">
                <span className="capitalize text-[12px] font-medium text-[#F4F1FF] flex-1">{provider}</span>
                <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${
                  configured ? 'bg-[#4EF0A0]/10 text-[#4EF0A0]' : 'bg-white/5 text-[#6E6A88]'
                }`}>
                  {configured ? '✓ Set' : '— Not set'}
                </span>
              </div>
            ))}
          </div>
        </Card>

        {/* Daily trend */}
        {(llm?.daily_trend || []).length > 0 && (
          <Card>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#6E6A88] mb-3">Daily calls — last 14 days</p>
            <div className="flex items-end gap-1 h-16">
              {llm.daily_trend.map(d => {
                const maxVal = Math.max(...llm.daily_trend.map(x => x.total), 1)
                const h = Math.max(4, Math.round((d.total / maxVal) * 56))
                return (
                  <div key={d.date} className="flex-1 flex flex-col items-center gap-0.5" title={`${d.date}: ${d.total} calls, ${d.failed} failed`}>
                    <div className="w-full rounded-sm" style={{ height: h, background: d.failed > 0 ? '#FF916C' : '#4EF0A0', opacity: 0.8 }} />
                    <span className="text-[8px] text-[#6E6A88] rotate-90 origin-left" style={{ marginTop: 4 }}>
                      {d.date.slice(5)}
                    </span>
                  </div>
                )
              })}
            </div>
            <p className="mt-1 text-[9px] text-[#6E6A88]">Green = all success · Orange = had failures</p>
          </Card>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 6 — Live chain status
      ══════════════════════════════════════════════════════════════════ */}
      <div>
        <SectionHeader title="6 · Live Fallback Chain Status"
          sub="Which model is active, which are exhausted, real-time order" />
        <div className="space-y-3">
          {Object.entries(llm?.chains || {}).map(([key, chain]) => (
            <Card key={key}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-[#F4F1FF]">{chain.name}</p>
                {chain.active_model && (
                  <span className="rounded-full bg-[#4EF0A0]/10 border border-[#4EF0A0]/20 px-2.5 py-0.5 text-[10px] font-bold text-[#4EF0A0]">
                    Active: {chain.active_model.split('/').pop()}
                  </span>
                )}
              </div>
              <div className="space-y-1.5">
                {(chain.steps || []).map((step, i) => {
                  const isActive = chain.active_model === step.model
                  return (
                    <div key={i}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2 ${
                        isActive ? 'bg-[#4EF0A0]/8 border border-[#4EF0A0]/20' : 'bg-white/[0.03]'
                      }`}>
                      <span className="text-[10px] font-bold text-[#6E6A88] w-4 shrink-0">#{i+1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-medium text-[#F4F1FF] truncate">{step.model}</p>
                        <p className="text-[10px] text-[#6E6A88]">
                          {step.provider}
                          {step.recent_calls > 0 && ` · ${step.recent_calls} calls · ${step.recent_failures} failed (24h)`}
                        </p>
                      </div>
                      <StatusPill status={step.status} />
                      {isActive && <span className="text-[10px] font-bold text-[#4EF0A0]">← IN USE</span>}
                    </div>
                  )
                })}
              </div>
            </Card>
          ))}
        </div>
      </div>

    </div>
  )
}
