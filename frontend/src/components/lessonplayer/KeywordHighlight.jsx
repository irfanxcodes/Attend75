/**
 * KeywordHighlight — document-style keyword chips.
 * Used in legacy lesson blocks rendered on the Canvas.
 */
import { motion } from 'framer-motion'

export function KeywordHighlight({ block, isActive, onComplete }) {
  let keywords = []
  try {
    keywords = JSON.parse(block.content)
  } catch {
    keywords = block.content.split(',').map(k => k.trim()).filter(Boolean)
  }

  return (
    <div className="mb-4">
      <p className="text-[10px] text-[#6b7280] uppercase tracking-widest font-semibold mb-2">
        Key Terms
      </p>
      <div className="flex flex-wrap gap-2">
        {keywords.map((kw, i) => (
          <motion.span
            key={`${block.id}-kw-${i}`}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.05, duration: 0.18 }}
            onAnimationComplete={() => {
              if (i === keywords.length - 1) setTimeout(() => onComplete?.(), 300)
            }}
            className="px-3 py-1 rounded-full text-[13px] font-medium
                       bg-indigo-50 text-indigo-700 border border-indigo-200"
          >
            {kw}
          </motion.span>
        ))}
      </div>
    </div>
  )
}
