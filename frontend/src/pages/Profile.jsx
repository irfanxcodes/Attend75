import { useEffect, useState } from 'react'
import LogoutButton from '../components/profile/LogoutButton'
import useAppStore from '../hooks/useAppStore'
import { fetchSessionStatus, submitFeedback } from '../services/attendanceApi'

function getInitials(name) {
  if (!name) return 'I'

  const parts = name.trim().split(/\s+/)

  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase()
  }

  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase()
}

function formatLastSynced(date) {
  const dayMonth = date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
  })

  const time = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })

  return `${dayMonth}, ${time}`
}

function Profile() {
  const {
    state: { user, session },
    actions,
  } = useAppStore()

  const isFirebaseUser = user.authProvider === 'firebase'
  const userName = isFirebaseUser
    ? (user.name || user.portalName || user.rollNumber || user.id || 'I')
    : (user.rollNumber || user.id || user.portalName || user.name || 'I')
  const rollNumber = user.rollNumber || user.id || '--'
  const [feedbackMessage, setFeedbackMessage] = useState('')
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false)
  const [feedbackStatus, setFeedbackStatus] = useState('')
  const [feedbackError, setFeedbackError] = useState('')
  const [shareStatus, setShareStatus] = useState('')
  const [syncStatus, setSyncStatus] = useState('Checking...')
  const [lastSynced, setLastSynced] = useState('--')
  const [isSyncExpanded, setIsSyncExpanded] = useState(false)
  const [isFeedbackExpanded, setIsFeedbackExpanded] = useState(false)
  const userInitials = getInitials(userName)
  const isLinked = syncStatus.toLowerCase() === 'linked'

  useEffect(() => {
    let isMounted = true

    if (!session.token) {
      setSyncStatus('Session expired')
      setLastSynced('--')
      return () => {
        isMounted = false
      }
    }

    setSyncStatus('Checking...')

    void (async () => {
      try {
        const status = await fetchSessionStatus(session.token)
        if (!isMounted) {
          return
        }

        if (status === 'linked') {
          setSyncStatus('Linked')
          setLastSynced(formatLastSynced(new Date()))
          return
        }

        if (status === 'expired') {
          setSyncStatus('Session expired')
          setLastSynced('--')
          return
        }

        setSyncStatus('Status unavailable')
      } catch {
        if (!isMounted) {
          return
        }
        setSyncStatus('Status unavailable')
      }
    })()

    return () => {
      isMounted = false
    }
  }, [session.token])

  const handleShare = async () => {
    const appLink = window.location.origin
    const sharePayload = {
      title: 'Attend75',
      text: 'Track your attendance easily',
      url: appLink,
    }

    setShareStatus('')

    if (navigator.share) {
      try {
        await navigator.share(sharePayload)
        setShareStatus('Thanks for sharing Attend75!')
        return
      } catch (error) {
        if (error?.name === 'AbortError') {
          return
        }
      }
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(appLink)
      } else {
        const tempInput = document.createElement('textarea')
        tempInput.value = appLink
        tempInput.setAttribute('readonly', '')
        tempInput.style.position = 'absolute'
        tempInput.style.left = '-9999px'
        document.body.appendChild(tempInput)
        tempInput.select()
        document.execCommand('copy')
        document.body.removeChild(tempInput)
      }
      setShareStatus('Sharing is not supported here. Link copied to clipboard.')
    } catch {
      setShareStatus(`Copy failed. Please share this link manually: ${appLink}`)
    }
  }

  const handleFeedbackSubmit = async (event) => {
    event.preventDefault()
    setFeedbackStatus('')
    setFeedbackError('')

    if (!feedbackMessage.trim()) {
      setFeedbackError('Feedback cannot be empty.')
      return
    }

    try {
      setIsSubmittingFeedback(true)
      await submitFeedback(feedbackMessage)
      setFeedbackStatus('Feedback submitted successfully.')
      setFeedbackMessage('')
    } catch (error) {
      setFeedbackError(error.message || 'Unable to submit feedback right now.')
    } finally {
      setIsSubmittingFeedback(false)
    }
  }

  return (
    <section className="space-y-4 pb-2">
      <section className="rounded-2xl bg-[#5B5485] px-5 py-5 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#E2BC8B]">
            <span className="text-2xl font-bold text-[#2B2450]">{userInitials}</span>
          </div>

          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold text-white">{userName}</h1>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsSyncExpanded((current) => !current)}
          className="mt-4 flex w-full items-center justify-between rounded-xl border border-white/15 bg-[#4F487A] px-3 py-2 text-left transition hover:bg-[#4B4472]"
          aria-expanded={isSyncExpanded}
          aria-controls="profile-sync-details"
        >
          <div>
            <h2 className="text-sm font-semibold text-[#F4F1FF]">Data Sync</h2>
            <p className="text-xs text-[#D8D3E8]">Tap to view session details</p>
          </div>
          <svg
            viewBox="0 0 20 20"
            className={[
              'h-5 w-5 flex-shrink-0 text-[#E2BC8B] transition-transform duration-300',
              isSyncExpanded ? 'rotate-180' : '',
            ].join(' ')}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <path d="M5 7.5 10 12.5 15 7.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <div
          id="profile-sync-details"
          className={[
            'overflow-hidden transition-all duration-300',
            isSyncExpanded ? 'mt-3 max-h-44 opacity-100' : 'max-h-0 opacity-0',
          ].join(' ')}
        >
          <div className="rounded-xl bg-[#E2BC8B] p-4 text-[#1A1535]">
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[#3E365F]">Last Synced</span>
                <span className="font-semibold">{lastSynced}</span>
              </div>

              <div className="flex items-center justify-between gap-3">
                <span className="text-[#3E365F]">Status</span>
                <span className={`font-semibold ${isLinked ? 'text-[#1F8F3A]' : 'text-[#C53030]'}`}>{syncStatus}</span>
              </div>

              <div className="flex items-center justify-between gap-3">
                <span className="text-[#3E365F]">Roll Number</span>
                <span className="font-semibold">{rollNumber}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="rounded-3xl bg-[#4F487A] p-4 shadow-md ring-1 ring-white/5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[#F4F1FF]">Share Attend75</h2>
            <p className="text-sm text-[#D8D3E8]">Share the app via WhatsApp, Instagram, and more.</p>
          </div>

          <button
            type="button"
            onClick={handleShare}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#E2BC8B] text-[#1D183E] transition hover:bg-[#D9AA6F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8D3E8]"
            aria-label="Share app"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 16V4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M8 8l4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M5 12v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        {shareStatus ? <p className="mt-3 text-sm text-[#F4F1FF]">{shareStatus}</p> : null}
      </div>

      <div className="rounded-3xl bg-[#4F487A] p-4 shadow-md ring-1 ring-white/5">
        <button
          type="button"
          onClick={() => setIsFeedbackExpanded((current) => !current)}
          className="flex w-full items-center justify-between text-left"
          aria-expanded={isFeedbackExpanded}
          aria-controls="feedback-details"
        >
          <div>
            <h2 className="text-lg font-semibold text-[#F4F1FF]">Feedback</h2>
            <p className="mt-1 text-sm text-[#D8D3E8]">Tell us what we can improve.</p>
          </div>
          <svg
            viewBox="0 0 20 20"
            className={[
              'h-5 w-5 flex-shrink-0 text-[#E2BC8B] transition-transform duration-300',
              isFeedbackExpanded ? 'rotate-180' : '',
            ].join(' ')}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <path d="M5 7.5 10 12.5 15 7.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <div
          id="feedback-details"
          className={[
            'overflow-hidden transition-all duration-300',
            isFeedbackExpanded ? 'mt-3 max-h-96 opacity-100' : 'max-h-0 opacity-0',
          ].join(' ')}
        >
          <form className="space-y-3" onSubmit={handleFeedbackSubmit}>
            <textarea
              value={feedbackMessage}
              onChange={(event) => setFeedbackMessage(event.target.value)}
              placeholder="Write your feedback here..."
              rows={4}
              className="w-full rounded-2xl border border-[#6D6499] bg-[#5B5485] px-4 py-3 text-sm text-[#F4F1FF] placeholder:text-[#CFC5E8] focus:border-[#E2BC8B] focus:outline-none"
            />

            {feedbackError ? <p className="text-sm text-[#FECACA]">{feedbackError}</p> : null}
            {feedbackStatus ? <p className="text-sm text-[#D1FAE5]">{feedbackStatus}</p> : null}

            <button
              type="submit"
              disabled={isSubmittingFeedback}
              className="inline-flex items-center rounded-full bg-[#E2BC8B] px-4 py-2 text-sm font-semibold text-[#1D183E] transition hover:bg-[#D9AA6F] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmittingFeedback ? 'Submitting...' : 'Submit Feedback'}
            </button>
          </form>
        </div>
      </div>

      <LogoutButton onLogout={actions.logout} />
      <p className="pb-1 text-center text-xs text-[#D8D3E8]/65">Attend75 · Made for ICFAI students</p>
    </section>
  )
}

export default Profile
