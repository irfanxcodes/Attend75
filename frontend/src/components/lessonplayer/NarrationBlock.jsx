/**
 * NarrationBlock — Animated text with Gemini Neural Voice audio.
 *
 * Priority:
 *   1. Pre-generated Gemini TTS audio (WAV from backend) — best quality
 *   2. Web Speech Synthesis API — fallback if audio not yet ready
 *
 * Text animates word-by-word in sync with audio duration.
 */

import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useWebSpeech } from '../../hooks/useWebSpeech'
import { getBlockAudioUrl } from '../../services/lessonApi'
import useAppStore from '../../hooks/useAppStore'

export function NarrationBlock({ block, isActive, onComplete }) {
  const { speak, stopSpeaking, isTTSSupported } = useWebSpeech()
  const { state: appState } = useAppStore()
  const token = appState.session?.token

  const [visibleWords, setVisibleWords] = useState([])
  const [isDone, setIsDone] = useState(false)
  const audioRef = useRef(null)
  const animTimerRef = useRef(null)
  const words = (block.content || '').split(' ').filter(Boolean)

  const stopAll = () => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    stopSpeaking()
    if (animTimerRef.current) clearInterval(animTimerRef.current)
  }

  const animateWords = (durationMs) => {
    // Spread word appearances evenly across the audio duration
    const msPerWord = durationMs / Math.max(words.length, 1)
    let idx = 0
    animTimerRef.current = setInterval(() => {
      idx++
      setVisibleWords(words.slice(0, idx))
      if (idx >= words.length) {
        clearInterval(animTimerRef.current)
        setIsDone(true)
      }
    }, Math.max(msPerWord, 60))
  }

  useEffect(() => {
    if (!isActive) return

    setVisibleWords([])
    setIsDone(false)

    const tryGeminiAudio = () => {
      if (!token) return false

      const audioUrl = getBlockAudioUrl(block.id, token)
      const audio = new Audio(audioUrl)
      audioRef.current = audio

      audio.onloadedmetadata = () => {
        const durationMs = (audio.duration || 3) * 1000
        animateWords(durationMs)
        audio.play().catch(() => {
          // Autoplay blocked — fall back to Web Speech
          stopAll()
          tryWebSpeech()
        })
      }

      audio.onended = () => {
        setVisibleWords(words)
        setIsDone(true)
        onComplete?.()
      }

      audio.onerror = () => {
        // Audio file not ready — fall back to Web Speech
        tryWebSpeech()
      }

      return true
    }

    const tryWebSpeech = () => {
      const voiceText = block.voice_text || block.content
      if (isTTSSupported && voiceText) {
        speak(voiceText, {
          onEnd: () => {
            setVisibleWords(words)
            setIsDone(true)
            onComplete?.()
          },
        })
        // Animate words for approximate TTS duration
        const estimatedMs = (voiceText.split(' ').length / 2.2) * 1000
        animateWords(estimatedMs)
      } else {
        // No audio available — just animate words with fixed timing
        let idx = 0
        animTimerRef.current = setInterval(() => {
          idx++
          setVisibleWords(words.slice(0, idx))
          if (idx >= words.length) {
            clearInterval(animTimerRef.current)
            setIsDone(true)
            setTimeout(() => onComplete?.(), 500)
          }
        }, 80)
      }
    }

    tryGeminiAudio()

    return () => stopAll()
  }, [isActive, block.id]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="py-3">
      <p className="text-[#F4F1FF] text-base leading-relaxed font-light">
        {visibleWords.map((word, i) => (
          <motion.span
            key={`${block.id}-${i}`}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15 }}
            className="inline-block mr-1"
          >
            {word}
          </motion.span>
        ))}
        {!isDone && isActive && (
          <motion.span
            className="inline-block w-0.5 h-4 bg-[#FF916C] ml-0.5 align-middle"
            animate={{ opacity: [1, 0] }}
            transition={{ duration: 0.6, repeat: Infinity }}
          />
        )}
      </p>
    </div>
  )
}
