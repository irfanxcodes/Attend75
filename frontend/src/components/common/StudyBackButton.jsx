import { useNavigate } from 'react-router-dom'

function StudyBackButton({ fallbackTo = '/study', label = 'Back', className = '', iconOnly = false }) {
  const navigate = useNavigate()

  const handleBack = () => {
    navigate(fallbackTo)
  }

  return (
    <button
      type="button"
      onClick={handleBack}
      className={`inline-flex shrink-0 items-center rounded-full border border-white/20 bg-white/5 text-[#E7DEDE] transition hover:bg-white/10 ${
        iconOnly ? 'h-11 w-11 justify-center text-xl' : 'gap-2 px-3 py-1.5 text-xs font-semibold'
      } ${className}`}
      aria-label={label}
    >
      <span aria-hidden="true">←</span>
      {!iconOnly ? <span>{label}</span> : null}
    </button>
  )
}

export default StudyBackButton