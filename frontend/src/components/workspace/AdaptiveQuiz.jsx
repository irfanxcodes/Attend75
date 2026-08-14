/**
 * AdaptiveQuiz — Phase 5 adaptive quiz component.
 *
 * Lives inside the TutorPanel when the student taps "Quiz me".
 * Full loop:
 *   1. Generate question (LLM, grounded in concept)
 *   2. Student types answer
 *   3. LLM evaluates → verdict: correct | partial | incorrect
 *   4. Show targeted feedback
 *   5. If partial/incorrect: show hint → retry
 *   6. After correct: update concept mastery + offer next question
 *
 * Concept progress is updated automatically via the /quiz/evaluate endpoint.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AlertCircle, CheckCircle2, ChevronRight, Lightbulb,
  Loader, RefreshCw, Target, XCircle,
} from 'lucide-react'
import { generateQuizQuestion, evaluateQuizAnswer, updateConceptProgress } from '../../services/lessonApi'

// ── Verdict display ───────────────────────────────────────────────────────

const VERDICT_CONFIG = {
  correct: {
    icon: CheckCircle2,
    color: '#4EF0A0',
    bg: 'bg-[#4EF0A0]/8 border-[#4EF0A0]/25',
    label: 'Correct!',
  },
  partial: {
    icon: AlertCircle,
    color: '#F5C26B',
    bg: 'bg-[#F5C26B]/8 border-[#F5C26B]/25',
    label: 'Almost there',
  },
  incorrect: {
    icon: XCircle,
    color: '#FF7B7B',
    bg: 'bg-[#FF7B7B]/8 border-[#FF7B7B]/25',
    label: 'Not quite',
  },
  error: {
    icon: AlertCircle,
    color: '#9895B5',
    bg: 'bg-white/5 border-white/10',
    label: 'Evaluation unavailable',
  },
}

function VerdictCard({ result, onRetry, onNext, showHint, onShowHint, attempts }) {
  const cfg = VERDICT_CONFIG[result.verdict] || VERDICT_CONFIG.error
  const Icon = cfg.icon
  const canRetry = result.verdict !== 'correct' && attempts < 3

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl border p-3.5 ${cfg.bg}`}
    >
      {/* Verdict header */}
      <div className="flex items-center gap-2 mb-2">
        <Icon size={15} style={{ color: cfg.color }} />
        <span className="text-[12px] font-semibold" style={{ color: cfg.color }}>
          {cfg.label}
        </span>
      </div>

      {/* Feedback */}
      <p className="text-[#D4D1EC] text-[12px] leading-relaxed mb-3">
        {result.feedback}
      </p>

      {/* Hint */}
      {result.hint && canRetry && (
        <>
          {!showHint ? (
            <button
              onClick={onShowHint}
              className="flex items-center gap-1.5 text-[#F5C26B] text-[11px] mb-3
                         hover:text-[#F5C26B]/80 transition-colors"
            >
              <Lightbulb size={11} />
              Show hint
            </button>
          ) : (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="bg-[#F5C26B]/8 border border-[#F5C26B]/20 rounded-lg px-3 py-2 mb-3"
            >
              <p className="text-[#F5C26B] text-[11px] font-semibold mb-0.5 uppercase tracking-widest">Hint</p>
              <p className="text-[#E8E5FF] text-[12px] leading-relaxed">{result.hint}</p>
            </motion.div>
          )}
        </>
      )}

      {/* Too many attempts — show they should review */}
      {attempts >= 3 && result.verdict !== 'correct' && (
        <div className="bg-white/5 rounded-lg px-3 py-2 mb-3">
          <p className="text-[#9895B5] text-[11px]">
            This concept has been added to your review queue.
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        {canRetry && (
          <button
            onClick={onRetry}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full
                       bg-white/6 border border-white/10 text-[#9895B5] text-[11px]
                       hover:border-white/20 hover:text-white active:scale-95 transition-all"
          >
            <RefreshCw size={10} />
            Try again
          </button>
        )}
        <button
          onClick={onNext}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full
                     text-[11px] font-medium active:scale-95 transition-all"
          style={{
            backgroundColor: result.verdict === 'correct' ? '#4EF0A020' : 'rgba(255,255,255,0.05)',
            color: result.verdict === 'correct' ? '#4EF0A0' : '#9895B5',
            border: `1px solid ${result.verdict === 'correct' ? '#4EF0A040' : 'rgba(255,255,255,0.1)'}`,
          }}
        >
          {result.verdict === 'correct' ? 'Next question' : 'Skip'}
          <ChevronRight size={10} />
        </button>
      </div>
    </motion.div>
  )
}

// ── Main AdaptiveQuiz ─────────────────────────────────────────────────────

export function AdaptiveQuiz({ token, conceptId, conceptTitle, onClose, onProgressUpdate }) {
  const [phase, setPhase] = useState('loading')
  // phases: loading | question | submitting | result | complete

  const [currentQ, setCurrentQ] = useState(null)   // {question, expected_answer, concept_title}
  const [answer, setAnswer]       = useState('')
  const [result, setResult]       = useState(null)  // {verdict, is_correct, feedback, hint}
  const [showHint, setShowHint]   = useState(false)
  const [attempts, setAttempts]   = useState(0)
  const [questionsAsked, setQuestionsAsked] = useState([])
  const [score, setScore]         = useState({ correct: 0, total: 0 })
  const [error, setError]         = useState(null)

  const textareaRef = useRef(null)

  const loadQuestion = useCallback(async () => {
    setPhase('loading')
    setAnswer('')
    setResult(null)
    setShowHint(false)
    setAttempts(0)
    setError(null)

    try {
      const q = await generateQuizQuestion({
        token,
        conceptId,
        existingQuestions: questionsAsked,
      })
      setCurrentQ(q)
      setQuestionsAsked(prev => [...prev, q.question])
      setPhase('question')
      setTimeout(() => textareaRef.current?.focus(), 150)
    } catch (err) {
      setError(err.message)
      setPhase('question')
    }
  }, [token, conceptId, questionsAsked])

  // Load first question on mount
  useEffect(() => {
    loadQuestion()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = useCallback(async () => {
    const trimmed = answer.trim()
    if (!trimmed || phase !== 'question' || !currentQ) return

    setPhase('submitting')
    setAttempts(prev => prev + 1)

    try {
      const res = await evaluateQuizAnswer({
        token,
        conceptId,
        question: currentQ.question,
        studentAnswer: trimmed,
        expectedAnswer: currentQ.expected_answer || '',
      })
      setResult(res)
      setPhase('result')

      if (res.is_correct) {
        setScore(prev => ({ correct: prev.correct + 1, total: prev.total + 1 }))
        onProgressUpdate?.('understood')
      } else {
        setScore(prev => ({ ...prev, total: prev.total + 1 }))
        if (attempts + 1 >= 3) {
          onProgressUpdate?.('struggling')
        }
      }
    } catch (err) {
      setError(err.message)
      setPhase('question')
    }
  }, [token, conceptId, answer, phase, currentQ, attempts, onProgressUpdate])

  const handleRetry = useCallback(() => {
    setAnswer('')
    setResult(null)
    setShowHint(false)
    setPhase('question')
    setTimeout(() => textareaRef.current?.focus(), 100)
  }, [])

  const handleNext = useCallback(() => {
    if (score.total >= 3) {
      setPhase('complete')
    } else {
      loadQuestion()
    }
  }, [score.total, loadQuestion])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && phase === 'question') {
      e.preventDefault()
      handleSubmit()
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────

  // Complete state
  if (phase === 'complete') {
    const pct = score.total > 0 ? Math.round((score.correct / score.total) * 100) : 0
    const mastered = pct >= 80
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-4"
      >
        <div className="text-center py-4">
          <div className="text-3xl mb-2">{mastered ? '🎯' : '📚'}</div>
          <p className="text-white font-semibold text-[14px] mb-1">
            {mastered ? 'Well done!' : 'Keep practicing'}
          </p>
          <p className="text-[#9895B5] text-[12px] mb-4">
            {score.correct}/{score.total} correct on <span className="text-white">{conceptTitle}</span>
          </p>
          {/* Score bar */}
          <div className="h-2 bg-white/8 rounded-full overflow-hidden mb-4">
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: mastered ? '#4EF0A0' : '#F5C26B' }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            />
          </div>
          <div className="flex gap-2 justify-center">
            <button
              onClick={loadQuestion}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full
                         bg-white/6 border border-white/12 text-[#9895B5] text-[12px]
                         hover:border-white/20 active:scale-95 transition-all"
            >
              <RefreshCw size={11} />
              More questions
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-full bg-[#FF916C]/15 border border-[#FF916C]/30
                         text-[#FF916C] text-[12px] active:scale-95 transition-all"
            >
              Done
            </button>
          </div>
        </div>
      </motion.div>
    )
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target size={13} className="text-[#4EF0A0]" />
          <span className="text-[#9895B5] text-[11px] uppercase tracking-widest font-medium">
            Quiz
          </span>
        </div>
        {score.total > 0 && (
          <span className="text-[#9895B5] text-[10px] tabular-nums">
            {score.correct}/{score.total} correct
          </span>
        )}
      </div>

      {/* Concept label */}
      <p className="text-[#FF916C] text-[11px] font-medium truncate">{conceptTitle}</p>

      {/* Loading */}
      {phase === 'loading' && (
        <div className="flex items-center gap-2 py-3">
          <Loader size={13} className="text-[#FF916C] animate-spin" />
          <span className="text-[#9895B5] text-[12px]">Generating question…</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-[#FF7B7B] text-[11px]">{error}</p>
      )}

      {/* Question + answer */}
      <AnimatePresence mode="wait">
        {currentQ && (phase === 'question' || phase === 'submitting' || phase === 'result') && (
          <motion.div
            key={currentQ.question}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3"
          >
            {/* Question text */}
            <div className="bg-[#1A1640] border border-white/[0.06] rounded-xl p-3">
              <p className="text-[#E8E5FF] text-[13px] leading-relaxed">{currentQ.question}</p>
            </div>

            {/* Answer input — hidden after submission */}
            {(phase === 'question' || phase === 'submitting') && (
              <div>
                <textarea
                  ref={textareaRef}
                  value={answer}
                  onChange={e => setAnswer(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type your answer…"
                  rows={3}
                  disabled={phase === 'submitting'}
                  style={{ fontSize: '16px' }}
                  className="w-full bg-[#2E2B4A] border border-white/10 rounded-xl px-3 py-2.5
                             text-[#E8E5FF] placeholder:text-[#5C5878] resize-none
                             focus:outline-none focus:border-white/20 transition-colors
                             disabled:opacity-50"
                />
                <button
                  onClick={handleSubmit}
                  disabled={!answer.trim() || phase === 'submitting'}
                  className="mt-2 w-full py-2 rounded-xl text-[12px] font-medium transition-all
                             disabled:opacity-35 active:scale-98
                             bg-[#FF916C] text-[#1D183E]"
                >
                  {phase === 'submitting' ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader size={12} className="animate-spin" />
                      Checking…
                    </span>
                  ) : 'Submit answer'}
                </button>
              </div>
            )}

            {/* Result */}
            {phase === 'result' && result && (
              <div className="space-y-2">
                {/* Show what student wrote */}
                <div className="bg-white/4 rounded-lg px-3 py-2">
                  <p className="text-[#6B6888] text-[10px] uppercase tracking-widest mb-0.5">Your answer</p>
                  <p className="text-[#C8C5E8] text-[12px] italic">"{answer}"</p>
                </div>

                <VerdictCard
                  result={result}
                  onRetry={handleRetry}
                  onNext={handleNext}
                  showHint={showHint}
                  onShowHint={() => setShowHint(true)}
                  attempts={attempts}
                />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
