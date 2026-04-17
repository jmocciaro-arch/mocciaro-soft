'use client'

import { useRef, useEffect, useState, useCallback } from 'react'

interface SignaturePadProps {
  onSign: (base64: string) => void
  width?: number
  height?: number
}

export function SignaturePad({ onSign, width = 480, height = 160 }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [isEmpty, setIsEmpty] = useState(true)
  const lastPos = useRef<{ x: number; y: number } | null>(null)

  // Inicializar canvas con fondo blanco
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = '#1a1a1a'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [])

  function getPos(e: MouseEvent | Touch, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    return {
      x: ((e as MouseEvent).clientX ?? (e as Touch).clientX) * scaleX - rect.left * scaleX,
      y: ((e as MouseEvent).clientY ?? (e as Touch).clientY) * scaleY - rect.top * scaleY,
    }
  }

  const startDrawing = useCallback((x: number, y: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    setIsDrawing(true)
    setIsEmpty(false)
    lastPos.current = { x, y }
    ctx.beginPath()
    ctx.moveTo(x, y)
  }, [])

  const draw = useCallback((x: number, y: number) => {
    if (!isDrawing) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx || !lastPos.current) return
    ctx.beginPath()
    ctx.moveTo(lastPos.current.x, lastPos.current.y)
    ctx.lineTo(x, y)
    ctx.stroke()
    lastPos.current = { x, y }
  }, [isDrawing])

  const stopDrawing = useCallback(() => {
    setIsDrawing(false)
    lastPos.current = null
  }, [])

  // Eventos mouse
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    function onMouseDown(e: MouseEvent) {
      e.preventDefault()
      const pos = getPos(e, canvas!)
      startDrawing(pos.x, pos.y)
    }
    function onMouseMove(e: MouseEvent) {
      if (!isDrawing) return
      e.preventDefault()
      const pos = getPos(e, canvas!)
      draw(pos.x, pos.y)
    }
    function onMouseUp() { stopDrawing() }

    canvas.addEventListener('mousedown', onMouseDown)
    canvas.addEventListener('mousemove', onMouseMove)
    canvas.addEventListener('mouseup', onMouseUp)
    canvas.addEventListener('mouseleave', onMouseUp)

    return () => {
      canvas.removeEventListener('mousedown', onMouseDown)
      canvas.removeEventListener('mousemove', onMouseMove)
      canvas.removeEventListener('mouseup', onMouseUp)
      canvas.removeEventListener('mouseleave', onMouseUp)
    }
  }, [isDrawing, startDrawing, draw, stopDrawing])

  // Eventos touch
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    function onTouchStart(e: TouchEvent) {
      e.preventDefault()
      const touch = e.touches[0]
      const pos = getPos(touch, canvas!)
      startDrawing(pos.x, pos.y)
    }
    function onTouchMove(e: TouchEvent) {
      e.preventDefault()
      const touch = e.touches[0]
      const pos = getPos(touch, canvas!)
      draw(pos.x, pos.y)
    }
    function onTouchEnd() { stopDrawing() }

    canvas.addEventListener('touchstart', onTouchStart, { passive: false })
    canvas.addEventListener('touchmove', onTouchMove, { passive: false })
    canvas.addEventListener('touchend', onTouchEnd)

    return () => {
      canvas.removeEventListener('touchstart', onTouchStart)
      canvas.removeEventListener('touchmove', onTouchMove)
      canvas.removeEventListener('touchend', onTouchEnd)
    }
  }, [isDrawing, startDrawing, draw, stopDrawing])

  function clear() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    setIsEmpty(true)
    setIsDrawing(false)
    lastPos.current = null
  }

  function confirm() {
    const canvas = canvasRef.current
    if (!canvas || isEmpty) return
    const base64 = canvas.toDataURL('image/png')
    onSign(base64)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
      <div
        style={{
          border: '2px dashed #d1d5db',
          borderRadius: '8px',
          overflow: 'hidden',
          cursor: 'crosshair',
          touchAction: 'none',
          background: '#fff',
          width: '100%',
          maxWidth: width,
        }}
      >
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          style={{ display: 'block', width: '100%', height: 'auto', touchAction: 'none' }}
        />
      </div>
      <p style={{ fontSize: '12px', color: '#9ca3af', margin: 0 }}>
        Dibujá tu firma arriba con el mouse o dedo
      </p>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          type="button"
          onClick={clear}
          style={{
            padding: '8px 16px',
            borderRadius: '6px',
            border: '1px solid #d1d5db',
            background: '#fff',
            color: '#374151',
            fontSize: '14px',
            cursor: 'pointer',
          }}
        >
          Limpiar
        </button>
        <button
          type="button"
          onClick={confirm}
          disabled={isEmpty}
          style={{
            padding: '8px 16px',
            borderRadius: '6px',
            border: 'none',
            background: isEmpty ? '#d1d5db' : '#16a34a',
            color: '#fff',
            fontSize: '14px',
            cursor: isEmpty ? 'not-allowed' : 'pointer',
            fontWeight: 600,
          }}
        >
          Confirmar firma
        </button>
      </div>
    </div>
  )
}
