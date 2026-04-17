import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { TangoClient } from '@/lib/invoicing/tango-client'

export const runtime = 'nodejs'

/**
 * POST /api/invoices/tango/config
 *
 * Guarda credenciales Tango para una empresa.
 * Body: {
 *   companyId,
 *   userIdentifier,
 *   applicationPublicKey,
 *   perfilComprobanteId?,
 *   puntoVentaDefault?
 * }
 *
 * GET /api/invoices/tango/config?companyId=xxx
 * Devuelve si hay provider Tango activo y su config (sin exponer keys completas)
 */

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get('companyId')
  if (!companyId) return NextResponse.json({ error: 'companyId requerido' }, { status: 400 })

  const supabase = admin()
  const { data } = await supabase
    .from('tt_invoice_providers')
    .select('id, provider_type, name, is_active, config')
    .eq('company_id', companyId)
    .eq('provider_type', 'tango_api')
    .maybeSingle()

  if (!data) return NextResponse.json({ configured: false })

  const cfg = (data.config || {}) as Record<string, unknown>
  return NextResponse.json({
    configured: Boolean(cfg.user_identifier && cfg.application_public_key),
    providerId: data.id,
    isActive: data.is_active,
    // Solo exponemos un preview enmascarado
    userIdentifierMasked: maskId(String(cfg.user_identifier || '')),
    applicationPublicKeyMasked: maskId(String(cfg.application_public_key || '')),
    perfilComprobanteId: cfg.perfil_comprobante_id,
    puntoVentaDefault: cfg.punto_venta_default,
  })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { companyId, userIdentifier, applicationPublicKey, perfilComprobanteId, puntoVentaDefault, testConnection } = body

    if (!companyId || !userIdentifier || !applicationPublicKey) {
      return NextResponse.json({ error: 'Faltan credenciales' }, { status: 400 })
    }

    // 1) Test: pedir token
    if (testConnection) {
      try {
        const tango = new TangoClient({ userIdentifier, applicationPublicKey })
        const token = await tango.getToken()
        return NextResponse.json({ ok: true, tokenPreview: token.slice(0, 16) + '...' })
      } catch (err) {
        return NextResponse.json({ error: (err as Error).message }, { status: 400 })
      }
    }

    const supabase = admin()

    // 2) Upsert provider
    const { data: existing } = await supabase
      .from('tt_invoice_providers')
      .select('id')
      .eq('company_id', companyId)
      .eq('provider_type', 'tango_api')
      .maybeSingle()

    const config = {
      user_identifier: userIdentifier,
      application_public_key: applicationPublicKey,
      perfil_comprobante_id: perfilComprobanteId ?? null,
      punto_venta_default: puntoVentaDefault ?? null,
    }

    if (existing) {
      const { error } = await supabase
        .from('tt_invoice_providers')
        .update({ config, is_active: true, name: 'Tango Factura API' })
        .eq('id', existing.id)
      if (error) throw error
      return NextResponse.json({ ok: true, providerId: existing.id })
    }

    const { data, error } = await supabase
      .from('tt_invoice_providers')
      .insert({
        company_id: companyId,
        provider_type: 'tango_api',
        name: 'Tango Factura API',
        is_default: true,
        is_active: true,
        config,
      })
      .select('id')
      .single()

    if (error) throw error
    return NextResponse.json({ ok: true, providerId: data.id })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

function maskId(s: string) {
  if (!s) return ''
  if (s.length <= 6) return '***'
  return s.slice(0, 4) + '***' + s.slice(-3)
}
