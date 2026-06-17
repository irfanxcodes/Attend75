import { useState } from 'react'

const API_BASE_URL = import.meta.env.DEV ? 'http://127.0.0.1:8000' : (import.meta.env.VITE_API_BASE_URL || '/api')

function CollegeInterestForm({ onClose, onSuccess }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [collegeName, setCollegeName] = useState('')
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim() || !email.trim() || !collegeName.trim()) {
      setError('Please fill in your name, email, and college name.')
      return
    }
    setIsSubmitting(true)
    setError('')

    try {
      const response = await fetch(`${API_BASE_URL}/college-interest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          college_name: collegeName.trim(),
          message: message.trim() || null,
        }),
      })
      const data = await response.json()
      if (data.status === 'success') {
        setSubmitted(true)
        if (onSuccess) onSuccess()
      } else {
        setError(data.message || 'Something went wrong. Please try again.')
      }
    } catch {
      setError('Unable to submit. Please check your connection.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="fixed inset-0 z-[180] flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm" onClick={onClose}>
        <div className="w-full max-w-sm animate-[slideUp_0.3s_ease-out] rounded-2xl border border-white/10 bg-[#2D2845] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
          <div className="text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#4EF0A0]/15">
              <svg viewBox="0 0 24 24" className="h-7 w-7 text-[#4EF0A0]" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h3 className="mt-4 text-lg font-bold text-[#F7F4FF]">Thank you!</h3>
            <p className="mt-2 text-xs leading-relaxed text-[#9F9AB5]">We&apos;ve received your interest. We&apos;ll reach out when Attend75 is available for your college.</p>
            <button type="button" onClick={onClose} className="mt-5 w-full rounded-full bg-[#4EF0A0] py-2.5 text-xs font-bold text-[#1D183E] transition active:scale-95">
              Continue exploring
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[180] flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md animate-[slideUp_0.3s_ease-out] rounded-2xl border border-white/10 bg-[#2D2845] p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-[#F7F4FF]">Like what you see?</h3>
            <p className="mt-0.5 text-xs text-[#9F9AB5]">Want Attend75 for your college? Let us know!</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-full border border-white/15 text-[#9F9AB5] hover:bg-white/5">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-[#7a6f94]">Your Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Rahul Sharma"
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-xs text-[#F7F4FF] placeholder:text-[#7a6f94] outline-none focus:border-[#4EF0A0]/50"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-[#7a6f94]">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@college.edu"
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-xs text-[#F7F4FF] placeholder:text-[#7a6f94] outline-none focus:border-[#4EF0A0]/50"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-[#7a6f94]">College / University Name</label>
            <input
              type="text"
              value={collegeName}
              onChange={(e) => setCollegeName(e.target.value)}
              placeholder="e.g. VIT Vellore, SRM Chennai..."
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-xs text-[#F7F4FF] placeholder:text-[#7a6f94] outline-none focus:border-[#4EF0A0]/50"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-[#7a6f94]">Message (optional)</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="What features would help you the most?"
              rows={2}
              className="mt-1 w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-xs text-[#F7F4FF] placeholder:text-[#7a6f94] outline-none focus:border-[#4EF0A0]/50"
            />
          </div>

          {error ? <p className="text-[10px] text-[#FF5B5B]">{error}</p> : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-full bg-[#4EF0A0] py-2.5 text-xs font-bold text-[#1D183E] transition active:scale-95 disabled:opacity-60"
          >
            {isSubmitting ? 'Submitting...' : 'I want this for my college'}
          </button>

          <button type="button" onClick={onClose} className="w-full py-2 text-center text-[10px] font-medium text-[#9F9AB5] hover:text-[#F7F4FF]">
            No thanks, just exploring
          </button>
        </form>
      </div>
    </div>
  )
}

export default CollegeInterestForm
