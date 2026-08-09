/**
 * ChapterUpload — pixel-matched to design spec
 * Background #4A4668, centered dashed card, ← STUDYME nav pill
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, CheckCircle, Loader, Sparkles, Upload, Users } from 'lucide-react'

import useAppStore from '../hooks/useAppStore'
import { uploadChapterPdf, getChapterStatus, getAvailableChapters } from '../services/lessonApi'

const POLL_INTERVAL_MS = 4000
const MAX_POLLS = 90
const ACCEPTED_EXTENSIONS = ['.pdf', '.docx', '.doc', '.pptx', '.ppt']
const ACCEPTED_MIME = '.pdf,.docx,.doc,.pptx,.ppt'

export default function ChapterUpload() {
  const { subjectId } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { state: appState } = useAppStore()
  const token = appState.session?.token

  const urlChapterKey   = searchParams.get('chapterKey')   || ''
  const urlChapterTitle = searchParams.get('chapterTitle') || ''

  const [chapterKey,   setChapterKey]   = useState(urlChapterKey)
  const [chapterTitle, setChapterTitle] = useState(urlChapterTitle)
  const [file,         setFile]         = useState(null)
  const [available,    setAvailable]    = useState([])
  const [uploading,    setUploading]    = useState(false)
  const [status,       setStatus]       = useState(null)
  const [error,        setError]        = useState(null)
  const pollRef   = useRef(null)
  const pollCount = useRef(0)

  useEffect(() => {
    if (!token || !subjectId) return
    getAvailableChapters({ token, subjectId })
      .then(chapters =>
        setAvailable(urlChapterKey
          ? chapters.filter(ch => ch.chapter_key === urlChapterKey)
          : chapters
        )
      )
      .catch(() => {})
  }, [token, subjectId, urlChapterKey])

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

  useEffect(() => () => clearInterval(pollRef.current), [])

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
    if (!file || !chapterKey.trim()) { setError('Please select a file and enter a chapter name'); return }
    setError(null); setUploading(true)
    try {
      const result = await uploadChapterPdf({ token, subjectId, chapterKey: chapterKey.trim(), chapterTitle: chapterTitle.trim(), file })
      if (result.already_processed && result.script_id) {
        setStatus({ upload_status: 'duplicate', script_id: result.script_id })
        setUploading(false)
        setTimeout(() => navigate(`/app/study/${subjectId}/${result.script_id}/workspace`), 2000)
        return
      }
      setStatus({ upload_status: 'pending', chapter_key: chapterKey.trim() })
      startPolling(chapterKey.trim())
    } catch (err) { setError(err.message); setUploading(false) }
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

  // ── Shared nav pill ───────────────────────────────────────────────────────
  const NavPill = () => (
    <div className="flex items-center border border-white/15 rounded-full px-4 py-2.5">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-white text-xs font-medium tracking-wide"
      >
        <ArrowLeft size={13} />
        <span className="tracking-wide">STUDYME</span>
      </button>
    </div>
  )

  // ── Status screen ─────────────────────────────────────────────────────────
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

  // ── Main upload page ──────────────────────────────────────────────────────
  return (
    <div className="min-h-dvh bg-[#5B5878] flex flex-col px-5 pt-safe">

      {/* Nav */}
      <div className="py-4"><NavPill /></div>

      <div className="flex-1 flex items-start justify-center pb-20 pt-2">
        <div className="w-full max-w-sm space-y-4">

          {/* Already-available lesson */}
          <AnimatePresence>
            {available.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-2"
              >
                <p className="text-[#9895B5] text-[11px] uppercase tracking-widest font-medium px-0.5">
                  Ready to study
                </p>
                {available.map(ch => (
                  <motion.button
                    key={ch.script_id}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => navigate(`/app/study/${subjectId}/${ch.script_id}/workspace`)}
                    className="w-full bg-[#4A4769] border border-white/[0.08] rounded-2xl p-4
                               flex items-center gap-3 text-left hover:border-white/15 transition-colors"
                  >
                    <div className="w-9 h-9 rounded-xl bg-[#4EF0A0]/10 flex items-center justify-center flex-shrink-0">
                      <Sparkles size={16} className="text-[#4EF0A0]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[#E8E5FF] text-[13px] font-medium truncate">{ch.chapter_title}</p>
                      <p className="text-[#9895B5] text-xs flex items-center gap-1 mt-0.5">
                        <Users size={9} />
                        Uploaded by {ch.uploaded_by_label} · {ch.concept_count} concepts
                      </p>
                    </div>
                    <span className="text-[#4EF0A0] text-xs font-semibold flex-shrink-0">Start →</span>
                  </motion.button>
                ))}
                <div className="flex items-center gap-3 py-1">
                  <div className="flex-1 h-px bg-white/[0.06]" />
                  <span className="text-[#9895B5] text-xs">or upload your own</span>
                  <div className="flex-1 h-px bg-white/[0.06]" />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Upload card — dashed border, centered content */}
          <div className="bg-[#4A4769]/70 border-2 border-dashed border-white/[0.12] rounded-3xl p-8 text-center">

            {/* Document icon — muted purple rounded square */}
            <div className="w-14 h-14 rounded-2xl bg-[#7B7498] flex items-center justify-center mx-auto mb-5">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="2" width="16" height="20" rx="2"/>
                <path d="M9 7h6M9 11h6M9 15h4"/>
              </svg>
            </div>

            <h2 className="text-white text-[18px] font-bold mb-2">Upload chapter file</h2>
            <p className="text-[#A8A5C0] text-[13px] leading-relaxed mb-6 max-w-[260px] mx-auto">
              AI will build an interactive lesson from your PDF, PPTX, or DOCX.
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
              onChange={e => setChapterTitle(e.target.value)}
              placeholder="Chapter name"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 mb-5
                         text-white text-sm placeholder:text-[#5C5878]
                         focus:outline-none focus:border-white/20 transition-colors"
            />

            {/* Error */}
            {error && <p className="text-[#FF7B7B] text-xs mb-4">{error}</p>}

            {/* CTA — salmon pill with sparkles icon */}
            <button
              onClick={handleUpload}
              disabled={!file || uploading}
              className="inline-flex items-center gap-2 px-8 py-3 rounded-full
                         bg-[#E8956D] text-white font-semibold text-sm
                         disabled:opacity-35 active:scale-95 transition-all"
            >
              {uploading
                ? <><Loader size={15} className="animate-spin" />Uploading…</>
                : <><Sparkles size={15} />Choose file</>
              }
            </button>

            <p className="text-[#6B6888] text-xs mt-4">PDF · DOCX · Max 20MB</p>
          </div>

        </div>
      </div>
    </div>
  )
}
