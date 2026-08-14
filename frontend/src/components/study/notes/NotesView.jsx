/**
 * NotesView — Notes Solver tab.
 *
 * Design principles (v3):
 *  - No ruled lines in the index view — those belong only on the canvas
 *  - Clear 3-level hierarchy: chapter title → problem number → question snippet
 *  - Entire problem row is a large tap target with a visible hover state
 *  - Upload button is always the primary action colour (indigo), never gray
 *  - Difficulty badges have enough padding and contrast to breathe
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BookOpen, CheckCircle, ChevronDown, ChevronRight,
  Loader, Sparkles, Trash2, Undo2, Upload,
} from 'lucide-react'

import useAppStore from '../../../hooks/useAppStore'
import {
  uploadNotes,
  getNotesStatus,
  getNotesForSubject,
  getNotesProblemList,
  deleteNotes,
  restoreNotes,
} from '../../../services/lessonApi'
import ProblemSolverCanvas from './ProblemSolverCanvas'

const POLL_INTERVAL_MS = 4000
const MAX_POLLS        = 90
const UNDO_TIMEOUT_MS  = 6000
const ACCEPTED_MIME    = '.pdf,.docx,.doc,.pptx,.ppt'
const ACCEPTED_EXT     = ['.pdf', '.docx', '.doc', '.pptx', '.ppt']
const MAX_BYTES        = 20 * 1024 * 1024

const DIFF_STYLE = {
  easy:   { bg: '#DCFCE7', text: '#15803D', border: '#86EFAC' },
  medium: { bg: '#FEF9C3', text: '#A16207', border: '#FDE047' },
  hard:   { bg: '#FEE2E2', text: '#B91C1C', border: '#FCA5A5' },
}

// ── Undo Toast ─────────────────────────────────────────────────────────────

function UndoToast({ message, onUndo, onDismiss }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3
                 px-4 py-3 rounded-xl shadow-xl whitespace-nowrap text-sm"
      style={{ background: '#1E1B2E', color: '#E8E5FF', border: '1px solid #3D3660' }}
    >
      <span>{message}</span>
      <button
        onClick={onUndo}
        className="flex items-center gap-1.5 font-semibold"
        style={{ color: '#F59E0B' }}
      >
        <Undo2 size={13} /> Undo
      </button>
      <button onClick={onDismiss} className="text-xs opacity-50 hover:opacity-80">✕</button>
    </motion.div>
  )
}

// ── Processing strip ───────────────────────────────────────────────────────

function ProcessingStrip({ status, error, onDismiss }) {
  const isReady  = ['ready', 'ready_low_coverage'].includes(status)
  const isFailed = status === 'failed'
  const accent   = isFailed ? '#EF4444' : isReady ? '#22C55E' : '#6366F1'

  // Split "friendly message (ref: ABCD12)" into message + ref code
  const refMatch = error?.match(/^(.*)\s+\(ref:\s*([A-Z0-9]{6})\)$/)
  const friendlyMsg = refMatch ? refMatch[1].trim() : (error || 'Processing failed — please try again')
  const refCode = refMatch ? refMatch[2] : null

  return (
    <div
      className="mx-4 mt-3 mb-1 rounded-xl px-4 py-3 flex items-start gap-3"
      style={{ background: `${accent}12`, border: `1px solid ${accent}30` }}
    >
      <div className="flex-shrink-0 mt-0.5">
        {isReady
          ? <CheckCircle size={16} style={{ color: accent }} />
          : isFailed
            ? <span style={{ color: accent, fontWeight: 700 }}>✕</span>
            : <Loader size={16} className="animate-spin" style={{ color: accent }} />
        }
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-medium" style={{ color: accent }}>
          {isFailed
            ? friendlyMsg
            : isReady
              ? 'Problems extracted successfully!'
              : status === 'processing'
                ? 'AI is reading your notes…'
                : 'Queued for processing…'}
        </p>
        {isFailed && refCode && (
          <p className="text-[10px] mt-0.5 opacity-50" style={{ color: accent }}>
            Error ref: {refCode}
          </p>
        )}
      </div>
      {(isFailed || isReady) && (
        <button onClick={onDismiss} className="text-xs opacity-50 hover:opacity-80 flex-shrink-0" style={{ color: accent }}>
          ✕
        </button>
      )}
      {!isFailed && !isReady && (
        <div className="w-20 h-1 rounded-full overflow-hidden flex-shrink-0 mt-1.5" style={{ background: `${accent}25` }}>
          <motion.div
            className="h-full rounded-full"
            style={{ background: accent }}
            animate={{ width: status === 'processing' ? '60%' : '18%' }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          />
        </div>
      )}
    </div>
  )
}

// ── Single problem row ─────────────────────────────────────────────────────

function ProblemRow({ problem, index, onSelect }) {
  const diff = DIFF_STYLE[problem.difficulty] || DIFF_STYLE.medium

  return (
    <button
      onClick={() => onSelect(problem.id)}
      className="w-full text-left group"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
        padding: '12px 16px',
        borderTop: index > 0 ? '1px solid #F0ECE4' : 'none',
        background: 'transparent',
        transition: 'background 0.12s',
      }}
      onMouseEnter={e => e.currentTarget.style.background = '#F5F1E8'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      {/* Large problem number */}
      <div
        className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center font-bold text-[12px]"
        style={{ background: '#EDE8DC', color: '#8B7355', marginTop: 1 }}
      >
        {index + 1}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p
          className="text-[13px] leading-snug line-clamp-2 mb-2"
          style={{ color: '#2A2040', fontFamily: 'system-ui, sans-serif', fontWeight: 500 }}
        >
          {problem.question_text}
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          {problem.topic && (
            <span
              className="text-[11px] font-medium px-2 py-0.5 rounded-full"
              style={{ background: '#EDE8DC', color: '#6B5E45' }}
            >
              {problem.topic}
            </span>
          )}
          <span
            className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
            style={{
              background: diff.bg,
              color: diff.text,
              border: `1px solid ${diff.border}`,
            }}
          >
            {problem.difficulty}
          </span>
        </div>
      </div>

      {/* Arrow — clearly visible */}
      <div
        className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all"
        style={{
          background: '#EDE8DC',
          color: '#8B7355',
          marginTop: 1,
        }}
      >
        <ChevronRight size={14} />
      </div>
    </button>
  )
}

