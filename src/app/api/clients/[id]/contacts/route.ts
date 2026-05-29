/**
 * GET /api/clients/[id]/contacts
 *
 * Devuelve los contactos activos de un cliente, ordenados por:
 *   1. is_primary desc (principal primero)
 *   2. name asc
 *
 * Usado por el cotizador (y pedido/albarán/factura cuando se extienda) para
 * mostrar el dropdown de contactos al asignar roles en el panel de
 * participantes del documento.
 *
 * Respeta RLS multi-empresa: el cliente tiene company_id y el guard valida
 * que el user tenga acceso a esa empresa antes de devolver los contactos.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { withCompanyFilter, ensureCompanyAccess } from '@/lib/auth/with-company-filter'
import type { ContactSnippet } from '@/lib/document-contacts'

export const runtime = 'nodejs'

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const guard = await withCompanyFilter()
  if (!guard.ok) return guard.response

  const { id: clientId } = await ctx.params
  if (!clientId) {
    return NextResponse.json({ error: 'client id requerido' }, { status: 400 })
  }

  const sb = adminClient()

  // Validar acceso: el cliente debe pertenecer a una empresa accesible.
  // Sin esto, un user de TorqueTools podría listar los contactos de
  // clientes de Buscatools usando solo el id (que es UUID público).
  const { data: clientRow, error: clientErr } = await sb
    .from('tt_clients')
    .select('id, company_id')
    .eq('id', clientId)
    .maybeSingle()

  if (clientErr || !clientRow) {
    return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })
  }

  const access = ensureCompanyAccess(guard, clientRow.company_id as string)
  if (!access.ok) return access.response

  const { data, error } = await sb
    .from('tt_client_contacts')
    .select(
      'id, client_id, name, position, email, phone, is_primary, default_roles, receives_quotes, receives_invoices, receives_remitos'
    )
    .eq('client_id', clientId)
    .eq('active', true)
    .order('is_primary', { ascending: false })
    .order('name', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: (data || []) as ContactSnippet[] })
}
