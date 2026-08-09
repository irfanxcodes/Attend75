/**
 * LessonControls — minimal floating control bar at the bottom of the lesson player.
 * Shows: progress bar, play/pause, doubt button.
 */
import { motion } from 'framer-motion'
import { MessageCircle, Pause, Play } from 'lucide-react'

export function LessonControls({
  isPlaying,
  isPaused,
  isIdle,
  progress,
  onPlayPause,
  onOpenDoubt,
  doubtsAsked = 0,
}) {
  const canControl = isPlaying || isPaused || isIdle

  return (
    <motion.div
      initial={{ y: 80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.3, type: 'spring', damping: 20 }}
      className="fixed bottom-0 left-0 right-0 z-40 pb-safe"
    >
      {/* Progress bar */}
      <div className="h-0.5 bg-white/5">
        <motion.div
          className="h-full bg-[#6CB4FF]"
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        />
      </div>

      {/* Control bar */}
      <div className="bg-[#1D183E]/95 backdrop-blur-md border-t border-white/5 px-5 py-3 flex items-center justify-between gap-4">
        {/* Progress label */}
        <span className="text-[#9F9AB5] text-xs tabular-nums min-w-[32px]">
          {progress}%
        </span>

        {/* Play / Pause button */}
        <button
          onClick={onPlayPause}
          disabled={!canControl}
          className="w-11 h-11 rounded-full bg-[#6CB4FF] flex items-center justify-center
                     shadow-lg shadow-[#6CB4FF]/20 active:scale-95 transition-transform
                     disabled:opacity-40"
          aria-label={isPlaying ? 'Pause lesson' : 'Play lesson'}
        >
          {isPlaying ? (
            <Pause size={18} className="text-[#1D183E]" fill="currentColor" />
          ) : (
            <Play size={18} className="text-[#1D183E] ml-0.5" fill="currentColor" />
          )}
        </button>

        {/* Doubt button */}
        <button
          onClick={onOpenDoubt}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl
                     bg-white/5 border border-white/10 text-[#9F9AB5] text-xs
                     hover:bg-white/8 hover:text-[#F4F1FF] transition-all active:scale-95"
          aria-label="Ask a doubt"
        >
          <MessageCircle size={14} />
          <span>Ask</span>
          {doubtsAsked > 0 && (
            <span className="text-[#6CB4FF]">{doubtsAsked}</span>
          )}
        </button>
      </div>
    </motion.div>
  )
}
