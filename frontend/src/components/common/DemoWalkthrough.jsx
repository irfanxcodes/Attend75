import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const DEMO_WALKTHROUGH_KEY = 'attend75.demoWalkthrough.completed'

function isDesktopViewport() {
  return typeof window !== 'undefined' && window.innerWidth >= 768
}

const STEPS_MOBILE = [
  {
    target: '[data-walkthrough="attendance-ring"]',
    title: 'Track Your Attendance',
    description: 'See your real-time attendance percentage. The app syncs directly with your college portal.',
    position: 'bottom',
  },
  {
    target: '[data-walkthrough="quick-stats"]',
    title: 'Know Your Status',
    description: 'Instantly see subjects at risk, total absences, and how many classes you can miss.',
    position: 'bottom',
  },
  {
    target: '[data-walkthrough="subjects-list"]',
    title: 'Subject-wise Breakdown',
    description: 'Every subject ranked by risk. Tap to expand details and email your faculty directly.',
    position: 'top',
  },
  {
    target: '[data-walkthrough="nav-history"]',
    title: 'Attendance History',
    description: 'Calendar view of your attendance. See which days you were absent and mail faculty.',
    position: 'top',
  },
  {
    target: '[data-walkthrough="nav-marks"]',
    title: 'Your Marks',
    description: 'Consolidated internal marks with radar chart comparison across subjects.',
    position: 'top',
  },
  {
    target: '[data-walkthrough="nav-study"]',
    title: 'StudyMe — Learn Smarter',
    description: 'Lessons, formulas, practice questions, and AI-powered study tools for your subjects.',
    position: 'top',
  },
]

const STEPS_DESKTOP = [
  {
    target: '[data-walkthrough="desktop-attendance-ring"]',
    title: 'Track Your Attendance',
    description: 'See your real-time attendance percentage. The app syncs directly with your college portal.',
    position: 'bottom',
  },
  {
    target: '[data-walkthrough="desktop-quick-stats"]',
    title: 'Know Your Status',
    description: 'Instantly see subjects at risk, total absences, and how many classes you can miss.',
    position: 'bottom',
  },
  {
    target: '[data-walkthrough="desktop-subjects-list"]',
    title: 'Subject-wise Breakdown',
    description: 'Every subject ranked by risk. Click to expand details and email your faculty directly.',
    position: 'top',
  },
  {
    target: '[data-walkthrough="sidebar-history"]',
    title: 'Attendance History',
    description: 'Calendar view of your attendance. See which days you were absent and mail faculty.',
    position: 'right',
  },
  {
    target: '[data-walkthrough="sidebar-marks"]',
    title: 'Your Marks',
    description: 'Consolidated internal marks with radar chart comparison across subjects.',
    position: 'right',
  },
  {
    target: '[data-walkthrough="sidebar-study"]',
    title: 'StudyMe — Learn Smarter',
    description: 'Lessons, formulas, practice questions, and AI-powered study tools for your subjects.',
    position: 'right',
  },
]

function getElementRect(selector) {
  const el = document.querySelector(selector)
  if (!el) return null
  if (el.offsetParent === null && el.style.position !== 'fixed') return null
  const rect = el.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) return null
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height, bottom: rect.bottom, right: rect.right }
}

function scrollTargetIntoView(selector) {
  const el = document.querySelector(selector)
  if (!el) return
  const rect = el.getBoundingClientRect()
  if (rect.top < 0 || rect.bottom > window.innerHeight) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
}

