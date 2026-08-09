/**
 * RecapBlock — end-of-chapter summary block
 */
import { motion } from 'framer-motion'

export function RecapBlock({ block, onComplete }) {
  const lines = block.content.split('\n').filter(Boolean)

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      onAnimationComplete={() => setTimeout(() => onComplete?.(), 1000)}
      className="py-2"
    >
      <div className="bg-gradient-to-br from-[#3D3660] to-[#302A52] border border-[#6CB4FF]/20 rounded-2xl p-4">
        <p className="text-xs text-[#6CB4FF] uppercase tracking-widest mb-3 font-medium">
          Chapter Recap
        </p>
        {lines.map((line, i) => (
          <motion.p
            key={i}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.06, duration: 0.2 }}
            className="text-[#D8D4E7] text-sm leading-relaxed py-0.5"
          >
            {line}
          </motion.p>
        ))}
      </div>
    </motion.div>
  )
}
