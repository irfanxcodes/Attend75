import { useState } from 'react'
import CollegeInterestForm from './CollegeInterestForm'
import useAppStore from '../../hooks/useAppStore'

const SUBMITTED_KEY = 'attend75.collegeInterest.submitted'
const DISMISSED_KEY = 'attend75.collegeInterest.dismissed'

function hasSubmitted() {
  try { return window.localStorage.getItem(SUBMITTED_KEY) === 'true' } catch { return false }
}

function CollegeInterestWidget() {
  const { state: { user } } = useAppStore()
  const [showForm, setShowForm] = useState(false)
  const [minimized, setMinimized] = useState(true)

  // Only show for demo/guest-explore users who haven't already submitted
  if (user.authProvider !== 'demo') return null
  if (hasSubmitted()) return null

  const handleOpenForm = () => {
    setShowForm(true)
    setMinimized(false)
  }

  const handleCloseForm = () => {
    setShowForm(false)
    setMinimized(true)
  }

  const handleFormSubmitSuccess = () => {
    try { window.localStorage.setItem(SUBMITTED_KEY, 'true') } catch { /* */ }
    setShowForm(false)
    setMinimized(false) // hide completely after submit
  }

  // If form is open, show full modal
  if (showForm) {
    return <CollegeInterestForm onClose={handleCloseForm} onSuccess={handleFormSubmitSuccess} />
  }

  // Minimized floating button
  if (!minimized) return null

  return (
    <button
      type="button"
      onClick={handleOpenForm}
      className="fixed right-4 top-4 z-[100] flex items-center gap-2 rounded-full border border-[#4EF0A0]/30 bg-[#2D2845]/95 px-3.5 py-2 shadow-lg backdrop-blur-sm transition-all hover:border-[#4EF0A0]/60 hover:shadow-[0_0_12px_rgba(78,240,160,0.15)] active:scale-95"
    >
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#4EF0A0]/20">
        <svg viewBox="0 0 24 24" className="h-3 w-3 text-[#4EF0A0]" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
      </span>
      <span className="text-[10px] font-semibold text-[#4EF0A0]">Want this for your college?</span>
    </button>
  )
}

export default CollegeInterestWidget
