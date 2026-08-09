/**
 * FormulaBlock — renders formula using KaTeX (already in the project)
 */
import { motion } from 'framer-motion'
import { InlineMath, BlockMath } from 'react-katex'
import 'katex/dist/katex.min.css'

function isLatex(str) {
  return /[\\{}^_]/.test(str) || str.startsWith('\\')
}

export function FormulaBlock({ block, isActive, onComplete }) {
  const content = block.content || ''

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      onAnimationComplete={() => setTimeout(() => onComplete?.(), 800)}
      className="py-2"
    >
      <p className="text-xs text-[#A8D8FF] uppercase tracking-widest mb-2 font-medium">
        Formula
      </p>
      <div className="bg-[#241C45] border border-[#A8D8FF]/20 rounded-xl px-4 py-3 overflow-x-auto">
        {isLatex(content) ? (
          <BlockMath math={content} />
        ) : (
          <p className="text-[#A8D8FF] text-base font-mono text-center">{content}</p>
        )}
      </div>
    </motion.div>
  )
}
