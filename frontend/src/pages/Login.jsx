import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import useAppStore from '../hooks/useAppStore'
import { isFirebaseAuthError, isPortalCredentialError, linkFirebaseCredentials, login, loginWithFirebase } from '../services/attendanceApi'
import { signInWithGoogleAndGetIdToken, signOutFirebaseUser } from '../services/firebaseAuth'

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-[17px] w-[17px] text-slate-300">
      <path
        fill="currentColor"
        d="M12 12a4.25 4.25 0 1 0 0-8.5 4.25 4.25 0 0 0 0 8.5Zm0 1.5c-3.18 0-9.5 1.6-9.5 4.75V20h19v-1.75c0-3.15-6.32-4.75-9.5-4.75Z"
      />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-[17px] w-[17px] text-slate-300">
      <path
        fill="currentColor"
        d="M7.75 10V8a4.25 4.25 0 1 1 8.5 0v2h1A2.75 2.75 0 0 1 20 12.75v6.5A2.75 2.75 0 0 1 17.25 22h-10.5A2.75 2.75 0 0 1 4 19.25v-6.5A2.75 2.75 0 0 1 6.75 10h1Zm1.5 0h5V8a2.75 2.75 0 0 0-5.5 0v2Zm-2.5 1.5a1.25 1.25 0 0 0-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25h-10.5Z"
      />
    </svg>
  )
}

function EyeIcon({ open }) {
  if (open) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-[17px] w-[17px] text-slate-300">
        <path
          fill="currentColor"
          d="M12 5.5c4.8 0 8.48 2.93 9.93 6.17a.75.75 0 0 1 0 .66C20.48 15.57 16.8 18.5 12 18.5S3.52 15.57 2.07 12.33a.75.75 0 0 1 0-.66C3.52 8.43 7.2 5.5 12 5.5Zm0 1.5c-4.04 0-7.17 2.34-8.4 5 1.23 2.66 4.36 5 8.4 5s7.17-2.34 8.4-5c-1.23-2.66-4.36-5-8.4-5Zm0 2.25a2.75 2.75 0 1 1 0 5.5 2.75 2.75 0 0 1 0-5.5Z"
        />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-[17px] w-[17px] text-slate-300">
      <path
        fill="currentColor"
        d="M3.28 2.22a.75.75 0 0 0-1.06 1.06l2.22 2.22A12.16 12.16 0 0 0 2.07 11.67a.75.75 0 0 0 0 .66C3.52 15.57 7.2 18.5 12 18.5c1.74 0 3.33-.39 4.72-1.03l4 4a.75.75 0 1 0 1.06-1.06L3.28 2.22ZM12 17c-4.04 0-7.17-2.34-8.4-5 .5-1.08 1.32-2.11 2.38-2.94l1.92 1.92A3.98 3.98 0 0 0 12 16a3.97 3.97 0 0 0 2.98-1.34l.66.66A9.58 9.58 0 0 1 12 17Zm0-9.75c2.9 0 5.41 1.2 7.1 2.98a9.58 9.58 0 0 1 1.3 1.77 10.3 10.3 0 0 1-1.95 2.67l-1.08-1.08A3.97 3.97 0 0 0 12 8a4.1 4.1 0 0 0-.82.08L9.66 6.56A10.47 10.47 0 0 1 12 7.25Z"
      />
    </svg>
  )
}

