/**
 * LessonSummary — end-of-chapter summary screen shown after all blocks complete.
 */
import { motion } from 'framer-motion'
import { BookOpen, CheckCircle, MessageCircle, RotateCcw } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export function LessonSummary({ script, conceptsSeen, quizResults, doubtsAsked, subjectId, lessonId }) {
  const navigate = useNavigate()

  const totalConcepts = script?.concept_count || 0
  const totalQuizzes = Object.keys(quizResults).length
  const correctQuizzes = Object.values(quizResults).filter(r => r === 'correct').length
  const durationMin = script?.estimated_duration_seconds
    ? Math.round(script.estimated_duration_seconds / 60)
    : null

  const stats = [
    { icon: BookOpen, label: 'Concepts covered', value: `${conceptsSeen.length}/${totalConcepts}`, color: '#6CB4FF' },
    { icon: CheckCircle, label: 'Quiz score', value: totalQuizzes > 0 ? `${correctQuizzes}/${totalQuizzes}` : '—', color: '#4EF0A0' },
    { icon: MessageCircle, label: 'Doubts asked', value: doubtsAsked, color: '#FF916C' },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="flex-1 flex flex-col items-center justify-center px-5 py-8 text-center"
    >
      {/* Celebration */}
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.2, type: 'spring', damping: 12 }}
        className="text-5xl mb-4"
      >
        🎓
      </motion.div>

      <h2 className="text-[#F4F1FF] text-xl font-semibold mb-1">
        Chapter Complete!
      </h2>
      <p className="text-[#9F9AB5] text-sm mb-6">
        {script?.title || 'You finished this lesson'}
        {durationMin && ` · ${durationMin} min`}
      </p>

      {/* Stats */}
      <div className="w-full max-w-xs grid grid-cols-3 gap-3 mb-8">
        {stats.map(({ icon: Icon, label, value, color }) => (
          <motion.div
            key={label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="bg-[#302A52] rounded-2xl p-3 flex flex-col items-center gap-1"
          >
            <Icon size={16} style={{ color }} />
            <span className="text-[#F4F1FF] text-lg font-semibold" style={{ color }}>
              {value}
            </span>
            <span className="text-[#9F9AB5] text-xs leading-tight text-center">{label}</span>
          </motion.div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-3 w-full max-w-xs">
        <button
          onClick={() => navigate(`/app/study/${subjectId}`)}
          className="w-full py-3 rounded-2xl bg-[#6CB4FF] text-[#1D183E] font-semibold text-sm
                     active:scale-98 transition-transform"
        >
          Back to Chapter List
        </button>
        <button
          onClick={() => window.location.reload()}
          className="w-full py-3 rounded-2xl bg-white/5 border border-white/10 text-[#9F9AB5] text-sm
                     flex items-center justify-center gap-2 hover:text-[#F4F1FF] transition-colors"
        >
          <RotateCcw size={14} />
          Revisit lesson
        </button>
      </div>
    </motion.div>
  )
}
