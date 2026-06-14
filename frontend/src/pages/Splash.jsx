import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

function Splash() {
  const navigate = useNavigate()
  const [stage, setStage] = useState(0) // 0=doodles, 1=converge, 2=logo, 3=text, 4=exit

  useEffect(() => {
    const timers = [
      setTimeout(() => setStage(1), 1000),  // Doodles converge
      setTimeout(() => setStage(2), 1800),  // Logo appears
      setTimeout(() => setStage(3), 2500),  // Text reveals
      setTimeout(() => setStage(4), 3800),  // Exit fade
      setTimeout(() => navigate('/login', { replace: true }), 4300), // Navigate
    ]
    return () => timers.forEach(clearTimeout)
  }, [navigate])

  return (
    <section className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden bg-[#5B5878]">
      {/* Stage 1 & 2: Scattered doodle icons that converge to center */}
      <div className="absolute inset-0 flex items-center justify-center">
        {/* Checkmark - top left */}
        <svg
          viewBox="0 0 24 24"
          className="absolute h-7 w-7 transition-all"
          style={{
            transitionDuration: '800ms',
            transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
            opacity: stage >= 2 ? 0 : 1,
            transform: stage >= 1
              ? 'translate(calc(-50% - 10px), calc(-50% - 20px)) scale(0.6)'
              : 'translate(-120px, -160px) scale(1)',
          }}
          fill="none"
          stroke="#FFAA8D"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>

        {/* Circle - top right */}
        <svg
          viewBox="0 0 24 24"
          className="absolute h-7 w-7 transition-all"
          style={{
            transitionDuration: '800ms',
            transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
            opacity: stage >= 2 ? 0 : 1,
            transform: stage >= 1
              ? 'translate(calc(-50% + 10px), calc(-50% - 20px)) scale(0.6)'
              : 'translate(100px, -120px) scale(1)',
          }}
          fill="none"
          stroke="#FFAA8D"
          strokeWidth="2"
        >
          <circle cx="12" cy="12" r="9" />
        </svg>

        {/* Plus - left */}
        <svg
          viewBox="0 0 24 24"
          className="absolute h-7 w-7 transition-all"
          style={{
            transitionDuration: '800ms',
            transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
            opacity: stage >= 2 ? 0 : 1,
            transform: stage >= 1
              ? 'translate(calc(-50% - 10px), 0) scale(0.6)'
              : 'translate(-140px, 20px) scale(1)',
          }}
          fill="none"
          stroke="#FFAA8D"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>

        {/* Percent - right */}
        <svg
          viewBox="0 0 24 24"
          className="absolute h-7 w-7 transition-all"
          style={{
            transitionDuration: '800ms',
            transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
            opacity: stage >= 2 ? 0 : 1,
            transform: stage >= 1
              ? 'translate(calc(-50% + 10px), 0) scale(0.6)'
              : 'translate(130px, 30px) scale(1)',
          }}
          fill="none"
          stroke="#FFAA8D"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M19 5 5 19" />
          <circle cx="6.5" cy="6.5" r="2.5" />
          <circle cx="17.5" cy="17.5" r="2.5" />
        </svg>

        {/* Bar chart - bottom left */}
        <svg
          viewBox="0 0 24 24"
          className="absolute h-7 w-7 transition-all"
          style={{
            transitionDuration: '800ms',
            transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
            opacity: stage >= 2 ? 0 : 1,
            transform: stage >= 1
              ? 'translate(calc(-50% - 10px), calc(-50% + 20px)) scale(0.6)'
              : 'translate(-100px, 170px) scale(1)',
          }}
          fill="none"
          stroke="#FFAA8D"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M6 20v-6M10 20v-10M14 20v-4M18 20v-8" />
        </svg>

        {/* Spark - bottom right */}
        <svg
          viewBox="0 0 24 24"
          className="absolute h-7 w-7 transition-all"
          style={{
            transitionDuration: '800ms',
            transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
            opacity: stage >= 2 ? 0 : 1,
            transform: stage >= 1
              ? 'translate(calc(-50% + 10px), calc(-50% + 20px)) scale(0.6)'
              : 'translate(110px, 160px) scale(1)',
          }}
          fill="none"
          stroke="#FFAA8D"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M12 3v2M12 19v2M5.64 5.64l1.41 1.41M16.95 16.95l1.41 1.41M3 12h2M19 12h2M5.64 18.36l1.41-1.41M16.95 7.05l1.41-1.41" />
        </svg>
      </div>

      {/* Stage 2-3: Logo icon */}
      <div
        className="relative z-10 flex flex-col items-center transition-all"
        style={{
          transitionDuration: '700ms',
          transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
          opacity: stage >= 4 ? 0 : stage >= 2 ? 1 : 0,
          transform: stage >= 2 ? 'scale(1)' : 'scale(0.3)',
        }}
      >
        {/* App icon - rounded square with checkmark circle */}
        <div className="flex h-24 w-24 items-center justify-center rounded-[22px] bg-[#E8A88C] shadow-[0_8px_32px_rgba(232,168,140,0.3)]">
          <svg viewBox="0 0 48 48" className="h-14 w-14">
            {/* Circular progress arc */}
            <circle cx="24" cy="24" r="16" stroke="#2D2845" strokeWidth="4" fill="none" opacity="0.3" />
            <circle
              cx="24" cy="24" r="16"
              stroke="#2D2845"
              strokeWidth="4"
              fill="none"
              strokeLinecap="round"
              strokeDasharray="80"
              strokeDashoffset="20"
              transform="rotate(-90 24 24)"
            />
            {/* Checkmark */}
            <path d="M16 24l5 5 11-11" stroke="#2D2845" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
        </div>

        {/* Stage 3: Typography */}
        <h1
          className="mt-5 text-3xl font-bold tracking-tight transition-all"
          style={{
            transitionDuration: '600ms',
            transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
            transitionDelay: '100ms',
            opacity: stage >= 3 ? 1 : 0,
            transform: stage >= 3 ? 'translateY(0)' : 'translateY(12px)',
          }}
        >
          <span className="text-[#F7F4FF]">Attend</span>
          <span className="text-[#FF916C]">75</span>
        </h1>

        <p
          className="mt-1.5 text-sm text-[#9F9AB5] transition-all"
          style={{
            transitionDuration: '600ms',
            transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
            transitionDelay: '250ms',
            opacity: stage >= 3 ? 1 : 0,
            transform: stage >= 3 ? 'translateY(0)' : 'translateY(10px)',
          }}
        >
          Your attendance &amp; study companion
        </p>
      </div>
    </section>
  )
}

export default Splash
