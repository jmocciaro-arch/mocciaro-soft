/**
 * POST /api/next-steps/execute
 *
 * Ejecuta una acción del Next-Step Suggester sobre un documento.
 * - Valida permiso via fn_can_execute_action (RPC).
 * - Loggea cada intento en tt_doc_actions_log (status='ok'|'error', duration_ms, payload).
 * - Si la acción muta el doc (convert/duplicate) → revalidateTag.
 */
import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth/require-admin'
import { ACTIONS_CATALOG } from '@/lib/next-steps/actions-catalog'
import { executeBodySchema, type ActionCode } from '@/lib/next-steps/types'
import { logger } from '@/lib/observability/logger'

export const runtime = 'nodejs'

interface DocSummary {
  id: string
  status: string
  company_id: string
  source: 'tt_documents' | 'tt_quotes'
}

async function loadQuotationSummary(docId: string): Promise<DocSummary | null> {
  const sb = await createServerClient()
  const { data: doc } = await sb
    .from('tt_documents')
    .select('id, status, company_id, doc_type')
    .eq('id', docId)
    .maybeSingle()
  if (doc && ['presupuesto', 'quotation'].includes(String(doc.doc_type))) {
    return {
      id: doc.id as string,
      status: (doc.status as string) ?? '',
      company_id: (doc.company_id as string) ?? '',
      source: 'tt_documents',
    }
  }
  const { data: legacy } = await sb
    .from('tt_quotes')
    .select('id, status, company_id')
    .eq('id', docId)
    .maybeSingle()
  if (legacy) {
    return {
      id: legacy.id as string,
      status: (legacy.status as string) ?? '',
      company_id: (legacy.company_id as string) ?? '',
      source: 'tt_quotes',
    }
  }
  return null
}

