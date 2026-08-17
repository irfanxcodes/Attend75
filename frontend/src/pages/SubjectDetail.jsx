/**
 * SubjectDetail — pixel-matched to design screenshots
 * Background: #5B5878 (medium muted purple)
 * Cards: #4A4769
 * Active module: #6B6585
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Loader, Sparkles, Upload, User } from 'lucide-react'
import useAppStore from '../hooks/useAppStore'
import { uploadHandout, getHandout, getHandoutStatus, createHandoutFromText } from '../services/handoutApi'
import { getAvailableChapters } from '../services/lessonApi'

const POLL_MS = 3000

const MODULE_COLORS = [
  '#F4845F', // 1 coral/salmon
  '#F5C26B', // 2 amber
  '#5DB8B2', // 3 teal
  '#8B7FD4', // 4 purple
  '#6CB4FF', // 5 blue
  '#4EF0A0', // 6 green
  '#FF8FAB', // 7 pink
  '#FFB23E', // 8 orange
]

// ── Chapter row ───────────────────────────────────────────────────────────────
function ChapterRow({ chapter, subjectId, lesson, navigate, isLast, allChapterTitles }) {
  const chapterSlug = chapter.title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 60)

  const handleUploadClick = () => {
    const params = new URLSearchParams({
      chapterTitle: chapter.title,
      chapterKey: chapterSlug,
      validTitles: JSON.stringify(allChapterTitles || [chapter.title]),
    })
    navigate(`/app/study/${subjectId}/upload?${params}`)
  }

  const topics = chapter.topics?.slice(0, 3).join(', ')

  return (
    <div className={`flex items-center gap-3 py-3.5 ${!isLast ? 'border-b border-white/[0.07]' : ''}`}>
      {/* Status dot */}
      <div
        className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-0.5"
        style={{ backgroundColor: lesson ? '#4EF0A0' : 'rgba(255,255,255,0.3)' }}
      />

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p className="text-white text-[13px] font-medium leading-snug truncate">{chapter.title}</p>
        <p className="text-[#A8A5C0] text-[11px] mt-0.5 truncate">
          {[
            chapter.sessions ? `Sessions ${chapter.sessions}` : null,
            topics || null,
          ].filter(Boolean).join(' · ')}
        </p>
      </div>

      {/* Action pill */}
      {lesson ? (
        <button
          onClick={() => navigate(`/app/study/${subjectId}/${lesson.script_id}/workspace`)}
          className="flex-shrink-0 flex items-center gap-2 px-5 py-2 rounded-full
                     bg-[#2E2B4A] text-white text-[12px] font-medium
                     hover:bg-[#3A3760] active:scale-95 transition-all"
        >
          <Sparkles size={13} className="text-[#4EF0A0]" />
          Start
        </button>
      ) : (
        <button
          onClick={handleUploadClick}
          className="flex-shrink-0 flex items-center gap-2 px-5 py-2 rounded-full
                     bg-[#2E2B4A] text-white text-[12px] font-medium
                     hover:bg-[#3A3760] active:scale-95 transition-all"
        >
          <Upload size={13} />
          Upload
        </button>
      )}
    </div>
  )
}

// ── Module card ───────────────────────────────────────────────────────────────
function ModuleCard({ mod, index, isActive, onClick, availableChapters }) {
  const color = MODULE_COLORS[index % MODULE_COLORS.length]
  const chapters = mod.chapters || []

  const lessonsReady = chapters.filter(ch => {
    const slug = ch.title.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '-').slice(0, 60)
    const exact = availableChapters.find(a => a.chapter_key === slug)
    if (exact) return true
    const words = ch.title.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(' ').filter(w => w.length > 3)
    return availableChapters.some(a => {
      const key = a.chapter_key.replace(/-/g, ' ')
      const matchCount = words.filter(w => key.includes(w)).length
      return matchCount >= 3 && matchCount >= words.length * 0.6
    })
  }).length

  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.97 }}
      className={`flex-shrink-0 w-48 text-left rounded-2xl p-3.5 border transition-all duration-150
        ${isActive
          ? 'bg-[#6B6080]'
          : 'bg-[#4A4769] border-white/[0.06] hover:bg-[#524F70]'
        }`}
      style={isActive ? { border: '1px solid rgba(232,149,109,0.45)' } : {}}
    >
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-[12px] text-white mb-3"
        style={{ backgroundColor: color }}
      >
        {mod.number}
      </div>
      <p className="text-white text-[13px] font-semibold leading-snug line-clamp-2 mb-1.5">
        {mod.title}
      </p>
      <p className="text-[#A8A5C0] text-[11px]">
        {chapters.length} chapter{chapters.length !== 1 ? 's' : ''}
        {mod.session_range ? ` · Sessions ${mod.session_range}` : ''}
      </p>
      {lessonsReady > 0 && (
        <p className="text-[#4EF0A0] text-[10px] mt-1 font-medium">
          {lessonsReady} AI lesson{lessonsReady !== 1 ? 's' : ''} ready
        </p>
      )}
    </motion.button>
  )
}

