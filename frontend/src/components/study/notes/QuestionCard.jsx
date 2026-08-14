/**
 * QuestionCard — renders question_text as a notebook problem statement.
 * Looks like a question written in pencil on ruled paper with a red left margin.
 */

import { useRef } from 'react'
import AnnotationOverlay from './AnnotationOverlay'

export default function QuestionCard({ question, activeAnnotations = [] }) {
  const containerRef = useRef(null)

  const annotationTargets = activeAnnotations
    .filter(a => a.target_text && question.question_text.includes(a.target_text))
    .reduce((acc, a) => {
      acc[a.target_text] = a.stepId
      return acc
    }, {})

  const renderAnnotatedText = () => {
    if (!Object.keys(annotationTargets).length) {
      return <span>{question.question_text}</span>
    }
    const ranges = []
    for (const [target, stepId] of Object.entries(annotationTargets)) {
      let idx = 0
      while (true) {
        const pos = question.question_text.indexOf(target, idx)
        if (pos === -1) break
        ranges.push({ start: pos, end: pos + target.length, target, stepId })
        idx = pos + 1
      }
    }
    ranges.sort((a, b) => a.start - b.start)
    const parts = []
    let cursor = 0
    for (const range of ranges) {
      if (range.start > cursor)
        parts.push({ text: question.question_text.slice(cursor, range.start), annotate: null })
      parts.push({ text: range.target, annotate: range.stepId })
      cursor = range.end
    }
    if (cursor < question.question_text.length)
      parts.push({ text: question.question_text.slice(cursor), annotate: null })

    return parts.map((p, i) =>
      p.annotate
        ? <span key={i} data-annotate={p.annotate} className="relative bg-yellow-200/60 rounded px-0.5">{p.text}</span>
        : <span key={i}>{p.text}</span>
    )
  }

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden"
      style={{
        background: '#F9F6EE',
        borderRadius: '6px 6px 4px 4px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.18), 0 1px 2px rgba(0,0,0,0.12)',
        // Ruled lines via repeating gradient
        backgroundImage: `
          repeating-linear-gradient(
            transparent,
            transparent 27px,
            #C8D8E8 27px,
            #C8D8E8 28px
          )
        `,
        backgroundPositionY: '36px',
      }}
    >
      {/* Red left margin line */}
      <div
        className="absolute top-0 bottom-0 left-12"
        style={{ width: '1.5px', background: '#E8A0A0', zIndex: 1 }}
      />

      {/* Top tape / dog-ear effect */}
      <div
        className="absolute top-0 right-0 w-8 h-8"
        style={{
          background: 'linear-gradient(225deg, #E8E0D0 50%, transparent 50%)',
        }}
      />

      <div className="relative z-10 pl-16 pr-5 pt-4 pb-5" style={{ minHeight: '80px' }}>
        {/* Problem number */}
        <div
          className="absolute left-0 top-4 w-12 text-center text-[11px] font-bold"
          style={{ color: '#C0A080', fontFamily: 'Georgia, serif' }}
        >
          Q{question.sequence_order || ''}
        </div>

        <p
          className="text-[13px] leading-[28px] whitespace-pre-wrap"
          style={{
            color: '#2A2040',
            fontFamily: "'Georgia', 'Times New Roman', serif",
          }}
        >
          {renderAnnotatedText()}
        </p>
      </div>

      <AnnotationOverlay annotations={activeAnnotations} containerRef={containerRef} />
    </div>
  )
}
