import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { TangoClient } from '@/lib/invoicing/tango-client'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * POST /api/invoices/tango/sync-remitos
 * Body: { companyId, from?: ISO, to?: ISO }
 *
 * Lee remitos de Tango (ListarRemitosVentas) y los sincroniza con tt_documents
 * como type='remito'. No crea remitos en Tango — solo lectura.
 *
 * IMPORTANTE: Tango NO tiene endpoint para crear remitos desde API.
 * Este endpoint es SOLO para reflejar en Mocciaro los remitos creados
 * manualmente en Tango.
 */
export async function POST(req: NextRequest) {
  try {
    const { companyId, from, to } = await req.json()
    if (!companyId) return NextResponse.json({ error: 'companyId requerido' }, { status: 400 })

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )

    const { data: provider } = await supabase
      .from('tt_invoice_providers')
      .select('id, config')
      .eq('company_id', companyId)
      .eq('provider_type', 'tango_api')
      .eq('is_active', true)
      .maybeSingle()
    if (!provider) {
      return NextResponse.json({ error: 'Sin provider Tango para esta empresa' }, { status: 400 })
    }

    const cfg = provider.config as any
    const tango = new TangoClient({
      userIdentifier: cfg.user_identifier,
      applicationPublicKey: cfg.application_public_key,
    })

    const filtro: Record<string, unknown> = {}
    if (from) filtro.FechaDesde = from
    if (to) filtro.FechaHasta = to

    const remitosTango = await tango.listarMovimientos({ ...filtro, TipoComprobante: 'REMITO' }).catch(() => [])
    // O usar el endpoint específico si está disponible
    // const remitos = await tango['authedPost']<any[]>('/Services/Facturacion/ListarRemitosVentas', filtro)

    let upserted = 0
    for (const r of remitosTango as any[]) {
      const legalNumber = r.NumeroComprobante || r.LegalNumber || r.Numero
      if (!legalNumber) continue

      // Chequear si ya existe
      const { data: existing } = await supabase
        .from('tt_documents')
        .select('id')
        .eq('company_id', companyId)
        .eq('doc_type', 'remito')
        .eq('legal_number', legalNumber)
        .maybeSingle()

      if (existing) continue

      await supabase.from('tt_documents').insert({
        doc_type: 'remito',
        legal_number: legalNumber,
        company_id: companyId,
        status: 'emitido',
        total: Number(r.Total || 0),
        currency: r.Moneda || 'ARS',
        metadata: { tango_source: r, synced_at: new Date().toISOString() },
      })
      upserted++
    }

    return NextResponse.json({
      ok: true,
      synced: upserted,
      totalTango: remitosTango.length,
    })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
