import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { getAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth/require-admin'
import { userHasRbacPermission } from '@/lib/auth/rbac-server'

export const runtime = 'nodejs'
export const maxDuration = 60

/** Encabezados canónicos de la plantilla — el import los matchea por nombre. */
const TEMPLATE_HEADERS = [
  'SKU',
  'Producto',
  'Peso neto (kg)',
  'Peso bruto (kg)',
  'Largo (cm)',
  'Ancho (cm)',
  'Alto (cm)',
] as const

/**
 * GET /api/comex/product-logistics/template — descarga la plantilla XLSX con
 * todos los productos físicos (sin servicios) y sus valores actuales: sirve
 * de plantilla de carga y de export. Requiere view_comex.
 */
export async function GET() {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response
  const admin = getAdminClient()
  if (!(await userHasRbacPermission(admin, auth.ttUserId, auth.role, 'view_comex'))) {
    return NextResponse.json({ error: 'Falta el permiso view_comex' }, { status: 403 })
  }

  // Paginado server-side: PostgREST corta en ~1000 filas por default y son ~22k.
  type Row = {
    sku: string
    name: string
    logistics: { net_weight_kg: number | null; gross_weight_kg: number | null; length_cm: number | null; width_cm: number | null; height_cm: number | null }[] | null
  }
  const rows: Row[] = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from('tt_products')
      .select('sku, name, logistics:tt_product_logistics(net_weight_kg, gross_weight_kg, length_cm, width_cm, height_cm)')
      .neq('product_type', 'service')
      .order('sku')
      .range(from, from + PAGE - 1)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    rows.push(...((data ?? []) as Row[]))
    if (!data || data.length < PAGE) break
  }

  const sheetRows = rows.map(r => {
    const l = Array.isArray(r.logistics) ? r.logistics[0] : r.logistics
    return {
      [TEMPLATE_HEADERS[0]]: r.sku,
      [TEMPLATE_HEADERS[1]]: r.name,
      [TEMPLATE_HEADERS[2]]: l?.net_weight_kg ?? null,
      [TEMPLATE_HEADERS[3]]: l?.gross_weight_kg ?? null,
      [TEMPLATE_HEADERS[4]]: l?.length_cm ?? null,
      [TEMPLATE_HEADERS[5]]: l?.width_cm ?? null,
      [TEMPLATE_HEADERS[6]]: l?.height_cm ?? null,
    }
  })

  const ws = XLSX.utils.json_to_sheet(sheetRows, { header: [...TEMPLATE_HEADERS] })
  ws['!cols'] = [{ wch: 16 }, { wch: 48 }, { wch: 14 }, { wch: 14 }, { wch: 11 }, { wch: 11 }, { wch: 11 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Datos físicos')
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="comex-datos-fisicos.xlsx"',
    },
  })
}
