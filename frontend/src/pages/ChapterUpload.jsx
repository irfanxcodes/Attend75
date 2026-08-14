/**
 * ChapterUpload — "Edit chapters" page
 * Shows all uploaded chapters for the subject with delete/undo,
 * plus the upload form with file-name validation.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, CheckCircle, Loader, Sparkles, Trash2, Undo2, Upload, Users } from 'lucide-react'

import useAppStore from '../hooks/useAppStore'
import {
  uploadChapterPdf,
  getChapterStatus,
  getAvailableChapters,
  deleteChapter,
  restoreChapter,
} from '../services/lessonApi'

const POLL_INTERVAL_MS = 4000
const MAX_POLLS = 90
const ACCEPTED_EXTENSIONS = ['.pdf', '.docx', '.doc', '.pptx', '.ppt']
const ACCEPTED_MIME = '.pdf,.docx,.doc,.pptx,.ppt'
const UNDO_TIMEOUT_MS = 6000 // how long the undo toast stays visible

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns significant words (>2 chars) from a string, lowercased. */
function sigWords(text) {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2)
  )
}

/** Check whether the filename stem shares at least one word with chapterTitle. */
function filenameMatchesChapter(filename, chapterTitle) {
  if (!chapterTitle.trim()) return true
  const stem = filename.replace(/\.[^/.]+$/, '')
  const fileWords = sigWords(stem)
  const titleWords = sigWords(chapterTitle)
  if (!titleWords.size || !fileWords.size) return true
  for (const w of fileWords) {
    if (titleWords.has(w)) return true
  }
  return false
}

/**
 * Check whether a user-typed title matches one of the valid chapter titles
 * from the subject handout (case-insensitive, word-overlap).
 * Returns the matched title string, or null if no match.
 */
function findMatchingTitle(typed, validTitles) {
  if (!validTitles || validTitles.length === 0) return typed || null
  const typedLow = typed.toLowerCase().trim()
  if (!typedLow) return null
  const typedWords = sigWords(typed)

  // 1. Exact (case-insensitive)
  const exact = validTitles.find(t => t.toLowerCase().trim() === typedLow)
  if (exact) return exact

  // 2. Substring either way
  const sub = validTitles.find(t => {
    const tl = t.toLowerCase()
    return tl.includes(typedLow) || typedLow.includes(tl)
  })
  if (sub) return sub

  // 3. Word overlap — at least 1 significant word matches
  const overlap = validTitles.find(t => {
    const tWords = sigWords(t)
    for (const w of typedWords) {
      if (tWords.has(w)) return true
    }
    return false
  })
  return overlap || null
}

// ── Chapter Picker — 4 visible + "more" dropdown ─────────────────────────────

