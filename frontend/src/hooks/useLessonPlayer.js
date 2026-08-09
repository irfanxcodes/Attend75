/**
 * useLessonPlayer — Lesson Player State Machine
 *
 * States:
 *   IDLE          lesson loaded, not started
 *   PLAYING       blocks playing sequentially
 *   PAUSED        student paused
 *   WAITING_QUIZ  quiz block shown, waiting for student response
 *   DOUBT_OPEN    student opened doubt panel
 *   ANSWERING     doubt submitted, waiting for API response
 *   COMPLETE      all blocks done, summary shown
 *
 * The state machine is deterministic — the LLM is never called here.
 * Voice playback is handled by useWebSpeech.
 * Progress persistence is handled by useLessonProgress.
 */

import { useCallback, useEffect, useReducer, useRef } from 'react'

export const PLAYER_STATE = {
  IDLE: 'IDLE',
  PLAYING: 'PLAYING',
  PAUSED: 'PAUSED',
  WAITING_QUIZ: 'WAITING_QUIZ',
  DOUBT_OPEN: 'DOUBT_OPEN',
  ANSWERING: 'ANSWERING',
  COMPLETE: 'COMPLETE',
}

const initialState = {
  playerState: PLAYER_STATE.IDLE,
  blocks: [],
  currentIndex: 0,
  conceptsSeen: [],
  quizResults: {},
  doubtsAsked: 0,
  lastDoubtAnswer: null,
  error: null,
}

function reducer(state, action) {
  switch (action.type) {
    case 'LOAD':
      return {
        ...initialState,
        blocks: action.blocks,
        currentIndex: action.startIndex || 0,
        conceptsSeen: action.conceptsSeen || [],
        quizResults: action.quizResults || {},
        doubtsAsked: action.doubtsAsked || 0,
      }

    case 'START':
      return { ...state, playerState: PLAYER_STATE.PLAYING }

    case 'PAUSE':
      return { ...state, playerState: PLAYER_STATE.PAUSED }

    case 'RESUME':
      return { ...state, playerState: PLAYER_STATE.PLAYING }

    case 'ADVANCE': {
      const nextIndex = state.currentIndex + 1
      if (nextIndex >= state.blocks.length) {
        return { ...state, playerState: PLAYER_STATE.COMPLETE }
      }
      const nextBlock = state.blocks[nextIndex]
      // Mark concept as seen when we reach a narration block
      const newConceptsSeen =
        nextBlock?.block_type === 'narration' && nextBlock?.concept_id
          ? [...new Set([...state.conceptsSeen, nextBlock.concept_id])]
          : state.conceptsSeen
      return {
        ...state,
        currentIndex: nextIndex,
        conceptsSeen: newConceptsSeen,
        playerState:
          nextBlock?.block_type === 'quiz'
            ? PLAYER_STATE.WAITING_QUIZ
            : PLAYER_STATE.PLAYING,
      }
    }

    case 'QUIZ_ANSWERED': {
      const currentBlock = state.blocks[state.currentIndex]
      const updatedResults = {
        ...state.quizResults,
        [currentBlock?.id]: action.result, // 'correct' | 'incorrect' | 'skipped'
      }
      return {
        ...state,
        quizResults: updatedResults,
        playerState: PLAYER_STATE.PLAYING,
      }
    }

    case 'OPEN_DOUBT':
      return { ...state, playerState: PLAYER_STATE.DOUBT_OPEN }

    case 'CLOSE_DOUBT':
      return {
        ...state,
        playerState: state.playerState === PLAYER_STATE.DOUBT_OPEN
          ? PLAYER_STATE.PAUSED
          : state.playerState,
      }

    case 'SUBMIT_DOUBT':
      return { ...state, playerState: PLAYER_STATE.ANSWERING }

    case 'DOUBT_ANSWERED':
      return {
        ...state,
        playerState: PLAYER_STATE.PLAYING,
        lastDoubtAnswer: action.answer,
        doubtsAsked: state.doubtsAsked + 1,
      }

    case 'DOUBT_FAILED':
      return {
        ...state,
        playerState: PLAYER_STATE.PAUSED,
        lastDoubtAnswer: action.message || 'Could not reach AI right now. Please try again.',
      }

    case 'ERROR':
      return { ...state, error: action.message }

    case 'COMPLETE':
      return { ...state, playerState: PLAYER_STATE.COMPLETE }

    default:
      return state
  }
}