// ── Problem set card ───────────────────────────────────────────────────────

function ProblemSetCard({ problemSet, onSelectProblem, onDelete, isDeleting }) {
  const [expanded, setExpanded] = useState(true)
  const title = problemSet.title || problemSet.chapter_key || 'Notes'
  const problems = problemSet.problems || []

  return (
    <div
      className="mx-4 mb-4 overflow-hidden"
      style={{
        background: '#FAF7F2',
        border: '1px solid #E0D9CC',
        borderRadius: 12,
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      }}
    >
      {/* Chapter header */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
        style={{ borderBottom: expanded ? '1px solid #E0D9CC' : 'none' }}
        onClick={() => setExpanded(v => !v)}
      >
        <BookOpen size={14} style={{ color: '#8B7355', flexShrink: 0 }} />

        <div className="flex-1 min-w-0">
          <p
            className="font-semibold text-[13px] truncate"
            style={{ color: '#2A2040' }}
          >
            {title}
          </p>
          <p className="text-[11px] mt-0.5" style={{ color: '#9B8E7A' }}>
            {problemSet.is_own_upload ? 'Uploaded by you' : 'Uploaded by a classmate'}
            {' · '}{problemSet.problem_count} {problemSet.problem_count === 1 ? 'problem' : 'problems'}
          </p>
        </div>

        {/* Problem count pill */}
        <span
          className="text-[11px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
          style={{ background: '#6366F1', color: 'white', minWidth: 22, textAlign: 'center' }}
        >
          {problemSet.problem_count}
        </span>

        {/* Delete — own only */}
        {problemSet.is_own_upload && (
          <button
            onClick={e => { e.stopPropagation(); onDelete(problemSet) }}
            disabled={isDeleting}
            className="p-1.5 rounded-lg transition-colors disabled:opacity-30"
            style={{ color: '#EF4444' }}
            onMouseEnter={e => e.currentTarget.style.background = '#FEE2E2'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            {isDeleting ? <Loader size={13} className="animate-spin" /> : <Trash2 size={13} />}
          </button>
        )}

        <ChevronDown
          size={14}
          style={{
            color: '#9B8E7A',
            flexShrink: 0,
            transform: expanded ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.2s',
          }}
        />
      </div>

      {/* Problem list */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            style={{ overflow: 'hidden' }}
          >
            {problems.length > 0 ? (
              problems.map((p, i) => (
                <ProblemRow
                  key={p.id}
                  problem={p}
                  index={i}
                  onSelect={onSelectProblem}
                />
              ))
            ) : (
              // Skeleton rows while loading
              Array.from({ length: problemSet.problem_count }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    height: 60,
                    borderTop: i > 0 ? '1px solid #F0ECE4' : 'none',
                    background: i % 2 === 0 ? 'transparent' : '#FAF7F2',
                  }}
                />
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Upload card ────────────────────────────────────────────────────────────

function UploadCard({ onUploaded }) {
  const { state: appState } = useAppStore()
  const token = appState.session?.token

  const [file, setFile]       = useState(null)
  const [title, setTitle]     = useState('')
  const [uploading, setUpl]   = useState(false)
  const [error, setError]     = useState(null)

  // Expose subjectId / chapterKey from parent via onUploaded
  const { subjectId, chapterKey, onStart } = onUploaded

  const handleFile = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    const ext = '.' + f.name.split('.').pop().toLowerCase()
    if (!ACCEPTED_EXT.includes(ext)) { setError('Only PDF, DOCX, PPTX files are accepted'); return }
    if (f.size > MAX_BYTES) { setError('File too large. Maximum 20MB.'); return }
    setError(null)
    setFile(f)
  }

  const handleSubmit = async () => {
    if (!file) { setError('Please select a file first'); return }
    setError(null)
    setUpl(true)
    try {
      const result = await uploadNotes({
        token, subjectId,
        chapterKey: chapterKey || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 64),
        title: title.trim(),
        file,
      })
      setFile(null)
      setTitle('')
      onStart(result)
    } catch (err) {
      // Show friendly message if backend returned one, otherwise generic
      const msg = err.message || ''
      const refMatch = msg.match(/^(.*)\s+\(ref:\s*([A-Z0-9]{6})\)$/)
      setError(refMatch ? `${refMatch[1].trim()} (ref: ${refMatch[2]})` : (msg || 'Upload failed. Please try again.'))
    } finally {
      setUpl(false)
    }
  }

  const canSubmit = !!file && !uploading

  return (
    <div
      className="mx-4 mb-4 overflow-hidden"
      style={{
        background: '#FAF7F2',
        border: '1px solid #E0D9CC',
        borderRadius: 12,
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      }}
    >
      {/* Header — subtle, not attention-grabbing */}
      <div
        className="flex items-center gap-2 px-4 py-3"
        style={{ borderBottom: '1px solid #E0D9CC' }}
      >
        <Upload size={13} style={{ color: '#8B7355' }} />
        <span className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: '#6B5E45' }}>
          Upload problem notes
        </span>
      </div>

      <div className="px-4 py-4 space-y-3">
        {/* File zone */}
        <label className="block cursor-pointer">
          <input type="file" accept={ACCEPTED_MIME} className="hidden" onChange={handleFile} />
          <div
            className="rounded-xl py-5 px-4 text-center transition-all"
            style={{
              border: `2px dashed ${file ? '#6366F1' : '#C8C0B0'}`,
              background: file ? '#EEF2FF' : '#F5F1E8',
            }}
          >
            {file ? (
              <>
                <Sparkles size={16} className="mx-auto mb-1.5" style={{ color: '#6366F1' }} />
                <p className="text-[13px] font-semibold truncate" style={{ color: '#3730A3' }}>{file.name}</p>
                <p className="text-[11px] mt-0.5" style={{ color: '#6366F1' }}>
                  {(file.size / 1024 / 1024).toFixed(1)} MB · tap to change
                </p>
              </>
            ) : (
              <>
                <Upload size={18} className="mx-auto mb-2" style={{ color: '#C8C0B0' }} />
                <p className="text-[13px] font-medium" style={{ color: '#8B7355' }}>Tap to select file</p>
                <p className="text-[11px] mt-0.5" style={{ color: '#B0A898' }}>PDF · DOCX · PPTX · Max 20MB</p>
              </>
            )}
          </div>
        </label>

        {/* Title input */}
        <input
          type="text"
          value={title}
          onChange={e => { setTitle(e.target.value); setError(null) }}
          placeholder="Chapter / notes title (optional)"
          className="w-full px-4 py-2.5 rounded-xl text-[13px] focus:outline-none transition-colors"
          style={{
            background: '#F5F1E8',
            border: '1.5px solid #D4C8B4',
            color: '#2A2040',
          }}
          onFocus={e => e.target.style.borderColor = '#6366F1'}
          onBlur={e => e.target.style.borderColor = '#D4C8B4'}
        />

        {error && (
          <p className="text-[12px]" style={{ color: '#EF4444' }}>{error}</p>
        )}

        {/* PRIMARY action — always indigo, only disabled when no file */}
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full py-3 rounded-xl font-semibold text-[14px] transition-all active:scale-[0.98]"
          style={{
            background: canSubmit ? '#6366F1' : '#C8C0B0',
            color: 'white',
            cursor: canSubmit ? 'pointer' : 'not-allowed',
            boxShadow: canSubmit ? '0 2px 8px rgba(99,102,241,0.35)' : 'none',
          }}
        >
          {uploading
            ? <span className="flex items-center justify-center gap-2">
                <Loader size={14} className="animate-spin" /> Uploading…
              </span>
            : 'Upload & extract problems'
          }
        </button>
      </div>
    </div>
  )
}

// ── Main NotesView ─────────────────────────────────────────────────────────

export default function NotesView({ subjectId, chapterKey }) {
  const { state: appState } = useAppStore()
  const token = appState.session?.token

  const [processingStatus, setProcessingStatus] = useState(null)
  const [problemSets, setProblemSets]           = useState([])
  const [loadingList, setLoadingList]           = useState(true)
  const [deletingId, setDeletingId]             = useState(null)
  const [undoEntry, setUndoEntry]               = useState(null)
  const [activeProblemId, setActiveProblemId]   = useState(null)

  const pollRef   = useRef(null)
  const pollCount = useRef(0)

  // ── Load list ──────────────────────────────────────────────────────────
  const loadList = useCallback(async () => {
    if (!token || !subjectId) return
    try {
      const sets = await getNotesForSubject({ token, subjectId })
      const enriched = await Promise.all(
        sets.map(async (ps) => {
          try {
            const probs = await getNotesProblemList({ token, problemSetId: ps.problem_set_id })
            return { ...ps, problems: probs }
          } catch {
            return { ...ps, problems: [] }
          }
        })
      )
      setProblemSets(enriched)
    } catch { /* ignore */ }
    finally { setLoadingList(false) }
  }, [token, subjectId])

  useEffect(() => { loadList() }, [loadList])
  useEffect(() => () => clearInterval(pollRef.current), [])

  // ── Polling ────────────────────────────────────────────────────────────
  const startPolling = useCallback((uploadId) => {
    pollCount.current = 0
    clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      pollCount.current++
      try {
        const s = await getNotesStatus({ token, uploadId })
        setProcessingStatus({ status: s.status, error: s.error_message })
        if (['ready', 'ready_low_coverage'].includes(s.status)) {
          clearInterval(pollRef.current)
          setTimeout(() => { setProcessingStatus(null); loadList() }, 1500)
        } else if (s.status === 'failed' || pollCount.current >= MAX_POLLS) {
          clearInterval(pollRef.current)
          if (pollCount.current >= MAX_POLLS)
            setProcessingStatus({ status: 'failed', error: 'Processing timed out.' })
        }
      } catch { /* keep polling */ }
    }, POLL_INTERVAL_MS)
  }, [token, loadList])

  // ── Upload callback ────────────────────────────────────────────────────
  const handleUploadStart = (result) => {
    if (result.already_processed) {
      loadList()
      return
    }
    setProcessingStatus({ status: 'pending', error: null })
    startPolling(result.upload_id)
  }

  // ── Delete + undo ──────────────────────────────────────────────────────
  const handleDelete = async (ps) => {
    setDeletingId(ps.upload_id)
    try {
      await deleteNotes({ token, uploadId: ps.upload_id })
      setProblemSets(prev => prev.filter(s => s.upload_id !== ps.upload_id))
      const tid = setTimeout(() => setUndoEntry(null), UNDO_TIMEOUT_MS)
      setUndoEntry({ problemSet: ps, timeoutId: tid })
    } catch { /* ignore */ }
    finally { setDeletingId(null) }
  }

  const handleUndo = async () => {
    if (!undoEntry) return
    clearTimeout(undoEntry.timeoutId)
    const { problemSet: ps } = undoEntry
    setUndoEntry(null)
    try {
      await restoreNotes({ token, uploadId: ps.upload_id })
      setProblemSets(prev => [ps, ...prev])
    } catch { /* ignore */ }
  }

  // ── Canvas (full notebook view) ────────────────────────────────────────
  if (activeProblemId) {
    return (
      <ProblemSolverCanvas
        problemId={activeProblemId}
        onBack={() => setActiveProblemId(null)}
      />
    )
  }

  // ── Index view ─────────────────────────────────────────────────────────
  return (
    <div
      className="flex-1 flex flex-col overflow-hidden"
      style={{ background: '#F0EBE0' }}
    >
      {/* Processing strip */}
      <AnimatePresence>
        {processingStatus && (
          <motion.div
            key="proc"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <ProcessingStrip
              status={processingStatus.status}
              error={processingStatus.error}
              onDismiss={() => setProcessingStatus(null)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Scrollable body */}
      <div
        className="flex-1 overflow-y-auto py-4"
        style={{ scrollbarWidth: 'thin', scrollbarColor: '#C8C0B0 transparent' }}
      >
        {loadingList ? (
          <div className="flex items-center justify-center py-12">
            <Loader size={18} className="animate-spin" style={{ color: '#C8C0B0' }} />
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {problemSets.map(ps => (
              <motion.div
                key={ps.upload_id}
                layout
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -16 }}
              >
                <ProblemSetCard
                  problemSet={ps}
                  onSelectProblem={setActiveProblemId}
                  onDelete={handleDelete}
                  isDeleting={deletingId === ps.upload_id}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        )}

        {/* Divider */}
        {problemSets.length > 0 && (
          <div className="flex items-center gap-3 mx-4 my-2">
            <div className="flex-1 h-px" style={{ background: '#D4C8B4' }} />
            <span className="text-[11px]" style={{ color: '#9B8E7A' }}>add more</span>
            <div className="flex-1 h-px" style={{ background: '#D4C8B4' }} />
          </div>
        )}

        {/* Upload card */}
        <UploadCard
          onUploaded={{ subjectId, chapterKey, onStart: handleUploadStart }}
        />
      </div>

      {/* Undo toast */}
      <AnimatePresence>
        {undoEntry && (
          <UndoToast
            key="undo"
            message={`"${undoEntry.problemSet.title || 'Notes'}" removed`}
            onUndo={handleUndo}
            onDismiss={() => {
              clearTimeout(undoEntry.timeoutId)
              setUndoEntry(null)
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
