import { useMemo } from 'react'
import katex from 'katex'
import { BlockMath } from 'react-katex'
import { latexFallbackText, normalizeLatex } from '../../utils/mathLatex'

function MathFormula({ latex, fallbackText = '', className = '', debugId = '' }) {
  const normalizedLatex = normalizeLatex(latex)
  const resolvedFallbackText = latexFallbackText(latex, fallbackText)
  const diagnostics = useMemo(() => {
    const rawLatex = String(latex || '')
    const info = {
      debugId: String(debugId || '').trim() || 'unknown-formula',
      rawLatex,
      normalizedLatex,
      fallbackText: String(fallbackText || ''),
      rawPrecheckOk: false,
      rawPrecheckError: '',
      normalizedPrecheckOk: false,
      normalizedPrecheckError: '',
      selectedMath: normalizedLatex,
      bypassedNormalizer: false,
      willUseFallbackBecauseEmptyLatex: !normalizedLatex,
    }

    if (!rawLatex && !normalizedLatex) {
      return info
    }

    try {
      katex.renderToString(rawLatex, { throwOnError: true, displayMode: true, strict: 'error' })
      info.rawPrecheckOk = true
    } catch (error) {
      info.rawPrecheckError = error instanceof Error ? error.message : String(error)
    }

    if (normalizedLatex) {
      try {
        katex.renderToString(normalizedLatex, { throwOnError: true, displayMode: true, strict: 'error' })
        info.normalizedPrecheckOk = true
      } catch (error) {
        info.normalizedPrecheckError = error instanceof Error ? error.message : String(error)
      }
    }

    if (info.rawPrecheckOk && !info.normalizedPrecheckOk) {
      info.selectedMath = rawLatex
      info.bypassedNormalizer = true
    }

    return info
  }, [debugId, fallbackText, latex, normalizedLatex])

  if (typeof window !== 'undefined') {
    const debugKey = `studyme-math:${diagnostics.debugId}:${diagnostics.normalizedLatex}:${diagnostics.fallbackText}`
    if (!window.__studyMeMathDebugSeen) {
      window.__studyMeMathDebugSeen = new Set()
    }
    if (!window.__studyMeMathDebugSeen.has(debugKey)) {
      window.__studyMeMathDebugSeen.add(debugKey)
      console.info('[StudyMe MathFormula] precheck', diagnostics)
    }
  }

  return (
    <div
      data-studyme-formula-id={diagnostics.debugId}
      className={`study-formula-block rounded-xl border border-[#A8D8FF]/25 bg-[#241C45] px-3 py-3 sm:px-4 sm:py-3.5 ${className}`}
    >
      <div className="overflow-x-auto">
        {normalizedLatex ? (
          <BlockMath
            math={diagnostics.selectedMath}
            renderError={(error) => {
              console.error('[StudyMe MathFormula] renderError', {
                ...diagnostics,
                renderError: error instanceof Error ? error.message : String(error),
                renderedFallback: resolvedFallbackText,
              })
              return <p className="text-sm text-[#F2CA98]">{resolvedFallbackText}</p>
            }}
          />
        ) : (
          <p className="text-sm text-[#F2CA98]">{resolvedFallbackText}</p>
        )}
      </div>
    </div>
  )
}

export default MathFormula
