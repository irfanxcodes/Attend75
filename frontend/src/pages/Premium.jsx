import { useEffect, useState } from 'react'
import { Bell, Check, ChevronLeft, Crown, LogIn, Shield, Zap } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import useAppStore from '../hooks/useAppStore'
import { getPremiumStatus, joinPremiumWaitlist } from '../services/premiumApi'

const FEATURES = [
  { icon: Bell, label: 'Real-time notice alerts', desc: 'Get notified instantly when new notices are posted' },
  { icon: Zap, label: 'Attendance warnings', desc: 'Alerts when you\'re near the 75% danger zone with recovery steps' },
  { icon: Shield, label: 'Class reminders*', desc: 'Never miss a class with timely reminders + tomorrow preview' },
  { icon: Crown, label: 'Daily & weekly digests', desc: 'Morning schedule + Monday attendance recap with trends' },
]

function Premium() {
  const { state: { session, user } } = useAppStore()
  const token = session.token
  const navigate = useNavigate()
  const [status, setStatus] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [waitlistError, setWaitlistError] = useState('')
  const [waitlistSuccess, setWaitlistSuccess] = useState(false)
  const [isJoining, setIsJoining] = useState(false)

  const isGuest = user.authProvider === 'guest' || !user.authProvider || user.authProvider === 'demo'

  useEffect(() => {
    if (!token) return
    getPremiumStatus({ token })
      .then(setStatus)
      .catch(() => setStatus({ is_premium: false, status: 'none' }))
      .finally(() => setIsLoading(false))
  }, [token])

  if (isLoading) {
    return (
      <div className="flex min-h-[60dvh] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#FF916C] border-t-transparent" />
      </div>
    )
  }

  const isPremium = status?.is_premium
  const isGrace = status?.status === 'grace'

  return (
    <section className="pb-24">
      <header className="flex items-center gap-3 px-1 pb-4">
        <button type="button" onClick={() => navigate(-1)} className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10">
          <ChevronLeft className="h-4 w-4 text-[#F7F4FF]" />
        </button>
        <h1 className="text-xl font-bold text-[#F7F4FF]">Premium</h1>
      </header>

      {/* Grace period banner */}
      {isGrace && (
        <div className="mb-4 rounded-xl bg-[#FFB23E]/15 p-3 ring-1 ring-[#FFB23E]/30">
          <p className="text-[12px] font-semibold text-[#FFB23E]">
            ⚠️ Grace period — {status.grace_remaining_days} day{status.grace_remaining_days !== 1 ? 's' : ''} remaining
          </p>
          <p className="mt-1 text-[10px] text-[#D8D4E7]">Renew your subscription to keep receiving notifications.</p>
        </div>
      )}

      {/* Active subscription info */}
      {isPremium && !isGrace && (
        <div className="mb-4 rounded-xl bg-[#4EF0A0]/10 p-4 ring-1 ring-[#4EF0A0]/20">
          <div className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-[#4EF0A0]" />
            <p className="text-[14px] font-bold text-[#4EF0A0]">Premium Active</p>
          </div>
          <p className="mt-1 text-[11px] text-[#D8D4E7]">
            Expires: {status.expiry_date ? new Date(status.expiry_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'}
          </p>
          <button
            type="button"
            onClick={() => navigate('/app/notification-settings')}
            className="mt-3 rounded-full bg-white/10 px-4 py-1.5 text-[11px] font-semibold text-[#F7F4FF]"
          >
            Manage notification settings →
          </button>
        </div>
      )}

      {/* Gmail linking prompt for guest premium users */}
      {isPremium && isGuest && (
        <div className="mb-4 rounded-xl bg-[#6CB4FF]/10 p-4 ring-1 ring-[#6CB4FF]/20">
          <div className="flex items-center gap-2">
            <LogIn className="h-5 w-5 text-[#6CB4FF]" />
            <p className="text-[13px] font-bold text-[#6CB4FF]">Link your Google account</p>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-[#D8D4E7]">
            To get <span className="font-semibold text-[#F7F4FF]">background attendance alerts</span> (even without opening the app), link your Google account. This lets us securely check your attendance every 6 hours.
          </p>
          <button
            type="button"
            onClick={() => navigate('/app/profile')}
            className="mt-3 w-full rounded-xl bg-[#6CB4FF] py-2.5 text-[12px] font-bold text-[#1D183E] transition active:scale-[0.97]"
          >
            Link Google Account →
          </button>
        </div>
      )}

      {/* Upsell section (for non-premium) */}
      {!isPremium && (
        <>
          <div className="rounded-2xl bg-gradient-to-br from-[#FF916C]/20 to-[#A78BFA]/20 p-5 ring-1 ring-white/10">
            <div className="flex items-center gap-2">
              <Crown className="h-6 w-6 text-[#FF916C]" />
              <h2 className="text-lg font-bold text-[#F7F4FF]">Go Premium</h2>
            </div>
            <p className="mt-2 text-[13px] text-[#D8D4E7]">
              Get real-time push notifications for notices, attendance warnings, class reminders, and more.
            </p>
            <div className="mt-4 flex items-baseline gap-1">
              <span className="text-3xl font-bold text-[#F7F4FF]">₹19</span>
              <span className="text-[13px] text-[#9F9AB5]">/month</span>
            </div>
            <p className="mt-1 text-[10px] text-[#9F9AB5]">UPI autopay · Cancel anytime</p>

            <button
              type="button"
              className="mt-4 w-full rounded-2xl bg-[#FF916C] py-3.5 text-[14px] font-bold text-[#1D183E] shadow-lg transition active:scale-[0.97] disabled:opacity-60"
              disabled={isJoining || waitlistSuccess}
              onClick={async () => {
                setWaitlistError('')
                setIsJoining(true)
                try {
                  await joinPremiumWaitlist({ token })
                  setWaitlistSuccess(true)
                } catch (err) {
                  setWaitlistError(err.message || 'Unable to join waitlist. Please try again.')
                } finally {
                  setIsJoining(false)
                }
              }}
            >
              {waitlistSuccess ? '✓ You\'re on the waitlist!' : isJoining ? 'Joining...' : 'Join Waitlist'}
            </button>
            {waitlistSuccess && (
              <p className="mt-2 text-center text-[11px] text-[#4EF0A0]">We'll notify you when Premium launches.</p>
            )}
            {waitlistError && (
              <p className="mt-2 text-center text-[11px] text-[#FF5B5B]">{waitlistError}</p>
            )}
          </div>

          {/* Features list */}
          <div className="mt-5 space-y-3">
            <h3 className="px-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#9F9AB5]">What you get</h3>
            {FEATURES.map(({ icon: Icon, label, desc }) => (
              <div key={label} className="flex items-start gap-3 rounded-xl bg-[#2E2A3A] p-3 ring-1 ring-white/5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#FF916C]/15">
                  <Icon className="h-4 w-4 text-[#FF916C]" />
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-[#F7F4FF]">{label}</p>
                  <p className="text-[10px] text-[#9F9AB5]">{desc}</p>
                </div>
              </div>
            ))}
          </div>

          <p className="mt-4 text-center text-[9px] text-[#7a6f94]">
            *Class reminders available for programs with digital timetables (BBA/B.Com).
          </p>
          <p className="mt-1 text-center text-[9px] text-[#7a6f94]">
            Background attendance monitoring requires Google account linking.
          </p>
        </>
      )}
    </section>
  )
}

export default Premium
