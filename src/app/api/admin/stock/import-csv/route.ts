/**
 * POST /api/admin/stock/import-csv  — FASE 1.1
 *
 * Carga inicial de stock desde un CSV exportado de STEL Order.
 *
 * Body (multipart/form-data):
 *   file:        archivo CSV
 *   company_id:  UUID de la empresa
 *   warehouse_code: código del warehouse destino (opcional;
 *                   si no se pasa, usa el default de la company)
 *   dry_run:     'true' para validar sin escribir
 *
 * CSV esperado (header en primera fila, separador autodetectado , o ;):
 *   sku, quantity, min_quantity?, warehouse_code?
 *
 * - SKU se resuelve a product_id por tt_products.sku.
 * - Discrepancias (SKU no encontrado, cantidad inválida, warehouse no existe)
 *   se devuelven en `discrepancies` sin bloquear el resto del import.
 * - UPSERT contra tt_stock con UNIQUE(product_id, warehouse_id).
 * - Registra un movement 'in' por cada fila para trazabilidad.
 *
 * Permisos: SOLO super_admin o admin (verificado vía user_has_permission).
 *
 * RESPUESTA:
 *   {
 *     ok: boolean,
 *     summary: { total_rows, applied, discrepancies_count, dry_run },
 *     discrepancies: [{ row_index, sku, reason }]
 *   }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const maxDuration = 120

interface CsvRow {
  sku: string
  quantity: number
  min_quantity?: number
  warehouse_code?: string
}

interface Discrepancy {
  row_index: number
  sku: string
  reason: string
}

function parseCsv(text: string): { headers: string[]; rows: string[][]; separator: string } {
  // Autodetect separator
  const firstLine = text.split(/\r?\n/)[0] ?? ''
  const semicolons = (firstLine.match(/;/g) || []).length
  const commas = (firstLine.match(/,/g) || []).length
  const separator = semicolons > commas ? ';' : ','

  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length === 0) return { headers: [], rows: [], separator }

  const parseLine = (line: string): string[] => {
    // Manejo simple de quoted fields. Suficiente para STEL exports.
    const out: string[] = []
    let cur = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (c === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (c === '"') {
        inQuotes = !inQuotes
      } else if (c === separator && !inQuotes) {
        out.push(cur)
        cur = ''
      } else {
        cur += c
      }
    }
    out.push(cur)
    return out.map((s) => s.trim())
  }

  const headers = parseLine(lines[0]).map((h) => h.toLowerCase().trim())
  const rows = lines.slice(1).map(parseLine)
  return { headers, rows, separator }
}

function findHeader(headers: string[], candidates: string[]): number {
  for (const c of candidates) {
    const idx = headers.findIndex((h) => h === c.toLowerCase())
    if (idx >= 0) return idx
  }
  return -1
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file')
    const companyId = formData.get('company_id') as string | null
    const defaultWarehouseCode = formData.get('warehouse_code') as string | null
    const dryRun = formData.get('dry_run') === 'true'

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file (multipart) requerido' }, { status: 400 })
    }
    if (!companyId) {
      return NextResponse.json({ error: 'company_id requerido' }, { status: 400 })
    }

    const sb = getAdminClient()
    const text = await file.text()
    const { headers, rows } = parseCsv(text)

    if (headers.length === 0 || rows.length === 0) {
      return NextResponse.json({ error: 'CSV vacío o sin headers' }, { status: 400 })
    }

    // Resolver índices de columnas (acepta variantes comunes de STEL)
    const skuIdx = findHeader(headers, ['sku', 'codigo', 'código', 'ref', 'referencia'])
    const qtyIdx = findHeader(headers, ['quantity', 'cantidad', 'stock', 'qty', 'unidades'])
    const minIdx = findHeader(headers, ['min_quantity', 'minimo', 'mínimo', 'stock_minimo'])
    const whIdx = findHeader(headers, ['warehouse_code', 'almacen', 'almacén', 'warehouse'])

    if (skuIdx < 0 || qtyIdx < 0) {
      return NextResponse.json(
        {
          error: `Headers requeridos no encontrados: sku/codigo y quantity/cantidad. Headers: ${headers.join(', ')}`,
        },
        { status: 400 }
      )
    }

    // Resolver warehouses de la company
    const { data: warehouses } = await sb
      .from('tt_warehouses')
      .select('id, code, is_active, active')
      .eq('company_id', companyId)
    const warehouseByCode = new Map<string, string>()
    for (const w of warehouses || []) {
      const isActive = (w.is_active as boolean | undefined) ?? (w.active as boolean | undefined) ?? true
      if (isActive) warehouseByCode.set((w.code as string).toLowerCase(), w.id as string)
    }

    let defaultWarehouseId: string | null = null
    if (defaultWarehouseCode) {
      defaultWarehouseId = warehouseByCode.get(defaultWarehouseCode.toLowerCase()) || null
      if (!defaultWarehouseId) {
        return NextResponse.json(
          { error: `Warehouse ${defaultWarehouseCode} no encontrado para la company` },
          { status: 400 }
        )
      }
    } else {
      const { data } = await sb.rpc('default_warehouse_for_company', { p_company_id: companyId })
      defaultWarehouseId = (data as string | null) ?? null
    }

    if (!defaultWarehouseId) {
      return NextResponse.json(
        { error: 'No se pudo determinar warehouse default. Pasá warehouse_code o creá uno.' },
        { status: 400 }
      )
    }

    // Cargar productos por SKU en lotes para resolver IDs
    const skus = Array.from(new Set(rows.map((r) => (r[skuIdx] || '').trim()).filter(Boolean)))
    const productBySku = new Map<string, string>()
    const BATCH = 500
    for (let i = 0; i < skus.length; i += BATCH) {
      const slice = skus.slice(i, i + BATCH)
      const { data } = await sb.from('tt_products').select('id, sku').in('sku', slice)
      for (const p of data || []) {
        productBySku.set((p.sku as string).toLowerCase(), p.id as string)
      }
    }

    // Iterar filas y aplicar (a menos que dry_run)
    const discrepancies: Discrepancy[] = []
    let applied = 0

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const sku = (row[skuIdx] || '').trim()
      const qtyRaw = (row[qtyIdx] || '').trim().replace(',', '.')
      const qty = Number(qtyRaw)
      const minQty = minIdx >= 0 ? Number((row[minIdx] || '').trim().replace(',', '.')) : null
      const whCode = whIdx >= 0 ? (row[whIdx] || '').trim() : ''

      if (!sku) {
        discrepancies.push({ row_index: i + 2, sku, reason: 'SKU vacío' })
        continue
      }
      if (!Number.isFinite(qty) || qty < 0) {
        discrepancies.push({ row_index: i + 2, sku, reason: `Cantidad inválida: "${qtyRaw}"` })
        continue
      }
      const productId = productBySku.get(sku.toLowerCase())
      if (!productId) {
        discrepancies.push({ row_index: i + 2, sku, reason: 'SKU no existe en tt_products' })
        continue
      }
      let warehouseId: string = defaultWarehouseId
      if (whCode) {
        const found = warehouseByCode.get(whCode.toLowerCase())
        if (!found) {
          discrepancies.push({
            row_index: i + 2,
            sku,
            reason: `Warehouse "${whCode}" no existe para la company`,
          })
          continue
        }
        warehouseId = found
      }

      if (dryRun) {
        applied++
        continue
      }

      // UPSERT con on conflict por (product_id, warehouse_id)
      const { data: existing } = await sb
        .from('tt_stock')
        .select('id, quantity')
        .eq('product_id', productId)
        .eq('warehouse_id', warehouseId)
        .maybeSingle()

      const previous = (existing?.quantity as number) || 0

      if (existing) {
        await sb
          .from('tt_stock')
          .update({
            quantity: qty,
            min_quantity: minQty ?? undefined,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id as string)
      } else {
        await sb.from('tt_stock').insert({
          product_id: productId,
          warehouse_id: warehouseId,
          quantity: qty,
          reserved: 0,
          min_quantity: minQty ?? 0,
        })
      }

      // Movement de auditoría
      const delta = qty - previous
      if (delta !== 0) {
        await sb.from('tt_stock_movements').insert({
          product_id: productId,
          warehouse_id: warehouseId,
          movement_type: delta > 0 ? 'in' : 'out',
          quantity: Math.abs(delta),
          quantity_before: previous,
          quantity_after: qty,
          reference_type: 'csv_import',
          reference_id: null,
          notes: `Import CSV (${file.name})`,
        })
      }

      applied++
    }

    return NextResponse.json({
      ok: true,
      summary: {
        total_rows: rows.length,
        applied,
        discrepancies_count: discrepancies.length,
        dry_run: dryRun,
        warehouse_id: defaultWarehouseId,
      },
      discrepancies,
    })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
