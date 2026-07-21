import { useEffect, useState } from 'react'
import { Bell, BellOff, ChevronLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import useAppStore from '../hooks/useAppStore'
import { getPreferences, updatePreferences } from '../services/pushApi'
import { requestPushSubscription, isPushSubscribed, getNotificationPermission, ensurePushRegistered } from '../pwa/push/subscribe'

const CATEGORY_LABELS = [
  { key: 'noticeExam', label: 'Exam', color: '#FF5B5B' },
  { key: 'noticeFee', label: 'Fee', color: '#FFB23E' },
  { key: 'noticeAcademic', label: 'Academic', color: '#6CB4FF' },
  { key: 'noticeInternship', label: 'Internship', color: '#A78BFA' },
  { key: 'noticeEvent', label: 'Event', color: '#4EF0A0' },
  { key: 'noticeGuestLecture', label: 'Guest Lecture', color: '#D97706' },
  { key: 'noticeGeneral', label: 'General', color: '#7a6f94' },
]

const LEAD_TIME_OPTIONS = [10, 15, 30, 60]

function BatteryOptimizationTip() {
  const [dismissed, setDismissed] = useState(() => localStorage.getItem('attend75_battery_tip_dismissed') === '1')
  const [expanded, setExpanded] = useState(false)

  if (dismissed) return null

  const handleDismiss = () => {
    localStorage.setItem('attend75_battery_tip_dismissed', '1')
    setDismissed(true)
  }

  // Detect phone brand for targeted instructions
  const ua = navigator.userAgent
  let brand = 'your phone'
  let steps = []
  if (/samsung/i.test(ua)) {
    brand = 'Samsung'
    steps = ['Settings → Apps → Chrome', 'Battery → Unrestricted', 'Also: Settings → Battery → Background usage limits → Never sleeping apps → Add Chrome']
  } else if (/xiaomi|miui|redmi|poco/i.test(ua)) {
    brand = 'Xiaomi/Redmi'
    steps = ['Settings → Apps → Manage apps → Chrome', 'Battery saver → No restrictions', 'Also: Security → Battery → App battery saver → Chrome → No restrictions']
  } else if (/oneplus|oppo|realme/i.test(ua)) {
    brand = 'OnePlus/Realme'
    steps = ['Settings → Battery → Battery optimization', 'Find Chrome → Don\'t optimize', 'Also: Settings → Apps → Chrome → Battery → Allow background activity']
  } else {
    steps = ['Settings → Apps → Chrome → Battery', 'Set to "Unrestricted" or "Don\'t optimize"', 'This ensures notifications arrive even when the app is closed']
  }

  return (
    <div className="mt-3 rounded-2xl bg-gradient-to-br from-[#FF916C]/10 to-[#FF916C]/5 p-4 ring-1 ring-[#FF916C]/20">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#FF916C]/15">
            <span className="text-sm">🔋</span>
          </div>
          <div>
            <p className="text-[12px] font-semibold text-[#F7F4FF]">Get instant notifications</p>
            <p className="mt-0.5 text-[10px] leading-relaxed text-[#9F9AB5]">
              {brand} may delay notifications to save battery. A quick settings change fixes this.
            </p>
          </div>
        </div>
        <button type="button" onClick={handleDismiss} className="shrink-0 p-1 text-[#9F9AB5] hover:text-[#F7F4FF]">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      {!expanded ? (
        <button type="button" onClick={() => setExpanded(true)} className="mt-3 flex items-center gap-1.5 rounded-lg bg-[#FF916C]/15 px-3 py-1.5 text-[10px] font-semibold text-[#FF916C] transition active:scale-95">
          <span>Show me how</span>
          <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      ) : (
        <div className="mt-3 space-y-2">
          {steps.map((step, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#FF916C]/20 text-[8px] font-bold text-[#FF916C]">{i + 1}</span>
              <p className="text-[10px] leading-relaxed text-[#d8d4e7]">{step}</p>
            </div>
          ))}
          <div className="mt-2 flex items-center gap-2">
            <button type="button" onClick={handleDismiss} className="rounded-lg bg-[#4EF0A0]/15 px-3 py-1.5 text-[10px] font-semibold text-[#4EF0A0] transition active:scale-95">
              ✓ Done, got it
            </button>
            <span className="text-[9px] text-[#7a6f94]">Takes 30 seconds</span>
          </div>
        </div>
      )}
    </div>
  )
}

function NotificationSettings() {
  const { state: { session } } = useAppStore()
  const token = session.token
  const navigate = useNavigate()
  const [prefs, setPrefs] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [permissionState, setPermissionState] = useState('default')
  const [fcmStatus, setFcmStatus] = useState(null) // null | 'checking' | 'ok:TOKEN' | 'error:MSG'

  useEffect(() => {
    if (!token) return
    setIsLoading(true)
    Promise.all([
      getPreferences({ token }),
      isPushSubscribed(),
    ]).then(async ([prefsData, subscribed]) => {
      setPrefs(prefsData)
      setIsSubscribed(subscribed)
      setPermissionState(getNotificationPermission())
      if (subscribed) {
        await ensurePushRegistered(token)
      }
      // Try FCM token registration and show status
      if (Notification.permission === 'granted') {
        setFcmStatus('checking')
        try {
          const { getFCMToken } = await import('../services/firebaseMessaging')
          const fcmToken = await getFCMToken()
          if (fcmToken) {
            setFcmStatus('ok:' + fcmToken.substring(0, 15))
            // Register with backend
            const { registerFCMToken } = await import('../services/pushApi')
            await registerFCMToken({ token, fcmToken, deviceInfo: /Android/i.test(navigator.userAgent) ? 'Android' : 'Other' })
          } else {
            setFcmStatus('error:token_null')
          }
        } catch (err) {
          setFcmStatus('error:' + (err?.code || err?.name || err?.message || 'unknown').substring(0, 40))
        }
      }
    }).catch(() => {})
    .finally(() => setIsLoading(false))
  }, [token])

  const handleToggle = async (key, value) => {
    if (!token) return
    setIsSaving(true)
    try {
      const updated = await updatePreferences({ token, [key]: value })
      setPrefs(updated)
    } catch { /* silent */ }
    finally { setIsSaving(false) }
  }

  const handleEnablePush = async () => {
    if (!token) return
    try {
      await requestPushSubscription(token)
      setIsSubscribed(true)
      setPermissionState(getNotificationPermission())
    } catch (err) {
      if (err?.code === 'PREMIUM_REQUIRED') {
        navigate('/app/premium')
      }
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[60dvh] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#FF916C] border-t-transparent" />
      </div>
    )
  }

  return (
    <section className="pb-24">
      <header className="flex items-center gap-3 px-1 pb-4">
        <button type="button" onClick={() => navigate(-1)} className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10">
          <ChevronLeft className="h-4 w-4 text-[#F7F4FF]" />
        </button>
        <h1 className="text-xl font-bold text-[#F7F4FF]">Notification Settings</h1>
      </header>

      {/* Push subscription status */}
      <div className="rounded-2xl bg-[#2E2A3A] p-4 ring-1 ring-white/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isSubscribed ? <Bell className="h-5 w-5 text-[#4EF0A0]" /> : <BellOff className="h-5 w-5 text-[#9F9AB5]" />}
            <div>
              <p className="text-sm font-semibold text-[#F7F4FF]">{isSubscribed ? 'Push Notifications Active' : 'Push Notifications Off'}</p>
              <p className="text-[10px] text-[#9F9AB5]">{isSubscribed ? 'You\'ll receive alerts even when the app is closed' : 'Enable to get real-time alerts'}</p>
            </div>
          </div>
          {!isSubscribed && permissionState !== 'denied' && (
            <button type="button" onClick={handleEnablePush} className="rounded-full bg-[#FF916C] px-3 py-1.5 text-[11px] font-bold text-[#1D183E]">
              Enable
            </button>
          )}
        </div>
        {permissionState === 'denied' && (
          <p className="mt-2 text-[10px] text-[#FF5B5B]">Notifications are blocked. Enable them in your browser settings → Site Settings → Notifications.</p>
        )}
        {fcmStatus && (
          <p className={`mt-2 text-[9px] font-mono ${fcmStatus.startsWith('ok') ? 'text-[#4EF0A0]' : fcmStatus === 'checking' ? 'text-[#FFB23E]' : 'text-[#FF5B5B]'}`}>
            FCM: {fcmStatus}
          </p>
        )}
      </div>

      {/* Background delivery tip — shown on Android when subscribed */}
      {isSubscribed && /Android/i.test(navigator.userAgent) && (
        <BatteryOptimizationTip />
      )}

      {/* PWA install nudge — installed PWAs get more reliable background push */}
      {isSubscribed && !window.matchMedia('(display-mode: standalone)').matches && /Android/i.test(navigator.userAgent) && (
        <div className="mt-3 rounded-2xl bg-[#2E2A3A] p-4 ring-1 ring-white/5">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#6CB4FF]/15">
              <span className="text-sm">📲</span>
            </div>
            <div className="flex-1">
              <p className="text-[11px] font-semibold text-[#F7F4FF]">Install Attend75 for best experience</p>
              <p className="text-[9px] text-[#9F9AB5]">Installed apps receive notifications more reliably in the background</p>
            </div>
          </div>
          <p className="mt-2 ml-11 text-[9px] text-[#7a6f94]">Chrome menu (⋮) → "Add to Home screen" or "Install app"</p>
        </div>
      )}

      {/* iOS: must install PWA for push to work */}
      {!isSubscribed && /iPhone|iPad|iPod/.test(navigator.userAgent) && !window.matchMedia('(display-mode: standalone)').matches && (
        <div className="mt-3 rounded-2xl bg-gradient-to-br from-[#6CB4FF]/10 to-[#6CB4FF]/5 p-4 ring-1 ring-[#6CB4FF]/20">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#6CB4FF]/15">
              <span className="text-sm">🍎</span>
            </div>
            <div>
              <p className="text-[12px] font-semibold text-[#F7F4FF]">iOS requires installation</p>
              <p className="mt-1 text-[10px] leading-relaxed text-[#9F9AB5]">
                Push notifications on iPhone/iPad only work when Attend75 is installed to your Home Screen.
              </p>
              <div className="mt-2.5 space-y-1.5">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#6CB4FF]/20 text-[8px] font-bold text-[#6CB4FF]">1</span>
                  <p className="text-[10px] text-[#d8d4e7]">Tap the Share button (⬆) at the bottom of Safari</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#6CB4FF]/20 text-[8px] font-bold text-[#6CB4FF]">2</span>
                  <p className="text-[10px] text-[#d8d4e7]">Scroll down and tap "Add to Home Screen"</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#6CB4FF]/20 text-[8px] font-bold text-[#6CB4FF]">3</span>
                  <p className="text-[10px] text-[#d8d4e7]">Open Attend75 from your Home Screen and enable notifications here</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {prefs && (
        <>
          {/* Master toggles */}
          <div className="mt-4 space-y-2">
            <h2 className="px-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#9F9AB5]">Categories</h2>
            {[
              { key: 'noticesEnabled', label: 'Notice Alerts', desc: 'New notices from your college' },
              { key: 'attendanceEnabled', label: 'Attendance Alerts', desc: 'Warnings when attendance drops' },
              { key: 'timetableEnabled', label: 'Class Reminders', desc: 'Before your classes start' },
              { key: 'dailyDigestEnabled', label: 'Daily Digest', desc: 'Morning summary of today\'s classes' },
              { key: 'weeklySummaryEnabled', label: 'Weekly Summary', desc: 'Monday attendance recap' },
            ].map(({ key, label, desc }) => (
              <div key={key} className="flex items-center justify-between rounded-xl bg-[#2E2A3A] px-4 py-3 ring-1 ring-white/5">
                <div>
                  <p className="text-[13px] font-semibold text-[#F7F4FF]">{label}</p>
                  <p className="text-[10px] text-[#9F9AB5]">{desc}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggle(key, !prefs[key])}
                  disabled={isSaving}
                  className={`h-6 w-11 rounded-full transition ${prefs[key] ? 'bg-[#4EF0A0]' : 'bg-white/10'}`}
                >
                  <div className={`h-5 w-5 rounded-full bg-white shadow transition ${prefs[key] ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </div>
            ))}
          </div>

          {/* Notice category filters */}
          {prefs.noticesEnabled && (
            <div className="mt-4 space-y-2">
              <h2 className="px-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#9F9AB5]">Notice Categories</h2>
              <div className="grid grid-cols-2 gap-2">
                {CATEGORY_LABELS.map(({ key, label, color }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleToggle(key, !prefs[key])}
                    disabled={isSaving}
                    className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-[11px] font-semibold transition ring-1 ${prefs[key] ? 'ring-white/10 bg-[#2E2A3A] text-[#F7F4FF]' : 'ring-white/5 bg-[#2E2A3A]/50 text-[#9F9AB5] opacity-60'}`}
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: prefs[key] ? color : '#555' }} />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Reminder lead time */}
          {prefs.timetableEnabled && (
            <div className="mt-4">
              <h2 className="px-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#9F9AB5]">Remind me before class</h2>
              <div className="mt-2 flex gap-2">
                {LEAD_TIME_OPTIONS.map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => handleToggle('reminderLeadMinutes', mins)}
                    disabled={isSaving}
                    className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${prefs.reminderLeadMinutes === mins ? 'bg-[#FF916C] text-[#1D183E]' : 'bg-white/5 text-[#9F9AB5]'}`}
                  >
                    {mins} min
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  )
}

export default NotificationSettings
