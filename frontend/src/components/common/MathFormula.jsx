import { BlockMath } from 'react-katex'

function normalizeLatex(latex) {
  const raw = String(latex || '')

  return raw
    .replace(/\u0008([A-Za-z]+)/g, String.raw`\\b$1`)
    .replace(/\u000c([A-Za-z]+)/g, String.raw`\\f$1`)
    .replace(/\r([A-Za-z]+)/g, String.raw`\\r$1`)
    .replace(/\t([A-Za-z]+)/g, String.raw`\\t$1`)
    .replace(/\u000b([A-Za-z]+)/g, String.raw`\\v$1`)
    .trim()
}

function MathFormula({ latex, fallbackText = '', className = '' }) {
  const normalizedLatex = normalizeLatex(latex)

  return (
    <div className={`study-formula-block rounded-xl border border-[#A8D8FF]/25 bg-[#241C45] px-3 py-3 sm:px-4 sm:py-3.5 ${className}`}>
      <div className="overflow-x-auto">
        {normalizedLatex ? (
          <BlockMath math={normalizedLatex} />
        ) : (
          <p className="text-sm text-[#F2CA98]">{fallbackText || '-'}</p>
        )}
      </div>
    </div>
  )
}

export default MathFormula
