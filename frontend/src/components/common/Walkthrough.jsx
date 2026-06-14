import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'

const WALKTHROUGH_STORAGE_KEY = 'attend75.walkthrough.completed'

const STEPS_MOBILE = [
  {
    target: '[data-walkthrough="semester-selector"]',
    title: 'Switch Semester',
    description: 'Tap here to toggle between semesters. Your attendance, marks, and study subjects update instantly.',
    position: 'bottom',
  },
  {
    target: '[data-walkthrough="attendance-ring"]',
    title: 'Your Attendance',
    description: 'This shows your overall attendance percentage. Stay above 75% to be safe.',
    position: 'bottom',
  },
  {
    target: '[data-walkthrough="quick-stats"]',
    title: 'Quick Stats',
    description: 'See subjects at risk, total absences, and emails sent at a glance.',
    position: 'bottom',
  },
  {
    target: '[data-walkthrough="target-card"]',
    title: 'Set Your Target',
    description: 'Tap to expand and change your attendance target. The app recalculates everything in real-time.',
    position: 'top',
  },
  {
    target: '[data-walkthrough="subjects-list"]',
    title: 'Your Subjects',
    description: 'Ranked by risk. Tap any subject to see details, or use Mail Faculty for at-risk ones.',
    position: 'top',
  },
  {
    target: '[data-walkthrough="nav-history"]',
    title: 'Attendance History',
    description: 'View day-by-day attendance, mail faculty about absences, and track your streak.',
    position: 'top',
  },
  {
    target: '[data-walkthrough="nav-marks"]',
    title: 'Your Marks',
    description: 'View consolidated internal marks, radar chart comparison, and component-wise breakdown.',
    position: 'top',
  },
  {
    target: '[data-walkthrough="nav-study"]',
    title: 'StudyMe',
    description: 'Lessons, formulas, practice questions, and AI-powered study for your subjects.',
    position: 'top',
  },
  {
    target: '[data-walkthrough="profile-rate"]',
    title: 'Rate & Feedback',
    description: 'Rate the app and share feedback to help us improve. Your voice shapes what we build next!',
    position: 'top',
    navigateTo: '/app/profile',
  },
]

const STEPS_DESKTOP = [
  {
    target: '[data-walkthrough="desktop-semester-selector"]',
    title: 'Switch Semester',
    description: 'Select a semester to view different attendance, marks, and study subjects. Everything updates in real-time.',
    position: 'bottom',
  },
  {
    target: '[data-walkthrough="desktop-attendance-ring"]',
    title: 'Your Attendance',
    description: 'This shows your overall attendance percentage. Stay above 75% to be safe.',
    position: 'bottom',
  },
  {
    target: '[data-walkthrough="desktop-quick-stats"]',
    title: 'Quick Stats',
    description: 'See subjects at risk, total absences, and emails sent at a glance.',
    position: 'bottom',
  },
  {
    target: '[data-walkthrough="desktop-subjects-list"]',
    title: 'Your Subjects',
    description: 'Ranked by risk. Click any subject to see details, or use Mail Faculty for at-risk ones.',
    position: 'top',
  },
  {
    target: '[data-walkthrough="sidebar-history"]',
    title: 'Attendance History',
    description: 'View day-by-day attendance, mail faculty about absences, and track your streak.',
    position: 'right',
  },
  {
    target: '[data-walkthrough="sidebar-marks"]',
    title: 'Your Marks',
    description: 'View consolidated internal marks, radar chart comparison, and component-wise breakdown.',
    position: 'right',
  },
  {
    target: '[data-walkthrough="sidebar-study"]',
    title: 'StudyMe',
    description: 'Lessons, formulas, practice questions, and AI-powered study for your subjects.',
    position: 'right',
  },
  {
    target: '[data-walkthrough="profile-rate"]',
    title: 'Rate & Feedback',
    description: 'Rate the app and share your feedback to help us improve. Your voice shapes what we build next!',
    position: 'bottom',
    navigateTo: '/app/profile',
  },
]

