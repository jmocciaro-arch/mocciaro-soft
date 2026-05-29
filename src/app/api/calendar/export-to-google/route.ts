/**
 * SESIÓN 11 — Fix 6
 *
 * MVP unidireccional: ERP → Google Calendar.
 * Toma todos los eventos de tt_sat_calendar_events en el rango especificado
 * (default: mes en curso) y los inserta en el primary calendar del admin que
 * tenga conectada la cuenta Google.
 *
 * TODO sesión futura: sync bidireccional. Hooks pendientes:
 *   - Pull desde Google Calendar (eventos creados ahí → tt_sat_calendar_events)
 *   - Webhook push notifications de Google para sync en near real-time
 *   - Manejar update/delete (upsert por external_id, soft-delete si fue
 *     borrado en Google)
 *   - Persistir external_id en tt_sat_calendar_events (columna a agregar)
 */

import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'
import { getGmailTokens, setGmailTokens } from '@/lib/gmail-tokens'
import { requireAdmin } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'

async function getOAuth2Client() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  )
  const tokens = await getGmailTokens()
  if (!tokens) return null
  oauth2Client.setCredentials(tokens)
  oauth2Client.on('tokens', (newTokens) => {
    void (async () => {
      try {
        const existing = (await getGmailTokens()) || {}
        await setGmailTokens({ ...existing, ...newTokens })
      } catch { /* non-blocking */ }
    })()
  })
  return oauth2Client
}

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export async function POST(request: NextRequest) {
  // Auth: solo admins (misma política que google/route.ts)
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response

  const oauth2Client = await getOAuth2Client()
  if (!oauth2Client) {
    return NextResponse.json(
      { error: 'google_not_connected', redirect: '/api/auth/google' },
      { status: 401 }
    )
  }

  let body: { from?: string; to?: string } = {}
  try {
    body = await request.json()
  } catch { /* body opcional */ }

  const sb = getServiceClient()

  const now = new Date()
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const defaultTo = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString()

  const from = body.from || defaultFrom
  const to = body.to || defaultTo

  const { data: events, error: evErr } = await sb
    .from('tt_sat_calendar_events')
    .select('id, title, start_date, end_date, all_day, notes, status')
    .gte('start_date', from)
    .lte('start_date', to)

  if (evErr) {
    return NextResponse.json({ error: 'db_error', message: evErr.message }, { status: 500 })
  }
  if (!events || events.length === 0) {
    return NextResponse.json({ ok: true, exported: 0, skipped: 0, range: { from, to } })
  }

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client })

  let exported = 0
  let skipped = 0
  const errors: Array<{ id: string; message: string }> = []

  for (const ev of events) {
    try {
      if ((ev.status as string) === 'cancelled') { skipped++; continue }

      const startISO = ev.start_date as string
      const endISO = (ev.end_date as string) || startISO

      const requestBody: Record<string, unknown> = {
        summary: (ev.title as string) || 'Evento ERP',
        description: ((ev.notes as string) || '') + `\n\n[ERP ref: ${ev.id}]`,
      }

      if (ev.all_day) {
        // Para all-day Google espera YYYY-MM-DD en date (no dateTime)
        requestBody.start = { date: startISO.slice(0, 10) }
        requestBody.end = { date: endISO.slice(0, 10) }
      } else {
        requestBody.start = { dateTime: startISO }
        requestBody.end = { dateTime: endISO }
      }

      await calendar.events.insert({
        calendarId: 'primary',
        requestBody,
      })
      exported++
    } catch (e) {
      errors.push({ id: ev.id as string, message: (e as Error).message })
    }
  }

  return NextResponse.json({
    ok: true,
    exported,
    skipped,
    total: events.length,
    errors: errors.length > 0 ? errors : undefined,
    range: { from, to },
  })
}
