import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { getAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth/require-admin'
import { userHasRbacPermission } from '@/lib/auth/rbac-server'

export const runtime = 'nodejs'
export const maxDuration = 120

const MAX_FILE_BYTES = 15 * 1024 * 1024

/** Acepta número, "0,45" (coma decimal es-AR), vacío → null, inválido → NaN. */
function parseNum(v: unknown): number | null {
  if (v == null || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN
  const s = String(v).trim().replace(',', '.')
  if (s === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : NaN
}

/** Normaliza encabezados: minúsculas, sin acentos ni paréntesis. */
function normHeader(h: string): string {
  return h.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\(.*?\)/g, '').trim()
}

const FIELD_BY_HEADER: Record<string, 'net_weight_kg' | 'gross_weight_kg' | 'length_cm' | 'width_cm' | 'height_cm'> = {
  'peso neto': 'net_weight_kg',
  'peso bruto': 'gross_weight_kg',
  'largo': 'length_cm',
  'ancho': 'width_cm',
  'alto': 'height_cm',
}

/**
 * POST /api/comex/product-logistics/import — carga masiva de datos físicos
 * desde la plantilla XLSX (matchea por SKU; filas sin ningún valor se
 * ignoran; SKUs desconocidos y valores inválidos se reportan, no rompen).
 * Requiere manage_comex.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response
  const admin = getAdminClient()
  if (!(await userHasRbacPermission(admin, auth.ttUserId, auth.role, 'manage_comex'))) {
    return NextResponse.json({ error: 'Falta el permiso manage_comex' }, { status: 403 })
  }

  let form: FormData
  try { form = await req.formData() } catch {
    return NextResponse.json({ error: 'Esperaba multipart/form-data con el archivo' }, { status: 400 })
  }
  const file = form.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'Falta el archivo (campo "file")' }, { status: 400 })
  if (file.size > MAX_FILE_BYTES) return NextResponse.json({ error: 'Archivo demasiado grande (máx 15 MB)' }, { status: 413 })

  let sheetRows: Record<string, unknown>[]
  try {
    const wb = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: 'buffer' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    if (!ws) return NextResponse.json({ error: 'El archivo no tiene hojas' }, { status: 400 })
    sheetRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null })
  } catch {
    return NextResponse.json({ error: 'No se pudo leer el Excel. ¿Es un .xlsx válido?' }, { status: 400 })
  }
  if (sheetRows.length === 0) return NextResponse.json({ error: 'La hoja está vacía' }, { status: 400 })

  // Resolver columnas por encabezado normalizado (tolerante a "(kg)"/acentos).
  const headerMap = new Map<string, string>() // header original → field
  let skuHeader: string | null = null
  for (const original of Object.keys(sheetRows[0])) {
    const norm = normHeader(original)
    if (norm === 'sku') { skuHeader = original; continue }
    const field = FIELD_BY_HEADER[norm]
    if (field) headerMap.set(original, field)
  }
  if (!skuHeader) return NextResponse.json({ error: 'No encontré la columna SKU' }, { status: 400 })
  if (headerMap.size === 0) return NextResponse.json({ error: 'No encontré columnas de datos (Peso neto, Peso bruto, Largo, Ancho, Alto)' }, { status: 400 })

  // Filas candidatas: con SKU y al menos un valor.
  type Parsed = { sku: string; values: Record<string, number | null>; rowNum: number }
  const parsed: Parsed[] = []
  const invalid: string[] = []
  sheetRows.forEach((row, i) => {
    const sku = String(row[skuHeader!] ?? '').trim()
    if (!sku) return
    const values: Record<string, number | null> = {}
    let hasValue = false
    let bad = false
    for (const [original, field] of headerMap) {
      const n = parseNum(row[original])
      if (n !== null && Number.isNaN(n)) { bad = true; break }
      if (n !== null && n < 0) { bad = true; break }
      if (n !== null) hasValue = true
      values[field] = n
    }
    if (bad) { invalid.push(`fila ${i + 2}: ${sku}`); return }
    if (hasValue) parsed.push({ sku, values, rowNum: i + 2 })
  })

  if (parsed.length === 0) {
    return NextResponse.json({ error: 'Ninguna fila tiene datos para importar', invalid_rows: invalid.slice(0, 20) }, { status: 400 })
  }

  // SKU → product_id en lotes (solo productos físicos).
  const skuToId = new Map<string, string>()
  const skus = [...new Set(parsed.map(p => p.sku))]
  for (let i = 0; i < skus.length; i += 500) {
    const { data, error } = await admin
      .from('tt_products')
      .select('id, sku')
      .in('sku', skus.slice(i, i + 500))
      .neq('product_type', 'service')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    for (const p of data ?? []) skuToId.set(p.sku as string, p.id as string)
  }

  const unknown: string[] = []
  const now = new Date().toISOString()
  const upserts = parsed.flatMap(p => {
    const productId = skuToId.get(p.sku)
    if (!productId) { unknown.push(p.sku); return [] }
    return [{ product_id: productId, ...p.values, updated_at: now }]
  })

  let updated = 0
  for (let i = 0; i < upserts.length; i += 500) {
    const chunk = upserts.slice(i, i + 500)
    const { error } = await admin.from('tt_product_logistics').upsert(chunk, { onConflict: 'product_id' })
    if (error) return NextResponse.json({ error: `Falló el guardado: ${error.message}`, updated }, { status: 500 })
    updated += chunk.length
  }

  return NextResponse.json({
    success: true,
    updated,
    unknown_skus: unknown.length,
    unknown_sample: unknown.slice(0, 15),
    invalid_rows: invalid.slice(0, 15),
  })
}
