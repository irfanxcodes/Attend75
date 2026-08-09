/**
 * ExampleBlock — real-world example with distinct visual treatment
 */
import { motion } from 'framer-motion'

export function ExampleBlock({ block, isActive, onComplete }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      onAnimationComplete={() => setTimeout(() => onComplete?.(), 600)}
      className="py-2"
    >
      <div className="bg-[#FF916C]/8 border border-[#FF916C]/20 rounded-xl px-4 py-3">
        <p className="text-xs text-[#FF916C] uppercase tracking-widest mb-1.5 font-medium">
          Example
        </p>
        <p className="text-[#F4F1FF] text-sm leading-relaxed">
          {block.content}
        </p>
      </div>
    </motion.div>
  )
}
