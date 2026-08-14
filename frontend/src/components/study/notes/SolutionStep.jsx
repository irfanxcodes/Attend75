/**
 * SolutionStep — renders one teaching step.
 *
 * Two display modes:
 *   content_format = "text"  → ink-dot + prose (existing behaviour)
 *   content_format = "table" → ink-dot + StepTable (ledger / balance sheet / key-value)
 */

import { useEffect, useRef } from 'react'
import StepTable from './StepTable'

const STEP_CONFIG = {
  context:     { label: 'Understanding', dot: '#6B7CFF' },
  given:       { label: 'Given',         dot: '#22C55E' },
  formula:     { label: 'Formula',       dot: '#F59E0B' },
  calculation: { label: 'Step',          dot: '#3B82F6' },
  result:      { label: 'Result',        dot: '#10B981' },
  insight:     { label: 'Note',          dot: '#A855F7' },
}

export default function SolutionStep({ step, stepNumber, autoPlay = false }) {
  const spokenRef = useRef(false)
  const cfg = STEP_CONFIG[step.step_type] || STEP_CONFIG.context
  const isTable = step.content_format === 'table'

  useEffect(() => {
    if (!autoPlay || spokenRef.current || !step.voice_text) return
    if (!window.speechSynthesis) return
    spokenRef.current = true
    const utterance = new SpeechSynthesisUtterance(step.voice_text)
    utterance.rate = 0.95
    utterance.pitch = 1.0
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utterance)
  }, [autoPlay, step.voice_text])

  // Label — for table steps, use a more descriptive badge
  const label = isTable
    ? (step.step_type === 'calculation' ? (stepNumber ? `Table ${stepNumber}` : 'Table') : cfg.label)
    : (cfg.label + (step.step_type === 'calculation' && stepNumber ? ` ${stepNumber}` : ''))

  return (
    <div className="flex gap-3 py-2">
      {/* Left: coloured dot + vertical line */}
      <div className="flex flex-col items-center pt-1 flex-shrink-0">
        <div
          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: cfg.dot }}
        />
        <div className="w-px flex-1 mt-1" style={{ backgroundColor: `${cfg.dot}35` }} />
      </div>

      {/* Right: label + content */}
      <div className="flex-1 min-w-0 pb-3">
        <span
          className="text-[9px] font-bold uppercase tracking-[0.15em] mb-2 block"
          style={{ color: cfg.dot }}
        >
          {label}
        </span>

        {isTable ? (
          <StepTable content={step.content} />
        ) : (
          <p
            className="text-[13px] leading-relaxed"
            style={{
              color: '#2D2A45',
              fontFamily: 'system-ui, -apple-system, sans-serif',
              whiteSpace: 'pre-wrap',
            }}
          >
            {step.content}
          </p>
        )}
      </div>
    </div>
  )
}
