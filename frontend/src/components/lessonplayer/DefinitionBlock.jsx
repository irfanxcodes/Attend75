/**
 * DefinitionBlock — document-style definition with indigo left border.
 * Used both in the sequential LessonPlayer and as a legacy block on the Canvas.
 */
import { motion } from 'framer-motion'

export function DefinitionBlock({ block, isActive, onComplete }) {
  // In canvas (static) mode the block renders on a white background.
  // In lesson player mode it renders on the dark #1D183E background.
  // We detect context by checking if isActive is explicitly false (canvas static mode).
  const isCanvasMode = isActive === false

  if (isCanvasMode) {
    return (
      <div className="border-l-[3px] border-[#6366f1] pl-4 py-0.5 mb-4">
        <p className="text-[10px] text-[#6366f1] uppercase tracking-widest font-semibold mb-1.5">
          Definition
        </p>
        <p className="text-[#1a1827] text-[15px] leading-relaxed italic">
          "{block.content}"
        </p>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.35 }}
      onAnimationComplete={() => setTimeout(() => onComplete?.(), 600)}
      className="py-2"
    >
      <div className="border-l-2 border-[#4EF0A0] pl-4 py-1">
        <p className="text-xs text-[#4EF0A0] uppercase tracking-widest mb-1 font-medium">
          Definition
        </p>
        <p className="text-[#F4F1FF] text-sm leading-relaxed italic">
          "{block.content}"
        </p>
      </div>
    </motion.div>
  )
}