function ChapterPicker({ titles, selected, onSelect }) {
  const [showAll, setShowAll] = useState(false)
  const INITIAL_COUNT = 5
  const visible = showAll ? titles : titles.slice(0, INITIAL_COUNT)
  const hasMore = titles.length > INITIAL_COUNT

  return (
    <div className="mb-4 text-left">
      <p className="text-[#9895B5] text-[10px] uppercase tracking-widest mb-2">
        Chapters in this subject
      </p>

      <div className="rounded-2xl border border-white/[0.08] overflow-hidden">
        {visible.map((t, i) => {
          const isSelected = selected.toLowerCase().trim() === t.toLowerCase().trim()
          const isLast = i === visible.length - 1 && !hasMore
          return (
            <button
              key={t}
              type="button"
              onClick={() => onSelect(t)}
              className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors
                ${!isLast ? 'border-b border-white/[0.06]' : ''}
                ${isSelected
                  ? 'bg-[#E8956D]/10'
                  : 'bg-[#3A3660] hover:bg-white/5 active:bg-white/10'
                }`}
            >
              <span className={`text-[13px] font-medium leading-snug pr-3
                ${isSelected ? 'text-[#E8956D]' : 'text-[#D4D1EC]'}`}>
                {t}
              </span>
              {isSelected && (
                <span className="text-[#E8956D] flex-shrink-0 text-[16px] leading-none">✓</span>
              )}
            </button>
          )
        })}

        {hasMore && (
          <button
            type="button"
            onClick={() => setShowAll(v => !v)}
            className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5
                       bg-[#2E2B4A] text-[#9895B5] text-[12px] font-medium
                       hover:text-white transition-colors border-t border-white/[0.06]"
          >
            {showAll
              ? <>Show less <span className="text-[10px]">▲</span></>
              : <>+{titles.length - INITIAL_COUNT} more <span className="text-[10px]">▼</span></>
            }
          </button>
        )}
      </div>
    </div>
  )
}

// ── Undo Toast ────────────────────────────────────────────────────────────────

function UndoToast({ message, onUndo, onDismiss }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="fixed bottom-6 left-4 right-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 z-50
                 flex items-center gap-3 bg-[#2E2B4A] border border-white/15 rounded-2xl
                 px-4 py-3 shadow-xl text-sm text-[#E8E5FF]"
    >
      <span className="flex-1 min-w-0 truncate">{message}</span>
      <button
        onClick={onUndo}
        className="flex items-center gap-1.5 text-[#E8956D] font-semibold hover:text-[#FFAA8D] transition-colors"
      >
        <Undo2 size={13} />
        Undo
      </button>
      <button
        onClick={onDismiss}
        className="text-[#9895B5] hover:text-white transition-colors text-xs"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </motion.div>
  )
}

// ── Chapter item in the list ──────────────────────────────────────────────────

function ChapterListItem({ chapter, subjectId, navigate, onDelete, isDeleting }) {

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="w-full bg-[#4A4769] border border-white/[0.08] rounded-2xl p-4
                 flex items-center gap-3"
    >
      <div className="w-9 h-9 rounded-xl bg-[#4EF0A0]/10 flex items-center justify-center flex-shrink-0">
        <Sparkles size={16} className="text-[#4EF0A0]" />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-[#E8E5FF] text-[13px] font-medium truncate">{chapter.chapter_title}</p>
        <p className="text-[#9895B5] text-xs flex items-center gap-1 mt-0.5">
          <Users size={9} />
          {chapter.is_own_upload
            ? 'Uploaded by you'
            : chapter.uploaded_by_name
              ? `Uploaded by ${chapter.uploaded_by_name}`
              : 'Uploaded by a classmate'}
          {' · '}{chapter.concept_count} concepts
        </p>
      </div>

      {/* Start button — always shown */}
      {chapter.script_id && (
        <button
          onClick={() => navigate(`/app/study/${subjectId}/${chapter.script_id}/workspace`)}
          className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full
                     bg-[#4EF0A0]/10 text-[#4EF0A0] text-[11px] font-medium
                     hover:bg-[#4EF0A0]/20 active:scale-95 transition-all"
        >
          <Sparkles size={11} />
          Start
        </button>
      )}

      {/* Only show delete for own uploads */}
      {chapter.is_own_upload && (
        <button
          onClick={() => onDelete(chapter)}
          disabled={isDeleting}
          className="flex-shrink-0 p-2 rounded-xl text-[#9895B5] hover:text-[#FF7B7B]
                     hover:bg-[#FF7B7B]/10 transition-all disabled:opacity-40"
          aria-label={`Delete ${chapter.chapter_title}`}
        >
          {isDeleting ? <Loader size={15} className="animate-spin" /> : <Trash2 size={15} />}
        </button>
      )}
    </motion.div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function ChapterUpload() {
  const { subjectId } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { state: appState } = useAppStore()
  const token = appState.session?.token

  const urlChapterKey   = searchParams.get('chapterKey')   || ''
  const urlChapterTitle = searchParams.get('chapterTitle') || ''
  const isMasterUpload  = searchParams.get('masterUpload') === 'true'
  const validTitles = (() => {
    try { return JSON.parse(searchParams.get('validTitles') || '[]') }
    catch { return [] }
  })()

  const [chapterKey,   setChapterKey]   = useState(urlChapterKey)
  const [chapterTitle, setChapterTitle] = useState(urlChapterTitle)
  const [titleError,   setTitleError]   = useState(null)
  const [file,         setFile]         = useState(null)
  const [available,    setAvailable]    = useState([])
  const [uploading,    setUploading]    = useState(false)
  const [status,       setStatus]       = useState(null)
  const [error,        setError]        = useState(null)
  const [deletingId,   setDeletingId]   = useState(null)
  const [undoEntry,    setUndoEntry]    = useState(null) // { chapter, timeoutId }

  const pollRef   = useRef(null)
  const pollCount = useRef(0)

  const loadChapters = useCallback(() => {
    if (!token || !subjectId) return
    getAvailableChapters({ token, subjectId })
      .then(chapters =>
        setAvailable(
          urlChapterKey
            ? chapters.filter(ch => ch.chapter_key === urlChapterKey)
            : chapters
        )
      )
      .catch(() => {})
  }, [token, subjectId, urlChapterKey])

  useEffect(() => { loadChapters() }, [loadChapters])
  useEffect(() => () => clearInterval(pollRef.current), [])

  // ── Delete with undo ────────────────────────────────────────────────────

  const handleDelete = async (chapter) => {
    setDeletingId(chapter.upload_id)
    try {
      await deleteChapter({ token, uploadId: chapter.upload_id })
      // Optimistically remove from list
      setAvailable(prev => prev.filter(c => c.upload_id !== chapter.upload_id))

      // Show undo toast
      const timeoutId = setTimeout(() => {
        setUndoEntry(null)
      }, UNDO_TIMEOUT_MS)

      setUndoEntry({ chapter, timeoutId })
    } catch (err) {
      setError(err.message)
    } finally {
      setDeletingId(null)
    }
  }

  const handleUndo = async () => {
    if (!undoEntry) return
    clearTimeout(undoEntry.timeoutId)
    const { chapter } = undoEntry
    setUndoEntry(null)
    try {
      await restoreChapter({ token, uploadId: chapter.upload_id })
      // Re-add to list at the front
      setAvailable(prev => [chapter, ...prev])
    } catch (err) {
      setError('Could not undo deletion. Please refresh the page.')
    }
  }

  const dismissUndo = () => {
    if (!undoEntry) return
    clearTimeout(undoEntry.timeoutId)
    setUndoEntry(null)
  }

  // ── Upload flow ─────────────────────────────────────────────────────────

  const startPolling = useCallback((key) => {
    pollCount.current = 0
    pollRef.current = setInterval(async () => {
      pollCount.current++
      try {
        const s = await getChapterStatus({ token, subjectId, chapterKey: key })
        setStatus(s)
        if (['ready', 'ready_low_coverage'].includes(s.upload_status)) {
          clearInterval(pollRef.current)
          if (s.script_id) setTimeout(() => navigate(`/app/study/${subjectId}/${s.script_id}/workspace`), 1500)
        } else if (s.upload_status === 'failed') {
          clearInterval(pollRef.current)
          setError(s.error_message || 'Processing failed. Please try again.')
          setUploading(false)
        } else if (pollCount.current >= MAX_POLLS) {
          clearInterval(pollRef.current)
          setError('Processing is taking longer than expected. Please check back later.')
          setUploading(false)
        }
      } catch { /* keep polling on network hiccup */ }
    }, POLL_INTERVAL_MS)
  }, [token, subjectId, navigate])

  const getFileIcon = () => {
    if (!file) return null
    const ext = file.name.split('.').pop().toLowerCase()
    if (ext === 'pdf')                   return '📄'
    if (ext === 'pptx' || ext === 'ppt') return '📊'
    if (ext === 'docx' || ext === 'doc') return '📝'
    return '📎'
  }

  const handleFileChange = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    const ext = '.' + f.name.split('.').pop().toLowerCase()
    if (!ACCEPTED_EXTENSIONS.includes(ext)) { setError('Only PDF, DOCX, PPTX files are accepted'); return }
    if (f.size > 20 * 1024 * 1024)          { setError('File too large. Maximum 20MB.'); return }

    setError(null)
    setFile(f)
    if (!chapterKey && !urlChapterKey)
      setChapterKey(f.name.replace(/\.[^/.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 64))
  }

  const handleUpload = async () => {
    if (!isMasterUpload) {
      // Per-chapter: chapter name is required and must match
      if (!chapterTitle.trim()) {
        setTitleError('Please enter the chapter name before uploading.')
        return
      }
      const matched = findMatchingTitle(chapterTitle, validTitles)
      if (validTitles.length > 0 && !matched) {
        setTitleError(
          `"${chapterTitle}" doesn't match any chapter in this subject. ` +
          `Please use the exact chapter name from the list below.`
        )
        return
      }
    }

    if (!file || !chapterKey.trim()) { setError('Please select a file'); return }

    // For master upload: use the file name as the chapter key/title if none provided
    const finalChapterKey   = chapterKey.trim() ||
      file.name.replace(/\.[^/.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 64)
    const finalChapterTitle = isMasterUpload
      ? (chapterTitle.trim() || file.name.replace(/\.[^/.]+$/, ''))
      : (matched || chapterTitle).trim()

    setError(null); setTitleError(null); setUploading(true)
    try {
      const result = await uploadChapterPdf({
        token, subjectId,
        chapterKey: finalChapterKey,
        chapterTitle: finalChapterTitle,
        skipFilenameCheck: true,
        file,
      })
      if (result.already_processed && result.script_id) {
        setStatus({ upload_status: 'duplicate', script_id: result.script_id })
        setUploading(false)
        setTimeout(() => navigate(`/app/study/${subjectId}/${result.script_id}/workspace`), 2000)
        return
      }
      setStatus({ upload_status: 'pending', chapter_key: finalChapterKey })
      startPolling(finalChapterKey)
    } catch (err) {
      const msg = err.message || ''
      setError(msg)
      setUploading(false)
    }
  }

  const STATUS_LABEL = {
    duplicate:          'File recognised — loading existing lesson…',
    pending:            'Queued for processing…',
    processing:         'Extracting concepts and building lesson…',
    ready:              'Lesson ready! Opening…',
    ready_low_coverage: 'Lesson ready! Opening…',
    failed:             'Processing failed',
  }
  const STATUS_PROGRESS = { duplicate: 100, pending: 10, processing: 60, ready: 100, ready_low_coverage: 100, failed: 0 }

  // ── Nav pill ────────────────────────────────────────────────────────────

  const NavPill = () => (
    <div className="flex items-center border border-white/15 rounded-full px-4 py-2.5">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-white text-xs font-medium tracking-wide"
      >
        <ArrowLeft size={13} />
        <span className="tracking-wide">STUDY</span>
      </button>
    </div>
  )

  // ── Status screen ───────────────────────────────────────────────────────

  if (status) {
    const isDuplicate = status.upload_status === 'duplicate'
    const isReady     = ['ready', 'ready_low_coverage'].includes(status.upload_status)
    const isFailed    = status.upload_status === 'failed'
    const accent      = isDuplicate ? '#A78BFA' : isReady ? '#4EF0A0' : isFailed ? '#FF7B7B' : '#C4A882'

    return (
      <div className="min-h-dvh bg-[#5B5878] flex flex-col px-5 pt-safe">
        <div className="py-4"><NavPill /></div>
        <div className="flex-1 flex items-center justify-center pb-20">
          <div className="w-full max-w-sm bg-[#4A4769]/80 border border-white/[0.08] rounded-3xl p-8 text-center">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5"
              style={{ backgroundColor: `${accent}22` }}>
              {isFailed
                ? <span className="text-2xl text-[#FF7B7B]">✕</span>
                : (isDuplicate || isReady)
                  ? <CheckCircle size={26} style={{ color: accent }} />
                  : <Loader size={26} className="animate-spin" style={{ color: accent }} />
              }
            </div>
            <p className="text-white font-semibold text-[15px] mb-1">
              {STATUS_LABEL[status.upload_status] || 'Processing…'}
            </p>
            {isDuplicate && (
              <p className="text-[#9895B5] text-sm mt-1">No need to run AI again — using existing lesson</p>
            )}
            {isFailed && error && (
              <p className="text-[#FF7B7B]/80 text-xs mt-2 leading-relaxed">{error}</p>
            )}
            {!isFailed && (
              <div className="mt-6 h-1.5 bg-white/8 rounded-full overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{ backgroundColor: accent }}
                  animate={{ width: `${STATUS_PROGRESS[status.upload_status] || 30}%` }}
                  transition={{ duration: 0.7, ease: 'easeOut' }}
                />
              </div>
            )}
            {isFailed && (
              <button
                onClick={() => { setStatus(null); setError(null) }}
                className="mt-5 px-6 py-2.5 rounded-full bg-[#2E2B4A] border border-white/10
                           text-[#E8E5FF] text-sm font-medium hover:border-white/20 transition-colors"
              >
                Try again
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Main page ───────────────────────────────────────────────────────────

  return (
    <div className="min-h-dvh bg-[#5B5878] flex flex-col px-5 pt-safe">

      {/* Nav */}
      <div className="py-4"><NavPill /></div>

      <div className="flex-1 flex items-start justify-center pb-20 pt-2">
        <div className="w-full max-w-sm space-y-5">

          {/* ── Uploaded chapters list ── */}
          <AnimatePresence>
            {available.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-2"
              >
                <p className="text-[#9895B5] text-[11px] uppercase tracking-widest font-medium px-0.5">
                  Uploaded chapters
                </p>
                <AnimatePresence>
                  {available.map(ch => (
                    <ChapterListItem
                      key={ch.upload_id}
                      chapter={ch}
                      subjectId={subjectId}
                      navigate={navigate}
                      onDelete={handleDelete}
                      isDeleting={deletingId === ch.upload_id}
                    />
                  ))}
                </AnimatePresence>
                <div className="flex items-center gap-3 py-1">
                  <div className="flex-1 h-px bg-white/[0.06]" />
                  <span className="text-[#9895B5] text-xs">or upload another</span>
                  <div className="flex-1 h-px bg-white/[0.06]" />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Upload card ── */}
          <div className="bg-[#4A4769]/70 border-2 border-dashed border-white/[0.12] rounded-3xl p-8 text-center">

            <div className="w-14 h-14 rounded-2xl bg-[#7B7498] flex items-center justify-center mx-auto mb-5">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="2" width="16" height="20" rx="2"/>
                <path d="M9 7h6M9 11h6M9 15h4"/>
              </svg>
            </div>

            <h2 className="text-white text-[18px] font-bold mb-2">
              {isMasterUpload ? 'Upload chapter file' : 'Upload chapter file'}
            </h2>
            <p className="text-[#A8A5C0] text-[13px] leading-relaxed mb-6 max-w-full mx-auto">
              {isMasterUpload
                ? "Have a PDF that covers the whole chapter? Upload it directly — no filename match needed."
                : 'AI will build an interactive lesson from your PDF, PPTX, or DOCX.'
              }
            </p>

            {/* File drop zone */}
            <label className="block cursor-pointer mb-4">
              <input type="file" accept={ACCEPTED_MIME} className="hidden" onChange={handleFileChange} />
              <div className={`rounded-xl border border-dashed py-4 px-4 transition-colors
                ${file
                  ? 'border-[#E8956D]/40 bg-[#E8956D]/5'
                  : 'border-white/10 hover:border-white/20'}`}
              >
                {file ? (
                  <>
                    <span className="text-2xl block mb-1">{getFileIcon()}</span>
                    <p className="text-white text-sm font-medium truncate">{file.name}</p>
                    <p className="text-[#A8A5C0] text-xs">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
                  </>
                ) : (
                  <>
                    <Upload size={20} className="text-[#A8A5C0] mx-auto mb-1.5" />
                    <p className="text-[#A8A5C0] text-sm">Tap to select file</p>
                  </>
                )}
              </div>
            </label>

            {/* Chapter name input */}
            <input
              type="text"
              value={chapterTitle}
              onChange={e => {
                setChapterTitle(e.target.value)
                setTitleError(null)
                setError(null)
                if (!urlChapterKey) {
                  setChapterKey(
                    e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64)
                  )
                }
              }}
              placeholder={isMasterUpload ? 'Notes label (optional)' : 'Chapter name (required) *'}
              className={`w-full bg-white/5 border rounded-xl px-4 py-2.5 mb-1
                         text-white text-sm placeholder:text-[#5C5878]
                         focus:outline-none transition-colors
                         ${titleError ? 'border-[#FF7B7B]/60' : 'border-white/10 focus:border-white/20'}`}
            />

            {/* Title error */}
            {titleError && (
              <p className="text-[#FF7B7B] text-xs mb-3 text-left leading-relaxed">{titleError}</p>
            )}

            {/* Chapter picker — only for per-chapter uploads */}
            {!isMasterUpload && validTitles.length > 0 && (
              <ChapterPicker
                titles={validTitles}
                selected={chapterTitle}
                onSelect={t => {
                  setChapterTitle(t)
                  setTitleError(null)
                  setError(null)
                  if (!urlChapterKey)
                    setChapterKey(t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64))
                }}
              />
            )}

            {/* Error */}
            {error && <p className="text-[#FF7B7B] text-xs mb-4 leading-relaxed">{error}</p>}

            {/* CTA */}
            <button
              onClick={handleUpload}
              disabled={!file || (!isMasterUpload && !chapterTitle.trim()) || uploading}
              className="inline-flex items-center gap-2 px-8 py-3 rounded-full
                         bg-[#E8956D] text-white font-semibold text-sm
                         disabled:opacity-35 active:scale-95 transition-all"
            >
              {uploading
                ? <><Loader size={15} className="animate-spin" />Uploading…</>
                : <><Sparkles size={15} />Upload chapter</>
              }
            </button>

            <p className="text-[#6B6888] text-xs mt-4">PDF · DOCX · PPTX · Max 20MB</p>
            {isMasterUpload ? (
              <p className="text-[#4EF0A0]/70 text-[11px] mt-1">
                Any filename accepted — no renaming needed
              </p>
            ) : (
              <p className="text-[#6B6888] text-[11px] mt-1">
                Any filename accepted
              </p>
            )}
          </div>

        </div>
      </div>

      {/* Undo toast */}
      <AnimatePresence>
        {undoEntry && (
          <UndoToast
            key="undo-toast"
            message={`"${undoEntry.chapter.chapter_title}" removed`}
            onUndo={handleUndo}
            onDismiss={dismissUndo}
          />
        )}
      </AnimatePresence>

    </div>
  )
}
