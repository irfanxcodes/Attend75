import { useMemo } from 'react'
import katex from 'katex'
import { latexFallbackText, normalizeLatex } from '../../utils/mathLatex'

function renderLatex(latex, displayMode) {
  const resolvedLatex = normalizeLatex(latex)
  if (!resolvedLatex) {
    return ''
  }

  try {
    return katex.renderToString(resolvedLatex, {
      displayMode,
      throwOnError: true,
      strict: 'ignore',
    })
  } catch {
    return ''
  }
}

export function MathInline({ latex, fallbackText = '', className = '' }) {
  const renderedHtml = useMemo(() => renderLatex(latex, false), [latex])
  const resolvedFallbackText = latexFallbackText(latex, fallbackText)

  if (!renderedHtml) {
    return <span className={className}>{resolvedFallbackText}</span>
  }

  return <span className={className} dangerouslySetInnerHTML={{ __html: renderedHtml }} />
}

function MathFormula({ latex, fallbackText = '', className = '' }) {
  const resolvedLatex = normalizeLatex(latex)
  const resolvedFallbackText = latexFallbackText(latex, fallbackText)
  const renderedHtml = useMemo(() => renderLatex(resolvedLatex, true), [resolvedLatex])

  return (
    <div className={`study-formula-block rounded-xl border border-[#A8D8FF]/25 bg-[#241C45] px-3 py-3 sm:px-4 sm:py-3.5 ${className}`}>
      <div className="overflow-x-auto">
        {renderedHtml ? (
          <div dangerouslySetInnerHTML={{ __html: renderedHtml }} />
        ) : (
          <p className="text-sm text-[#F2CA98]">{resolvedFallbackText}</p>
        )}
      </div>
    </div>
  )
}

export default MathFormula
