/**
 * ProblemSolverCanvas — notebook canvas view for one problem.
 * The whole screen becomes a digital notebook page.
 * Solution steps reveal like a teacher writing them out.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ChevronDown, Loader } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import QuestionCard from './QuestionCard'
import SolutionStep from './SolutionStep'
import useAppStore from '../../../hooks/useAppStore'
import { getNotesProblem } from '../../../services/lessonApi'

const DIFF_INK = {
  easy:   { bg: '#DCFCE7', text: '#166534', border: '#86EFAC' },
  medium: { bg: '#FEF9C3', text: '#854D0E', border: '#FDE047' },
  hard:   { bg: '#FEE2E2', text: '#991B1B', border: '#FCA5A5' },
}

export default function ProblemSolverCanvas({ problemId, onBack }) {
  const { state: appState } = useAppStore()
  const token = appState.session?.token

  const [problem, setProblem]       = useState(null)
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)
  const [revealedCount, setRevealed] = useState(0)
  const [lastRevealed, setLastRevealed] = useState(false)
  const bottomRef = useRef(null)

  const load = useCallback(async () => {
    if (!token || !problemId) return
    try {
      const data = await getNotesProblem({ token, problemId })
      setProblem(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [token, problemId])

  useEffect(() => { load() }, [load])

  // Scroll to bottom when new step revealed
  useEffect(() => {
    if (lastRevealed && bottomRef.current) {
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100)
      setLastRevealed(false)
    }
  }, [revealedCount, lastRevealed])

  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center">
        <Loader size={20} className="animate-spin mx-auto mb-2" style={{ color: '#C4A882' }} />
        <p className="text-[12px]" style={{ color: '#C4A882', fontFamily: 'Georgia, serif' }}>
          Opening notebook…
        </p>
      </div>
    </div>
  )

  if (error) return (
    <div className="flex-1 flex items-center justify-center px-6">
      <p className="text-[#FF7B7B] text-sm text-center">{error}</p>
    </div>
  )

  if (!problem) return null

  const totalSteps = problem.steps.length

  // Guard: if no steps were generated (old DB record), show a re-process message
  if (totalSteps === 0) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden" style={{ background: '#EEEAE0' }}>
        <div className="flex items-center gap-3 px-4 py-3 flex-shrink-0 border-b" style={{ background: '#F5F0E8', borderColor: '#D4C8B0' }}>
          <button onClick={onBack} className="flex items-center gap-1.5 transition-opacity hover:opacity-70" style={{ color: '#8B7355', fontFamily: 'Georgia, serif', fontSize: '13px' }}>
            <ArrowLeft size={14} /> Back
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center px-8">
          <div className="text-center max-w-xs">
            <div className="text-3xl mb-4">📋</div>
            <p className="font-semibold mb-2" style={{ color: '#4B3D2A', fontFamily: 'Georgia, serif', fontSize: '15px' }}>
              No solution steps yet
            </p>
            <p className="text-[13px] leading-relaxed" style={{ color: '#8B7355', fontFamily: 'Georgia, serif' }}>
              This problem was processed with an older version. Delete this upload and re-upload the file to get detailed step-by-step solutions.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const isStarted  = revealedCount > 0
  const isFinished = revealedCount >= totalSteps
  const diff = DIFF_INK[problem.difficulty] || DIFF_INK.medium

  const activeAnnotations = problem.steps
    .slice(0, revealedCount)
    .filter(s => s.annotation)
    .map(s => ({ ...s.annotation, stepId: s.id }))

  const handleNext = () => {
    if (revealedCount < totalSteps) {
      setRevealed(prev => prev + 1)
      setLastRevealed(true)
    }
  }

  let calcCounter = 0

  return (
    <div className="flex-1 flex flex-col overflow-hidden" style={{ background: '#EEEAE0' }}>

      {/* ── Notebook header bar ── */}
      <div
        className="flex items-center gap-3 px-4 py-3 flex-shrink-0 border-b"
        style={{ background: '#F5F0E8', borderColor: '#D4C8B0' }}
      >
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 transition-opacity hover:opacity-70"
          style={{ color: '#8B7355', fontFamily: 'Georgia, serif', fontSize: '13px' }}
        >
          <ArrowLeft size={14} />
          Back
        </button>

        <div className="flex-1" />

        {problem.topic && (
          <span
            className="text-[11px] font-medium"
            style={{ color: '#8B7355', fontFamily: 'Georgia, serif' }}
          >
            {problem.topic}
          </span>
        )}

        <span
          className="text-[10px] font-bold px-2 py-0.5 rounded"
          style={{
            background: diff.bg,
            color: diff.text,
            border: `1px solid ${diff.border}`,
          }}
        >
          {problem.difficulty}
        </span>

        {/* Progress dots */}
        <div className="flex gap-1">
          {problem.steps.map((_, i) => (
            <div
              key={i}
              className="w-1.5 h-1.5 rounded-full transition-all duration-300"
              style={{ background: i < revealedCount ? '#6B7CFF' : '#C4B8A0' }}
            />
          ))}
        </div>
      </div>

      {/* ── Notebook body ── */}
      <div
        className="flex-1 overflow-y-auto px-4 py-5 space-y-5"
        style={{ scrollbarWidth: 'thin', scrollbarColor: '#C4B8A0 transparent' }}
      >
        {/* Question on paper */}
        <QuestionCard question={problem} activeAnnotations={activeAnnotations} />

        {/* Solution section header */}
        {isStarted && (
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px" style={{ background: '#C4B8A0' }} />
            <span
              className="text-[10px] uppercase tracking-widest"
              style={{ color: '#8B7355', fontFamily: 'Georgia, serif' }}
            >
              Solution
            </span>
            <div className="flex-1 h-px" style={{ background: '#C4B8A0' }} />
          </div>
        )}

        {/* Steps — clean card, no ruled lines (steps have their own ink indicators) */}
        {isStarted && (
          <div
            className="rounded-xl overflow-hidden"
            style={{
              background: '#FDFAF5',
              border: '1px solid #E8E0D0',
              boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
            }}
          >
            <div className="px-5 py-4">
              <AnimatePresence initial={false}>
                {problem.steps.slice(0, revealedCount).map((step, i) => {
                  if (step.step_type === 'calculation') calcCounter++
                  const isNew = i === revealedCount - 1
                  return (
                    <motion.div
                      key={step.id}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.25, ease: 'easeOut' }}
                    >
                      <SolutionStep
                        step={step}
                        stepNumber={step.step_type === 'calculation' ? calcCounter : null}
                        autoPlay={isNew}
                      />
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            </div>
          </div>
        )}

        {/* Final answer — highlighted box like a circled answer */}
        <AnimatePresence>
          {isFinished && problem.answer && (
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              className="relative rounded overflow-hidden"
              style={{
                background: '#FFFBEB',
                border: '2px solid #F59E0B',
                boxShadow: '0 2px 8px rgba(245,158,11,0.15)',
              }}
            >
              {/* Pencil circle decoration */}
              <div
                className="absolute -top-3 -right-3 w-12 h-12 rounded-full opacity-20"
                style={{ border: '3px solid #F59E0B' }}
              />
              <div className="px-5 py-4">
                <p
                  className="text-[9px] uppercase tracking-widest mb-1"
                  style={{ color: '#92400E', fontFamily: 'Georgia, serif' }}
                >
                  ∴ Final Answer
                </p>
                <p
                  className="text-[15px] font-bold leading-snug"
                  style={{ color: '#78350F', fontFamily: 'Georgia, serif' }}
                >
                  {problem.answer}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Coming soon placeholder */}
        <AnimatePresence>
          {isFinished && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center pb-2">
              <button
                disabled
                className="text-[11px] px-4 py-2 rounded-full opacity-40 cursor-not-allowed"
                style={{
                  background: '#E8E0D0',
                  color: '#8B7355',
                  border: '1px dashed #C4B8A0',
                  fontFamily: 'Georgia, serif',
                }}
                title="Coming soon"
              >
                Practice a similar question · Soon
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={bottomRef} />
      </div>

      {/* ── CTA — sticky at bottom ── */}
      {!isFinished && (
        <div
          className="flex-shrink-0 px-4 py-3 border-t"
          style={{ background: '#F5F0E8', borderColor: '#D4C8B0' }}
        >
          {!isStarted ? (
            <button
              onClick={handleNext}
              className="w-full py-3 rounded-lg font-semibold text-[13px] transition-all active:scale-[0.98]"
              style={{
                background: 'linear-gradient(135deg, #6B7CFF, #9B59B6)',
                color: 'white',
                fontFamily: 'Georgia, serif',
                boxShadow: '0 2px 8px rgba(107,124,255,0.35)',
              }}
            >
              Open notebook →
            </button>
          ) : (
            <button
              onClick={handleNext}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-lg
                         font-medium text-[13px] transition-all active:scale-[0.98]"
              style={{
                background: '#F9F6EE',
                color: '#4B3D2A',
                border: '1.5px solid #C4B8A0',
                fontFamily: 'Georgia, serif',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              }}
            >
              Next step
              <ChevronDown size={14} />
            </button>
          )}

          <p
            className="text-center mt-2 text-[10px]"
            style={{ color: '#A89880', fontFamily: 'Georgia, serif' }}
          >
            {revealedCount} / {totalSteps} steps
          </p>
        </div>
      )}
    </div>
  )
}
