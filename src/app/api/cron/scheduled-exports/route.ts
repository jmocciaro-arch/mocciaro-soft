/**
 * Cron + manual run para tt_scheduled_exports.
 *
 * GET/POST con CRON_SECRET → corre todos los que tienen next_run_at <= now().
 * POST con body `{ exportId }` → corre uno solo (manual).
 *
 * Para cada export:
 *   - Lee filas según target_table + filter
 *   - Genera el archivo según format
 *   - Lo entrega según delivery_type:
 *       email → Resend (RESEND_API_KEY)
 *       webhook → fetch POST con el archivo
 *       storage → Supabase Storage bucket "scheduled-exports"
 *   - Actualiza last_run_at + last_run_status + next_run_at
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'
import { parseExpression } from 'cron-parser'
import { Resend } from 'resend'
import { wrapCronHandler } from '@/lib/observability/with-cron-logging'

export const runtime = 'nodejs'
export const maxDuration = 300

interface ExportRow {
  id: string
  company_id: string | null
  name: string
  target_table: string
  format: 'csv' | 'xlsx' | 'json' | 'xml'
  filter: Record<string, unknown> | null
  schedule_cron: string
  delivery_type: 'email' | 'webhook' | 'storage'
  delivery_config: Record<string, unknown>
  is_active: boolean
}

const handler = async (req: NextRequest): Promise<NextResponse> => {
  let exportId: string | null = null
  if (req.method === 'POST') {
    try {
      const body = await req.json()
      exportId = body?.exportId ?? null
    } catch {/* no body */}
  }

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  let q = sb.from('tt_scheduled_exports').select('*').eq('is_active', true)
  if (exportId) {
    q = q.eq('id', exportId)
  } else {
    q = q.lte('next_run_at', new Date().toISOString())
  }

  const { data: list, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const exports_ = (list || []) as ExportRow[]
  const results: Array<{ id: string; ok: boolean; error?: string }> = []

  for (const e of exports_) {
    try {
      await runOne(sb as SbClient, e)
      const next = nextCronTime(e.schedule_cron)
      await sb.from('tt_scheduled_exports').update({
        last_run_at: new Date().toISOString(),
        last_run_status: 'success',
        last_run_error: null,
        next_run_at: next,
      }).eq('id', e.id)
      results.push({ id: e.id, ok: true })
    } catch (err) {
      const msg = (err as Error).message
      const next = nextCronTime(e.schedule_cron)
      await sb.from('tt_scheduled_exports').update({
        last_run_at: new Date().toISOString(),
        last_run_status: 'failed',
        last_run_error: msg,
        next_run_at: next,
      }).eq('id', e.id)
      results.push({ id: e.id, ok: false, error: msg })
    }
  }

  return NextResponse.json({ ran: results.length, results })
}

function nextCronTime(expr: string): string {
  try {
    const it = parseExpression(expr)
    return it.next().toDate().toISOString()
  } catch {
    // Fallback: 24 horas
    return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  }
}

type SbClient = ReturnType<typeof createClient>

async function runOne(
  sb: SbClient,
  e: ExportRow
): Promise<void> {
  // 1. Fetch rows
  let q = sb.from(e.target_table).select('*').limit(50000)
  for (const [k, v] of Object.entries(e.filter || {})) {
    if (v == null || v === '') continue
    q = q.eq(k, v)
  }
  const { data: rows, error } = await q
  if (error) throw new Error(`fetch: ${error.message}`)

  const records = (rows || []) as Record<string, unknown>[]
  if (records.length === 0) {
    // Aún así corremos delivery para reportar 0 filas
  }

  // 2. Generate file
  let content: string | Buffer
  let mimeType: string
  let extension: string

  if (e.format === 'csv') {
    content = toCsv(records)
    mimeType = 'text/csv'
    extension = 'csv'
  } else if (e.format === 'json') {
    content = JSON.stringify(records, null, 2)
    mimeType = 'application/json'
    extension = 'json'
  } else if (e.format === 'xml') {
    content = toXml(records, e.target_table)
    mimeType = 'application/xml'
    extension = 'xml'
  } else {
    // xlsx
    const ws = XLSX.utils.json_to_sheet(records)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, e.target_table.slice(0, 30))
    content = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
    mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    extension = 'xlsx'
  }

  const filename = `${e.name.replace(/[^a-zA-Z0-9_-]/g, '_')}_${new Date().toISOString().slice(0, 10)}.${extension}`

  // 3. Deliver
  if (e.delivery_type === 'email') {
    const recipients = (e.delivery_config?.recipients as string[]) || []
    if (recipients.length === 0) throw new Error('email: sin destinatarios')
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) throw new Error('RESEND_API_KEY no configurado')
    const resend = new Resend(apiKey)
    const buf = typeof content === 'string' ? Buffer.from(content, 'utf-8') : content
    const from = (e.delivery_config?.from as string) || 'reports@torquetools.com'
    await resend.emails.send({
      from,
      to: recipients,
      subject: `Export: ${e.name}`,
      text: `Adjunto el export "${e.name}" con ${records.length} filas.`,
      attachments: [{ filename, content: buf }],
    })
  } else if (e.delivery_type === 'webhook') {
    const url = e.delivery_config?.url as string
    if (!url) throw new Error('webhook: sin url')
    const buf = typeof content === 'string' ? content : content.toString('base64')
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        export_name: e.name,
        target_table: e.target_table,
        format: e.format,
        filename,
        row_count: records.length,
        content: buf,
        encoding: typeof content === 'string' ? 'utf-8' : 'base64',
      }),
    })
    if (!res.ok) throw new Error(`webhook: HTTP ${res.status}`)
  } else if (e.delivery_type === 'storage') {
    const bucket = (e.delivery_config?.bucket as string) || 'scheduled-exports'
    const path = (e.delivery_config?.path as string) || filename
    const buf = typeof content === 'string' ? Buffer.from(content, 'utf-8') : content
    const { error: upErr } = await sb.storage.from(bucket).upload(path, buf, {
      contentType: mimeType,
      upsert: true,
    })
    if (upErr) throw new Error(`storage: ${upErr.message}`)
  }
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return ''
  const headers = Object.keys(rows[0])
  const escape = (v: unknown): string => {
    if (v == null) return ''
    const s = typeof v === 'string' ? v : JSON.stringify(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [headers.join(','), ...rows.map(r => headers.map(h => escape(r[h])).join(','))].join('\n')
}

function toXml(rows: Record<string, unknown>[], tag: string): string {
  const escapeXml = (s: string) => s.replace(/[<>&"']/g, c => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;',
  }[c]!))
  const inner = rows.map(r => {
    const cells = Object.entries(r).map(([k, v]) => {
      const sv = v == null ? '' : escapeXml(typeof v === 'string' ? v : JSON.stringify(v))
      return `    <${k}>${sv}</${k}>`
    }).join('\n')
    return `  <row>\n${cells}\n  </row>`
  }).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<${tag}>\n${inner}\n</${tag}>`
}

export const GET = wrapCronHandler('scheduled-exports', handler)
export const POST = wrapCronHandler('scheduled-exports', handler)
