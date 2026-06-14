import { useLocation, useNavigate } from 'react-router-dom'

function StudyBackButton({ fallbackTo = '/study', label = 'Back', className = '', iconOnly = false }) {
  const navigate = useNavigate()
  const location = useLocation()

  const handleBack = () => {
    // Determine the correct base path based on current location
    const isAppRoute = location.pathname.startsWith('/app/')
    let target = fallbackTo

    if (isAppRoute && !fallbackTo.startsWith('/app/')) {
      // Convert /study/... to /app/study/...
      target = `/app${fallbackTo}`
    } else if (!isAppRoute && fallbackTo.startsWith('/app/')) {
      // Convert /app/study/... to /study/...
      target = fallbackTo.replace('/app', '')
    }

    navigate(target)
  }

  return (
    <button
      type="button"
      onClick={handleBack}
      className={`inline-flex shrink-0 items-center rounded-full border border-white/20 bg-white/5 text-[#E7DEDE] transition hover:bg-white/10 ${
        iconOnly ? 'h-8 w-8 justify-center text-base' : 'gap-2 px-3 py-1.5 text-xs font-semibold'
      } ${className}`}
      aria-label={label}
    >
      <span aria-hidden="true">←</span>
      {!iconOnly ? <span>{label}</span> : null}
    </button>
  )
}

export default StudyBackButton