export function useLessonPlayer({ onBlockChange, onComplete } = {}) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const prevIndexRef = useRef(-1)

  // Notify parent when block changes
  useEffect(() => {
    if (prevIndexRef.current !== state.currentIndex) {
      prevIndexRef.current = state.currentIndex
      onBlockChange?.(state.currentIndex, state.blocks[state.currentIndex])
    }
  }, [state.currentIndex, state.blocks, onBlockChange])

  // Notify parent on completion
  useEffect(() => {
    if (state.playerState === PLAYER_STATE.COMPLETE) {
      onComplete?.({
        conceptsSeen: state.conceptsSeen,
        quizResults: state.quizResults,
        doubtsAsked: state.doubtsAsked,
        totalBlocks: state.blocks.length,
      })
    }
  }, [state.playerState, onComplete, state.conceptsSeen, state.quizResults, state.doubtsAsked, state.blocks.length])

  const load = useCallback((blocks, savedProgress = null) => {
    dispatch({
      type: 'LOAD',
      blocks,
      startIndex: savedProgress?.last_block_index || 0,
      conceptsSeen: savedProgress?.concepts_seen || [],
      quizResults: savedProgress?.quiz_results || {},
      doubtsAsked: savedProgress?.doubts_asked || 0,
    })
  }, [])

  const start = useCallback(() => dispatch({ type: 'START' }), [])
  const pause = useCallback(() => dispatch({ type: 'PAUSE' }), [])
  const resume = useCallback(() => dispatch({ type: 'RESUME' }), [])
  const advance = useCallback(() => dispatch({ type: 'ADVANCE' }), [])
  const answerQuiz = useCallback((result) => dispatch({ type: 'QUIZ_ANSWERED', result }), [])
  const openDoubt = useCallback(() => dispatch({ type: 'OPEN_DOUBT' }), [])
  const closeDoubt = useCallback(() => dispatch({ type: 'CLOSE_DOUBT' }), [])
  const submitDoubt = useCallback(() => dispatch({ type: 'SUBMIT_DOUBT' }), [])
  const doubtAnswered = useCallback((answer) => dispatch({ type: 'DOUBT_ANSWERED', answer }), [])
  const doubtFailed = useCallback((message) => dispatch({ type: 'DOUBT_FAILED', message }), [])

  const currentBlock = state.blocks[state.currentIndex] || null
  const isPlaying = state.playerState === PLAYER_STATE.PLAYING
  const isPaused = state.playerState === PLAYER_STATE.PAUSED
  const isWaitingQuiz = state.playerState === PLAYER_STATE.WAITING_QUIZ
  const isDoubtOpen = state.playerState === PLAYER_STATE.DOUBT_OPEN
  const isAnswering = state.playerState === PLAYER_STATE.ANSWERING
  const isComplete = state.playerState === PLAYER_STATE.COMPLETE
  const isIdle = state.playerState === PLAYER_STATE.IDLE
  const progress = state.blocks.length > 0
    ? Math.round((state.currentIndex / state.blocks.length) * 100)
    : 0

  return {
    // State
    playerState: state.playerState,
    currentBlock,
    currentIndex: state.currentIndex,
    blocks: state.blocks,
    conceptsSeen: state.conceptsSeen,
    quizResults: state.quizResults,
    doubtsAsked: state.doubtsAsked,
    lastDoubtAnswer: state.lastDoubtAnswer,
    error: state.error,
    progress,
    // Derived booleans
    isPlaying,
    isPaused,
    isWaitingQuiz,
    isDoubtOpen,
    isAnswering,
    isComplete,
    isIdle,
    // Actions
    load,
    start,
    pause,
    resume,
    advance,
    answerQuiz,
    openDoubt,
    closeDoubt,
    submitDoubt,
    doubtAnswered,
    doubtFailed,
  }
}
