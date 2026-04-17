'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Mic, MicOff, Volume2, VolumeX, Square, Loader2 } from 'lucide-react'

interface Props {
  onTranscribed: (text: string) => void
  disabled?: boolean
  color?: string
}

/**
 * Botón de voz que:
 *  1) Graba audio con MediaRecorder
 *  2) Envía a /api/ai/transcribe → Gemini transcribe
 *  3) Dispara onTranscribed con el texto
 *
 * Para respuestas de la IA: usa Web Speech API (speechSynthesis) para leer en voz alta.
 */
export function VoiceChat({ onTranscribed, disabled, color = '#f97316' }: Props) {
  const [recording, setRecording] = useState(false)
  const [processing, setProcessing] = useState(false)
  const mediaRecorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      chunks.current = []
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunks.current.push(e.data) }
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunks.current, { type: 'audio/webm' })
        if (blob.size < 1000) return // demasiado corto
        await transcribe(blob)
      }
      mr.start()
      mediaRecorder.current = mr
      setRecording(true)
    } catch (err) {
      console.error('Mic error:', err)
      alert('No se pudo acceder al micrófono. Verificá los permisos del navegador.')
    }
  }

  function stopRecording() {
    if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
      mediaRecorder.current.stop()
    }
    setRecording(false)
  }

  async function transcribe(blob: Blob) {
    setProcessing(true)
    try {
      const fd = new FormData()
      fd.append('file', blob, 'voice.webm')
      fd.append('context', 'ERP Mocciaro Soft — pregunta del usuario por voz')
      const res = await fetch('/api/ai/transcribe', { method: 'POST', body: fd })
      const j = await res.json()
      if (res.ok && j.text) {
        onTranscribed(j.text)
      } else {
        console.error('Transcription error:', j.error)
      }
    } catch (err) {
      console.error('Transcribe fetch error:', err)
    } finally {
      setProcessing(false)
    }
  }

  return (
    <button
      type="button"
      onClick={() => {
        if (recording) stopRecording()
        else startRecording()
      }}
      disabled={disabled || processing}
      className="p-2 rounded-lg transition-all"
      style={{
        background: recording ? '#ef4444' : processing ? '#6B7280' : `${color}20`,
        color: recording ? 'white' : processing ? 'white' : color,
        border: `1px solid ${recording ? '#ef4444' : processing ? '#6B7280' : color + '60'}`,
        animation: recording ? 'pulse 1.5s infinite' : 'none',
      }}
      title={recording ? 'Click para parar' : processing ? 'Transcribiendo...' : 'Mantené para hablar'}
    >
      {processing ? (
        <Loader2 className="w-5 h-5 animate-spin" />
      ) : recording ? (
        <Square className="w-5 h-5" />
      ) : (
        <Mic className="w-5 h-5" />
      )}
    </button>
  )
}

/**
 * Lee texto en voz alta usando Web Speech API (gratis, funciona en todos los browsers).
 */
export function speakText(text: string, lang = 'es-AR') {
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = lang
  utterance.rate = 1.0
  utterance.pitch = 1.0
  // Preferir voz español si hay disponible
  const voices = window.speechSynthesis.getVoices()
  const esVoice = voices.find((v) => v.lang.startsWith('es'))
  if (esVoice) utterance.voice = esVoice
  window.speechSynthesis.speak(utterance)
}

export function stopSpeaking() {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel()
}
