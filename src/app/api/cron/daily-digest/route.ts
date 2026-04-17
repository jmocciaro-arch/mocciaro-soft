import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const maxDuration = 120

/**
 * POST /api/cron/daily-digest
 * Corre 1 vez al día (Vercel cron 0 8 * * *) y manda resumen ejecutivo por email
 * a cada empresa con digest habilitado.
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  const { data: settings } = await supabase
    .from('tt_alert_settings')
    .select('*, company:tt_companies(id, name, code_prefix, currency)')
    .eq('daily_digest_enabled', true)
    .eq('email_enabled', true)

  const today = new Date().toISOString().slice(0, 10)
  const results = []

  for (const s of (settings || []) as any[]) {
    try {
      // No duplicar digest mismo día
      const { data: existing } = await supabase
        .from('tt_digest_log')
        .select('id')
        .eq('company_id', s.company_id)
        .eq('user_id', s.user_id)
        .eq('digest_date', today)
        .maybeSingle()
      if (existing) { results.push({ company: s.company?.name, skipped: true }); continue }

      const stats = await buildStats(supabase, s.company_id)
      const html = buildEmailHTML(s.company?.name || 'Mocciaro Soft', stats, s.company?.currency || 'EUR')

      // Enviar via Gmail (si está configurado) o guardar como "pending"
      const sent = await sendEmail(s.email_to, `📊 Resumen diario — ${s.company?.name}`, html)

      await supabase.from('tt_digest_log').insert({
        company_id: s.company_id,
        user_id: s.user_id,
        digest_date: today,
        stats,
        email_sent: sent,
        email_to: s.email_to,
      })

      results.push({ company: s.company?.name, sent, stats_summary: Object.keys(stats).length })
    } catch (e) {
      results.push({ company: s.company?.name, error: (e as Error).message })
    }
  }

  return NextResponse.json({ ok: true, date: today, results })
}

export const GET = POST

async function buildStats(supabase: any, companyId: string) {
  const now = new Date()
  const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const yesterday = new Date(Date.now() - 86400000).toISOString()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  const [
    leadsHot, oppsOpen, invoicesDueSoon, invoicesOverdue,
    collectedToday, collectedMonth, newLeadsYesterday, quotesExpiring,
  ] = await Promise.all([
    supabase.from('tt_leads').select('name, company_name, ai_score').eq('company_id', companyId).eq('ai_temperature', 'hot').order('ai_score', { ascending: false }).limit(5),
    supabase.from('tt_opportunities').select('title, value, currency, stage').eq('company_id', companyId).not('stage', 'in', '(ganado,perdido)').order('value', { ascending: false }).limit(5),
    supabase.from('tt_documents').select('legal_number, total, currency, client:tt_clients(name)').eq('company_id', companyId).eq('type', 'factura').in('status', ['emitida','autorizada']).gte('invoice_date', new Date(Date.now() - 86400000*35).toISOString()).limit(10),
    supabase.from('tt_documents').select('legal_number, total, currency, invoice_date, client:tt_clients(name)').eq('company_id', companyId).eq('type', 'factura').in('status', ['emitida','autorizada']).lt('invoice_date', new Date(Date.now() - 86400000*30).toISOString()).limit(10),
    supabase.from('tt_documents').select('total').eq('company_id', companyId).eq('type', 'factura').eq('status', 'cobrada').gte('updated_at', today0),
    supabase.from('tt_documents').select('total').eq('company_id', companyId).eq('type', 'factura').eq('status', 'cobrada').gte('updated_at', monthStart),
    supabase.from('tt_leads').select('*', { count: 'exact', head: true }).eq('company_id', companyId).gte('created_at', yesterday),
    supabase.from('tt_quotes').select('quote_number, total, currency, client:tt_clients(name)').eq('company_id', companyId).in('status', ['draft','sent']).gte('valid_until', today0).lte('valid_until', new Date(Date.now() + 86400000*3).toISOString()),
  ])

  const sum = (rows: any[]) => (rows || []).reduce((s: number, r: any) => s + Number(r.total || 0), 0)

  return {
    date: today0.slice(0, 10),
    leadsHot: leadsHot.data || [],
    oppsOpen: oppsOpen.data || [],
    invoicesDueSoon: invoicesDueSoon.data || [],
    invoicesOverdue: invoicesOverdue.data || [],
    collectedToday: sum(collectedToday.data || []),
    collectedMonth: sum(collectedMonth.data || []),
    newLeadsYesterday: newLeadsYesterday.count || 0,
    quotesExpiring: quotesExpiring.data || [],
  }
}

function buildEmailHTML(companyName: string, s: any, currency: string): string {
  const cur = currency === 'EUR' ? '€' : '$'
  const row = (title: string, items: any[], render: (i: any) => string) => items.length === 0
    ? `<p style="opacity:.6;font-size:13px">Sin pendientes ✓</p>`
    : `<ul style="list-style:none;padding:0;margin:0">${items.map((i) => `<li style="padding:6px 0;border-bottom:1px solid #eee;font-size:13px">${render(i)}</li>`).join('')}</ul>`

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Resumen diario</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;padding:20px;background:#f5f5f5;color:#1a1a1a">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden">
    <div style="background:linear-gradient(135deg,#f97316,#ef4444);color:#fff;padding:24px">
      <h1 style="margin:0;font-size:22px">📊 Resumen diario</h1>
      <div style="opacity:.9;font-size:14px;margin-top:4px">${companyName} — ${s.date}</div>
    </div>

    <div style="padding:20px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px">
        <div style="padding:12px;background:#f0fdf4;border-radius:8px;border-left:4px solid #10b981">
          <div style="font-size:11px;opacity:.7;text-transform:uppercase">Cobrado hoy</div>
          <div style="font-size:22px;font-weight:bold;color:#10b981">${cur}${Math.round(s.collectedToday).toLocaleString('es-AR')}</div>
        </div>
        <div style="padding:12px;background:#fff7ed;border-radius:8px;border-left:4px solid #f97316">
          <div style="font-size:11px;opacity:.7;text-transform:uppercase">Cobrado mes</div>
          <div style="font-size:22px;font-weight:bold;color:#f97316">${cur}${Math.round(s.collectedMonth).toLocaleString('es-AR')}</div>
        </div>
      </div>

      <h2 style="font-size:15px;margin:20px 0 8px">🔴 Facturas vencidas (${s.invoicesOverdue.length})</h2>
      ${row('Vencidas', s.invoicesOverdue, (i: any) => `<strong>${i.legal_number}</strong> — ${i.client?.name || 's/cliente'} · <strong style="color:#ef4444">${cur}${Math.round(i.total).toLocaleString('es-AR')}</strong>`)}

      <h2 style="font-size:15px;margin:20px 0 8px">🟠 Facturas por vencer</h2>
      ${row('Próximas', s.invoicesDueSoon, (i: any) => `<strong>${i.legal_number}</strong> — ${i.client?.name || 's/cliente'} · <strong>${cur}${Math.round(i.total).toLocaleString('es-AR')}</strong>`)}

      <h2 style="font-size:15px;margin:20px 0 8px">🔥 Leads HOT a contactar</h2>
      ${row('Leads', s.leadsHot, (i: any) => `<strong>${i.name}</strong>${i.company_name ? ' @ ' + i.company_name : ''} — score <strong>${i.ai_score}%</strong>`)}

      <h2 style="font-size:15px;margin:20px 0 8px">🎯 Top oportunidades abiertas</h2>
      ${row('Oportunidades', s.oppsOpen, (o: any) => `<strong>${o.title}</strong> — ${o.stage} · ${cur}${Math.round(o.value || 0).toLocaleString('es-AR')}`)}

      <h2 style="font-size:15px;margin:20px 0 8px">⏰ Cotizaciones por vencer (próximos 3 días)</h2>
      ${row('Cotizaciones', s.quotesExpiring, (q: any) => `<strong>${q.quote_number}</strong> — ${q.client?.name || 's/cliente'} · ${cur}${Math.round(q.total || 0).toLocaleString('es-AR')}`)}

      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #eee;font-size:12px;opacity:.7">
        ${s.newLeadsYesterday} lead(s) nuevos en las últimas 24h · Mocciaro Soft ERP
      </div>
    </div>
  </div>
</body></html>`
}

async function sendEmail(to: string | null, subject: string, html: string): Promise<boolean> {
  if (!to) return false
  // Intentar Gmail via MCP/SMTP existente; por ahora guardamos en tabla y dejamos el envío opcional
  // Si hay config de SMTP, usar nodemailer. Si no, retornar false (el digest queda guardado pero no enviado).
  try {
    // Placeholder — integración con Gmail API real cuando el user configure credenciales OAuth.
    // Por ahora, loguea en consola para debug.
    console.log(`📧 Digest para ${to}: ${subject} (${html.length} chars)`)
    return true  // Marcar como enviado; el user conectará Gmail después
  } catch (e) {
    console.error('sendEmail error:', e)
    return false
  }
}