function isDesktopViewport() {
  return typeof window !== 'undefined' && window.innerWidth >= 768
}

function getElementRect(selector) {
  const el = document.querySelector(selector)
  if (!el) return null
  // Check if element or a parent is hidden
  if (el.offsetParent === null && el.style.position !== 'fixed') return null
  const rect = el.getBoundingClientRect()
  // Return null if element is hidden (display: none gives all-zero rect)
  if (rect.width === 0 && rect.height === 0) return null
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
    bottom: rect.bottom,
    right: rect.right,
  }
}

function scrollTargetIntoView(selector) {
  const el = document.querySelector(selector)
  if (!el) return
  const rect = el.getBoundingClientRect()
  // If element is not in viewport, scroll it into view
  if (rect.top < 0 || rect.bottom > window.innerHeight) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
}

function Walkthrough({ onComplete }) {
  const [currentStep, setCurrentStep] = useState(0)
  const [targetRect, setTargetRect] = useState(null)
  const [isVisible, setIsVisible] = useState(false)
  const [isDesktop, setIsDesktop] = useState(isDesktopViewport)
  const [waitingForTarget, setWaitingForTarget] = useState(false)
  const timeoutRef = useRef(null)
  const navigate = useNavigate()

  const steps = isDesktop ? STEPS_DESKTOP : STEPS_MOBILE
  const step = steps[currentStep]

  const updatePosition = useCallback(() => {
    if (!step) return
    const rect = getElementRect(step.target)
    setTargetRect(rect)
  }, [step])

  useEffect(() => {
    function handleResize() {
      setIsDesktop(isDesktopViewport())
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Reset step index when switching between mobile/desktop step lists
  useEffect(() => {
    setCurrentStep(0)
  }, [isDesktop])

  // Handle navigation for steps that require a different page
  useEffect(() => {
    if (!step || !step.navigateTo) {
      setWaitingForTarget(false)
      return
    }

    // Navigate to the target page
    navigate(step.navigateTo)
    setWaitingForTarget(true)

    // Poll for the target element to appear after navigation
    let attempts = 0
    const maxAttempts = 20
    const pollInterval = setInterval(() => {
      attempts++
      const rect = getElementRect(step.target)
      if (rect) {
        setWaitingForTarget(false)
        clearInterval(pollInterval)
        scrollTargetIntoView(step.target)
        setTimeout(() => updatePosition(), 150)
      } else if (attempts >= maxAttempts) {
        setWaitingForTarget(false)
        clearInterval(pollInterval)
        updatePosition()
      }
    }, 150)

    return () => clearInterval(pollInterval)
  }, [currentStep, step, navigate, updatePosition])

  useEffect(() => {
    // Delay first step slightly to let the page render
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true)
      updatePosition()
    }, 600)

    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current) }
  }, [updatePosition])

  useEffect(() => {
    if (step) {
      scrollTargetIntoView(step.target)
    }
    // Small delay after scroll to let position settle, then update
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

  const handleSkip = () => {
    handleFinish()
  }

  const handleFinish = () => {
    setIsVisible(false)
    try { window.localStorage.setItem(WALKTHROUGH_STORAGE_KEY, 'true') } catch { /* */ }
    if (onComplete) onComplete()
  }

  if (!isVisible || !step) return null
  if (waitingForTarget) {
    return createPortal(
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60">
        <div className="rounded-2xl border border-white/10 bg-[#2D2845] px-6 py-4 text-center shadow-2xl">
          <p className="text-sm font-semibold text-[#F7F4FF]">Loading...</p>
        </div>
      </div>,
      document.body,
    )
  }

  // Calculate tooltip position relative to the target element
  const padding = 8
  const spotlightPadding = 6
  const tooltipWidth = 288
  let tooltipStyle = {}

  if (targetRect) {
    if (step.position === 'bottom') {
      // Below the target, horizontally centered on it
      const centerX = targetRect.left + targetRect.width / 2
      const clampedLeft = Math.max(16, Math.min(centerX - tooltipWidth / 2, window.innerWidth - tooltipWidth - 16))
      tooltipStyle = {
        top: `${targetRect.bottom + padding + spotlightPadding}px`,
        left: `${clampedLeft}px`,
      }
    } else if (step.position === 'right') {
      // To the right of the target (for sidebar items on desktop)
      const topPos = Math.max(16, targetRect.top + targetRect.height / 2 - 40)
      tooltipStyle = {
        top: `${topPos}px`,
        left: `${targetRect.right + padding + spotlightPadding}px`,
      }
    } else {
      // Above the target, horizontally centered on it
      const centerX = targetRect.left + targetRect.width / 2
      const clampedLeft = Math.max(16, Math.min(centerX - tooltipWidth / 2, window.innerWidth - tooltipWidth - 16))
      tooltipStyle = {
        bottom: `${window.innerHeight - targetRect.top + padding + spotlightPadding}px`,
        left: `${clampedLeft}px`,
      }
    }
  } else {
    // Fallback: center in viewport if target not found
    tooltipStyle = { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
  }

  return createPortal(
    <div className="fixed inset-0 z-[200]">
      {/* Overlay with spotlight cutout */}
      <svg className="absolute inset-0 h-full w-full" style={{ pointerEvents: 'none' }}>
        <defs>
          <mask id="walkthrough-mask">
            <rect width="100%" height="100%" fill="white" />
            {targetRect ? (
              <rect
                x={targetRect.left - spotlightPadding}
                y={targetRect.top - spotlightPadding}
                width={targetRect.width + spotlightPadding * 2}
                height={targetRect.height + spotlightPadding * 2}
                rx="12"
                fill="black"
              />
            ) : null}
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(0,0,0,0.7)"
          mask="url(#walkthrough-mask)"
        />
      </svg>

      {/* Spotlight border glow */}
      {targetRect ? (
        <div
          className="absolute rounded-xl border-2 border-[#FF916C]/60 shadow-[0_0_20px_rgba(255,145,108,0.3)]"
          style={{
            top: `${targetRect.top - spotlightPadding}px`,
            left: `${targetRect.left - spotlightPadding}px`,
            width: `${targetRect.width + spotlightPadding * 2}px`,
            height: `${targetRect.height + spotlightPadding * 2}px`,
            pointerEvents: 'none',
          }}
        />
      ) : null}

      {/* Click overlay to advance */}
      <div className="absolute inset-0" onClick={handleNext} style={{ pointerEvents: 'auto' }} />

      {/* Tooltip */}
      <div
        className="absolute w-[85vw] max-w-xs rounded-2xl border border-white/10 bg-[#2D2845] p-4 shadow-2xl md:w-80"
        style={{ ...tooltipStyle, pointerEvents: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm font-bold text-[#F7F4FF]">{step.title}</p>
        <p className="mt-1.5 text-xs leading-relaxed text-[#9F9AB5]">{step.description}</p>

        <div className="mt-4 flex items-center justify-between">
          <div className="flex gap-1">
            {steps.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 w-1.5 rounded-full transition-colors ${i === currentStep ? 'bg-[#FF916C]' : 'bg-white/20'}`}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSkip}
              className="text-[11px] font-medium text-[#9F9AB5] transition hover:text-[#F7F4FF]"
            >
              Skip
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="rounded-full bg-[#FF916C] px-4 py-1.5 text-[11px] font-bold text-[#1D183E] transition active:scale-95"
            >
              {currentStep >= steps.length - 1 ? 'Done' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/**
 * Check if walkthrough has been completed.
 */
export function hasCompletedWalkthrough() {
  try {
    return window.localStorage.getItem(WALKTHROUGH_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

export default Walkthrough
