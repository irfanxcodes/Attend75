import { useMemo } from 'react'
import katex from 'katex'
import { latexFallbackText, normalizeLatex } from '../../utils/mathLatex'

function MathFormula({ latex, fallbackText = '', className = '' }) {
  const resolvedLatex = normalizeLatex(latex)
  const resolvedFallbackText = latexFallbackText(latex, fallbackText)
  const renderedHtml = useMemo(() => {
    if (!resolvedLatex) {
      return ''
    }

    try {
      return katex.renderToString(resolvedLatex, {
        displayMode: true,
        throwOnError: true,
        strict: 'ignore',
      })
    } catch {
      return ''
    }
  }, [resolvedLatex])

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
