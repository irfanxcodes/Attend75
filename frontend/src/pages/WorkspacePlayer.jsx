/**
 * WorkspacePlayer — StudyMe 2.0 Canvas workspace.
 *
 * Layout (desktop lg+):
 *   [ConceptNav 240px fixed] | [Canvas flex-1 min-w-0] | [Tutor 280px fixed]
 *
 * Tabs (Canvas / Source / Resources) switch the CENTER column content only.
 * The sidebar and tutor panel never move — no full-screen overlays.
 *
 * Mobile: single column. Sidebar + tutor open as bottom sheets.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, BookOpen, Layout, MessageCircle, Package } from 'lucide-react'

import useAppStore from '../hooks/useAppStore'
import { useLessonProgress } from '../hooks/useLessonProgress'

import {
  getLessonScript,
  getWorkspaceContext,
  getChapterCurriculum,
  getConcept,
  updateConceptProgress,
} from '../services/lessonApi'

import { ConceptCanvas } from '../components/workspace/ConceptCanvas'
import { ConceptNavSidebar, ConceptNavSheet } from '../components/workspace/ConceptNav'
import { TutorPanel, TutorBottomSheet } from '../components/workspace/TutorPanel'
import { SourceViewer } from '../components/workspace/SourceViewer'
import { ResourcesViewer } from '../components/workspace/ResourcesViewer'
import { ReviewQueue } from '../components/workspace/ReviewQueue'
import { ReviewSession } from '../components/workspace/ReviewSession'

// ── Tab bar ───────────────────────────────────────────────────────────────

const TABS = [
  { id: 'canvas',    label: 'Canvas',    icon: Layout   },
  { id: 'source',    label: 'Source',    icon: BookOpen },
  { id: 'resources', label: 'Resources', icon: Package  },
]

function TabBar({ active, onChange }) {
  return (
    <div className="flex gap-1" role="tablist" aria-label="Workspace view">
      {TABS.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          role="tab"
          aria-selected={active === id}
          onClick={() => onChange(id)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium transition-all
            ${active === id
              ? 'bg-[#2E2B4A] text-white border border-white/20'
              : 'text-[#6B6888] hover:text-[#C8C5E8] border border-transparent hover:bg-white/[0.04]'
            }`}
        >
          <Icon size={11} aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  )
}

// ── Loading / Error screens ───────────────────────────────────────────────

function WorkspaceLoading() {
  return (
    <div className="fixed inset-0 bg-[#1D183E] flex items-center justify-center z-50">
      <div className="text-center">
        <div className="w-6 h-6 border-2 border-[#6CB4FF] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-[#9895B5] text-sm">Preparing workspace…</p>
      </div>
    </div>
  )
}

function WorkspaceError({ message, onBack }) {
  return (
    <div className="fixed inset-0 bg-[#1D183E] flex items-center justify-center z-50 px-6">
      <div className="text-center max-w-xs">
        <p className="text-[#FF7B7B] text-sm mb-4">{message}</p>
        <button onClick={onBack} className="px-5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-[#9895B5] text-sm">
          Go back
        </button>
      </div>
    </div>
  )
}

// ── Main WorkspacePlayer ──────────────────────────────────────────────────

export default function WorkspacePlayer() {
  const { subjectId, lessonId } = useParams()
  const navigate = useNavigate()
  const { state: appState } = useAppStore()
  const token = appState.session?.token

  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [script, setScript]     = useState(null)
  const [uploadId, setUploadId] = useState(null)
  const [chapterTitle, setChapterTitle] = useState('')

  const [concepts, setConcepts]         = useState([])
  const [legacyBlocks, setLegacyBlocks] = useState({})
  const [sectionsLoading, setSectionsLoading] = useState(false)

  const [activeTab, setActiveTab]             = useState('canvas')
  const [activeConceptId, setActiveConceptId] = useState(null)
  const [visibleConceptId, setVisibleConceptId] = useState(null)
  const [highlightSlideNo, setHighlightSlideNo] = useState(null)
  const [navOpen, setNavOpen]   = useState(false)
  const [tutorOpen, setTutorOpen] = useState(false)

  const [reviewingConcept, setReviewingConcept] = useState(null)

  const progress = useLessonProgress({ token, lessonId, enabled: !!token })

  // ── Data loading ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!token || !lessonId) return
    let cancelled = false

    const load = async () => {
      try {
        const ctx = await getWorkspaceContext({ token, lessonId })
        if (cancelled) return
        setUploadId(ctx.upload_id)
        setChapterTitle(ctx.title)

        const [scriptData, curriculumData] = await Promise.all([
          getLessonScript({ token, lessonId }),
          getChapterCurriculum({ token, uploadId: ctx.upload_id }).catch(() => null),
        ])
        if (cancelled) return

        setScript(scriptData)
        progress.restore().catch(() => {})

        const blockMap = {}
        for (const block of scriptData.blocks || []) {
          if (block.concept_id) {
            if (!blockMap[block.concept_id]) blockMap[block.concept_id] = []
            blockMap[block.concept_id].push(block)
          }
        }
        setLegacyBlocks(blockMap)

        let initialConcepts = []
        if (curriculumData?.concepts?.length > 0) {
          initialConcepts = curriculumData.concepts.map(c => ({
            id: c.id, title: c.title,
            content_type: c.content_type || 'theory',
            source_heading: c.source_heading || '',
            prerequisites: c.prerequisites || [],
            status: c.student_status || 'unseen',
            sequence_order: c.sequence_order,
            has_sections: c.has_sections,
            sections: [], explanation: '',
          }))
        } else {
          const seenIds = new Set()
          const orderedIds = []
          for (const block of scriptData.blocks || []) {
            if (block.concept_id && !seenIds.has(block.concept_id)) {
              seenIds.add(block.concept_id)
              orderedIds.push(block.concept_id)
            }
          }
          initialConcepts = orderedIds.map((id, idx) => ({
            id, title: `Concept ${idx + 1}`,
            content_type: 'theory', source_heading: '',
            prerequisites: [], status: 'unseen',
            sequence_order: idx, has_sections: false,
            sections: [], explanation: '',
          }))
        }

        setConcepts(initialConcepts)
        if (initialConcepts.length > 0) {
          setActiveConceptId(initialConcepts[0].id)
          setVisibleConceptId(initialConcepts[0].id)
        }
        setLoading(false)

        if (initialConcepts.length > 0 && !cancelled) {
          setSectionsLoading(true)
          const enriched = await Promise.all(
            initialConcepts.map(c =>
              getConcept({ token, conceptId: c.id })
                .then(full => ({
                  ...c,
                  title: full.title || c.title,
                  content_type: full.content_type || c.content_type,
                  source_heading: full.source_heading || c.source_heading,
                  source_page: full.source_page || c.source_page || null,
                  explanation: full.explanation || '',
                  keywords: full.keywords || [],
                  formulas: full.formulas || [],
                  examples: full.examples || [],
                  worked_examples: full.worked_examples || [],
                  misconceptions: full.misconceptions || [],
                  sections: full.sections || [],
                }))
                .catch(() => c)
            )
          )
          if (!cancelled) {
            setConcepts(enriched)
            setSectionsLoading(false)
          }
        }

      } catch (err) {
        if (!cancelled) { setError(err.message); setLoading(false) }
      }
    }

    load()
    return () => { cancelled = true }
  }, [token, lessonId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ──────────────────────────────────────────────────────────
  const handleConceptVisible = useCallback((conceptId) => {
    setVisibleConceptId(conceptId)
    setConcepts(prev => prev.map(c =>
      c.id === conceptId && c.status === 'unseen' ? { ...c, status: 'learning' } : c
    ))
    if (token && conceptId) {
      updateConceptProgress({ token, conceptId, status: 'learning' }).catch(() => {})
    }
  }, [token])

  const handleConceptNavClick = useCallback((conceptId) => {
    setActiveConceptId(conceptId)
    setNavOpen(false)
    // Switch back to canvas tab if on another tab
    setActiveTab('canvas')
  }, [])

  const handleViewSource = useCallback((slideNo) => {
    setHighlightSlideNo(slideNo || null)
    setActiveTab('source')
  }, [])

  const handleStartReview = useCallback((conceptId, conceptTitle) => {
    setReviewingConcept({ id: conceptId, title: conceptTitle })
  }, [])

  const handleReviewComplete = useCallback(() => {
    setReviewingConcept(null)
    if (uploadId && token) {
      getChapterCurriculum({ token, uploadId }).then(data => {
        if (data?.concepts?.length > 0) {
          setConcepts(prev => prev.map(c => {
            const updated = data.concepts.find(nc => nc.id === c.id)
            return updated ? { ...c, status: updated.student_status || c.status } : c
          }))
        }
      }).catch(() => {})
    }
  }, [uploadId, token]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived ───────────────────────────────────────────────────────────
  const currentConcept = concepts.find(c => c.id === (visibleConceptId || activeConceptId))
  const title = chapterTitle || script?.title || 'Chapter'

  const conceptsForNav = concepts.map(c => ({
    id: c.id,
    title: c.title,
    content_type: c.content_type || 'theory',
    source_heading: c.source_heading || '',
    source_page: c.source_page || null,
    student_status: c.status || 'unseen',
  }))

  if (loading) return <WorkspaceLoading />
  if (error)   return <WorkspaceError message={error} onBack={() => navigate(-1)} />

  return (
    <div className="fixed inset-0 bg-[#1D183E] flex flex-col overflow-hidden" style={{ zIndex: 50 }}>

      {/* ── Header ── */}
      <header
        className="flex items-center gap-3 px-4 border-b border-white/[0.07] flex-shrink-0 bg-[#1D183E]"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 10px)', paddingBottom: '10px' }}
      >
        {/* Back */}
        <button
          onClick={() => navigate(`/app/study/${subjectId}`)}
          aria-label="Back to subject"
          className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-[#9895B5]
                     flex-shrink-0 active:scale-95 transition-transform hover:bg-white/10"
        >
          <ArrowLeft size={16} aria-hidden="true" />
        </button>

        {/* Title + tabs */}
        <div className="flex-1 min-w-0">
          <p className="text-white text-[13px] font-semibold truncate leading-tight mb-1" title={title}>
            {title}
          </p>
          <TabBar active={activeTab} onChange={setActiveTab} />
        </div>

        {/* Mobile toggles */}
        <div className="flex items-center gap-2 flex-shrink-0 lg:hidden">
          <button
            onClick={() => setNavOpen(true)}
            aria-label="Open chapter outline"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full
                       bg-white/5 border border-white/[0.08] text-[#9895B5] text-[12px]
                       active:scale-95 transition-all"
          >
            <BookOpen size={13} aria-hidden="true" />
          </button>
          <button
            onClick={() => setTutorOpen(true)}
            aria-label="Open AI tutor"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full
                       bg-white/5 border border-white/[0.08] text-[#9895B5] text-[12px]
                       active:scale-95 transition-all"
          >
            <MessageCircle size={13} aria-hidden="true" />
            <span>Tutor</span>
          </button>
        </div>
      </header>

      {/* ── Three-column body ── */}
      {/*
        Critical layout rules:
        - Left sidebar:  flex-shrink-0, fixed width, overflow-hidden
        - Center column: flex-1 min-w-0, overflow-hidden (prevents bleed)
        - Right tutor:   flex-shrink-0, fixed width, overflow-hidden
        All three are siblings in a flex row — none uses position:absolute
      */}
      <div className="flex flex-1 overflow-hidden min-h-0">

        {/* ── Left: Concept Nav (desktop only) ── */}
        <aside className="hidden lg:flex flex-col w-[240px] flex-shrink-0 overflow-hidden border-r border-white/[0.07]">
          <ConceptNavSidebar
            concepts={conceptsForNav}
            activeConceptId={visibleConceptId}
            onConceptClick={handleConceptNavClick}
            onViewSource={handleViewSource}
            title={title}
          />
        </aside>

        {/* ── Center: tabbed content ── */}
        <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {/* Canvas tab — always mounted, hidden when inactive to preserve scroll position */}
          <div className={`flex-1 flex flex-col overflow-hidden ${activeTab === 'canvas' ? '' : 'hidden'}`}>
            <ConceptCanvas
              concepts={concepts}
              legacyBlocksByConcept={legacyBlocks}
              script={script ? { ...script, title } : null}
              activeConceptId={activeConceptId}
              onConceptVisible={handleConceptVisible}
              onViewSource={handleViewSource}
              loading={sectionsLoading && concepts.every(c => !c.sections?.length)}
            />
          </div>

          {/* Source tab */}
          <div className={`flex-1 flex flex-col overflow-hidden ${activeTab === 'source' ? '' : 'hidden'}`}>
            <SourceViewer
              token={token}
              uploadId={uploadId}
              highlightSlideNo={highlightSlideNo}
              onSlideClick={(slideNo) => {
                const match = concepts.find(c => c.source_page === slideNo)
                if (match) {
                  setActiveConceptId(match.id)
                  setActiveTab('canvas')
                }
                setHighlightSlideNo(slideNo)
              }}
            />
          </div>

          {/* Resources tab */}
          <div className={`flex-1 flex flex-col overflow-hidden ${activeTab === 'resources' ? '' : 'hidden'}`}>
            <div
              className="flex-1 overflow-y-auto"
              style={{ scrollbarWidth: 'thin', scrollbarColor: '#3D3660 transparent' }}
            >
              {uploadId && (
                <ReviewQueue
                  token={token}
                  uploadId={uploadId}
                  onReviewConcept={handleStartReview}
                />
              )}
              <div className="h-px bg-white/[0.06] mx-4 my-1 flex-shrink-0" />
              <ResourcesViewer
                token={token}
                conceptId={visibleConceptId}
                conceptTitle={currentConcept?.title}
                uploadId={uploadId}
                onViewSource={handleViewSource}
              />
            </div>
          </div>
        </main>

        {/* ── Right: Tutor Panel (desktop only) ── */}
        <aside className="hidden lg:flex flex-col w-[280px] flex-shrink-0 overflow-hidden border-l border-white/[0.07]">
          <TutorPanel
            token={token}
            scriptId={lessonId}
            conceptId={visibleConceptId}
            uploadId={uploadId}
            currentConceptTitle={currentConcept?.title}
            onViewSource={handleViewSource}
            className="flex-1 overflow-hidden"
          />
        </aside>
      </div>

      {/* ── Mobile sheets ── */}
      <ConceptNavSheet
        concepts={conceptsForNav}
        activeConceptId={visibleConceptId}
        onConceptClick={handleConceptNavClick}
        onViewSource={handleViewSource}
        title={title}
        isOpen={navOpen}
        onClose={() => setNavOpen(false)}
      />
      <TutorBottomSheet
        isOpen={tutorOpen}
        onClose={() => setTutorOpen(false)}
        token={token}
        scriptId={lessonId}
        conceptId={visibleConceptId}
        uploadId={uploadId}
        currentConceptTitle={currentConcept?.title}
        onViewSource={handleViewSource}
      />

      {/* ── Review Session overlay ── */}
      <AnimatePresence>
        {reviewingConcept && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 z-40"
          >
            <ReviewSession
              token={token}
              conceptId={reviewingConcept.id}
              conceptTitle={reviewingConcept.title}
              onComplete={handleReviewComplete}
              onClose={() => setReviewingConcept(null)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
