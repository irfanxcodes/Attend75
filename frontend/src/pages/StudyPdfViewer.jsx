import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import StudyBackButton from '../components/common/StudyBackButton'
import { getStudyLessonById, getStudySubjectById } from '../constants/studyMe/content'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function StudyPdfViewer() {
  const navigate = useNavigate()
  const { subjectId, lessonId } = useParams()
  const [searchParams] = useSearchParams()
  const topicId = searchParams.get('topic') || ''

  const subject = getStudySubjectById(subjectId)
  const lesson = getStudyLessonById(subjectId, lessonId)
  const lessonTopics = Array.isArray(lesson?.topics) ? lesson.topics : []
  const selectedTopic = lessonTopics.find((topic) => topic.id === topicId) || lessonTopics[0] || null

  const resolvedPdfPath = useMemo(() => {
    const rawPath = subject?.pdfPath
    if (!rawPath) {
      return ''
    }

    if (/^(https?:|blob:|data:)/i.test(rawPath)) {
      return rawPath
    }

    const baseUrl = import.meta.env.BASE_URL || '/'
    const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
    const normalizedPath = rawPath.startsWith('/') ? rawPath.slice(1) : rawPath
    return `${normalizedBase}${normalizedPath}`
  }, [subject])

  const initialPage = useMemo(() => {
    if (!lesson) {
      return 1
    }

    if (selectedTopic?.pageRange?.start) {
      return selectedTopic.pageRange.start
    }

    return lesson.pageRange?.start || 1
  }, [lesson, selectedTopic])

  const [numPages, setNumPages] = useState(null)
  const [pageNumber, setPageNumber] = useState(initialPage)
  const [pdfError, setPdfError] = useState('')
  const [pdfViewportSize, setPdfViewportSize] = useState({ width: 0, height: 0 })
  const [pageAspectRatio, setPageAspectRatio] = useState(1 / Math.SQRT2)
  const [isViewerFocused, setViewerFocused] = useState(false)
  const [isExpanded, setExpanded] = useState(false)
  const pdfViewportRef = useRef(null)
  const viewerScreenRef = useRef(null)
  const touchStateRef = useRef({ x: 0, y: 0, at: 0 })

  useEffect(() => {
    setPageNumber(initialPage)
  }, [initialPage])

  useEffect(() => {
    setPdfError('')
  }, [resolvedPdfPath])

  useEffect(() => {
    if (!resolvedPdfPath) {
      return
    }

    const details = {
      apiVersion: pdfjs.version,
      workerSrc: pdfjs.GlobalWorkerOptions.workerSrc,
      pdfPath: resolvedPdfPath,
    }
    console.info('[StudyPdfViewer] PDF.js runtime', details)
    window.__studyMePdfRuntime = details
  }, [resolvedPdfPath])

  useEffect(() => {
    if (!isExpanded) {
      return undefined
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isExpanded])

  useEffect(() => {
    viewerScreenRef.current?.focus({ preventScroll: true })
  }, [isExpanded])

  useEffect(() => {
    const target = pdfViewportRef.current
    if (!target) {
      return
    }

    const updateSize = () => {
      setPdfViewportSize({
        width: Math.max(Math.floor(target.clientWidth), 240),
        height: Math.max(Math.floor(target.clientHeight), 280),
      })
    }

    updateSize()

    const observer = new ResizeObserver(updateSize)
    observer.observe(target)

    return () => {
      observer.disconnect()
    }
  }, [isExpanded])

  if (!subject || !lesson) {
    return (
      <section className="space-y-3 pb-2 sm:space-y-4">
        <StudyBackButton fallbackTo="/study" label="Back" />
        <header>
          <h1 className="text-2xl font-bold tracking-tight text-[#E7DEDE] sm:text-3xl">StudyMe PDF Viewer</h1>
          <p className="mt-1 text-xs text-[#CFC5E8] sm:text-sm">Lesson mapping not found.</p>
        </header>
        <button
          type="button"
          onClick={() => navigate('/study')}
          className="rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-[#E7DEDE] hover:bg-white/10"
        >
          Back to StudyMe
        </button>
      </section>
    )
  }

  const canGoPrev = pageNumber > 1
  const canGoNext = numPages ? pageNumber < numPages : false

  const goToPrevPage = () => {
    setPageNumber((current) => clamp(current - 1, 1, numPages || 1))
  }

  const goToNextPage = () => {
    setPageNumber((current) => clamp(current + 1, 1, numPages || 1))
  }

  const handleTouchStart = (event) => {
    const touch = event.changedTouches?.[0]
    if (!touch) {
      return
    }

    touchStateRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      at: Date.now(),
    }
  }

  const handleTouchEnd = (event) => {
    const touch = event.changedTouches?.[0]
    if (!touch) {
      return
    }

    const elapsed = Date.now() - touchStateRef.current.at
    const deltaX = touch.clientX - touchStateRef.current.x
    const deltaY = touch.clientY - touchStateRef.current.y
    const absX = Math.abs(deltaX)
    const absY = Math.abs(deltaY)

    if (elapsed > 900) {
      return
    }

    if (absX < 64 || absX < absY * 1.2) {
      return
    }

    if (deltaX < 0 && canGoNext) {
      goToNextPage()
      return
    }

    if (deltaX > 0 && canGoPrev) {
      goToPrevPage()
    }
  }

  const handleViewerKeyDown = (event) => {
    if (!isViewerFocused) {
      return
    }

    const targetTag = event.target?.tagName?.toLowerCase()
    if (targetTag === 'input' || targetTag === 'textarea' || event.target?.isContentEditable) {
      return
    }

    if (event.key === 'ArrowRight' && canGoNext) {
      event.preventDefault()
      goToNextPage()
      return
    }

    if (event.key === 'ArrowLeft' && canGoPrev) {
      event.preventDefault()
      goToPrevPage()
    }
  }

  const availableWidth = Math.max(pdfViewportSize.width - (isExpanded ? 12 : 22), 240)
  const availableHeight = Math.max(pdfViewportSize.height - (isExpanded ? 12 : 22), 280)
  const heightBoundWidth = Math.max(Math.floor(availableHeight * pageAspectRatio), 240)
  const renderWidth = Math.min(availableWidth, heightBoundWidth)

  const toggleExpanded = () => {
    setExpanded((current) => !current)
  }

  const viewerContent = (
    <section
      ref={viewerScreenRef}
      tabIndex={0}
      onKeyDown={handleViewerKeyDown}
      onFocusCapture={() => setViewerFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setViewerFocused(false)
        }
      }}
      onPointerDown={() => viewerScreenRef.current?.focus({ preventScroll: true })}
      className={`flex flex-col gap-2 outline-none sm:gap-4 ${
        isExpanded
          ? 'fixed inset-0 z-[120] h-dvh w-screen bg-[#48426D] p-2 sm:p-3'
          : 'min-h-[72dvh] pb-1 sm:pb-2'
      }`}
    >
      {!isExpanded ? (
        <header className="shrink-0 rounded-2xl border border-white/15 bg-[#312051] p-3 sm:p-4">
          <div className="flex items-center gap-2.5">
            <StudyBackButton
              fallbackTo={`/study/${subject.id}/${lesson.id}`}
              label="Go back"
              iconOnly
              className="h-11 w-11 text-xl"
            />
            <p className="text-xs uppercase tracking-[0.14em] text-[#CFC5E8]">Embedded PDF Viewer</p>
          </div>
          <h1 className="mt-1 text-xl font-semibold text-[#F4F1FF] sm:text-2xl">{lesson.title}</h1>
          <p className="mt-1 text-xs text-[#D8D3E8]">
            {selectedTopic ? `${selectedTopic.title} • ` : ''}Starting at page {initialPage}
          </p>
          <p className="mt-1 text-[11px] text-[#CFC5E8]">Swipe left/right on phone. Use left/right arrow keys when this screen is focused.</p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => navigate(`/study/${subject.id}/${lesson.id}`)}
              className="rounded-full border border-white/20 px-3 py-1.5 text-xs font-semibold text-[#E7DEDE] hover:bg-white/10"
            >
              Back to Lesson
            </button>

            <button
              type="button"
              onClick={() => setPageNumber(initialPage)}
              className="rounded-full border border-[#A8D8FF]/50 bg-[#3A315D] px-3 py-1.5 text-xs font-semibold text-[#CFE8FF] hover:bg-[#4A3E73]"
            >
              Jump to Start Page
            </button>
          </div>

          {lessonTopics.length ? (
            <div className="mt-2 -mx-1 overflow-x-auto px-1 pb-1">
              <div className="flex w-max gap-2">
                {lessonTopics.map((topic) => {
                  const isActive = selectedTopic?.id === topic.id
                  return (
                    <button
                      key={topic.id}
                      type="button"
                      onClick={() => navigate(`/study/${subject.id}/${lesson.id}/pdf?topic=${topic.id}`)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                        isActive
                          ? 'border-[#A8D8FF]/60 bg-[#A8D8FF]/15 text-[#CFE8FF]'
                          : 'border-white/20 text-[#E7DEDE] hover:bg-white/10'
                      }`}
                    >
                      {topic.title}
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}
        </header>
      ) : null}

      <section className="flex min-h-0 flex-1 flex-col rounded-2xl border border-white/15 bg-[#312051] p-1 sm:p-2">
        <div className="mb-1 flex shrink-0 items-center justify-between rounded-xl bg-[#3A315D] px-3 py-2 text-xs text-[#D8D3E8] sm:mb-2">
          <button
            type="button"
            disabled={!canGoPrev}
            onClick={goToPrevPage}
            className="rounded-full border border-white/20 px-3 py-1 font-semibold text-[#E7DEDE] disabled:opacity-50"
          >
            Prev
          </button>
          <span>
            Page {pageNumber}{numPages ? ` / ${numPages}` : ''}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleExpanded}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/20 px-2.5 py-1 font-semibold text-[#E7DEDE] hover:bg-white/10"
              aria-label={isExpanded ? 'Exit full screen reader' : 'Open full screen reader'}
              title={isExpanded ? 'Exit full screen reader' : 'Open full screen reader'}
            >
              {isExpanded ? (
                <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3.5 w-3.5 fill-current">
                  <path d="M3 8V3h5v1.5H4.5V8H3Zm14 0h-1.5V4.5H12V3h5v5Zm-9 9H3v-5h1.5v3.5H8V17Zm9 0h-5v-1.5h3.5V12H17v5Z" />
                </svg>
              ) : (
                <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3.5 w-3.5 fill-current">
                  <path d="M8 3H3v5h1.5V4.5H8V3Zm9 0h-5v1.5h3.5V8H17V3ZM8 17H3v-5h1.5v3.5H8V17Zm9 0h-5v-1.5h3.5V12H17v5Z" />
                </svg>
              )}
              <span className="hidden sm:inline">{isExpanded ? 'Exit' : 'Full'}</span>
            </button>
            <button
              type="button"
              disabled={!canGoNext}
              onClick={goToNextPage}
              className="rounded-full border border-white/20 px-3 py-1 font-semibold text-[#E7DEDE] disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>

        <div
          ref={pdfViewportRef}
          className="flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-xl bg-[#1D183E] p-1 sm:p-2"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <Document
            file={resolvedPdfPath}
            onLoadSuccess={({ numPages: totalPages }) => {
              setNumPages(totalPages)
              setPageNumber((current) => clamp(current, 1, totalPages))
              setPdfError('')
            }}
            onLoadError={() => {
              setPdfError(`Unable to load PDF. Please verify file path: ${resolvedPdfPath || 'missing path'}`)
            }}
            loading={<p className="p-3 text-sm text-[#D8D3E8]">Loading PDF...</p>}
            error={<p className="p-3 text-sm text-[#FECACA]">Unable to render PDF document.</p>}
          >
            <Page
              pageNumber={pageNumber}
              width={renderWidth || 320}
              onLoadSuccess={(loadedPage) => {
                const viewport = loadedPage.getViewport({ scale: 1 })
                if (viewport?.width && viewport?.height) {
                  setPageAspectRatio(viewport.width / viewport.height)
                }
              }}
              renderTextLayer
              renderAnnotationLayer
            />
          </Document>
        </div>

        {pdfError ? (
          <div className="mt-2 rounded-lg border border-[#F87171]/40 bg-[#7F1D1D]/20 px-3 py-2 text-xs text-[#FECACA]">
            {pdfError}
          </div>
        ) : null}
      </section>
    </section>
  )

  if (isExpanded) {
    return createPortal(viewerContent, document.body)
  }

  return viewerContent
}

export default StudyPdfViewer
