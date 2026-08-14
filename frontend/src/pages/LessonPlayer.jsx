/**
 * LessonPlayer — Full-screen immersive AI lesson experience.
 *
 * - Fetches the Teaching Script on mount
 * - Restores saved progress
 * - Plays blocks sequentially using useLessonPlayer state machine
 * - Handles doubts via DoubtPanel + API
 * - Saves progress every 30s and on pause/complete
 * - Hides app bottom navigation
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Loader } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

import useAppStore from '../hooks/useAppStore'
import { useLessonPlayer, PLAYER_STATE } from '../hooks/useLessonPlayer'
import { useLessonProgress } from '../hooks/useLessonProgress'
import { useWebSpeech } from '../hooks/useWebSpeech'

import { getLessonScript, askDoubt } from '../services/lessonApi'
import { NotebookCanvas } from '../components/lessonplayer/NotebookCanvas'
import { LessonControls } from '../components/lessonplayer/LessonControls'
import { DoubtPanel } from '../components/lessonplayer/DoubtPanel'
import { LessonSummary } from '../components/lessonplayer/LessonSummary'

export default function LessonPlayer() {
  const { subjectId, lessonId } = useParams()
  const navigate = useNavigate()
  const { state: appState } = useAppStore()
  const token = appState.session?.token

  const [script, setScript] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [doubtAnswer, setDoubtAnswer] = useState(null)

  const { stopSpeaking } = useWebSpeech()

  const player = useLessonPlayer({
    onBlockChange: () => setDoubtAnswer(null),
    onComplete: () => {
      stopSpeaking()
    },
  })

  const progress = useLessonProgress({ token, lessonId, enabled: !!token })

  // ── Track last-opened lesson for "Continue your lesson" card ──────────
  useEffect(() => {
    if (!subjectId || !lessonId) return
    try {
      const prev = JSON.parse(window.localStorage.getItem('attend75.studyme.lastLesson') || '{}')
      window.localStorage.setItem(
        'attend75.studyme.lastLesson',
        JSON.stringify({ subjectId, lessonId, title: prev?.title || '', openedAt: Date.now() })
      )
    } catch { /* ignore */ }
  }, [subjectId, lessonId])

  // ── Load script + restore progress ────────────────────────────────────
  useEffect(() => {
    if (!token || !lessonId) return

    let cancelled = false

    const load = async () => {
      try {
        const [scriptData, savedProgress] = await Promise.all([
          getLessonScript({ token, lessonId }),
          progress.restore(),
        ])
        if (cancelled) return
        setScript(scriptData)
        player.load(scriptData.blocks, savedProgress)
      } catch (err) {
        if (!cancelled) setLoadError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [token, lessonId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Update lesson title in lastLesson record once script loads ────────
  useEffect(() => {
    if (!subjectId || !lessonId || !script?.title) return
    try {
      const prev = JSON.parse(window.localStorage.getItem('attend75.studyme.lastLesson') || '{}')
      if (prev.subjectId === subjectId && prev.lessonId === lessonId) {
        window.localStorage.setItem(
          'attend75.studyme.lastLesson',
          JSON.stringify({ ...prev, title: script.title })
        )
      }
    } catch { /* ignore */ }
  }, [subjectId, lessonId, script?.title])

  // ── Autosave progress ─────────────────────────────────────────────────
  useEffect(() => {
    if (!script) return
    progress.startAutosave(() => ({
      lastBlockIndex: player.currentIndex,
      completed: player.isComplete,
      conceptsSeen: player.conceptsSeen,
      quizResults: player.quizResults,
      doubtsAsked: player.doubtsAsked,
    }))
    return () => progress.stopAutosave()
  }, [script, player.currentIndex, player.isComplete]) // eslint-disable-line react-hooks/exhaustive-deps

  // Save on pause and complete
  useEffect(() => {
    if (player.isPaused || player.isComplete) {
      progress.save({
        lastBlockIndex: player.currentIndex,
        completed: player.isComplete,
        conceptsSeen: player.conceptsSeen,
        quizResults: player.quizResults,
        doubtsAsked: player.doubtsAsked,
      })
    }
  }, [player.isPaused, player.isComplete]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Block completion: auto-advance ────────────────────────────────────
  const handleBlockComplete = useCallback(() => {
    if (player.isPlaying) {
      player.advance()
    }
  }, [player.isPlaying, player.advance])

  // ── Quiz answer ───────────────────────────────────────────────────────
  const handleQuizAnswer = useCallback((result) => {
    player.answerQuiz(result)
    setTimeout(() => player.advance(), 800)
  }, [player.answerQuiz, player.advance])

  // ── Play / Pause toggle ───────────────────────────────────────────────
  const handlePlayPause = useCallback(() => {
    if (player.isIdle) {
      player.start()
    } else if (player.isPlaying) {
      stopSpeaking()
      player.pause()
    } else if (player.isPaused) {
      player.resume()
    }
  }, [player.isIdle, player.isPlaying, player.isPaused, player.start, player.pause, player.resume, stopSpeaking])

  // ── Doubt submit ──────────────────────────────────────────────────────
  const handleDoubtSubmit = useCallback(async (question) => {
    player.submitDoubt()
    stopSpeaking()
    try {
      const res = await askDoubt({
        token,
        lessonId,
        question,
        currentBlockIndex: player.currentIndex,
      })
      setDoubtAnswer(res.answer)
      player.doubtAnswered(res.answer)
    } catch (err) {
      player.doubtFailed(err.message)
      setDoubtAnswer('Could not reach AI right now. Please try again.')
    }
  }, [token, lessonId, player.currentIndex, stopSpeaking])

  // ── Idle → start after 1.5s (auto-start) ─────────────────────────────
  useEffect(() => {
    if (!loading && script && player.isIdle) {
      const t = setTimeout(() => player.start(), 1500)
      return () => clearTimeout(t)
    }
  }, [loading, script, player.isIdle]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Back button ───────────────────────────────────────────────────────
  const handleBack = () => {
    stopSpeaking()
    navigate(`/app/study/${subjectId}`)
  }

  // ── Render ─────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="fixed inset-0 bg-[#1D183E] flex items-center justify-center z-50">
        <div className="text-center">
          <Loader size={24} className="text-[#FF916C] animate-spin mx-auto mb-3" />
          <p className="text-[#9F9AB5] text-sm">Preparing your lesson...</p>
        </div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="fixed inset-0 bg-[#1D183E] flex items-center justify-center z-50 px-6">
        <div className="text-center max-w-xs">
          <p className="text-[#FF6B6B] text-sm mb-4">{loadError}</p>
          <button
            onClick={() => navigate(-1)}
            className="px-5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-[#9F9AB5] text-sm"
          >
            Go back
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-[#1D183E] flex flex-col z-50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-safe pt-4 pb-3 border-b border-white/5 flex-shrink-0">
        <button
          onClick={handleBack}
          className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-[#9F9AB5]"
          aria-label="Back"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-[#F4F1FF] text-sm font-medium truncate">
            {script?.title || 'AI Lesson'}
          </p>
          <p className="text-[#9F9AB5] text-xs">
            {player.currentIndex + 1} / {script?.total_blocks || '—'}
          </p>
        </div>
        {/* Idle indicator */}
        {player.isIdle && (
          <motion.span
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="text-[#9F9AB5] text-xs"
          >
            Starting...
          </motion.span>
        )}
      </div>

      {/* Main content */}
      <AnimatePresence mode="wait">
        {player.isComplete ? (
          <LessonSummary
            key="summary"
            script={script}
            conceptsSeen={player.conceptsSeen}
            quizResults={player.quizResults}
            doubtsAsked={player.doubtsAsked}
            subjectId={subjectId}
            lessonId={lessonId}
          />
        ) : (
          <NotebookCanvas
            key="canvas"
            blocks={script?.blocks || []}
            currentIndex={player.currentIndex}
            isActive={player.isPlaying}
            onBlockComplete={handleBlockComplete}
            onQuizAnswer={handleQuizAnswer}
          />
        )}
      </AnimatePresence>

      {/* Controls — hidden when complete */}
      {!player.isComplete && (
        <LessonControls
          isPlaying={player.isPlaying}
          isPaused={player.isPaused}
          isIdle={player.isIdle}
          progress={player.progress}
          onPlayPause={handlePlayPause}
          onOpenDoubt={player.openDoubt}
          doubtsAsked={player.doubtsAsked}
        />
      )}

      {/* Doubt panel */}
      <DoubtPanel
        isOpen={player.isDoubtOpen || player.isAnswering}
        onClose={() => {
          if (!player.isAnswering) player.closeDoubt()
        }}
        onSubmit={handleDoubtSubmit}
        isAnswering={player.isAnswering}
        answer={doubtAnswer}
      />
    </div>
  )
}
