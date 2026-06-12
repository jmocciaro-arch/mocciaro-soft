/**
 * GET /api/next-steps?doc_type=quotation&doc_id=uuid
 *
 * Devuelve las acciones disponibles para un documento + la sugerida (★).
 * - Filtra por permisos del usuario via fn_can_execute_action (RPC).
 * - Acciones disabled (F2/F3) se devuelven con enabled=false (placeholders).
 * - Cache server-side 30s con tag `next-steps-${doc_id}` (revalidate via execute).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth/require-admin'
import { ACTIONS_CATALOG } from '@/lib/next-steps/actions-catalog'
import { suggestPrimary } from '@/lib/next-steps/suggest'
import {
  ACTION_CODES,
  nextStepsQuerySchema,
  type ActionDescriptor,
  type NextStepsResponse,
  type ActionCode,
} from '@/lib/next-steps/types'
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

  // 1) tt_documents (camino principal — doc_type IN ('presupuesto','quotation'))
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

  // 2) Legacy tt_quotes
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

interface BuildArgs {
  docId: string
  ttUserId: string
  authUserId: string
  companyId: string
  status: string
}

async function buildActions({
  docId,
  authUserId,
  companyId,
  status,
}: BuildArgs): Promise<ActionDescriptor[]> {
  const sb = await createServerClient()
  const out: ActionDescriptor[] = []

  for (const code of ACTION_CODES) {
    const entry = ACTIONS_CATALOG[code]

    // Placeholders F2/F3: siempre se devuelven, marcados como disabled
    if (!entry.enabledInF1) {
      out.push({
        code,
        label: entry.label,
        icon: entry.icon,
        shortcut: entry.shortcut,
        enabled: false,
        tooltip: entry.disabledTooltip,
      })
      continue
    }

    // Acciones funcionales: chequear permiso. Si no tiene → omitir.
    const { data: allowed, error: rpcErr } = await sb.rpc(
      'fn_can_execute_action',
      { p_user_id: authUserId, p_company_id: companyId, p_action: code }
    )
    if (rpcErr) {
      logger.warn('[next-steps] fn_can_execute_action error', {
        code,
        error: rpcErr.message,
      })
      continue
    }
    if (!allowed) continue

    out.push({
      code,
      label: entry.label,
      icon: entry.icon,
      shortcut: entry.shortcut,
      enabled: true,
      tooltip: null,
    })
  }

  // El status no afecta la lista, pero lo dejamos visible en el log para debug
  logger.debug?.('[next-steps] built actions', {
    docId,
    status,
    count: out.length,
  })

  return out
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

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const parsed = nextStepsQuerySchema.safeParse({
      doc_type: url.searchParams.get('doc_type'),
      doc_id: url.searchParams.get('doc_id'),
    })
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Parámetros inválidos', details: parsed.error.flatten() },
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

    const { doc_type, doc_id } = parsed.data

    // ── Loader directo (sin unstable_cache porque createClient() usa cookies(),
    //    incompatible con cache scope en Next 16). Si más adelante se requiere
    //    cachear, pasar los datos del session como argumentos al loader.
    //    revalidateTag desde /execute sigue funcionando como invalidación lógica.
    const loadResult = async (): Promise<NextStepsResponse | { __notFound: true } | { __forbidden: true }> => {
      const summary = await loadQuotationSummary(doc_id)
      if (!summary) return { __notFound: true }
      if (summary.company_id !== companyId) return { __forbidden: true }

      const actions = await buildActions({
        docId: doc_id,
        ttUserId,
        authUserId: authId,
        companyId,
        status: summary.status,
      })

      const suggested: ActionCode = suggestPrimary(summary.status)

      return {
        doc_type,
        doc_id,
        doc_status: summary.status,
        actions,
        suggested,
      }
    }

    const result = await loadResult()
    if ('__notFound' in result) {
      return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 })
    }
    if ('__forbidden' in result) {
      return NextResponse.json({ error: 'Sin acceso a este documento' }, { status: 403 })
    }
    return NextResponse.json(result)
  } catch (err) {
    logger.error('[GET /api/next-steps] error:', err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
