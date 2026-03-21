import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import useAppStore from '../hooks/useAppStore'
import { login } from '../services/attendanceApi'

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

  async function handleSubmit(event) {
    event.preventDefault()

    try {
      setError('')
      setIsSubmitting(true)
      const session = await login(form)
      actions.setAuthSession(session)
      navigate('/loading')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="min-h-screen bg-[#4B467C] p-6">
      <form onSubmit={handleSubmit} className="mx-auto flex min-h-[calc(100vh-48px)] w-full max-w-md flex-col justify-between">
        <header className="pt-10 text-center">
          <h1 className="text-[34px] font-bold text-[#F5F5F5]">Attend75</h1>
        </header>

        <div>
          <h2 className="text-[22px] font-semibold text-[#E8A08C] underline decoration-[#E8A08C] underline-offset-[6px]">Sign in</h2>

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

        <div className="pt-[30px]">
          <button
            type="submit"
            disabled={isSubmitting}
            className="h-[45px] w-full rounded-[10px] bg-[#E8A08C] text-base font-semibold text-[#181818] transition-transform duration-150 hover:brightness-105 active:scale-[0.99] disabled:opacity-60"
          >
            {isSubmitting ? 'Logging in...' : 'Login'}
          </button>

          <p className="mt-2.5 text-center text-xs text-slate-300">Only used to retrieve your attendance</p>
        </div>
      </form>
    </section>
  )
}

export default Login