async function resolveCompanyId(
  req: NextRequest,
  ttUserId: string
): Promise<string | null> {
  const headerCompany = req.headers.get('x-company-id')
  if (headerCompany) return headerCompany
  const sb = await createServerClient()
  const { data: uc } = await sb
    .from('tt_user_companies')
    .select('company_id, is_default')
    .eq('user_id', ttUserId)
    .order('is_default', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (uc?.company_id as string) ?? null
}

interface LogArgs {
  companyId: string
  userId: string
  docType: string
  docId: string
  actionCode: ActionCode
  status: 'ok' | 'error'
  payload: Record<string, unknown>
  errorMessage?: string | null
  durationMs: number
}

async function writeLog(args: LogArgs): Promise<string | null> {
  const sb = await createServerClient()
  const { data, error } = await sb
    .from('tt_doc_actions_log')
    .insert({
      company_id: args.companyId,
      user_id: args.userId,
      doc_type: args.docType,
      doc_id: args.docId,
      action_code: args.actionCode,
      status: args.status,
      payload: args.payload,
      error_message: args.errorMessage ?? null,
      duration_ms: args.durationMs,
    })
    .select('id')
    .maybeSingle()
  if (error) {
    logger.warn('[next-steps/execute] log insert failed:', error.message)
    return null
  }
  return (data?.id as string) ?? null
}

interface ActionResult {
  redirect_to?: string
  pdf_url?: string
  sales_order_id?: string
  new_doc_id?: string
  number?: string
  mutated?: boolean
  [key: string]: unknown
}

async function runAction(
  code: ActionCode,
  docId: string,
  payload: Record<string, unknown>,
  origin: string,
  cookieHeader: string,
  companyId: string
): Promise<ActionResult> {
  switch (code) {
    case 'preview_pdf':
      return { pdf_url: `/api/documents/${docId}/pdf` }

    case 'send_email': {
      // Reusa /api/documents/[id]/send — adapta payload al contrato de S8
      const res = await fetch(`${origin}/api/documents/${docId}/send`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: cookieHeader,
        },
        body: JSON.stringify({
          channel: 'email',
          companyId,
          recipients: payload.recipients,
          subject: payload.subject,
          body_html: payload.body_html,
          attachments: payload.attachments ?? ['pdf'],
        }),
      })
      if (!res.ok) {
        const txt = await res.text().catch(() => '')
        throw new Error(`send falló (${res.status}): ${txt.slice(0, 200)}`)
      }
      const json = (await res.json()) as Record<string, unknown>
      return { ...json, mutated: false }
    }

    case 'duplicate_for_client': {
      const res = await fetch(`${origin}/api/quotations/duplicate`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: cookieHeader,
        },
        body: JSON.stringify({
          source_doc_id: docId,
          target_client_id: payload.target_client_id,
        }),
      })
      if (!res.ok) {
        const txt = await res.text().catch(() => '')
        throw new Error(`duplicate falló (${res.status}): ${txt.slice(0, 200)}`)
      }
      const json = (await res.json()) as { new_doc_id?: string; redirect_to?: string }
      return {
        new_doc_id: json.new_doc_id,
        redirect_to: json.redirect_to,
        mutated: true,
      }
    }

    case 'convert_to_sales_order': {
      const res = await fetch(`${origin}/api/sales-orders/from-quotation`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: cookieHeader,
        },
        body: JSON.stringify({ source_doc_id: docId }),
      })
      if (!res.ok) {
        const txt = await res.text().catch(() => '')
        throw new Error(`convert falló (${res.status}): ${txt.slice(0, 200)}`)
      }
      const json = (await res.json()) as {
        sales_order_id?: string
        number?: string
        redirect_to?: string
      }
      return {
        sales_order_id: json.sales_order_id,
        number: json.number,
        redirect_to: json.redirect_to ?? '/ventas?tab=pedidos',
        mutated: true,
      }
    }

    case 'schedule_followup':
    case 'add_internal_note':
      throw new Error('Acción no disponible en F1')

    default: {
      const _exhaustive: never = code
      throw new Error(`Acción desconocida: ${String(_exhaustive)}`)
    }
  }
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now()
  let parsedBody: ReturnType<typeof executeBodySchema.safeParse> | null = null

  try {
    const raw = (await req.json().catch(() => null)) as unknown
    parsedBody = executeBodySchema.safeParse(raw)
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: 'Body inválido', details: parsedBody.error.flatten() },
        { status: 400 }
      )
    }
    const { doc_type, doc_id, action_code, payload } = parsedBody.data

    // Validar payload específico del action
    const entry = ACTIONS_CATALOG[action_code]
    const payloadParsed = entry.payloadSchema.safeParse(payload ?? {})
    if (!payloadParsed.success) {
      return NextResponse.json(
        { error: 'Payload inválido', details: payloadParsed.error.flatten() },
        { status: 400 }
      )
    }

    const guard = await requireAuth()
    if (!guard.ok) return guard.response
    const { authId, ttUserId } = guard

    const companyId = await resolveCompanyId(req, ttUserId)
    if (!companyId) {
      return NextResponse.json(
        { error: 'No se pudo resolver la empresa activa' },
        { status: 400 }
      )
    }

    // Doc summary + access
    const summary = await loadQuotationSummary(doc_id)
    if (!summary) {
      return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 })
    }
    if (summary.company_id !== companyId) {
      return NextResponse.json({ error: 'Sin acceso a este documento' }, { status: 403 })
    }

    // Permiso
    const sb = await createServerClient()
    const { data: allowed } = await sb.rpc('fn_can_execute_action', {
      p_user_id: authId,
      p_company_id: companyId,
      p_action: action_code,
    })
    if (!allowed) {
      await writeLog({
        companyId,
        userId: authId,
        docType: doc_type,
        docId: doc_id,
        actionCode: action_code,
        status: 'error',
        payload: payloadParsed.data as Record<string, unknown>,
        errorMessage: 'permission_denied',
        durationMs: Date.now() - startedAt,
      })
      return NextResponse.json({ error: 'Sin permiso para esta acción' }, { status: 403 })
    }

    // Ejecutar
    const origin = req.nextUrl.origin
    const cookieHeader = req.headers.get('cookie') ?? ''
    let result: ActionResult
    try {
      result = await runAction(
        action_code,
        doc_id,
        payloadParsed.data as Record<string, unknown>,
        origin,
        cookieHeader,
        companyId
      )
    } catch (actionErr) {
      const durationMs = Date.now() - startedAt
      const errMsg = (actionErr as Error).message
      const logId = await writeLog({
        companyId,
        userId: authId,
        docType: doc_type,
        docId: doc_id,
        actionCode: action_code,
        status: 'error',
        payload: payloadParsed.data as Record<string, unknown>,
        errorMessage: errMsg,
        durationMs,
      })
      return NextResponse.json(
        { ok: false, action_code, log_id: logId, error: errMsg },
        { status: 500 }
      )
    }

    const durationMs = Date.now() - startedAt
    const logId = await writeLog({
      companyId,
      userId: authId,
      docType: doc_type,
      docId: doc_id,
      actionCode: action_code,
      status: 'ok',
      payload: payloadParsed.data as Record<string, unknown>,
      durationMs,
    })

    if (result.mutated) {
      // Next 16 requiere un profile/CacheLifeConfig — expire:0 purga ya.
      revalidateTag(`next-steps-${doc_id}`, { expire: 0 })
    }

    return NextResponse.json({
      ok: true,
      action_code,
      log_id: logId,
      result,
    })
  } catch (err) {
    logger.error('[POST /api/next-steps/execute] error:', err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
