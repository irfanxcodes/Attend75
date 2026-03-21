import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

function Loading() {
  const navigate = useNavigate()

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      navigate('/dashboard', { replace: true })
    }, 2000)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [navigate])

  return (
    <section className="flex min-h-screen items-center justify-center bg-[#4B467C] px-6">
      <div className="flex flex-col items-center gap-[14px] text-center">
        <p className="text-[17px] font-medium tracking-[0.5px] text-[#E8A08C]">Fetching Attendance</p>
        <span className="inline-flex text-[20px] leading-none text-[#E8A08C] animate-hourglass">⌛</span>
      </div>
    </section>
  )
}

export default Loading
