import { BlockMath } from 'react-katex'
import { latexFallbackText } from '../../utils/mathLatex'

function MathFormula({ latex, fallbackText = '', className = '' }) {
  const resolvedLatex = String(latex || '').trim()
  const resolvedFallbackText = latexFallbackText(latex, fallbackText)

  return (
    <div className={`study-formula-block rounded-xl border border-[#A8D8FF]/25 bg-[#241C45] px-3 py-3 sm:px-4 sm:py-3.5 ${className}`}>
      <div className="overflow-x-auto">
        {resolvedLatex ? (
          <BlockMath
            math={resolvedLatex}
            renderError={() => <p className="text-sm text-[#F2CA98]">{resolvedFallbackText}</p>}
          />
        ) : (
          <p className="text-sm text-[#F2CA98]">{resolvedFallbackText}</p>
        )}
      </div>
    </div>
  )
}

export default MathFormula
