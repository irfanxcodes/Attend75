import { useEffect, useState } from 'react'
import { Bell, BellOff, ChevronLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import useAppStore from '../hooks/useAppStore'
import { getPreferences, updatePreferences } from '../services/pushApi'
import { requestPushSubscription, isPushSubscribed, getNotificationPermission } from '../pwa/push/subscribe'

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

function NotificationSettings() {
  const { state: { session } } = useAppStore()
  const token = session.token
  const navigate = useNavigate()
  const [prefs, setPrefs] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [permissionState, setPermissionState] = useState('default')

  useEffect(() => {
    if (!token) return
    setIsLoading(true)
    Promise.all([
      getPreferences({ token }),
      isPushSubscribed(),
    ]).then(([prefsData, subscribed]) => {
      setPrefs(prefsData)
      setIsSubscribed(subscribed)
      setPermissionState(getNotificationPermission())
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
      if (err.status === 402) {
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
      </div>

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
