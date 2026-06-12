/**
 * doc-numbering.ts — Generación centralizada de números de documento.
 *
 * V1: lee el último documento con el mismo prefix + company_id y suma 1.
 * NO es atómico — dos requests concurrentes pueden colisionar.
 *
 * TODO (SESIÓN 2): migrar a `tt_document_sequences` con UPDATE ... RETURNING
 * para garantizar atomicidad. Ver MEMORY → project_mocciaro_soft_roadmap.md.
 */

import { createClient } from '@/lib/supabase/client'

export type DocPrefix =
  | 'COT' // Cotización
  | 'PED' // Pedido (sales order)
  | 'REM' | 'ALB' // Remito / albarán
  | 'FAC' // Factura de venta
  | 'NC'  // Nota de crédito venta
  | 'PAP' // Pedido a proveedor (purchase order)
  | 'FC'  // Factura de compra
  | 'AB'  // Abono compra (nota crédito compra)
  | 'PAY' | 'CBR' // Pagos / cobros
  | 'OC'  // Orden de compra cliente

/**
 * Genera el próximo número para el prefix dado en la empresa indicada.
 * Formato: `PREFIX-YYMM-NNNN` (ej. `PED-2605-0042`).
 */
export async function generateDocNumber(
  prefix: DocPrefix,
  companyId: string | null | undefined
): Promise<string> {
  const supabase = createClient()
  const now = new Date()
  const yr = now.getFullYear().toString().slice(-2)
  const mo = (now.getMonth() + 1).toString().padStart(2, '0')
  const period = `${yr}${mo}`
  const pattern = `${prefix}-${period}-%`

  // Buscamos el último doc_number del período + prefix + empresa.
  // Filtramos por company_id sólo si vino — para queries legacy sin company.
  let query = supabase
    .from('tt_documents')
    .select('system_code')
    .like('system_code', pattern)
    .order('system_code', { ascending: false })
    .limit(1)

  if (companyId) query = query.eq('company_id', companyId)

  const { data } = await query

  let maxNum = 0
  const last = data?.[0]?.system_code as string | undefined
  if (last) {
    const match = last.match(/(\d+)$/)
    if (match) maxNum = parseInt(match[1], 10)
  }

  // Como las tablas legacy (tt_sales_orders, tt_invoices, tt_delivery_notes,
  // tt_quotes) también tienen doc_number propio, chequeamos ahí también para
  // el prefix correspondiente y nos quedamos con el máximo.
  const legacyTable = legacyTableFor(prefix)
  if (legacyTable) {
    let q2 = supabase
      .from(legacyTable.table)
      .select(legacyTable.column)
      .like(legacyTable.column, pattern)
      .order(legacyTable.column, { ascending: false })
      .limit(1)
    if (companyId) q2 = q2.eq('company_id', companyId)
    const { data: d2 } = await q2
    const lastLegacy = (d2?.[0] as Record<string, unknown> | undefined)?.[legacyTable.column] as
      | string
      | undefined
    if (lastLegacy) {
      const m = lastLegacy.match(/(\d+)$/)
      if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10))
    }
  }

  return `${prefix}-${period}-${String(maxNum + 1).padStart(4, '0')}`
}

function legacyTableFor(prefix: DocPrefix): { table: string; column: string } | null {
  switch (prefix) {
    case 'COT':
      return { table: 'tt_quotes', column: 'number' }
    case 'PED':
      return { table: 'tt_sales_orders', column: 'doc_number' }
    case 'REM':
    case 'ALB':
      return { table: 'tt_delivery_notes', column: 'doc_number' }
    case 'FAC':
      return { table: 'tt_invoices', column: 'doc_number' }
    default:
      return null
  }
}
