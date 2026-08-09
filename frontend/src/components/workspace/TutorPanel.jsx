/**
 * TutorPanel — persistent AI tutor sidebar.
 *
 * Fixes applied:
 * - Markdown rendered properly in chat bubbles (bold, italic, code, lists)
 * - Panel is flex-col h-full with overflow-hidden — no bleeding into canvas
 * - Input section is flex-shrink-0 so it never pushes the message list off screen
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, Loader, Mic, MicOff, Send, Sparkles, X } from 'lucide-react'
import { useWebSpeech } from '../../hooks/useWebSpeech'
import { askTutor } from '../../services/lessonApi'
import { AdaptiveQuiz } from './AdaptiveQuiz'

const MODE_CONFIG = {
  answer:   { label: 'Answer',   color: '#6CB4FF' },
  socratic: { label: 'Socratic', color: '#A78BFA' },
  hint:     { label: 'Hint',     color: '#F5C26B' },
  quiz:     { label: 'Quiz me',  color: '#4EF0A0' },
}

// ── Inline markdown renderer ──────────────────────────────────────────────
// Handles: **bold**, *italic*, `code`, and bullet lists (- item)
// Kept intentionally simple — no external dependency needed.

function renderInlineMarkdown(text) {
  // Split on **bold**, *italic*, `code` patterns
  const parts = []
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g
  let last = 0
  let match

  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) {
      parts.push({ type: 'text', content: text.slice(last, match.index) })
    }
    if (match[2]) parts.push({ type: 'bold',   content: match[2] })
    else if (match[3]) parts.push({ type: 'italic', content: match[3] })
    else if (match[4]) parts.push({ type: 'code',   content: match[4] })
    last = match.index + match[0].length
  }
  if (last < text.length) {
    parts.push({ type: 'text', content: text.slice(last) })
  }

  return parts.map((p, i) => {
    if (p.type === 'bold')   return <strong key={i} className="font-semibold text-white">{p.content}</strong>
    if (p.type === 'italic') return <em key={i} className="italic">{p.content}</em>
    if (p.type === 'code')   return <code key={i} className="bg-white/10 rounded px-1 py-0.5 text-[11px] font-mono text-[#A8D8FF]">{p.content}</code>
    return <span key={i}>{p.content}</span>
  })
}

function MarkdownContent({ content, isUser }) {
  // Split into lines, handle bullet lists
  const lines = (content || '').split('\n')

  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        const trimmed = line.trim()
        if (!trimmed) return null

        // Bullet list item
        if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
          return (
            <div key={i} className="flex gap-1.5 items-start">
              <span className="mt-[5px] w-1 h-1 rounded-full bg-current flex-shrink-0 opacity-60" />
              <span className="text-[13px] leading-relaxed">
                {renderInlineMarkdown(trimmed.slice(2))}
              </span>
            </div>
          )
        }

        return (
          <p key={i} className="text-[13px] leading-relaxed">
            {renderInlineMarkdown(trimmed)}
          </p>
        )
      })}
    </div>
  )
}

// ── Message bubble ────────────────────────────────────────────────────────

function MessageBubble({ msg }) {
  const isUser = msg.role === 'user'
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}
    >
      {!isUser && (
        <div className="w-6 h-6 rounded-full bg-[#6CB4FF]/20 flex items-center justify-center flex-shrink-0 mr-2 mt-0.5">
          <Sparkles size={10} className="text-[#6CB4FF]" />
        </div>
      )}
      <div
        className={`max-w-[85%] rounded-2xl px-3.5 py-2.5
          ${isUser
            ? 'bg-[#2E2B4A] text-[#E8E5FF] rounded-br-sm'
            : 'bg-[#1A1640] text-[#D4D1EC] rounded-bl-sm border border-white/[0.07]'
          }`}
      >
        <MarkdownContent content={msg.content} isUser={isUser} />
      </div>
    </motion.div>
  )
}

// ── Thinking indicator ────────────────────────────────────────────────────

function ThinkingIndicator() {
  return (
    <div className="flex justify-start mb-3">
      <div className="w-6 h-6 rounded-full bg-[#6CB4FF]/20 flex items-center justify-center flex-shrink-0 mr-2 mt-0.5">
        <Sparkles size={10} className="text-[#6CB4FF]" />
      </div>
      <div className="bg-[#1A1640] border border-white/[0.07] rounded-2xl rounded-bl-sm px-3.5 py-2.5 flex gap-1 items-center">
        {[0, 1, 2].map(i => (
          <motion.span
            key={i}
            className="w-1.5 h-1.5 bg-[#6CB4FF] rounded-full"
            animate={{ y: [0, -4, 0] }}
            transition={{ delay: i * 0.15, repeat: Infinity, duration: 0.6 }}
          />
        ))}
      </div>
    </div>
  )
}

// ── Mode selector ─────────────────────────────────────────────────────────

function ModeSelector({ mode, onChange }) {
  return (
    <div className="flex gap-1 flex-wrap">
      {Object.entries(MODE_CONFIG).map(([key, cfg]) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all border
            ${mode === key ? '' : 'text-[#9895B5] bg-transparent border-transparent hover:bg-white/[0.05] hover:text-[#C8C5E8]'}`}
          style={mode === key
            ? { backgroundColor: `${cfg.color}20`, color: cfg.color, borderColor: `${cfg.color}40` }
            : {}}
        >
          {cfg.label}
        </button>
      ))}
    </div>
  )
}

// ── Main TutorPanel ───────────────────────────────────────────────────────

export function TutorPanel({
  token, scriptId, conceptId, uploadId,
  currentConceptTitle, onViewSource,
  className = '',
}) {
  const [messages, setMessages] = useState([])
  const [input, setInput]       = useState('')
  const [mode, setMode]         = useState('answer')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)
  const [showQuiz, setShowQuiz] = useState(false)
  const messagesEndRef = useRef(null)
  const inputRef       = useRef(null)

  const { listen, stopListening, isListening, isSTTSupported } = useWebSpeech()

  // Reset when concept changes
  useEffect(() => {
    setShowQuiz(false)
    setMode('answer')
    setInput('')
    setError(null)
    setMessages(
      currentConceptTitle
        ? [{ role: 'tutor', content: `I'm here to help you with **${currentConceptTitle}**. Ask me anything, or tap "Quiz me" to test your understanding.` }]
        : []
    )
  }, [conceptId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const sendMessage = useCallback(async (text, overrideMode) => {
    const q = (text || input).trim()
    const activeMode = overrideMode || mode
    if (!q || !token) return

    const userMsg = { role: 'user', content: q }
    const history = [...messages, userMsg]
    setMessages(history)
    setInput('')
    setLoading(true)
    setError(null)

    try {
      const res = await askTutor({
        token, question: q, scriptId, conceptId, uploadId,
        conversation: history.slice(-6).map(m => ({
          role: m.role === 'user' ? 'user' : 'tutor',
          content: m.content,
        })),
        mode: activeMode,
      })
      setMessages(prev => [...prev, { role: 'tutor', content: res.answer }])
      if (res.suggested_action?.type === 'focus_slide' && res.suggested_action.slide) {
        onViewSource?.(res.suggested_action.slide)
      }
    } catch {
      setError('Could not reach AI. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [token, input, mode, messages, scriptId, conceptId, uploadId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleVoice = useCallback(() => {
    if (isListening) { stopListening(); return }
    listen({
      onResult: (t) => { setInput(t); stopListening() },
      onError:  ()  => stopListening(),
    })
  }, [isListening, listen, stopListening])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  const handleModeChange = (m) => {
    if (m === 'quiz') { setShowQuiz(true); return }
    setMode(m)
    setShowQuiz(false)
  }

  // ── Quiz mode ─────────────────────────────────────────────────────────

  if (showQuiz) {
    return (
      <div className={`flex flex-col h-full bg-[#1E1B3C] overflow-hidden ${className}`}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.07] flex-shrink-0">
          <button
            onClick={() => setShowQuiz(false)}
            className="w-7 h-7 rounded-full bg-white/5 flex items-center justify-center text-[#9895B5]
                       hover:bg-white/10 active:scale-95 transition-all flex-shrink-0"
          >
            <ArrowLeft size={13} />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-white text-[13px] font-semibold">Quiz</p>
            {currentConceptTitle && (
              <p className="text-[#6B6888] text-[10px] truncate" title={currentConceptTitle}>{currentConceptTitle}</p>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: '#2E2B4A transparent' }}>
          {conceptId ? (
            <AdaptiveQuiz
              token={token}
              conceptId={conceptId}
              conceptTitle={currentConceptTitle || 'Current concept'}
              onClose={() => setShowQuiz(false)}
              onProgressUpdate={() => {}}
            />
          ) : (
            <div className="flex items-center justify-center h-32 px-4">
              <p className="text-[#9895B5] text-sm text-center">Open a concept to start a quiz.</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Chat mode ─────────────────────────────────────────────────────────

  return (
    <div className={`flex flex-col h-full bg-[#1E1B3C] overflow-hidden ${className}`}>

      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-white/[0.07] flex-shrink-0">
        <div className="w-7 h-7 rounded-full bg-[#6CB4FF]/20 flex items-center justify-center flex-shrink-0">
          <Sparkles size={12} className="text-[#6CB4FF]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white text-[13px] font-semibold leading-tight">Tutor</p>
          {currentConceptTitle && (
            <p className="text-[#6B6888] text-[10px] truncate leading-tight mt-0.5" title={currentConceptTitle}>
              {currentConceptTitle}
            </p>
          )}
        </div>
      </div>

      {/* Messages — flex-1 with overflow scroll */}
      <div
        className="flex-1 overflow-y-auto min-h-0 px-4 py-3"
        style={{ scrollbarWidth: 'thin', scrollbarColor: '#2E2B4A transparent' }}
      >
        {messages.map((msg, i) => (
          <MessageBubble key={i} msg={msg} />
        ))}
        {loading && <ThinkingIndicator />}
        {error && <p className="text-[#FF7B7B] text-xs text-center py-2">{error}</p>}
        <div ref={messagesEndRef} />
      </div>

      {/* Mode selector — flex-shrink-0 */}
      <div className="px-4 py-2 border-t border-white/[0.05] flex-shrink-0">
        <ModeSelector mode={mode} onChange={handleModeChange} />
      </div>

      {/* Input row — flex-shrink-0 */}
      <div className="px-4 pb-4 pt-1.5 flex gap-2 items-end flex-shrink-0">
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything…"
          rows={2}
          disabled={loading}
          style={{ fontSize: '16px' }}
          className="flex-1 min-w-0 bg-[#2E2B4A] border border-white/[0.10] rounded-xl px-3 py-2.5
                     text-[#E8E5FF] placeholder:text-[#5C5878] resize-none
                     focus:outline-none focus:border-white/25 transition-colors disabled:opacity-50"
        />
        {isSTTSupported && (
          <button
            onClick={handleVoice}
            disabled={loading}
            aria-label={isListening ? 'Stop listening' : 'Voice input'}
            className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all
              ${isListening
                ? 'bg-[#FF7B7B]/20 border border-[#FF7B7B]/50 text-[#FF7B7B]'
                : 'bg-white/5 border border-white/10 text-[#9895B5] hover:text-white'
              } disabled:opacity-40`}
          >
            {isListening ? <MicOff size={14} /> : <Mic size={14} />}
          </button>
        )}
        <button
          onClick={() => sendMessage()}
          disabled={!input.trim() || loading}
          aria-label="Send"
          className="w-9 h-9 rounded-xl bg-[#6CB4FF] flex items-center justify-center flex-shrink-0
                     active:scale-95 transition-all disabled:opacity-35"
        >
          {loading
            ? <Loader size={14} className="text-[#1D183E] animate-spin" />
            : <Send size={14} className="text-[#1D183E]" />
          }
        </button>
      </div>
    </div>
  )
}

// ── Mobile bottom sheet ───────────────────────────────────────────────────

export function TutorBottomSheet({ isOpen, onClose, token, scriptId, conceptId, uploadId, currentConceptTitle, onViewSource }) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 z-40"
          />
          <motion.div
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 340 }}
            className="fixed bottom-0 left-0 right-0 z-50 h-[72dvh] rounded-t-2xl overflow-hidden flex flex-col"
          >
            {/* Drag handle */}
            <div className="bg-[#1E1B3C] px-5 pt-3 pb-1.5 border-b border-white/[0.07] flex-shrink-0 flex items-center justify-center relative">
              <div className="w-10 h-1 bg-white/20 rounded-full" />
              <button
                onClick={onClose}
                aria-label="Close tutor"
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[#9895B5] hover:text-white p-1"
              >
                <X size={16} />
              </button>
            </div>
            <TutorPanel
              token={token} scriptId={scriptId} conceptId={conceptId}
              uploadId={uploadId} currentConceptTitle={currentConceptTitle}
              onViewSource={onViewSource}
              className="flex-1 min-h-0"
            />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
