import { BlockMath } from 'react-katex'

function MathFormula({ latex, fallbackText = '', className = '' }) {
  return (
    <div className={`study-formula-block rounded-xl border border-[#A8D8FF]/25 bg-[#241C45] px-3 py-3 sm:px-4 sm:py-3.5 ${className}`}>
      <div className="overflow-x-auto">
        {latex?.trim() ? (
          <BlockMath math={latex} />
        ) : (
          <p className="text-sm text-[#F2CA98]">{fallbackText || '-'}</p>
        )}
      </div>
    </div>
  )
}

export default MathFormula