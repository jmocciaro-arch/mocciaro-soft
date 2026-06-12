// ============================================================================
// GET /api/tracking/[id]
//
// Pixel transparente 1x1 para tracking de aperturas de email.
// El [id] es el tracking_id del envío en tt_document_sends.
//
// Cada hit incrementa open_count atómicamente vía RPC tt_increment_send_open
// y devuelve un PNG 1x1 transparente con headers no-cache.
//
// Nota: si el tracking_id no existe, devolvemos igual el pixel (no querés
// romper el email del cliente por un id corrupto).
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

// PNG transparente 1x1 — generado con: pngcrush + base64
const TRANSPARENT_PIXEL_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII='

const PIXEL_BUFFER = Buffer.from(TRANSPARENT_PIXEL_BASE64, 'base64')

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id: trackingId } = await params

  if (trackingId) {
    try {
      const admin = getAdminClient()
      // Atomic increment via RPC — silencioso si la fila no existe
      await admin.rpc('tt_increment_send_open', { p_tracking_id: trackingId })
    } catch (err) {
      // Best-effort — no rompemos la respuesta del pixel
      console.warn('[tracking] increment failed:', err)
    }
  }

  // Copia a ArrayBuffer "puro" para BlobPart (Buffer.buffer es ArrayBufferLike)
  const ab = new ArrayBuffer(PIXEL_BUFFER.byteLength)
  new Uint8Array(ab).set(PIXEL_BUFFER)

  return new NextResponse(ab, {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Content-Length': String(PIXEL_BUFFER.length),
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      Pragma: 'no-cache',
      Expires: '0',
    },
  })
}
