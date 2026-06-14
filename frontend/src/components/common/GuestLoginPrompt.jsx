import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

/**
 * A modal prompt that shows when a guest tries to use a feature that requires login.
 * Shows a friendly message and Login/Cancel buttons.
 */
function GuestLoginPrompt({ isOpen, onClose, featureName = 'this feature' }) {
  const navigate = useNavigate()

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-[#4A466A] p-5 shadow-xl ring-1 ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold text-[#F7F4FF]">Login Required</h3>
        <p className="mt-2 text-sm leading-relaxed text-[#9F9AB5]">
          You're viewing demo data. Login with your portal credentials to {featureName}.
        </p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-full border border-white/15 py-2.5 text-sm font-semibold text-[#D8D4E7] transition hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="flex-1 rounded-full bg-[#FF916C] py-2.5 text-sm font-bold text-[#1D183E] transition active:scale-[0.98]"
          >
            Login
          </button>
        </div>
      </div>
    </div>
  )
}

export default GuestLoginPrompt

/**
 * Hook for managing guest login prompt state.
 */
export function useGuestPrompt() {
  const [isOpen, setIsOpen] = useState(false)
  const [feature, setFeature] = useState('')

  const showPrompt = (featureName = 'use this feature') => {
    setFeature(featureName)
    setIsOpen(true)
  }

  const closePrompt = () => setIsOpen(false)

  return { isOpen, feature, showPrompt, closePrompt }
}
