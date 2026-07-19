import { useEffect, useState } from 'react'
import { Crown, LogOut, Share2, Star, MessageSquare, Settings, Bell, BellOff, X, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { FollowCreatorSection } from '../components/common/FollowCreatorBanner'
import useAppStore from '../hooks/useAppStore'
import { fetchSessionStatus, fetchUserRating, submitFeedback, submitRating } from '../services/attendanceApi'
import { useInstallPrompt } from '../pwa/useInstallPrompt'
import { getPreferences, updatePreferences } from '../services/pushApi'
import { requestPushSubscription, isPushSubscribed, getNotificationPermission } from '../pwa/push/subscribe'
import { getPremiumStatus } from '../services/premiumApi'

function getInitials(name) {
  if (!name) return 'A'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase()
}

function Profile() {
  const navigate = useNavigate()
  const {
    state: { user, session, attendance, selectedTarget },
    actions,
  } = useAppStore()

  const isFirebaseUser = user.authProvider === 'firebase'
  const userName = isFirebaseUser
    ? (user.name || user.portalName || user.rollNumber || user.id || 'Student')
    : (user.portalName || user.name || user.rollNumber || user.id || 'Student')
  const rollNumber = user.rollNumber || user.id || '--'
  const overallPercentage = attendance?.overallPercentage || 0
  const initials = getInitials(userName)

  // Derive program label from portal data (program_full cookie, e.g. "Bachelor of Commerce")
  const programLabel = session.programFull || session.programSn || null

  const [rating, setRating] = useState(0)
  const [hoverRating, setHoverRating] = useState(0)
  const [feedbackMessage, setFeedbackMessage] = useState('')
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false)
  const [feedbackStatus, setFeedbackStatus] = useState('')
  const [feedbackError, setFeedbackError] = useState('')

  const { canInstall, isInstalled, promptInstall, isIOS } = useInstallPrompt()

  // ── Premium status ──────────────────────────────────────────────────────────
  const [premiumStatus, setPremiumStatus] = useState(null) // null=loading, {is_premium, status, expiry_date, ...}

  useEffect(() => {
    if (!session.token) return
    getPremiumStatus({ token: session.token })
      .then(setPremiumStatus)
      .catch(() => setPremiumStatus({ is_premium: false, status: 'none' }))
  }, [session.token])

  // ── Settings sheet state ──────────────────────────────────────────────────
  const [showSettings, setShowSettings] = useState(false)
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [permissionState, setPermissionState] = useState('default')
  const [prefs, setPrefs] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isEnabling, setIsEnabling] = useState(false)

  // Load notification state when settings sheet opens
  useEffect(() => {
    if (!showSettings || !session.token) return
    Promise.all([
      getPreferences({ token: session.token }),
      isPushSubscribed(),
    ]).then(async ([prefsData, subscribed]) => {
      setPrefs(prefsData)
      setPermissionState(getNotificationPermission())

      if (subscribed) {
        // Browser has a subscription, but backend might not know about it.
        // Re-register to ensure the backend is in sync.
        try {
          await requestPushSubscription(session.token)
          setIsSubscribed(true)
        } catch (err) {
          console.error('[Push Re-register Error]', err)
          // If premium required error, mark as not subscribed on backend
          if (err?.status === 402) {
            setIsSubscribed(false)
          } else {
            // Browser has a sub but backend registration failed — show as off
            setIsSubscribed(false)
          }
        }
      } else {
        setIsSubscribed(false)
      }
    }).catch(() => {})
  }, [showSettings, session.token])

  const handleNotificationToggle = async (key, value) => {
    if (!session.token) return
    setIsSaving(true)
    try {
      const updated = await updatePreferences({ token: session.token, [key]: value })
      setPrefs(updated)
    } catch { /* silent */ }
    finally { setIsSaving(false) }
  }

  const handleEnablePush = async () => {
    if (!session.token || isEnabling) return
    setIsEnabling(true)
    try {
      await requestPushSubscription(session.token)
      setIsSubscribed(true)
      setPermissionState(getNotificationPermission())
    } catch (err) {
      if (err?.status === 402) {
        setShowSettings(false)
        navigate('/app/premium')
      } else {
        // Show the error so user knows what happened
        console.error('[Push Subscribe Error]', err)
        alert(`Push subscription failed: ${err?.message || 'Unknown error'}. Make sure you're using HTTPS and have allowed notifications.`)
      }
    } finally {
      setIsEnabling(false)
    }
  }

  // Fetch existing rating
  useEffect(() => {
    if (!session.token) return
    void (async () => {
      const r = await fetchUserRating(session.token)
      if (r) setRating(r)
    })()
  }, [session.token])

  const handleRating = async (value) => {
    setRating(value)
    if (session.token) {
      await submitRating(session.token, value)
    }
  }

  const handleFeedbackSubmit = async (event) => {
    event.preventDefault()
    setFeedbackStatus('')
    setFeedbackError('')
    if (!feedbackMessage.trim()) { setFeedbackError('Feedback cannot be empty.'); return }

    try {
      setIsSubmittingFeedback(true)
      await submitFeedback(feedbackMessage, userName)
      setFeedbackStatus('Sent!')
      setFeedbackMessage('')
    } catch (error) {
      setFeedbackError(error.message || 'Unable to submit.')
    } finally {
      setIsSubmittingFeedback(false)
    }
  }

  const handleShare = async (platform) => {
    const url = window.location.origin
    const text = 'Track your attendance with Attend75'

    if (platform === 'whatsapp') {
      window.open(`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`, '_blank')
    } else if (platform === 'instagram') {
      try { await navigator.clipboard.writeText(url) } catch { /* */ }
      window.open('https://instagram.com', '_blank')
    } else {
      try {
        await navigator.clipboard.writeText(url)
      } catch { /* */ }
    }
  }

  const handleLogout = async () => {
    await actions.logout()
    navigate('/login', { replace: true })
  }

  return (
    <section className="space-y-3 pb-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-[#F7F4FF]">Profile</h1>
        <button
          type="button"
          onClick={() => setShowSettings(true)}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/8 text-[#9F9AB5] transition hover:bg-white/15 active:scale-95"
          aria-label="Settings"
        >
          <Settings className="h-4.5 w-4.5" strokeWidth={1.8} />
        </button>
      </div>

      {/* User card */}
      <div
        className="flex flex-col items-center rounded-2xl px-4 py-6 ring-1 ring-white/5"
        style={{ background: 'linear-gradient(180deg, #5B5878 0%, #4A466A 40%)' }}
      >
        {/* Avatar with attendance ring */}
        <div className="relative h-[100px] w-[100px]">
          <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
            <circle cx="50" cy="50" r="44" stroke="#302A52" strokeWidth="6" fill="none" />
            <circle
              cx="50" cy="50" r="44"
              stroke="#4EF0A0"
              strokeWidth="6"
              strokeLinecap="round"
              fill="none"
              strokeDasharray={2 * Math.PI * 44}
              strokeDashoffset={2 * Math.PI * 44 - (Math.min(100, overallPercentage) / 100) * 2 * Math.PI * 44}
              className="transition-all duration-700"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-[#E8A88C] text-xl font-bold text-[#1D183E]">
              {initials}
            </div>
          </div>
        </div>

        {/* Name + details */}
        <p className="mt-4 text-xl font-bold text-[#F7F4FF]">{userName}</p>
        <p className="mt-0.5 text-xs text-[#9F9AB5]">{rollNumber}</p>
        {programLabel && (
          <p className="mt-0.5 text-xs text-[#9F9AB5]">{programLabel}</p>
        )}

        {/* Status badge */}
        <div className="mt-3 flex items-center gap-1.5 rounded-full border border-[#4EF0A0]/30 px-3 py-1">
          <span className="h-2 w-2 rounded-full bg-[#4EF0A0]" />
          <span className="text-xs font-semibold text-[#4EF0A0]">{overallPercentage}% · {overallPercentage > 75 ? 'Safe' : overallPercentage >= 60 ? 'Tight' : 'At Risk'}</span>
        </div>
      </div>

      {/* Rate */}
      <div className="rounded-2xl bg-[#4A466A] px-4 py-4 ring-1 ring-white/5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFB23E]/15">
            <Star className="h-5 w-5 text-[#FFB23E]" strokeWidth={1.8} />
          </div>
          <div>
            <p className="text-sm font-bold text-[#F7F4FF]">Rate Attend75</p>
            <p className="text-[10px] text-[#9F9AB5]">Tap a star to send a quick review</p>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onClick={() => handleRating(star)}
              onMouseEnter={() => setHoverRating(star)}
              onMouseLeave={() => setHoverRating(0)}
              className="transition-transform duration-150 active:scale-90"
              aria-label={`Rate ${star} star${star > 1 ? 's' : ''}`}
            >
              <Star
                className="h-7 w-7"
                strokeWidth={1.5}
                fill={(hoverRating || rating) >= star ? '#FFB23E' : 'none'}
                stroke={(hoverRating || rating) >= star ? '#FFB23E' : '#6E6A88'}
              />
            </button>
          ))}
        </div>
      </div>

      {/* Premium & Notifications */}
      {(() => {
        const isPremiumActive = premiumStatus?.is_premium === true
        const expiryDate = premiumStatus?.expiry_date ? new Date(premiumStatus.expiry_date) : null
        const daysRemaining = expiryDate ? Math.max(0, Math.ceil((expiryDate - new Date()) / (1000 * 60 * 60 * 24))) : null
        const needsRenewal = !isPremiumActive || (daysRemaining !== null && daysRemaining <= 3)

        if (isPremiumActive && !needsRenewal) {
          // Active premium — show green "Premium Active" badge
          return (
            <button
              type="button"
              onClick={() => navigate('/app/premium')}
              className="flex w-full items-center gap-3 rounded-2xl px-4 py-4 ring-1 ring-[#4EF0A0]/20 transition active:scale-[0.99] hover:bg-[#4EF0A0]/5"
              style={{ background: 'linear-gradient(135deg, rgba(78,240,160,0.08) 0%, rgba(78,240,160,0.02) 100%)' }}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#4EF0A0]/15">
                <Crown className="h-5 w-5 text-[#4EF0A0]" strokeWidth={1.8} />
              </div>
              <div className="min-w-0 flex-1 text-left">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-[#F7F4FF]">Premium Active</p>
                  <span className="rounded-full bg-[#4EF0A0]/15 px-2 py-0.5 text-[9px] font-bold text-[#4EF0A0]">✓</span>
                </div>
                <p className="text-[10px] text-[#9F9AB5]">
                  {daysRemaining !== null ? `Renews in ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}` : 'All features unlocked'}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-[#9F9AB5]" />
            </button>
          )
        }

        if (isPremiumActive && needsRenewal) {
          // Expiring soon or in grace — show amber "Renew Premium" CTA
          return (
            <button
              type="button"
              onClick={() => navigate('/app/premium')}
              className="flex w-full items-center gap-3 rounded-2xl px-4 py-4 ring-1 ring-[#FFB23E]/25 transition active:scale-[0.99] hover:bg-[#FFB23E]/5"
              style={{ background: 'linear-gradient(135deg, rgba(255,178,62,0.1) 0%, rgba(255,178,62,0.02) 100%)' }}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFB23E]/15">
                <Crown className="h-5 w-5 text-[#FFB23E]" strokeWidth={1.8} />
              </div>
              <div className="min-w-0 flex-1 text-left">
                <p className="text-sm font-bold text-[#F7F4FF]">Renew Premium</p>
                <p className="text-[10px] text-[#FFB23E]">
                  {daysRemaining === 0 ? 'Expires today — renew to keep alerts' : `${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} left — renew now`}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-[#FFB23E] px-3 py-1 text-[10px] font-bold text-[#1D183E]">Renew</span>
            </button>
          )
        }

        if (!isPremiumActive && premiumStatus?.status === 'expired') {
          // Expired — show red-ish "Renew Premium"
          return (
            <button
              type="button"
              onClick={() => navigate('/app/premium')}
              className="flex w-full items-center gap-3 rounded-2xl px-4 py-4 ring-1 ring-[#FF916C]/25 transition active:scale-[0.99] hover:bg-[#FF916C]/5"
              style={{ background: 'linear-gradient(135deg, rgba(255,145,108,0.1) 0%, rgba(255,145,108,0.02) 100%)' }}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FF916C]/15">
                <Crown className="h-5 w-5 text-[#FF916C]" strokeWidth={1.8} />
              </div>
              <div className="min-w-0 flex-1 text-left">
                <p className="text-sm font-bold text-[#F7F4FF]">Renew Premium</p>
                <p className="text-[10px] text-[#FF916C]">Subscription expired — renew to resume alerts</p>
              </div>
              <span className="shrink-0 rounded-full bg-[#FF916C] px-3 py-1 text-[10px] font-bold text-[#1D183E]">Renew</span>
            </button>
          )
        }

        // Default: not premium — show subscribe CTA
        return (
          <button
            type="button"
            onClick={() => navigate('/app/premium')}
            className="flex w-full items-center gap-3 rounded-2xl bg-[#4A466A] px-4 py-4 ring-1 ring-white/5 transition active:scale-[0.99] hover:bg-[#565275]"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FF916C]/15">
              <Crown className="h-5 w-5 text-[#FF916C]" strokeWidth={1.8} />
            </div>
            <div className="min-w-0 flex-1 text-left">
              <p className="text-sm font-bold text-[#F7F4FF]">Get Premium</p>
              <p className="text-[10px] text-[#9F9AB5]">Push notifications, class reminders & more</p>
            </div>
            <span className="shrink-0 rounded-full bg-[#FF916C] px-3 py-1 text-[10px] font-bold text-[#1D183E]">₹19/mo</span>
          </button>
        )
      })()}

      {/* Share */}
      <div className="rounded-2xl bg-[#4A466A] px-4 py-4 ring-1 ring-white/5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#6CB4FF]/15">
            <Share2 className="h-5 w-5 text-[#6CB4FF]" strokeWidth={1.8} />
          </div>
          <div>
            <p className="text-sm font-bold text-[#F7F4FF]">Share with classmates</p>
            <p className="text-[10px] text-[#9F9AB5]">They get the streak. You get the karma.</p>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          {['WhatsApp', 'Instagram', 'Copy link'].map((label) => (
            <button
              key={label}
              type="button"
              onClick={() => handleShare(label.toLowerCase().replace(' ', ''))}
              className="rounded-full border border-white/15 px-3.5 py-1.5 text-[11px] font-semibold text-[#D8D4E7] transition active:scale-95 hover:bg-white/5"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Feedback */}
      <div className="rounded-2xl bg-[#4A466A] px-4 py-4 ring-1 ring-white/5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#C77DFF]/15">
            <MessageSquare className="h-5 w-5 text-[#C77DFF]" strokeWidth={1.8} />
          </div>
          <div>
            <p className="text-sm font-bold text-[#F7F4FF]">Send feedback</p>
            <p className="text-[10px] text-[#9F9AB5]">What should we build next?</p>
          </div>
        </div>
        <form onSubmit={handleFeedbackSubmit} className="mt-3">
          <textarea
            value={feedbackMessage}
            onChange={(e) => { setFeedbackMessage(e.target.value); setFeedbackStatus(''); setFeedbackError('') }}
            placeholder="What's missing?"
            rows={3}
            className="w-full rounded-xl border border-white/10 bg-[#3D3660] px-3 py-2.5 text-sm text-[#F7F4FF] placeholder:text-[#6E6A88] outline-none focus:border-[#FF916C]/40"
          />
          {feedbackError ? <p className="mt-1 text-[10px] text-[#FF5B5B]">{feedbackError}</p> : null}
          {feedbackStatus ? <p className="mt-1 text-[10px] text-[#4EF0A0]">{feedbackStatus}</p> : null}
          <button
            type="submit"
            disabled={isSubmittingFeedback}
            className="mt-2 rounded-full bg-[#FF916C] px-4 py-1.5 text-[11px] font-bold text-[#1D183E] transition active:scale-95 disabled:opacity-60"
          >
            {isSubmittingFeedback ? 'Sending...' : 'Send'}
          </button>
        </form>
      </div>

      {/* Install / App Status */}
      {isInstalled ? (
        <div className="flex items-center gap-3 rounded-2xl bg-[#4EF0A0]/10 px-4 py-3 ring-1 ring-[#4EF0A0]/20">
          <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-[#4EF0A0]" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <p className="text-xs font-semibold text-[#4EF0A0]">Running as installed app</p>
        </div>
      ) : canInstall ? (
        <button
          type="button"
          onClick={promptInstall}
          className="flex w-full items-center gap-3 rounded-2xl bg-[#4A466A] px-4 py-4 ring-1 ring-white/5 transition active:scale-[0.99] hover:bg-[#565275]"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FF916C]/15">
            <svg viewBox="0 0 24 24" className="h-5 w-5 text-[#FF916C]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </div>
          <div className="min-w-0 flex-1 text-left">
            <p className="text-sm font-bold text-[#F7F4FF]">Install Attend75</p>
            <p className="text-[10px] text-[#9F9AB5]">Add to home screen for quick access</p>
          </div>
          <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-[#9F9AB5]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      ) : isIOS ? (
        <div className="rounded-2xl bg-[#4A466A] px-4 py-3 ring-1 ring-white/5">
          <p className="text-xs font-semibold text-[#F7F4FF]">Install Attend75</p>
          <p className="mt-1 text-[10px] leading-relaxed text-[#9F9AB5]">
            Tap <span className="font-semibold text-[#6CB4FF]">Share</span> → <span className="font-semibold text-[#4EF0A0]">Add to Home Screen</span> in Safari to install.
          </p>
        </div>
      ) : null}

      {/* Logout */}
      <button
        type="button"
        onClick={handleLogout}
        className="flex w-full items-center gap-3 rounded-2xl bg-[#4A466A]/60 px-4 py-4 text-sm font-semibold text-[#FF5B5B] ring-1 ring-[#FF5B5B]/20 transition active:scale-[0.99] hover:bg-[#FF5B5B]/5"
      >
        <LogOut className="h-4 w-4" strokeWidth={2} />
        Log out
      </button>

      {/* Follow the creator - mobile only (desktop has it in sidebar) */}
      <div className="md:hidden">
        <FollowCreatorSection />
      </div>

      {/* Footer */}
      <p className="text-center text-[10px] text-[#6E6A88]">
        Attend<span className="text-[#FF916C]">75</span> · Made for ICFAI / IBS students
      </p>

      {/* Settings sheet */}
      {showSettings && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setShowSettings(false) }}
        >
          <div className="w-full max-w-md overflow-hidden rounded-t-[28px] bg-[#1E1B2E] shadow-2xl">
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="h-1 w-10 rounded-full bg-white/20" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-3 pb-4">
              <div className="flex items-center gap-2.5">
                <Settings className="h-4 w-4 text-[#9F9AB5]" strokeWidth={1.8} />
                <h2 className="text-[15px] font-bold text-[#F7F4FF]">Settings</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowSettings(false)}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-white/8 text-[#9F9AB5] transition hover:bg-white/15"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="px-4 pb-8 space-y-3">
              {/* Notification enable/disable */}
              <div>
                <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-wider text-[#9F9AB5]/70">
                  Push Notifications
                </p>

                {/* Subscription status row */}
                <div className="rounded-2xl bg-white/[0.05] ring-1 ring-white/[0.07] px-4 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${isSubscribed ? 'bg-[#4EF0A0]/15' : 'bg-white/8'}`}>
                      {isSubscribed
                        ? <Bell className="h-4 w-4 text-[#4EF0A0]" strokeWidth={1.8} />
                        : <BellOff className="h-4 w-4 text-[#9F9AB5]" strokeWidth={1.8} />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-[#F7F4FF]">
                        {isSubscribed ? 'Notifications active' : 'Notifications off'}
                      </p>
                      <p className="text-[10px] text-[#9F9AB5] leading-snug">
                        {isSubscribed
                          ? 'You\'ll get alerts even when the app is closed'
                          : permissionState === 'denied'
                            ? 'Blocked in browser — go to Site Settings to allow'
                            : 'Enable to get notice & attendance alerts'
                        }
                      </p>
                    </div>
                    {!isSubscribed && permissionState !== 'denied' && (
                      <button
                        type="button"
                        onClick={handleEnablePush}
                        disabled={isEnabling}
                        className="shrink-0 rounded-full bg-[#FF916C] px-3.5 py-1.5 text-[11px] font-bold text-[#1D183E] transition active:scale-95 disabled:opacity-60"
                      >
                        {isEnabling ? 'Enabling…' : 'Enable'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Per-category toggles (only when subscribed + prefs loaded) */}
                {isSubscribed && prefs && (
                  <div className="mt-2 space-y-1.5">
                    {[
                      { key: 'noticesEnabled', label: 'Notice alerts', desc: 'New college notices' },
                      { key: 'attendanceEnabled', label: 'Attendance warnings', desc: 'When you drop below 75%' },
                      { key: 'timetableEnabled', label: 'Class reminders', desc: 'Before your classes start' },
                      { key: 'dailyDigestEnabled', label: 'Daily digest', desc: 'Morning class summary' },
                      { key: 'weeklySummaryEnabled', label: 'Weekly summary', desc: 'Monday attendance recap' },
                    ].map(({ key, label, desc }) => (
                      <div
                        key={key}
                        className="flex items-center justify-between rounded-xl bg-white/[0.04] px-4 py-3 ring-1 ring-white/[0.06]"
                      >
                        <div className="min-w-0 flex-1 pr-3">
                          <p className="text-[12px] font-semibold text-[#F7F4FF]">{label}</p>
                          <p className="text-[10px] text-[#9F9AB5]">{desc}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleNotificationToggle(key, !prefs[key])}
                          disabled={isSaving}
                          aria-label={`Toggle ${label}`}
                          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${prefs[key] ? 'bg-[#4EF0A0]' : 'bg-white/10'}`}
                        >
                          <div className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-200 ${prefs[key] ? 'left-[22px]' : 'left-0.5'}`} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Divider */}
              <div className="h-px bg-white/[0.07]" />

              {/* Full settings link */}
              <button
                type="button"
                onClick={() => { setShowSettings(false); navigate('/app/notification-settings') }}
                className="flex w-full items-center justify-between rounded-xl bg-white/[0.04] px-4 py-3 ring-1 ring-white/[0.06] transition hover:bg-white/[0.07] active:scale-[0.98]"
              >
                <p className="text-[12px] font-semibold text-[#F7F4FF]">All notification settings</p>
                <ChevronRight className="h-4 w-4 text-[#9F9AB5]" />
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

export default Profile