// ── "Don't have a handout?" bottom-sheet ─────────────────────────────────────
function NoHandoutSheet({ onDismiss, onDone, token, subjectId, subjectName }) {
  const [mode, setMode] = useState(null)          // null | 'syllabus_paste' | 'manual'
  const [syllabusText, setSyllabusText] = useState('')
  const [chaptersText, setChaptersText] = useState('')
  const [subjectLabel, setSubjectLabel] = useState(subjectName || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const chapterList = chaptersText.split('\n').map(l => l.trim()).filter(Boolean)

  const handleSubmit = async () => {
    setError(null)
    setBusy(true)
    try {
      if (mode === 'syllabus_paste') {
        if (syllabusText.trim().length < 30) {
          setError('Paste more text — at least a few lines of syllabus.')
          setBusy(false)
          return
        }
        await createHandoutFromText({
          token, subjectId,
          subjectName: subjectLabel || subjectId.toUpperCase(),
          mode: 'syllabus_paste',
          syllabusText: syllabusText.trim(),
        })
        // LLM processing is async — hand control back to the parent which will poll status
        onDone('pending')
      } else {
        if (chapterList.length === 0) {
          setError('Add at least one chapter.')
          setBusy(false)
          return
        }
        await createHandoutFromText({
          token, subjectId,
          subjectName: subjectLabel || subjectId.toUpperCase(),
          mode: 'manual',
          chapters: chapterList,
        })
        // Manual mode is synchronous — handout is ready immediately
        onDone('ready')
      }
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onDismiss() }}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 280 }}
        className="w-full max-w-md rounded-t-[28px] bg-[#3A3660] overflow-hidden shadow-2xl"
        style={{ maxHeight: '90dvh', overflowY: 'auto' }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-white/20" />
        </div>

        <div className="px-5 pb-8 pt-2">
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-white text-[17px] font-bold">Build your chapter index</h2>
              <p className="text-[#A8A5C0] text-[12px] mt-0.5">No handout? No problem.</p>
            </div>
            <button onClick={onDismiss} className="p-2 rounded-full text-[#9895B5] hover:text-white transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          {/* Subject name input */}
          <div className="mb-4">
            <label className="text-[#A8A5C0] text-[11px] uppercase tracking-wider mb-1.5 block">Subject name</label>
            <input
              type="text"
              value={subjectLabel}
              onChange={e => setSubjectLabel(e.target.value)}
              placeholder="e.g. Data Structures, DBMS"
              className="w-full bg-white/[0.07] border border-white/10 rounded-xl px-4 py-2.5
                         text-white text-sm placeholder:text-[#5C5878] focus:outline-none focus:border-white/20 transition-colors"
            />
          </div>

          {/* Mode selector — only shown before picking a mode */}
          {!mode && (
            <div className="space-y-3 mt-2">
              <p className="text-[#A8A5C0] text-[12px]">How would you like to build the chapter list?</p>

              {/* Option 1 — Paste syllabus */}
              <button
                type="button"
                onClick={() => setMode('syllabus_paste')}
                className="w-full text-left rounded-2xl bg-[#4A4769] border border-white/[0.08]
                           px-4 py-4 hover:bg-[#524F70] active:scale-[0.98] transition-all"
              >
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#E8956D]/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-base">📋</span>
                  </div>
                  <div>
                    <p className="text-white text-[13px] font-semibold">Paste syllabus text</p>
                    <p className="text-[#A8A5C0] text-[11px] mt-0.5 leading-relaxed">
                      Copy text from your college portal, WhatsApp PDF, or course page — AI extracts the chapter structure automatically.
                    </p>
                    <span className="inline-block mt-2 px-2.5 py-0.5 rounded-full bg-[#E8956D]/15 text-[#E8956D] text-[10px] font-medium">
                      AI-powered · ~10 sec
                    </span>
                  </div>
                </div>
              </button>

              {/* Option 2 — Manual */}
              <button
                type="button"
                onClick={() => setMode('manual')}
                className="w-full text-left rounded-2xl bg-[#4A4769] border border-white/[0.08]
                           px-4 py-4 hover:bg-[#524F70] active:scale-[0.98] transition-all"
              >
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#4EF0A0]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-base">✏️</span>
                  </div>
                  <div>
                    <p className="text-white text-[13px] font-semibold">Type chapters manually</p>
                    <p className="text-[#A8A5C0] text-[11px] mt-0.5 leading-relaxed">
                      Enter chapter names one per line. Instant — no AI needed.
                    </p>
                    <span className="inline-block mt-2 px-2.5 py-0.5 rounded-full bg-[#4EF0A0]/10 text-[#4EF0A0] text-[10px] font-medium">
                      Instant
                    </span>
                  </div>
                </div>
              </button>
            </div>
          )}

          {/* Syllabus paste input */}
          {mode === 'syllabus_paste' && (
            <div className="mt-1">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[#A8A5C0] text-[11px] uppercase tracking-wider">Paste syllabus here</label>
                <button onClick={() => { setMode(null); setError(null) }} className="text-[#9895B5] text-[11px] underline hover:text-white">Back</button>
              </div>
              <textarea
                value={syllabusText}
                onChange={e => setSyllabusText(e.target.value)}
                rows={8}
                placeholder={"Copy and paste your syllabus text here...\n\nWorks with:\n• College portal course pages\n• WhatsApp PDF text\n• Any module/chapter listing"}
                className="w-full bg-white/[0.07] border border-white/10 rounded-xl px-4 py-3
                           text-white text-[13px] placeholder:text-[#5C5878] focus:outline-none
                           focus:border-white/20 transition-colors resize-none leading-relaxed"
              />
              <p className="text-[#7A7898] text-[11px] mt-1.5">
                AI will extract modules and chapters automatically.
              </p>
            </div>
          )}

          {/* Manual chapter entry */}
          {mode === 'manual' && (
            <div className="mt-1">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[#A8A5C0] text-[11px] uppercase tracking-wider">Chapter names (one per line)</label>
                <button onClick={() => { setMode(null); setError(null) }} className="text-[#9895B5] text-[11px] underline hover:text-white">Back</button>
              </div>
              <textarea
                value={chaptersText}
                onChange={e => setChaptersText(e.target.value)}
                rows={8}
                placeholder={"Introduction to OOP\nClasses and Objects\nInheritance\nPolymorphism\nAbstraction\nException Handling\nFile I/O"}
                className="w-full bg-white/[0.07] border border-white/10 rounded-xl px-4 py-3
                           text-white text-[13px] placeholder:text-[#5C5878] focus:outline-none
                           focus:border-white/20 transition-colors resize-none leading-relaxed"
              />
              {chapterList.length > 0 && (
                <p className="text-[#4EF0A0] text-[11px] mt-1.5">
                  {chapterList.length} chapter{chapterList.length !== 1 ? 's' : ''} detected
                </p>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="text-[#FF7B7B] text-[12px] mt-3 leading-relaxed">{error}</p>
          )}

          {/* Submit button */}
          {mode && (
            <button
              onClick={handleSubmit}
              disabled={busy}
              className="mt-5 w-full flex items-center justify-center gap-2 py-3.5 rounded-full
                         bg-[#E8956D] text-white font-semibold text-[14px]
                         disabled:opacity-40 active:scale-[0.98] transition-all"
            >
              {busy ? (
                <><Loader size={16} className="animate-spin" />{mode === 'syllabus_paste' ? 'Extracting chapters…' : 'Building index…'}</>
              ) : mode === 'syllabus_paste' ? (
                <><Sparkles size={16} />Extract chapters with AI</>
              ) : (
                <><Sparkles size={16} />Build my chapter index</>
              )}
            </button>
          )}
        </div>
      </motion.div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function SubjectDetail() {
  const { subjectId } = useParams()
  const navigate = useNavigate()
  const { state: { session, attendance } } = useAppStore()
  const token = session?.token

  const [handout, setHandout] = useState(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState(null)
  const [availableChapters, setAvailableChapters] = useState([])
  const [activeModuleIndex, setActiveModuleIndex] = useState(0)
  const [showNoHandoutSheet, setShowNoHandoutSheet] = useState(false)
  const pollRef = useRef(null)

  const subjectDisplay = attendance?.subjects?.find(s =>
    (s.shortName || s.id || '').toLowerCase() === subjectId.toLowerCase()
  )
  const subjectName = handout?.subject_name || subjectDisplay?.name || subjectId.toUpperCase()

  const stopPoll = () => { if (pollRef.current) clearInterval(pollRef.current) }

  const loadHandout = useCallback(async () => {
    if (!token) return
    try {
      const [h, chapters] = await Promise.all([
        getHandout({ token, subjectId }),
        getAvailableChapters({ token, subjectId }),
      ])
      setHandout(h)
      setAvailableChapters(chapters || [])
    } catch {
      setHandout(null)
    } finally {
      setLoading(false)
    }
  }, [token, subjectId])

  useEffect(() => { loadHandout(); return stopPoll }, [loadHandout])

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const ext = file.name.split('.').pop().toLowerCase()
    if (!['pdf', 'docx', 'doc'].includes(ext)) { setError('Only PDF or DOCX files accepted'); return }
    if (file.size > 20 * 1024 * 1024) { setError('File too large — max 20MB'); return }
    setError(null); setUploading(true)
    try {
      const result = await uploadHandout({ token, subjectId, file })
      if (result.already_exists) { await loadHandout(); return }
      setProcessing(true)
      pollRef.current = setInterval(async () => {
        const s = await getHandoutStatus({ token, subjectId })
        if (s.status === 'ready') { stopPoll(); setProcessing(false); await loadHandout() }
        else if (s.status === 'failed') {
          stopPoll(); setProcessing(false)
          setError('Could not extract syllabus. Please ensure the file is a text-based PDF or DOCX.')
        }
      }, POLL_MS)
    } catch (err) { setError(err.message) }
    finally { setUploading(false) }
  }

  const getLesson = (chapterTitle) => {
    const slug = chapterTitle.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '-').slice(0, 60)
    const exact = availableChapters.find(ch => ch.chapter_key === slug)
    if (exact) return exact
    const partial = availableChapters.find(ch => {
      const key = ch.chapter_key.replace(/-/g, ' ')
      const title = chapterTitle.toLowerCase().replace(/[^a-z0-9\s]/g, '')
      const words = title.split(' ').filter(w => w.length > 3)
      const matchCount = words.filter(w => key.includes(w)).length
      return matchCount >= 3 && matchCount >= words.length * 0.6
    })
    return partial || null
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-dvh bg-[#5B5878]">
      <Loader size={22} className="text-white/40 animate-spin" />
    </div>
  )

  const modules = handout?.modules || []
  const activeModule = modules[activeModuleIndex] || null

  // ── No handout yet ────────────────────────────────────────────────────────
  if (!handout && !processing) {
    return (
      <div className="min-h-dvh bg-[#5B5878] px-5 pt-safe">
        {/* Full-width nav capsule */}
        <div className="py-4">
          <div className="flex items-center border border-white/15 rounded-full px-4 py-2.5">
            <button onClick={() => navigate('/app/study')}
              className="flex items-center gap-2 text-white text-xs font-medium tracking-wide">
              <ArrowLeft size={13} /> STUDYME
            </button>
          </div>
        </div>

        {/* Centered upload card */}
        <div className="flex items-center justify-center pt-12 pb-10">
          <div className="w-full max-w-sm bg-[#4A4769] border-2 border-dashed border-white/15 rounded-3xl p-10 text-center">
            {/* Icon — rounded square, muted purple bg, document icon */}
            <div className="w-14 h-14 rounded-2xl bg-[#7B7498] flex items-center justify-center mx-auto mb-6">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="2" width="16" height="20" rx="2"/>
                <path d="M9 7h6M9 11h6M9 15h4"/>
              </svg>
            </div>
            <h2 className="text-white text-[18px] font-bold mb-2">Upload course handout</h2>
            <p className="text-[#A8A5C0] text-[13px] leading-relaxed mb-8 max-w-[260px] mx-auto">
              Upload your course handout as a PDF or DOCX. We'll extract every module and chapter so you can study chapter by chapter.
            </p>
            {error && <p className="text-[#FF7B7B] text-xs mb-4">{error}</p>}
            <label className="cursor-pointer inline-block">
              <input type="file" accept=".pdf,.docx,.doc" className="hidden" onChange={handleFile} disabled={uploading} />
              <div className="inline-flex items-center gap-2 px-7 py-3 rounded-full bg-[#E8956D] text-white
                              font-semibold text-sm active:scale-95 transition-transform">
                {uploading
                  ? <><Loader size={15} className="animate-spin" />Uploading…</>
                  : <><Sparkles size={15} />Choose file</>
                }
              </div>
            </label>
            <p className="text-[#7A7898] text-xs mt-4">PDF · DOCX · Max 20MB</p>

            {/* No-handout alternative */}
            <button
              type="button"
              onClick={() => setShowNoHandoutSheet(true)}
              className="mt-4 text-[#9895B5] text-[12px] underline underline-offset-2 hover:text-[#D4D1EC] transition-colors"
            >
              Don&apos;t have a course handout?
            </button>
          </div>
        </div>

        <AnimatePresence>
          {showNoHandoutSheet && (
            <NoHandoutSheet
              token={token}
              subjectId={subjectId}
              subjectName={subjectDisplay?.name || subjectId.toUpperCase()}
              onDismiss={() => setShowNoHandoutSheet(false)}
              onDone={(status) => {
                setShowNoHandoutSheet(false)
                if (status === 'ready') {
                  loadHandout()
                } else {
                  setProcessing(true)
                  pollRef.current = setInterval(async () => {
                    const s = await getHandoutStatus({ token, subjectId })
                    if (s.status === 'ready') { stopPoll(); setProcessing(false); loadHandout() }
                    else if (s.status === 'failed') {
                      stopPoll(); setProcessing(false)
                      setError('Could not extract syllabus from pasted text. Try again or build manually.')
                    }
                  }, POLL_MS)
                }
              }}
            />
          )}
        </AnimatePresence>
      </div>
    )
  }

  // ── Processing ────────────────────────────────────────────────────────────
  if (processing) {
    return (
      <div className="min-h-dvh bg-[#5B5878] flex flex-col items-center justify-center px-5">
        <Loader size={28} className="text-white/50 animate-spin mb-4" />
        <p className="text-white font-semibold">Extracting syllabus…</p>
        <p className="text-[#A8A5C0] text-sm mt-1">Our AI is reading your course handout (~15 seconds)</p>
      </div>
    )
  }

  // ── Main layout ───────────────────────────────────────────────────────────
  return (
    <div className="min-h-dvh bg-[#5B5878] pb-20">

      {/* ── Nav ── */}
      <div className="flex items-center justify-between px-5 pt-safe py-4">
        <button
          onClick={() => navigate('/app/study')}
          className="flex items-center gap-2 px-3.5 py-2 rounded-full border border-white/20
                     text-white text-xs font-medium tracking-wide hover:border-white/35 transition-colors"
        >
          <ArrowLeft size={13} />
          STUDYME
        </button>

        <div className="flex items-center gap-2">
          {/* Per-chapter upload */}
          <button
            onClick={() => {
              const allTitles = (handout?.modules || [])
                .flatMap(m => m.chapters || [])
                .map(ch => ch.title)
              const params = new URLSearchParams({ validTitles: JSON.stringify(allTitles) })
              navigate(`/app/study/${subjectId}/upload?${params}`)
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#2E2B4A]
                       text-[#E8956D] text-xs font-medium active:scale-95 transition-all"
            style={{ border: '1px solid rgba(232,149,109,0.45)' }}
          >
            <Sparkles size={12} className="text-[#E8956D]" />
            Edit chapters
          </button>
        </div>
      </div>

      <div className="px-5 space-y-4">

        {/* ── Title ── */}
        <div className="mt-1">
          <h1 className="text-white text-[22px] sm:text-[28px] font-bold leading-tight tracking-tight">{subjectName}</h1>
          <p className="text-[#A8A5C0] text-[13px] mt-1">
            {[
              handout.program,
              handout.semester ? `Sem ${handout.semester}` : null,
              handout.credits  ? `${handout.credits} credits` : null,
              handout.subject_code || null,
            ].filter(Boolean).join(' · ')}
          </p>
        </div>

        {/* ── Course info card ── */}
        {(handout.course_description || handout.instructor_name) && (
          <div className="bg-[#4A4769] border border-white/[0.08] rounded-2xl px-4 py-3.5">
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
              <div className="flex-1 min-w-0">
                {handout.course_description && (
                  <p className="text-[#D4D1EC] text-[13px] leading-relaxed mb-2.5 line-clamp-3">
                    {handout.course_description}
                  </p>
                )}
                {handout.instructor_name && (
                  <div className="flex items-center gap-1.5 text-[#A8A5C0] text-xs">
                    <User size={11} />
                    {handout.instructor_name}
                  </div>
                )}
              </div>
              {/* "Handout by You" badge */}
              <div className="self-start flex-shrink-0 bg-[#2E2B4A] border border-white/10 rounded-full px-3.5 py-1.5">
                <p className="text-white text-[11px] font-medium whitespace-nowrap">
                  Handout by {handout.uploaded_by_label === 'you' ? 'You' : handout.uploaded_by_label}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Module strip ── */}
        <div className="-mx-5 px-5">
          <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none">
            {modules.map((mod, i) => (
              <ModuleCard
                key={mod.number}
                mod={mod}
                index={i}
                isActive={i === activeModuleIndex}
                onClick={() => setActiveModuleIndex(i)}
                availableChapters={availableChapters}
              />
            ))}
          </div>
        </div>

        {/* ── Chapter panel ── */}
        <AnimatePresence mode="wait">
          {activeModule && (
            <motion.div
              key={activeModuleIndex}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -3 }}
              transition={{ duration: 0.15 }}
              className="bg-[#4A4769] border border-white/[0.08] rounded-2xl"
            >
              {/* Panel header */}
              {(() => {
                // First: check if any chapter in this module has a matched lesson
                const moduleLesson = (activeModule.chapters || [])
                  .map(ch => getLesson(ch.title))
                  .find(l => l != null)

                // Fallback: find any "orphan" upload (master upload with a custom key
                // that doesn't match any handout chapter title) — it still has a script_id
                const allMatchedKeys = new Set(
                  (handout?.modules || [])
                    .flatMap(m => m.chapters || [])
                    .map(ch => getLesson(ch.title))
                    .filter(Boolean)
                    .map(l => l.chapter_key)
                )
                const orphanLesson = !moduleLesson
                  ? availableChapters.find(ch => ch.script_id && !allMatchedKeys.has(ch.chapter_key))
                  : null

                const activeLesson = moduleLesson || orphanLesson

                return (
                  <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/[0.07]">
                    <p className="text-white text-[14px] font-semibold">{activeModule.title}</p>
                    {activeLesson ? (
                      <button
                        onClick={() => navigate(`/app/study/${subjectId}/${activeLesson.script_id}/workspace`)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#2E2B4A]
                                   text-white text-[11px] font-medium active:scale-95 transition-all
                                   border border-white/10 hover:border-white/20"
                      >
                        <Sparkles size={11} className="text-[#4EF0A0]" />
                        Start
                      </button>
                    ) : (
                      <button
                        onClick={() => navigate(`/app/study/${subjectId}/upload?masterUpload=true`)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#2E2B4A]
                                   text-[#9895B5] text-[11px] font-medium active:scale-95 transition-all
                                   border border-white/10 hover:border-white/20 hover:text-white"
                      >
                        <Upload size={11} />
                        One upload
                      </button>
                    )}
                  </div>
                )
              })()}

              {/* Chapter rows */}
              <div className="px-4">
                {(activeModule.chapters || []).map((ch, i) => (
                  <ChapterRow
                    key={i}
                    chapter={ch}
                    subjectId={subjectId}
                    lesson={getLesson(ch.title)}
                    navigate={navigate}
                    isLast={i === (activeModule.chapters?.length || 0) - 1}
                    allChapterTitles={(handout?.modules || []).flatMap(m => m.chapters || []).map(c => c.title)}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Re-upload link ── */}
        <div className="text-center pt-1 pb-2">
          <label className="cursor-pointer">
            <input type="file" accept=".pdf,.docx,.doc" className="hidden" onChange={handleFile} disabled={uploading} />
            <span className="text-[#A8A5C0] text-xs underline underline-offset-2 hover:text-white transition-colors">
              Upload different handout version
            </span>
          </label>
        </div>

      </div>
    </div>
  )
}
