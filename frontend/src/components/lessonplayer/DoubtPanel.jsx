/**
 * DoubtPanel — slide-up panel for asking a doubt during lesson playback.
 * Supports text input and voice (Web Speech Recognition).
 */
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Mic, MicOff, Send, X } from 'lucide-react'
import { useWebSpeech } from '../../hooks/useWebSpeech'

export function DoubtPanel({ isOpen, onClose, onSubmit, isAnswering, answer }) {
  const [question, setQuestion] = useState('')
  const { listen, stopListening, isListening, isSTTSupported } = useWebSpeech()
  const inputRef = useRef(null)

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300)
    } else {
      setQuestion('')
      stopListening()
    }
  }, [isOpen, stopListening])

  const handleVoice = () => {
    if (isListening) {
      stopListening()
      return
    }
    listen({
      onResult: (transcript) => {
        setQuestion(transcript)
        stopListening()
      },
      onError: (err) => {
        console.warn('STT error:', err)
        stopListening()
      },
    })
  }

  const handleSubmit = () => {
    const q = question.trim()
    if (!q || isAnswering) return
    onSubmit(q)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 z-40"
          />

          {/* Panel */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 26, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-[#302A52] border-t border-white/10 rounded-t-2xl px-5 pt-4 pb-[max(2rem,env(safe-area-inset-bottom))]"
          >
            {/* Handle */}
            <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-4" />

            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <p className="text-[#F4F1FF] text-sm font-medium">Ask a question</p>
              <button
                onClick={onClose}
                className="w-7 h-7 rounded-full bg-white/5 flex items-center justify-center text-[#9F9AB5] hover:text-[#F4F1FF] transition-colors"
              >
                <X size={14} />
              </button>
            </div>

            {/* AI Answer (shown after submit) */}
            <AnimatePresence>
              {answer && !isAnswering && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mb-3"
                >
                  <div className="bg-[#1D183E] rounded-xl p-3">
                    <p className="text-xs text-[#FF916C] mb-1 font-medium">Answer</p>
                    <p className="text-[#D8D4E7] text-sm leading-relaxed">{answer}</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Loading state */}
            {isAnswering && (
              <div className="mb-3 flex items-center gap-2 text-[#9F9AB5] text-sm">
                <motion.div
                  className="flex gap-1"
                  animate={{}}
                >
                  {[0, 1, 2].map(i => (
                    <motion.span
                      key={i}
                      className="w-1.5 h-1.5 bg-[#FF916C] rounded-full"
                      animate={{ y: [0, -4, 0] }}
                      transition={{ delay: i * 0.15, repeat: Infinity, duration: 0.6 }}
                    />
                  ))}
                </motion.div>
                <span>Thinking...</span>
              </div>
            )}

            {/* Input row */}
            <div className="flex gap-2 items-end">
              <textarea
                ref={inputRef}
                value={question}
                onChange={e => setQuestion(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your question here..."
                rows={2}
                disabled={isAnswering}
                className="flex-1 bg-[#1D183E] border border-white/10 rounded-xl px-3 py-2.5
                           text-[#F4F1FF] text-sm placeholder:text-[#9F9AB5] resize-none
                           focus:outline-none focus:border-[#FF916C]/50 transition-colors
                           disabled:opacity-50"
              />

              {/* Voice button */}
              {isSTTSupported && (
                <button
                  onClick={handleVoice}
                  disabled={isAnswering}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all flex-shrink-0
                    ${isListening
                      ? 'bg-[#FF6B6B]/20 border border-[#FF6B6B]/50 text-[#FF6B6B]'
                      : 'bg-white/5 border border-white/10 text-[#9F9AB5] hover:text-[#F4F1FF]'
                    } disabled:opacity-40`}
                  aria-label={isListening ? 'Stop listening' : 'Use voice'}
                >
                  {isListening ? <MicOff size={15} /> : <Mic size={15} />}
                </button>
              )}

              {/* Send button */}
              <button
                onClick={handleSubmit}
                disabled={!question.trim() || isAnswering}
                className="w-10 h-10 rounded-xl bg-[#FF916C] flex items-center justify-center
                           flex-shrink-0 active:scale-95 transition-all
                           disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Send question"
              >
                <Send size={15} className="text-white" />
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
