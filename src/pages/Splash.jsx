import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

function Splash() {
  const navigate = useNavigate()
  const [isExiting, setIsExiting] = useState(false)

  useEffect(() => {
    const fadeTimer = setTimeout(() => {
      setIsExiting(true)
    }, 1100)

    const redirectTimer = setTimeout(() => {
      navigate('/login', { replace: true })
    }, 2000)

    return () => {
      clearTimeout(fadeTimer)
      clearTimeout(redirectTimer)
    }
  }, [navigate])

  return (
    <section className="flex min-h-screen items-center justify-center bg-[#48426D] px-6">
      <h1
        className={[
          "text-center text-[48px] font-medium tracking-tight text-[#F1AA9B] transition-all duration-700",
          isExiting ? 'opacity-0' : 'opacity-100',
        ].join(' ')}
        style={{ fontFamily: 'Inter, sans-serif' }}
      >
        Attend75
      </h1>
    </section>
  )
}

export default Splash
