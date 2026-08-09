/**
 * QuizBlock — pauses lesson, shows recall question, reveals answer
 */
import { useState } from 'react'
import { motion } from 'framer-motion'
import { CheckCircle, ChevronDown } from 'lucide-react'

export function QuizBlock({ block, onAnswer }) {
  const [showAnswer, setShowAnswer] = useState(false)
  const [answered, setAnswered] = useState(false)

  const handleReveal = () => {
    setShowAnswer(true)
  }

  const handleMark = (result) => {
    setAnswered(true)
    onAnswer?.(result)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="py-2"
    >
      <div className="bg-[#4A466A] border border-white/10 rounded-2xl p-4">
        {/* Question header */}
        <div className="flex items-center gap-2 mb-3">
          <div className="w-5 h-5 rounded-full bg-[#FF916C]/20 border border-[#FF916C]/50 flex items-center justify-center flex-shrink-0">
            <span className="text-[#FF916C] text-xs font-bold">?</span>
          </div>
          <p className="text-xs text-[#FF916C] uppercase tracking-widest font-medium">
            Quick Check
          </p>
        </div>

        {/* Question */}
        <p className="text-[#F4F1FF] text-sm leading-relaxed mb-4">
          {block.content}
        </p>

        {/* Answer reveal */}
        {!showAnswer ? (
          <button
            onClick={handleReveal}
            className="w-full py-2.5 rounded-xl bg-white/5 border border-white/10 text-[#9F9AB5] text-sm hover:bg-white/8 hover:text-[#F4F1FF] transition-all flex items-center justify-center gap-2"
          >
            <ChevronDown size={14} />
            Show Answer
          </button>
        ) : (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            transition={{ duration: 0.25 }}
          >
            <div className="bg-[#1D183E] rounded-xl p-3 mb-3">
              <p className="text-xs text-[#4EF0A0] mb-1 font-medium">Answer</p>
              <p className="text-[#D8D4E7] text-sm leading-relaxed">
                {block.expected_answer}
              </p>
            </div>

            {!answered && (
              <div className="flex gap-2">
                <button
                  onClick={() => handleMark('correct')}
                  className="flex-1 py-2 rounded-xl bg-[#4EF0A0]/10 border border-[#4EF0A0]/30 text-[#4EF0A0] text-sm font-medium hover:bg-[#4EF0A0]/15 transition-all"
                >
                  Got it ✓
                </button>
                <button
                  onClick={() => handleMark('incorrect')}
                  className="flex-1 py-2 rounded-xl bg-white/5 border border-white/10 text-[#9F9AB5] text-sm hover:bg-white/8 transition-all"
                >
                  Need review
                </button>
              </div>
            )}

            {answered && (
              <div className="flex items-center gap-2 text-[#4EF0A0] text-sm">
                <CheckCircle size={14} />
                <span>Continuing lesson...</span>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </motion.div>
  )
}