function DemoWalkthrough({ onComplete }) {
  const [currentStep, setCurrentStep] = useState(0)
  const [targetRect, setTargetRect] = useState(null)
  const [isVisible, setIsVisible] = useState(false)
  const [isDesktop, setIsDesktop] = useState(isDesktopViewport)
  const timeoutRef = useRef(null)

  const steps = isDesktop ? STEPS_DESKTOP : STEPS_MOBILE
  const step = steps[currentStep]

  useEffect(() => {
    function handleResize() { setIsDesktop(isDesktopViewport()) }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => { setCurrentStep(0) }, [isDesktop])

  const updatePosition = useCallback(() => {
    if (!step) return
    const rect = getElementRect(step.target)
    setTargetRect(rect)
  }, [step])

  useEffect(() => {
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true)
      updatePosition()
    }, 800)
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current) }
  }, [updatePosition])

  useEffect(() => {
    if (step) scrollTargetIntoView(step.target)
    const id = setTimeout(() => updatePosition(), 100)
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      clearTimeout(id)
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [currentStep, step, updatePosition])

  const handleNext = () => {
    if (currentStep >= steps.length - 1) {
      handleFinish()
      return
    }
    setCurrentStep((c) => c + 1)
  }

  const handleFinish = () => {
    setIsVisible(false)
    try { window.localStorage.setItem(DEMO_WALKTHROUGH_KEY, 'true') } catch { /* */ }
    if (onComplete) onComplete()
  }

  if (!isVisible || !step) return null

  const padding = 8
  const spotlightPadding = 6
  const tooltipWidth = 288
  let tooltipStyle = {}

  if (targetRect) {
    if (step.position === 'bottom') {
      const centerX = targetRect.left + targetRect.width / 2
      const clampedLeft = Math.max(16, Math.min(centerX - tooltipWidth / 2, window.innerWidth - tooltipWidth - 16))
      tooltipStyle = { top: `${targetRect.bottom + padding + spotlightPadding}px`, left: `${clampedLeft}px` }
    } else if (step.position === 'right') {
      const topPos = Math.max(16, targetRect.top + targetRect.height / 2 - 40)
      tooltipStyle = { top: `${topPos}px`, left: `${targetRect.right + padding + spotlightPadding}px` }
    } else {
      const centerX = targetRect.left + targetRect.width / 2
      const clampedLeft = Math.max(16, Math.min(centerX - tooltipWidth / 2, window.innerWidth - tooltipWidth - 16))
      tooltipStyle = { bottom: `${window.innerHeight - targetRect.top + padding + spotlightPadding}px`, left: `${clampedLeft}px` }
    }
  } else {
    tooltipStyle = { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
  }

  return createPortal(
    <div className="fixed inset-0 z-[200]">
      <svg className="absolute inset-0 h-full w-full" style={{ pointerEvents: 'none' }}>
        <defs>
          <mask id="demo-walkthrough-mask">
            <rect width="100%" height="100%" fill="white" />
            {targetRect ? (
              <rect x={targetRect.left - spotlightPadding} y={targetRect.top - spotlightPadding} width={targetRect.width + spotlightPadding * 2} height={targetRect.height + spotlightPadding * 2} rx="12" fill="black" />
            ) : null}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(0,0,0,0.75)" mask="url(#demo-walkthrough-mask)" />
      </svg>

      {targetRect ? (
        <div className="absolute rounded-xl border-2 border-[#4EF0A0]/60 shadow-[0_0_20px_rgba(78,240,160,0.2)]" style={{ top: `${targetRect.top - spotlightPadding}px`, left: `${targetRect.left - spotlightPadding}px`, width: `${targetRect.width + spotlightPadding * 2}px`, height: `${targetRect.height + spotlightPadding * 2}px`, pointerEvents: 'none' }} />
      ) : null}

      <div className="absolute inset-0" onClick={handleNext} style={{ pointerEvents: 'auto' }} />

      <div className="absolute w-[85vw] max-w-xs rounded-2xl border border-white/10 bg-[#2D2845] p-4 shadow-2xl md:w-80" style={{ ...tooltipStyle, pointerEvents: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <p className="text-sm font-bold text-[#F7F4FF]">{step.title}</p>
        <p className="mt-1.5 text-xs leading-relaxed text-[#9F9AB5]">{step.description}</p>
        <div className="mt-4 flex items-center justify-between">
          <div className="flex gap-1">
            {steps.map((_, i) => (
              <span key={i} className={`h-1.5 w-1.5 rounded-full transition-colors ${i === currentStep ? 'bg-[#4EF0A0]' : 'bg-white/20'}`} />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={handleFinish} className="text-[11px] font-medium text-[#9F9AB5] transition hover:text-[#F7F4FF]">Skip</button>
            <button type="button" onClick={handleNext} className="rounded-full bg-[#4EF0A0] px-4 py-1.5 text-[11px] font-bold text-[#1D183E] transition active:scale-95">
              {currentStep >= steps.length - 1 ? 'Done' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export function hasDemoWalkthroughCompleted() {
  try { return window.localStorage.getItem(DEMO_WALKTHROUGH_KEY) === 'true' } catch { return false }
}

export default DemoWalkthrough
