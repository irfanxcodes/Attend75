/**
 * useWebSpeech — TTS + STT abstraction
 *
 * speak(text, onEnd)  → reads text aloud via Web Speech Synthesis API
 * listen(onResult)    → listens for voice input via Web Speech Recognition API
 * stopSpeaking()      → cancels current speech
 * stopListening()     → stops active recognition
 * isSupported         → true if browser supports both APIs
 */

import { useCallback, useEffect, useRef, useState } from 'react'

const SUPPORTED_TTS = typeof window !== 'undefined' && 'speechSynthesis' in window
const SUPPORTED_STT =
  typeof window !== 'undefined' &&
  ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)

export function useWebSpeech() {
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const recognitionRef = useRef(null)
  const utteranceRef = useRef(null)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (SUPPORTED_TTS) window.speechSynthesis.cancel()
      if (recognitionRef.current) {
        try { recognitionRef.current.stop() } catch {}
      }
    }
  }, [])

  const speak = useCallback((text, { onEnd, onError, rate = 0.95, pitch = 1.0 } = {}) => {
    if (!SUPPORTED_TTS || !text) {
      onEnd?.()
      return
    }

    window.speechSynthesis.cancel()

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = rate
    utterance.pitch = pitch
    utterance.lang = 'en-IN'

    // Prefer an Indian English voice if available
    const voices = window.speechSynthesis.getVoices()
    const preferred = voices.find(v =>
      v.lang === 'en-IN' || v.name.includes('India') || v.name.includes('Rishi')
    ) || voices.find(v => v.lang.startsWith('en'))
    if (preferred) utterance.voice = preferred

    utterance.onstart = () => setIsSpeaking(true)
    utterance.onend = () => {
      setIsSpeaking(false)
      onEnd?.()
    }
    utterance.onerror = (e) => {
      setIsSpeaking(false)
      // 'interrupted' is not a real error — it happens when we cancel intentionally
      if (e.error !== 'interrupted') onError?.(e.error)
    }

    utteranceRef.current = utterance
    window.speechSynthesis.speak(utterance)
  }, [])

  const stopSpeaking = useCallback(() => {
    if (SUPPORTED_TTS) {
      window.speechSynthesis.cancel()
      setIsSpeaking(false)
    }
  }, [])

  const listen = useCallback(({ onResult, onError, continuous = false } = {}) => {
    if (!SUPPORTED_STT) {
      onError?.('Speech recognition not supported in this browser')
      return
    }

    // Stop any existing recognition
    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch {}
    }

    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition
    const recognition = new SpeechRec()
    recognition.lang = 'en-IN'
    recognition.continuous = continuous
    recognition.interimResults = false
    recognition.maxAlternatives = 1

    recognition.onstart = () => setIsListening(true)
    recognition.onend = () => setIsListening(false)

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map(r => r[0].transcript)
        .join(' ')
        .trim()
      if (transcript) onResult?.(transcript)
    }

    recognition.onerror = (event) => {
      setIsListening(false)
      if (event.error !== 'aborted') onError?.(event.error)
    }

    recognitionRef.current = recognition

    try {
      recognition.start()
    } catch (err) {
      setIsListening(false)
      onError?.(err.message)
    }
  }, [])

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch {}
      setIsListening(false)
    }
  }, [])

  return {
    speak,
    stopSpeaking,
    listen,
    stopListening,
    isSpeaking,
    isListening,
    isTTSSupported: SUPPORTED_TTS,
    isSTTSupported: SUPPORTED_STT,
    isSupported: SUPPORTED_TTS || SUPPORTED_STT,
  }
}
