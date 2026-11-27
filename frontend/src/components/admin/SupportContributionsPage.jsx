/**
 * Admin — Support Contributions Page
 * View, confirm, and manage contribution records.
 */
import { useEffect, useState } from 'react'
import { getAdminContributions, updateContributionStatus } from '../../services/adminApi'

const STATUS_COLORS = {
  pending:   'bg-[#FFB23E]/15 text-[#FFB23E]',
  thanked:   'bg-[#6CB4FF]/15 text-[#6CB4FF]',
  confirmed: 'bg-[#4EF0A0]/15 text-[#4EF0A0]',
}

export default function SupportContributionsPage() {
  const [contributions, setContributions] = useState([])
  const [stats, setStats] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState(null)

  useEffect(() => {
    setIsLoading(true)
    getAdminContributions()
      .then(data => {
        setContributions(data.contributions || [])
        setStats(data.stats || null)
      })
      .finally(() => setIsLoading(false))
  }, [])

  const handleStatusChange = async (id, status) => {
    setUpdatingId(id)
    try {
      const updated = await updateContributionStatus(id, { status })
      setContributions(prev => prev.map(c => c.id === id ? { ...c, ...updated } : c))
    } finally {
      setUpdatingId(null)
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#FF916C] border-t-transparent" />
      </div>
    )
  }

  // Only show 'submit' and 'click_amount' events (not raw 'view' noise)
  const meaningful = contributions.filter(c => ['submit', 'click_amount'].includes(c.action_type))

  return (
    <div className="space-y-5">
      {/* Stats row */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Total contributors', value: stats.contributors_this_month },
            { label: 'Confirmed amount', value: `₹${stats.total_amount || 0}` },
            { label: 'Total events', value: contributions.length },
            { label: 'Meaningful clicks', value: meaningful.length },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-xl bg-[#2a2440] p-4 ring-1 ring-white/5">
              <p className="text-[10px] text-[#9F9AB5] uppercase tracking-wider">{label}</p>
              <p className="mt-1 text-[22px] font-bold text-[#F7F4FF]">{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="rounded-2xl bg-[#2a2440] ring-1 ring-white/5 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-white/5 text-[10px] uppercase tracking-wider text-[#9F9AB5]">
                {['ID', 'Roll', 'Card', 'Action', 'Amount', 'Status', 'Date', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {contributions.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-[#9F9AB5]">No contributions yet</td></tr>
              ) : contributions.map(c => (
                <tr key={c.id} className="hover:bg-white/[0.02] transition">
                  <td className="px-4 py-3 text-[#9F9AB5]">#{c.id}</td>
                  <td className="px-4 py-3 font-mono text-[#F7F4FF]">{c.roll_number}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-white/5 px-2 py-0.5 text-[#D8D4E7]">{c.card_style}</span>
                  </td>
                  <td className="px-4 py-3 text-[#9F9AB5]">{c.action_type}</td>
                  <td className="px-4 py-3 font-bold text-[#F7F4FF]">
                    {c.amount ? `₹${c.amount}` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_COLORS[c.status] || ''}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[#9F9AB5] whitespace-nowrap">
                    {c.created_at ? new Date(c.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {c.status !== 'confirmed' && (
                      <button
                        type="button"
                        disabled={updatingId === c.id}
                        onClick={() => handleStatusChange(c.id, 'confirmed')}
                        className="rounded-lg bg-[#4EF0A0]/10 px-3 py-1 text-[10px] font-bold text-[#4EF0A0] transition hover:bg-[#4EF0A0]/20 disabled:opacity-50"
                      >
                        {updatingId === c.id ? '...' : 'Confirm'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
