'use client'

import { useState, useRef, useCallback } from 'react'
import { Mic, MicOff, Loader2, CheckCircle, X, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface TranscribeResult {
  text: string
  structured?: Record<string, string | null>
}

interface VoiceRecorderProps {
  onTranscribed: (text: string, structured: Record<string, string>) => void
  context?: string
  disabled?: boolean
}

const FIELD_LABELS: Record<string, string> = {
  tecnico: 'Técnico',
  motivo_ingreso: 'Motivo de ingreso',
  condicion_visual: 'Condición visual',
  observaciones: 'Observaciones',
}

export function VoiceRecorder({ onTranscribed, context = 'SAT maintenance form', disabled }: VoiceRecorderProps) {
  const [recording, setRecording] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<TranscribeResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const startRecording = useCallback(async () => {
    if (disabled) return
    setError(null)
    setResult(null)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      chunksRef.current = []

      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
      const recorder = new MediaRecorder(stream, { mimeType })

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data)
      }

      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: mimeType })
        streamRef.current?.getTracks().forEach((t) => t.stop())
        streamRef.current = null
        await transcribeAudio(blob, mimeType)
      }

      recorder.start()
      recorderRef.current = recorder
      setRecording(true)
      setRecordingTime(0)

      timerRef.current = setInterval(() => {
        setRecordingTime((t) => {
          if (t >= 120) {
            stopRecording()
            return 120
          }
          return t + 1
        })
      }, 1000)
    } catch (e) {
      setError(`No se pudo acceder al micrófono: ${(e as Error).message}`)
    }
  }, [disabled]) // eslint-disable-line react-hooks/exhaustive-deps

  const stopRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop()
    }
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    setRecording(false)
  }, [])

  const transcribeAudio = async (blob: Blob, mimeType: string) => {
    setLoading(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('file', new File([blob], `audio.${mimeType.includes('webm') ? 'webm' : 'mp4'}`, { type: mimeType }))
      formData.append('context', context)

      const res = await fetch('/api/ai/transcribe', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json() as TranscribeResult & { error?: string }
      if (!res.ok) throw new Error(data.error || 'Error al transcribir')

      setResult(data)
      setExpanded(true)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const handleApply = () => {
    if (!result) return
    const structured: Record<string, string> = {}
    if (result.structured) {
      for (const [key, val] of Object.entries(result.structured)) {
        if (val) structured[key] = val
      }
    }
    onTranscribed(result.text, structured)
    setResult(null)
    setExpanded(false)
  }

  const formatTime = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  return (
    <div className="space-y-2">
      {/* Botón principal */}
      <div className="flex items-center gap-2">
        {!recording ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={startRecording}
            disabled={disabled || loading}
            className="flex items-center gap-2"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Mic className="w-4 h-4 text-orange-400" />
            )}
            {loading ? 'Transcribiendo...' : '🎤 Dictá la ficha'}
          </Button>
        ) : (
          <Button
            type="button"
            variant="danger"
            size="sm"
            onClick={stopRecording}
            className="flex items-center gap-2 animate-pulse"
          >
            <MicOff className="w-4 h-4" />
            Detener — {formatTime(recordingTime)}
          </Button>
        )}

        {result && (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="flex items-center gap-1 text-xs text-orange-400 hover:text-orange-300"
          >
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            Ver transcripción
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          <X className="w-3 h-3 shrink-0" />
          {error}
        </div>
      )}

      {/* Resultado */}
      {result && expanded && (
        <div
          className="rounded-lg border p-3 space-y-3 text-sm"
          style={{ background: '#151821', borderColor: '#2A3040' }}
        >
          {/* Transcripción */}
          <div>
            <div className="text-[10px] uppercase text-[#9CA3AF] font-bold mb-1">Transcripción</div>
            <p className="text-[#F0F2F5] text-xs leading-relaxed">{result.text}</p>
          </div>

          {/* Campos estructurados */}
          {result.structured && Object.keys(result.structured).some((k) => result.structured![k]) && (
            <div>
              <div className="text-[10px] uppercase text-[#9CA3AF] font-bold mb-2">Campos detectados</div>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(result.structured).map(([key, val]) => {
                  if (!val) return null
                  return (
                    <div
                      key={key}
                      className="rounded p-2"
                      style={{ background: '#0F1218', border: '1px solid #2A3040' }}
                    >
                      <div className="text-[9px] text-orange-400 font-bold uppercase">{FIELD_LABELS[key] || key}</div>
                      <div className="text-xs mt-0.5 text-[#F0F2F5]">{val}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Acciones */}
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="primary" size="sm" onClick={handleApply}>
              <CheckCircle className="w-3 h-3" /> Aplicar al formulario
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => { setResult(null); setExpanded(false) }}>
              <X className="w-3 h-3" /> Descartar
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
