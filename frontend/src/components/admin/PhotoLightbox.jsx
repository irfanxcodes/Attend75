import { useEffect } from 'react'

function PhotoLightbox({ src, name, onClose }) {
  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  if (!src) return null

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative animate-[slideUp_0.2s_ease-out] rounded-2xl border border-white/10 bg-[#2a2440] p-3 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={src}
          alt={name || 'User photo'}
          className="h-64 w-64 rounded-xl object-cover sm:h-80 sm:w-80"
          onError={(e) => { e.target.src = '' ; e.target.alt = 'Failed to load' }}
        />
        {name ? (
          <p className="mt-2 text-center text-xs font-semibold text-[#f0ece4]">{name}</p>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full border border-white/15 bg-[#1e1932] text-[#9F9AB5] transition hover:bg-white/10 hover:text-[#f0ece4]"
        >
          ✕
        </button>
      </div>
    </div>
  )
}

export default PhotoLightbox
