import { useEffect, useState, useRef } from 'react'
import { Bell, BellOff, ChevronLeft, Upload, FileText, CheckCircle, AlertCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import useAppStore from '../hooks/useAppStore'
import { getPreferences, updatePreferences, uploadTimetable } from '../services/pushApi'
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

function TimetableUploadCard({ token, onSuccess }) {
  const fileInputRef = useRef(null)
  const [state, setState] = useState('idle') // idle | uploading | success | error
  const [message, setMessage] = useState('')
  const [result, setResult] = useState(null)
  const [dragging, setDragging] = useState(false)

  const ACCEPTED_TYPES = '.pdf,.jpg,.jpeg,.png,.webp,.bmp,.tiff,.xlsx,.xls'

  const validateFile = (file) => {
    if (!file) return 'No file selected.'
    const name = file.name.toLowerCase()
    const isImage = /\.(jpg|jpeg|png|webp|bmp|tiff?)$/.test(name)
    const isDoc = /\.(pdf|xlsx|xls)$/.test(name)
    if (!isImage && !isDoc) return 'Unsupported file type. Upload a PDF, image (JPG/PNG/WEBP), or XLSX.'
    const maxBytes = (isImage ? 20 : 10) * 1024 * 1024
    if (file.size > maxBytes) return `File too large (max ${isImage ? 20 : 10}MB)`
    return null
  }

  const handleFile = async (file) => {
    if (!file) return
    const validationError = validateFile(file)
    if (validationError) {
      setState('error')
      setMessage(validationError)
      return
    }
    setState('uploading')
    setMessage('')
    setResult(null)
    try {
      const data = await uploadTimetable({ token, file })
      setState('success')
      setResult(data)
      setMessage(`Found ${data.matchedClasses} classes across ${data.daysWithClasses?.length || 0} days. You'll now get class reminders!`)
      if (onSuccess) onSuccess()
    } catch (err) {
      setState('error')
      setMessage(err.message || 'Upload failed. Please try again.')
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  return (
    <div className="mt-3 rounded-2xl bg-gradient-to-br from-[#6CB4FF]/10 to-[#A78BFA]/10 p-4 ring-1 ring-[#6CB4FF]/25">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#6CB4FF]/15">
          <span className="text-base">📅</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-[#F7F4FF]">Get class reminders</p>
          <p className="mt-0.5 text-[10px] leading-relaxed text-[#9F9AB5]">
            Your program's timetable isn't on the portal yet. Upload your timetable (PDF, photo, or Excel) to get notified before every class.
          </p>
        </div>
      </div>

      {/* Upload area */}
      {state !== 'success' && (
        <div
          className={`mt-3 rounded-xl border-2 border-dashed transition cursor-pointer ${
            dragging
              ? 'border-[#6CB4FF] bg-[#6CB4FF]/10'
              : 'border-white/15 bg-white/[0.03] hover:border-[#6CB4FF]/50 hover:bg-[#6CB4FF]/5'
          }`}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
        >
          <div className="flex flex-col items-center justify-center py-5 px-3">
            {state === 'uploading' ? (
              <>
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#6CB4FF] border-t-transparent" />
                <p className="mt-2 text-[11px] text-[#9F9AB5]">Analysing your timetable…</p>
              </>
            ) : (
              <>
                <Upload className="h-6 w-6 text-[#6CB4FF]/60" strokeWidth={1.5} />
                <p className="mt-2 text-[12px] font-semibold text-[#F7F4FF]">Tap to upload your timetable</p>
                <p className="mt-0.5 text-[10px] text-[#9F9AB5]">or drag and drop here</p>
                <div className="mt-2 flex items-center gap-1.5">
                  {['PDF', 'JPG/PNG', 'XLSX'].map((f) => (
                    <span key={f} className="rounded-full bg-white/8 px-2 py-0.5 text-[9px] font-semibold text-[#7a6f94]">{f}</span>
                  ))}
                </div>
              </>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_TYPES}
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        </div>
      )}

      {/* Result feedback */}
      {state === 'success' && (
        <div className="mt-3 flex items-start gap-2.5 rounded-xl bg-[#4EF0A0]/10 p-3 ring-1 ring-[#4EF0A0]/20">
          <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#4EF0A0]" strokeWidth={2} />
          <div>
            <p className="text-[11px] font-semibold text-[#4EF0A0]">Timetable uploaded!</p>
            <p className="mt-0.5 text-[10px] leading-relaxed text-[#9F9AB5]">{message}</p>
            <p className="mt-1 text-[9px] text-[#7a6f94]">Reminders will start from tomorrow at 5:30 AM.</p>
          </div>
        </div>
      )}
      {state === 'error' && (
        <div className="mt-3 flex items-start gap-2.5 rounded-xl bg-[#FF5B5B]/10 p-3 ring-1 ring-[#FF5B5B]/20">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#FF5B5B]" strokeWidth={2} />
          <div>
            <p className="text-[11px] font-semibold text-[#FF5B5B]">Upload failed</p>
            <p className="mt-0.5 text-[10px] leading-relaxed text-[#9F9AB5]">{message}</p>
            <button
              type="button"
              onClick={() => { setState('idle'); setMessage('') }}
              className="mt-1.5 text-[10px] font-semibold text-[#6CB4FF]"
            >
              Try again
            </button>
          </div>
        </div>
      )}

      {/* Help tip */}
      {state === 'idle' || state === 'error' ? (
        <p className="mt-3 text-[9px] leading-relaxed text-[#7a6f94]">
          💡 Get the PDF from your class WhatsApp group or college email, then upload here. Must be the original digital PDF — screenshots won't work.
        </p>
      ) : null}
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
  const [isEnabling, setIsEnabling] = useState(false)
  const [enableMessage, setEnableMessage] = useState(null) // null | 'SUCCESS' | error string
  const [hasTimetable, setHasTimetable] = useState(true) // assume true until we know otherwise

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
        // Check if timetable is matched — to decide whether to show upload card
        try {
          const configuredApiBaseUrl = String(import.meta.env.VITE_API_BASE_URL || '').trim()
          const apiBase = import.meta.env.DEV ? 'http://127.0.0.1:8000' : (configuredApiBaseUrl || '/api')
          const res = await fetch(`${apiBase}/push/timetable-debug?token=${encodeURIComponent(token)}`)
          const json = await res.json()
          const match = json?.data?.timetable_match
          setHasTimetable(match?.status === 'ok' || match?.status === 'no_subscription')
        } catch {
          setHasTimetable(true) // don't show card on error
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
    if (!token || isEnabling) return
    setIsEnabling(true)
    setEnableMessage(null)
    try {
      await requestPushSubscription(token)
      setIsSubscribed(true)
      setPermissionState(getNotificationPermission())
      setEnableMessage('SUCCESS')
    } catch (err) {
      const code = err?.code || ''
      if (code === 'SESSION_EXPIRED') {
        setEnableMessage('Your session has expired. Please go back and log in again.')
      } else if (code === 'IOS_INSTALL_REQUIRED') {
        setEnableMessage('To get notifications on iPhone, install the app first:\n\nIn Safari → tap Share (⬆) → "Add to Home Screen"\n\nThen open from your home screen and enable here.')
      } else if (code === 'PERMISSION_DENIED') {
        setEnableMessage('Notifications are blocked. Go to your device Settings → find this browser/app → enable Notifications.')
      } else if (code === 'SUBSCRIBE_FAILED') {
        setEnableMessage('Could not subscribe in this browser. Try refreshing the page, or use Chrome for the best experience.')
      } else {
        setEnableMessage('Something went wrong. Please try again later.')
      }
    } finally {
      setIsEnabling(false)
    }
  }

  const handleDisablePush = async () => {
    if (!token) return
    try {
      // Unsubscribe from browser push
      if ('serviceWorker' in navigator && 'PushManager' in window) {
        const registration = await navigator.serviceWorker.ready
        const subscription = await registration.pushManager.getSubscription()
        if (subscription) {
          const endpoint = subscription.endpoint
          await subscription.unsubscribe()
          // Also remove from backend
          const { unsubscribePush } = await import('../services/pushApi')
          await unsubscribePush({ token, endpoint })
        }
      }
      setIsSubscribed(false)
      setEnableMessage(null)
    } catch {
      // Silent
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
              <p className="text-[10px] text-[#9F9AB5]">{isSubscribed ? 'Receive alerts for notices, classes & more' : 'Enable to get real-time alerts'}</p>
            </div>
          </div>
          {!isSubscribed && permissionState !== 'denied' && (
            <button type="button" onClick={handleEnablePush} disabled={isEnabling} className="rounded-full bg-[#FF916C] px-3 py-1.5 text-[11px] font-bold text-[#1D183E] disabled:opacity-60">
              {isEnabling ? 'Enabling…' : 'Enable'}
            </button>
          )}
          {isSubscribed && (
            <button type="button" onClick={handleDisablePush} className="rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-[#9F9AB5]">
              Disable
            </button>
          )}
        </div>
        {permissionState === 'denied' && (
          <p className="mt-2 text-[10px] text-[#FF5B5B]">Notifications are blocked. Enable them in your browser settings → Site Settings → Notifications.</p>
        )}
        {enableMessage && enableMessage !== 'SUCCESS' && (
          <p className="mt-2 text-[10px] text-[#FF5B5B] whitespace-pre-line">{enableMessage}</p>
        )}
        {enableMessage === 'SUCCESS' && (
          <p className="mt-2 text-[10px] text-[#4EF0A0] font-semibold">✓ Notifications enabled! You'll receive real-time alerts.</p>
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

      {/* Timetable upload card — shown when subscribed but no timetable match found */}
      {isSubscribed && !hasTimetable && (
        <TimetableUploadCard
          token={token}
          onSuccess={() => setHasTimetable(true)}
        />
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
