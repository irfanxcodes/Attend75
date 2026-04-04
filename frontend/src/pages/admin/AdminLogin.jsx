import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { loginAdminWithPassword, parseAdminSession } from '../../services/adminApi'

function AdminLogin() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const existingSession = parseAdminSession()
    if (existingSession?.sessionToken) {
      navigate('/admin', { replace: true })
    }
  }, [navigate])

  async function handleAdminSignIn(event) {
    event.preventDefault()

    try {
      setError('')
      setIsSubmitting(true)
      await loginAdminWithPassword(username, password)
      navigate('/admin', { replace: true })
    } catch (requestError) {
      setError(requestError.message || 'Unable to sign in as admin.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="flex min-h-dvh items-center justify-center bg-[#48426D] px-4 sm:px-6">
      <div className="w-full max-w-md rounded-2xl border border-white/20 bg-[#5B5485] p-5 shadow-md sm:p-6">
        <h1 className="text-2xl font-bold text-[#F4F1FF]">Admin Dashboard</h1>
        <p className="mt-2 text-sm text-[#D8D3E8]">Sign in with your admin username and password.</p>

        <form onSubmit={handleAdminSignIn} className="mt-5 space-y-3">
          <label className="block space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-[#D8D3E8]">Username</span>
            <input
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              className="h-11 w-full rounded-xl border border-white/20 bg-[#463E69] px-3 text-sm text-[#F4F1FF] placeholder:text-[#B8B0D4] focus:border-[#E2BC8B] focus:outline-none"
              placeholder="Enter admin username"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-[#D8D3E8]">Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              className="h-11 w-full rounded-xl border border-white/20 bg-[#463E69] px-3 text-sm text-[#F4F1FF] placeholder:text-[#B8B0D4] focus:border-[#E2BC8B] focus:outline-none"
              placeholder="Enter admin password"
            />
          </label>

          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-white px-4 text-sm font-semibold text-[#201A43] transition hover:brightness-105 disabled:opacity-60"
          >
            <span>{isSubmitting ? 'Signing in...' : 'Sign in'}</span>
          </button>
        </form>

        {error ? (
          <p className="mt-4 rounded-md border border-rose-300/50 bg-rose-500/15 px-3 py-2 text-xs text-rose-100">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  )
}

export default AdminLogin
