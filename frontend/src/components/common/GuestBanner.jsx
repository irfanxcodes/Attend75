import { useNavigate } from 'react-router-dom'
import useAppStore from '../../hooks/useAppStore'

function GuestBanner() {
  const navigate = useNavigate()
  const { state: { user } } = useAppStore()

  if (user.authProvider !== 'demo') return null

  return (
    <div className="flex items-center justify-between gap-2 rounded-xl bg-[#FF916C]/10 px-3 py-2 ring-1 ring-[#FF916C]/20">
      <p className="text-[10px] text-[#FFAA8D]">
        <span className="font-semibold">Demo mode</span> — viewing sample data
      </p>
      <button
        type="button"
        onClick={() => { navigate('/login') }}
        className="shrink-0 rounded-full bg-[#FF916C] px-3 py-1 text-[10px] font-bold text-[#1D183E] transition active:scale-95"
      >
        Login
      </button>
    </div>
  )
}

export default GuestBanner
