import { useNavigate } from 'react-router-dom'

function ArcadeBanner() {
  const navigate = useNavigate()

  return (
    <button
      type="button"
      onClick={() => navigate('/app/arcade')}
      className="relative flex w-full items-center overflow-hidden rounded-2xl text-left transition active:scale-[0.98]"
      style={{ height: '88px' }}
    >
      {/* Background - sky blue to purple split */}
      <div className="absolute inset-0">
        {/* Sky blue left section */}
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(135deg, #87CEEB 0%, #B0E0F0 40%, #6B5B95 60%, #4A3F78 100%)',
          }}
        />
        {/* Clouds */}
        <div className="absolute left-[10%] top-2 h-4 w-10 rounded-full bg-white/40" />
        <div className="absolute left-[5%] top-4 h-3 w-7 rounded-full bg-white/30" />
        <div className="absolute left-[22%] top-6 h-3 w-8 rounded-full bg-white/25" />
      </div>

      {/* Floating graduation caps */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Cap 1 - top left */}
        <svg className="absolute left-[8%] top-1 w-5 h-5 text-gray-700/70 -rotate-12" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 3L1 9l4 2.18v6L12 21l7-3.82v-6l2-1.09V17h2V9L12 3zm6.82 6L12 12.72 5.18 9 12 5.28 18.82 9zM17 15.99l-5 2.73-5-2.73v-3.72L12 15l5-2.73v3.72z"/>
        </svg>
        {/* Cap 2 - top center-left */}
        <svg className="absolute left-[25%] -top-0.5 w-4 h-4 text-gray-700/60 rotate-6" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 3L1 9l4 2.18v6L12 21l7-3.82v-6l2-1.09V17h2V9L12 3zm6.82 6L12 12.72 5.18 9 12 5.28 18.82 9zM17 15.99l-5 2.73-5-2.73v-3.72L12 15l5-2.73v3.72z"/>
        </svg>
        {/* Cap 3 - bottom left */}
        <svg className="absolute left-[3%] bottom-2 w-4 h-4 text-gray-700/50 rotate-12" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 3L1 9l4 2.18v6L12 21l7-3.82v-6l2-1.09V17h2V9L12 3zm6.82 6L12 12.72 5.18 9 12 5.28 18.82 9zM17 15.99l-5 2.73-5-2.73v-3.72L12 15l5-2.73v3.72z"/>
        </svg>
        {/* Cap 4 - bottom right area */}
        <svg className="absolute right-[15%] bottom-1 w-4 h-4 text-gray-700/40 -rotate-6" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 3L1 9l4 2.18v6L12 21l7-3.82v-6l2-1.09V17h2V9L12 3zm6.82 6L12 12.72 5.18 9 12 5.28 18.82 9zM17 15.99l-5 2.73-5-2.73v-3.72L12 15l5-2.73v3.72z"/>
        </svg>
      </div>

      {/* Player character from the game */}
      <div className="absolute left-3 bottom-2 pointer-events-none">
        <svg width="48" height="48" viewBox="0 0 64 64" fill="none">
          {/* Shadow */}
          <rect x="12" y="14" width="42" height="42" rx="12" fill="rgba(0,0,0,0.2)"/>
          {/* Body - orange rounded square */}
          <rect x="9" y="11" width="42" height="42" rx="12" fill="#FF916C"/>
          {/* Outline */}
          <rect x="9" y="11" width="42" height="42" rx="12" stroke="#E07A58" strokeWidth="2.5" fill="none"/>
          {/* Eye white */}
          <circle cx="38" cy="28" r="9" fill="white"/>
          {/* Eye pupil */}
          <circle cx="40" cy="28" r="5" fill="#1D183E"/>
        </svg>
      </div>

      {/* Center content - Title and button */}
      <div className="relative z-10 flex flex-col items-center justify-center w-full h-full">
        <h3
          className="text-xl font-extrabold tracking-wide"
          style={{
            color: '#3D2B1A',
            textShadow: '0 1px 2px rgba(0,0,0,0.1), 0 0 8px rgba(255,255,255,0.3)',
          }}
        >
          Arcade
        </h3>
        <span
          className="mt-1 rounded-full px-4 py-1 text-[11px] font-bold text-white"
          style={{
            background: 'linear-gradient(135deg, #F0874A 0%, #E06030 100%)',
            boxShadow: '0 2px 8px rgba(240,135,74,0.4)',
          }}
        >
          EXPLORE ARCADE
        </span>
      </div>

      {/* Subtle border/ring */}
      <div className="absolute inset-0 rounded-2xl ring-1 ring-black/10" />
    </button>
  )
}

export default ArcadeBanner
