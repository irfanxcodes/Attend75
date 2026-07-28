function formatNumber(num) {
  if (num >= 1000) return `${(num / 1000).toFixed(1)}k`
  return String(num)
}

function MiniBar({ value, max }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-[#4EF0A0]" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-[#9F9AB5]">{pct}%</span>
    </div>
  )
}

const GAME_LABELS = {
  flappy: 'Flappy Bird',
  pacman: 'Pac-Man',
  stack: 'Stack',
}

function ArcadePage({ analytics, onRefresh, isLoading }) {
  const arcade = analytics?.arcade || {}
  const totalPlayers = arcade.totalPlayers || 0
  const totalGamesPlayed = arcade.totalGamesPlayed || 0
  const newPlayers7d = arcade.newPlayers7d || 0
  const perGame = arcade.perGame || []
  const dailyTrend = arcade.dailyTrend || []

  const maxDailyPlays = Math.max(...dailyTrend.map((d) => d.plays || 0), 1)
  const maxPerGamePlayers = Math.max(...perGame.map((g) => g.uniquePlayers || 0), 1)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#f0ece4]">Arcade Analytics</h1>
          <div className="mt-1 flex items-center gap-3 text-[11px] text-[#7a6f94]">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#4EF0A0]" />
              Live · synced {isLoading ? '...' : 'just now'}
            </span>
            <span>Students playing arcade games on Attend75</span>
          </div>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isLoading}
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-semibold text-[#d8d4e7] transition hover:bg-white/10 disabled:opacity-50"
        >
          ↻ Refresh
        </button>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-2xl border border-white/[0.06] bg-[#2a2440] p-5">
          <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#7a6f94]">Total Players</p>
          <span className="mt-2 block text-[32px] font-bold text-[#f0ece4]">{formatNumber(totalPlayers)}</span>
          <p className="mt-1 text-[10px] text-[#9F9AB5]">unique students who played</p>
        </div>
        <div className="rounded-2xl border border-white/[0.06] bg-[#2a2440] p-5">
          <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#7a6f94]">New Players (7d)</p>
          <span className="mt-2 block text-[32px] font-bold text-[#4EF0A0]">{formatNumber(newPlayers7d)}</span>
          <p className="mt-1 text-[10px] text-[#9F9AB5]">first-timers this week</p>
        </div>
        <div className="rounded-2xl border border-white/[0.06] bg-[#2a2440] p-5">
          <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#7a6f94]">Total Games Played</p>
          <span className="mt-2 block text-[32px] font-bold text-[#6CB4FF]">{formatNumber(totalGamesPlayed)}</span>
          <p className="mt-1 text-[10px] text-[#9F9AB5]">total score submissions</p>
        </div>
      </div>

      {/* Per-game breakdown */}
      <div className="rounded-2xl border border-white/[0.06] bg-[#2a2440] p-5">
        <p className="text-sm font-semibold text-[#f0ece4]">Per-game breakdown</p>
        <p className="mt-0.5 text-[9px] text-[#7a6f94]">Unique players, total plays, and top score per game</p>

        {perGame.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-white/[0.06] text-left text-[9px] font-bold uppercase tracking-wider text-[#7a6f94]">
                  <th className="pb-3 pr-4">Game</th>
                  <th className="pb-3 pr-4">Unique Players</th>
                  <th className="pb-3 pr-4">Popularity</th>
                  <th className="pb-3 pr-4 text-right">Total Plays</th>
                  <th className="pb-3 text-right">Top Score</th>
                </tr>
              </thead>
              <tbody>
                {perGame.map((g) => (
                  <tr key={g.game} className="border-b border-white/[0.04]">
                    <td className="py-3 pr-4 font-semibold text-[#d8d4e7]">
                      {GAME_LABELS[g.game] || g.game}
                    </td>
                    <td className="py-3 pr-4 font-bold text-[#f0ece4]">{formatNumber(g.uniquePlayers)}</td>
                    <td className="py-3 pr-4">
                      <MiniBar value={g.uniquePlayers} max={maxPerGamePlayers} />
                    </td>
                    <td className="py-3 pr-4 text-right text-[#9F9AB5]">{formatNumber(g.totalPlays)}</td>
                    <td className="py-3 text-right font-bold text-[#4EF0A0]">{formatNumber(g.topScore)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-4 py-6 text-center text-[11px] text-[#7a6f94]">No game data yet</p>
        )}
      </div>

      {/* Daily plays trend — last 14 days */}
      <div className="rounded-2xl border border-white/[0.06] bg-[#2a2440] p-5">
        <p className="text-sm font-semibold text-[#f0ece4]">Daily activity · last 14 days</p>
        <p className="mt-0.5 text-[9px] text-[#7a6f94]">Games played and unique players per day</p>

        {dailyTrend.length > 0 ? (
          <div className="mt-4 space-y-2">
            {dailyTrend.map((item) => (
              <div key={item.date} className="flex items-center gap-3">
                <span className="w-20 shrink-0 text-[10px] text-[#7a6f94]">
                  {new Date(item.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                </span>
                <div className="flex flex-1 items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-[#6CB4FF]"
                      style={{ width: `${maxDailyPlays > 0 ? Math.round((item.plays / maxDailyPlays) * 100) : 0}%` }}
                    />
                  </div>
                </div>
                <span className="w-10 text-right text-[10px] font-semibold text-[#f0ece4]">{item.plays}</span>
                <span className="w-16 text-right text-[9px] text-[#7a6f94]">{item.players} players</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 py-6 text-center text-[11px] text-[#7a6f94]">No activity data yet</p>
        )}
      </div>
    </div>
  )
}

export default ArcadePage
