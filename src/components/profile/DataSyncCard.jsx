function DataSyncCard({ lastSynced, status, rollNumber }) {
  const isLinked = status.toLowerCase() === 'linked'

  return (
    <section className="rounded-2xl bg-[#E2BC8B] p-5 text-[#1A1535] shadow-sm">
      <h2 className="text-base font-semibold">Data Sync</h2>

      <div className="mt-4 space-y-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[#3E365F]">Last Synced</span>
          <span className="font-semibold">{lastSynced}</span>
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className="text-[#3E365F]">Status</span>
          <span className={`font-semibold ${isLinked ? 'text-[#1F8F3A]' : 'text-[#C53030]'}`}>{status}</span>
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className="text-[#3E365F]">Roll Number</span>
          <span className="font-semibold">{rollNumber}</span>
        </div>
      </div>
    </section>
  )
}

export default DataSyncCard