function Login() {
  const navigate = useNavigate()
  const { actions } = useAppStore()
  const [form, setForm] = useState({ username: '', password: '' })
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false)
  const [firebaseToken, setFirebaseToken] = useState('')
  const [showLinkingForm, setShowLinkingForm] = useState(false)
  const [linkForm, setLinkForm] = useState({ rollNumber: '', password: '' })
  const [isLinkingSubmitting, setIsLinkingSubmitting] = useState(false)
  const [linkError, setLinkError] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()

    try {
      setError('')
      setIsSubmitting(true)
      const session = await login(form)
      actions.setAuthSession(session)
      actions.setAttendanceData(session.attendanceData)
      navigate('/loading')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleGoogleSignIn() {
    try {
      setError('')
      setLinkError('')
      setIsGoogleSubmitting(true)

      const googleResult = await signInWithGoogleAndGetIdToken()
      const token = googleResult.idToken
      setFirebaseToken(token)

      const firebaseResult = await loginWithFirebase(token)

      if (firebaseResult.linked && firebaseResult.session) {
        actions.setAuthSession(firebaseResult.session)
        actions.setAttendanceData(firebaseResult.session.attendanceData)
        navigate('/loading')
        return
      }

      setLinkForm({ rollNumber: '', password: '' })
      setShowLinkingForm(true)
    } catch (requestError) {
      if (isPortalCredentialError(requestError)) {
        setLinkError(requestError.message)
        setShowLinkingForm(true)
        return
      }
      if (isFirebaseAuthError(requestError)) {
        await signOutFirebaseUser()
        window.location.reload()
        return
      }
      setError(requestError.message)
    } finally {
      setIsGoogleSubmitting(false)
    }
  }

  async function handleLinkCredentials(event) {
    event.preventDefault()

    try {
      setLinkError('')
      setIsLinkingSubmitting(true)

      const linkResult = await linkFirebaseCredentials({
        idToken: firebaseToken,
        rollNumber: linkForm.rollNumber,
        password: linkForm.password,
      })

      if (!linkResult.linked || !linkResult.session) {
        throw new Error('Credential linking is not complete yet. Please try again.')
      }

      actions.setAuthSession(linkResult.session)
      actions.setAttendanceData(linkResult.session.attendanceData)
      navigate('/loading')
    } catch (requestError) {
      if (isFirebaseAuthError(requestError)) {
        await signOutFirebaseUser()
        window.location.reload()
        return
      }
      setLinkError(requestError.message)
    } finally {
      setIsLinkingSubmitting(false)
    }
  }

  return (
    <section className="min-h-dvh bg-[#4B467C] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:pt-6">
      <form onSubmit={handleSubmit} className="mx-auto flex min-h-[calc(100dvh-2rem)] w-full max-w-md flex-col justify-between sm:min-h-[calc(100dvh-3rem)]">
        <header className="pt-4 text-center sm:pt-8">
          <h1 className="text-3xl font-bold text-[#F5F5F5] sm:text-[34px]">Attend75</h1>
        </header>

        <div>
          <h2 className="text-xl font-semibold text-[#E8A08C] underline decoration-[#E8A08C] underline-offset-[6px] sm:text-[22px]">Sign in</h2>

          <div className="mt-5 space-y-5">
            <label className="block">
              <span className="text-xs text-slate-300">Login id</span>
              <div className="mt-1 flex items-center gap-2 border-b border-white/30 py-2 focus-within:border-white/80">
                <UserIcon />
                <input
                  type="text"
                  value={form.username}
                  onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
                  placeholder="24FMUCHH01XXXX"
                  className="w-full bg-transparent text-sm text-white placeholder:text-slate-300 outline-none"
                />
              </div>
            </label>

            <label className="block">
              <span className="text-xs text-slate-300">Password</span>
              <div className="mt-1 flex items-center gap-2 border-b border-white/30 py-2 focus-within:border-white/80">
                <LockIcon />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                  placeholder="enter your password"
                  className="w-full bg-transparent text-sm text-white placeholder:text-slate-300 outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="rounded p-0.5"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  <EyeIcon open={showPassword} />
                </button>
              </div>
            </label>
          </div>

          {error ? (
            <p className="mt-4 rounded-md border border-rose-300/50 bg-rose-500/15 px-3 py-2 text-xs text-rose-100">{error}</p>
          ) : null}
        </div>

        <div className="pt-6 sm:pt-[30px]">
          <button
            type="submit"
            disabled={isSubmitting}
            className="h-[45px] w-full rounded-[10px] bg-[#E8A08C] text-base font-semibold text-[#181818] transition-transform duration-150 hover:brightness-105 active:scale-[0.99] disabled:opacity-60"
          >
            {isSubmitting ? 'Logging in...' : 'Login as Guest'}
          </button>

          <div className="mb-3 flex items-center gap-2 text-xs text-slate-300">
            <span className="h-px flex-1 bg-white/30" />
            <span>OR</span>
            <span className="h-px flex-1 bg-white/30" />
          </div>

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isGoogleSubmitting || isSubmitting || isLinkingSubmitting}
            className="mb-3 h-[45px] w-full rounded-[10px] border border-white/40 bg-white text-sm font-semibold text-[#181818] transition-transform duration-150 hover:brightness-105 active:scale-[0.99] disabled:opacity-60"
          >
            <span className="inline-flex items-center justify-center gap-2">
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
                <path fill="#EA4335" d="M12.25 10.2v3.92h5.54c-.24 1.27-.96 2.34-2.04 3.06l3.31 2.57c1.93-1.78 3.04-4.4 3.04-7.5 0-.72-.06-1.41-.18-2.05h-9.67Z" />
                <path fill="#34A853" d="M6.5 14.28l-.75.58-2.64 2.05A9.93 9.93 0 0 0 12 22c2.7 0 4.97-.89 6.63-2.43l-3.31-2.57c-.91.61-2.07.98-3.32.98-2.6 0-4.81-1.76-5.6-4.13Z" />
                <path fill="#FBBC05" d="M3.11 7.09A9.88 9.88 0 0 0 2.5 10c0 1.06.17 2.08.61 2.91 0 .01 3.39-2.63 3.39-2.63A5.9 5.9 0 0 1 6.4 10c0-.43.07-.86.2-1.25Z" />
                <path fill="#4285F4" d="M12 5.98c1.47 0 2.78.5 3.82 1.49l2.86-2.86C16.97 3.03 14.7 2 12 2a9.93 9.93 0 0 0-8.89 5.09L6.4 9.75C7.19 7.74 9.4 5.98 12 5.98Z" />
              </svg>
              <span>{isGoogleSubmitting ? 'Signing in with Google...' : 'Sign in with Google'}</span>
            </span>
          </button>

          <p className="mt-2.5 text-center text-xs text-slate-300">Only used to retrieve your attendance</p>
        </div>
      </form>

      {showLinkingForm ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/45 px-3 py-4 backdrop-blur-sm sm:px-6">
          <div className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/20 bg-[#4F487A] p-4 shadow-xl sm:p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-[#F5F5F5]">Link Portal Credentials</h3>
                <p className="mt-1 text-xs text-slate-300">Enter roll number and password once. Your credentials are encrypted.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (isLinkingSubmitting) return
                  setShowLinkingForm(false)
                  setLinkError('')
                }}
                className="rounded-md px-2 py-1 text-sm text-slate-200 hover:bg-white/10"
                aria-label="Close credential linking"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleLinkCredentials} className="space-y-3">
              <input
                type="text"
                value={linkForm.rollNumber}
                onChange={(event) => setLinkForm((current) => ({ ...current, rollNumber: event.target.value }))}
                placeholder="Roll number"
                className="h-[42px] w-full rounded-[8px] border border-white/30 bg-transparent px-3 text-sm text-white placeholder:text-slate-300 outline-none"
              />

              <input
                type="password"
                value={linkForm.password}
                onChange={(event) => setLinkForm((current) => ({ ...current, password: event.target.value }))}
                placeholder="Portal password"
                className="h-[42px] w-full rounded-[8px] border border-white/30 bg-transparent px-3 text-sm text-white placeholder:text-slate-300 outline-none"
              />

              {linkError ? (
                <p className="rounded-md border border-rose-300/50 bg-rose-500/15 px-3 py-2 text-xs text-rose-100">{linkError}</p>
              ) : null}

              <button
                type="submit"
                disabled={isLinkingSubmitting || isGoogleSubmitting || isSubmitting}
                className="h-[42px] w-full rounded-[8px] border border-[#E2BC8B]/85 bg-[#E2BC8B] text-sm font-semibold text-[#1D183E] transition hover:bg-[#D9AA6F] disabled:opacity-60"
              >
                {isLinkingSubmitting ? 'Linking credentials...' : 'Link Credentials'}
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  )
}

export default Login
