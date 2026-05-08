import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

/**
 * GET /api/health/sales-chain
 * Diagnóstico completo del estado de la cadena de ventas.
 * Chequea: tablas, columnas clave, migrations aplicadas, API keys, buckets.
 */
export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  const checks: Array<{ name: string; ok: boolean; detail?: string }> = []

  // 1) Env vars
  checks.push({ name: 'ENV: GEMINI_API_KEY', ok: Boolean(process.env.GEMINI_API_KEY) })
  checks.push({ name: 'ENV: ANTHROPIC_API_KEY', ok: Boolean(process.env.ANTHROPIC_API_KEY) })
  checks.push({ name: 'ENV: SUPABASE_SERVICE_ROLE_KEY', ok: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY) })

  // 2) Tablas clave
  const tables = [
    'tt_companies', 'tt_clients', 'tt_products',
    'tt_leads', 'tt_lead_interactions',
    'tt_opportunities', 'tt_quotes', 'tt_sales_orders', 'tt_purchase_orders',
    'tt_documents', 'tt_document_lines', 'tt_oc_parsed',
    'tt_invoice_providers', 'tt_tango_maestros_cache',
    'tt_bank_statements', 'tt_bank_statement_lines',
    'tt_document_sequences',
  ]
  for (const t of tables) {
    try {
      const { error } = await supabase.from(t).select('*', { head: true, count: 'exact' }).limit(1)
      checks.push({ name: `TABLE: ${t}`, ok: !error, detail: error?.message })
    } catch (e) {
      checks.push({ name: `TABLE: ${t}`, ok: false, detail: (e as Error).message })
    }
  }

  // 3) Empresas con prefijo
  const { data: companies } = await supabase
    .from('tt_companies')
    .select('id, name, code_prefix, trade_name, legal_name, tax_id, country')
  const prefixed = (companies || []).filter((c: any) => c.code_prefix)
  checks.push({
    name: `COMPANIES con code_prefix: ${prefixed.length}/${(companies || []).length}`,
    ok: prefixed.length > 0,
    detail: prefixed.map((c: any) => `${c.code_prefix}=${c.name}`).join(', '),
  })

  // 4) Función next_document_code existe
  try {
    const firstCompany = companies?.[0] as any
    if (firstCompany?.id) {
      const { data, error } = await supabase.rpc('next_document_code', {
        p_company_id: firstCompany.id,
        p_type: 'cotizacion',
      } as any)
      checks.push({
        name: 'FUNCTION: next_document_code',
        ok: !error && typeof data === 'string',
        detail: error?.message || `Ejemplo: ${data}`,
      })
    }
  } catch (e) {
    checks.push({ name: 'FUNCTION: next_document_code', ok: false, detail: (e as Error).message })
  }

  // 5) Columnas IA en tt_opportunities
  try {
    const { error } = await supabase.from('tt_opportunities').select('ai_score, ai_temperature, ai_tags', { head: true }).limit(1)
    checks.push({ name: 'COLS: tt_opportunities.ai_*', ok: !error, detail: error?.message })
  } catch (e) {
    checks.push({ name: 'COLS: tt_opportunities.ai_*', ok: false, detail: (e as Error).message })
  }

  // 6) Buckets de storage
  const buckets = ['invoices', 'bank-statements', 'client-pos', 'sat-photos', 'sat-pdfs']
  for (const b of buckets) {
    try {
      const { error } = await supabase.storage.from(b).list('', { limit: 1 })
      checks.push({ name: `BUCKET: ${b}`, ok: !error, detail: error?.message })
    } catch (e) {
      checks.push({ name: `BUCKET: ${b}`, ok: false, detail: (e as Error).message })
    }
  }

  // 7) Providers de factura por empresa
  const { data: providers } = await supabase.from('tt_invoice_providers').select('company_id, provider_type, is_active')
  checks.push({
    name: `INVOICE PROVIDERS: ${providers?.length || 0}`,
    ok: (providers?.length || 0) > 0,
    detail: providers?.map((p: any) => p.provider_type).join(', '),
  })

  // 8) Counts por entidad (para que veas volumen)
  const counts: Record<string, number> = {}
  for (const t of ['tt_leads', 'tt_opportunities', 'tt_quotes', 'tt_sales_orders', 'tt_documents']) {
    try {
      const { count } = await supabase.from(t).select('*', { count: 'exact', head: true })
      counts[t] = count || 0
    } catch { counts[t] = -1 }
  }

  const allOk = checks.every((c) => c.ok)
  return NextResponse.json({
    ok: allOk,
    summary: `${checks.filter((c) => c.ok).length}/${checks.length} checks OK`,
    checks,
    counts,
    companies,
  })
}
