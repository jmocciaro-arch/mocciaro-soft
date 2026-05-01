/**
 * POST /api/supplier-offers/parse-excel
 *
 * Recibe un Excel/CSV con la lista de precios actualizada de un proveedor,
 * detecta automáticamente las columnas (SKU, Descripción, Precio, Costo, Marca)
 * y devuelve las filas normalizadas + match contra tt_products por SKU.
 *
 * NO guarda — devuelve preview para revisión. El user después llama a apply-excel-update.
 *
 * Multipart FormData:
 *   - file: .xlsx | .xls | .csv
 *   - supplier_id?: string (UUID)
 *   - sheet_name?: string (opcional, default = primera hoja)
 *   - header_row?: string (1-based, default = 1; útil cuando Excel tiene branding antes)
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'

export const runtime = 'nodejs'
export const maxDuration = 60

interface ColumnMap {
  sku: number | null
  description: number | null
  price: number | null
  cost: number | null
  brand: number | null
  // posibles columnas extra
  ean: number | null
  pack: number | null
  weight: number | null
}

const COLUMN_PATTERNS: Record<keyof ColumnMap, RegExp[]> = {
  sku: [
    /^sku\b/i,
    /^c[oó]digo\b/i,
    /^code\b/i,
    /^art[ií]culo\b/i,
    /^art\.?\s*nr/i,
    /^artikel/i,
    /^ref(\.|erencia)?\b/i,
    /^item\b/i,
    /^part[\s_-]?(no|number|nr)/i,
  ],
  description: [
    /^descripci[oó]n/i,
    /^description/i,
    /^denominaci[oó]n/i,
    /^bezeichnung/i,
    /^d[ée]signation/i,
    /^name/i,
    /^producto/i,
    /^detalle/i,
  ],
  price: [
    /^precio[\s_-]?(venta|publico|p[uú]blico|vp)?$/i,
    /^pvp/i,
    /^price$/i,
    /^sale[\s_-]?price/i,
    /^p\.?\s*venta/i,
    /^retail/i,
  ],
  cost: [
    /^costo/i,
    /^cost\b/i,
    /^precio[\s_-]?(costo|compra|c)/i,
    /^p\.?\s*compra/i,
    /^purchase[\s_-]?price/i,
    /^einkauf/i,
    /^net(to)?[\s_-]?price/i,
    /^net\b/i,
  ],
  brand: [
    /^marca/i,
    /^brand/i,
    /^fabricante/i,
    /^manufacturer/i,
    /^hersteller/i,
  ],
  ean: [/^ean(13)?/i, /^barcode/i, /^c[oó]digo[\s_-]?barras/i],
  pack: [/^pack/i, /^embalaje/i, /^unidades?[\s_-]?caja/i, /^qty[\s_-]?per/i],
  weight: [/^peso/i, /^weight/i, /^kg\b/i, /^gewicht/i],
}

function detectColumns(headers: string[]): ColumnMap {
  const map: ColumnMap = {
    sku: null,
    description: null,
    price: null,
    cost: null,
    brand: null,
    ean: null,
    pack: null,
    weight: null,
  }

  for (let i = 0; i < headers.length; i++) {
    const h = (headers[i] || '').toString().trim()
    if (!h) continue

    for (const key of Object.keys(COLUMN_PATTERNS) as (keyof ColumnMap)[]) {
      if (map[key] !== null) continue
      const patterns = COLUMN_PATTERNS[key]
      if (patterns.some((re) => re.test(h))) {
        map[key] = i
        break
      }
    }
  }
  return map
}

function toNumber(v: unknown): number | null {
  if (v == null || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  let s = String(v).trim()
  if (!s) return null
  // quitar símbolos de moneda
  s = s.replace(/[€$£\s]/g, '')
  // detectar formato europeo (1.234,56) vs anglosajón (1,234.56)
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) {
      // europeo: punto = miles, coma = decimal
      s = s.replace(/\./g, '').replace(',', '.')
    } else {
      // anglosajón: coma = miles, punto = decimal
      s = s.replace(/,/g, '')
    }
  } else if (lastComma > -1 && lastDot === -1) {
    // sólo coma → asumir decimal
    s = s.replace(/\./g, '').replace(',', '.')
  }
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

export interface ExcelRow {
  row_number: number
  sku: string | null
  description: string | null
  price: number | null
  cost: number | null
  brand: string | null
  ean: string | null
  pack: number | null
  weight: number | null
  raw: Record<string, unknown>
  // match contra tt_products
  product_id: string | null
  matched: boolean
  current_cost: number | null
  current_price: number | null
  cost_change_pct: number | null
  errors: string[]
}

export async function POST(req: NextRequest) {
  try {
    const fd = await req.formData()
    const file = fd.get('file') as File | null
    const supplierId = (fd.get('supplier_id') as string | null) || null
    const sheetName = (fd.get('sheet_name') as string | null) || null
    const headerRowRaw = fd.get('header_row') as string | null
    const headerRow = headerRowRaw ? Math.max(1, parseInt(headerRowRaw, 10) || 1) : 1

    if (!file) {
      return NextResponse.json({ error: 'file (Excel/CSV) es requerido' }, { status: 400 })
    }

    const lower = file.name.toLowerCase()
    const isCSV = lower.endsWith('.csv') || lower.endsWith('.tsv') || file.type.includes('csv')
    const isExcel =
      lower.endsWith('.xlsx') ||
      lower.endsWith('.xls') ||
      file.type.includes('spreadsheet') ||
      file.type.includes('excel')

    if (!isCSV && !isExcel) {
      return NextResponse.json(
        { error: 'Solo se aceptan .xlsx, .xls, .csv o .tsv' },
        { status: 400 }
      )
    }

    const buf = Buffer.from(await file.arrayBuffer())
    if (buf.length === 0) {
      return NextResponse.json({ error: 'El archivo está vacío' }, { status: 400 })
    }

    // Parse con SheetJS (server-side via npm)
    let workbook: XLSX.WorkBook
    try {
      workbook = XLSX.read(buf, {
        type: 'buffer',
        cellDates: false,
        cellNF: false,
        codepage: 65001, // UTF-8 por defecto para CSV
      })
    } catch (err) {
      return NextResponse.json(
        { error: `No se pudo leer el archivo: ${(err as Error).message}` },
        { status: 400 }
      )
    }

    const sheetNames = workbook.SheetNames
    if (sheetNames.length === 0) {
      return NextResponse.json({ error: 'El archivo no tiene hojas' }, { status: 400 })
    }

    const useSheet = sheetName && sheetNames.includes(sheetName) ? sheetName : sheetNames[0]
    const sheet = workbook.Sheets[useSheet]
    if (!sheet) {
      return NextResponse.json({ error: `Hoja "${useSheet}" no encontrada` }, { status: 400 })
    }

    // Convertir a array bidimensional para tener control sobre el header_row
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: '',
      blankrows: false,
      raw: true,
    })

    if (aoa.length < headerRow) {
      return NextResponse.json(
        { error: `El archivo tiene menos de ${headerRow} filas` },
        { status: 400 }
      )
    }

    const headers = (aoa[headerRow - 1] || []).map((h) => String(h ?? '').trim())
    const dataRows = aoa.slice(headerRow)

    if (headers.length === 0) {
      return NextResponse.json({ error: 'No se detectaron columnas en el header' }, { status: 400 })
    }

    const columnMap = detectColumns(headers)

    if (columnMap.sku === null && columnMap.description === null) {
      return NextResponse.json(
        {
          error:
            'No se pudo detectar columna de SKU ni descripción. Renombrá las columnas a "SKU/Código" y "Descripción".',
          headers,
        },
        { status: 400 }
      )
    }

    // Construir filas
    const parsedRows: ExcelRow[] = []
    for (let i = 0; i < dataRows.length; i++) {
      const r = dataRows[i] || []
      // saltear filas totalmente vacías
      if (!r.some((c) => c != null && String(c).trim() !== '')) continue

      const rawObj: Record<string, unknown> = {}
      for (let c = 0; c < headers.length; c++) {
        rawObj[headers[c] || `col_${c}`] = r[c] ?? null
      }

      const sku =
        columnMap.sku !== null && r[columnMap.sku] != null
          ? String(r[columnMap.sku]).trim() || null
          : null
      const description =
        columnMap.description !== null && r[columnMap.description] != null
          ? String(r[columnMap.description]).trim() || null
          : null
      const price = columnMap.price !== null ? toNumber(r[columnMap.price]) : null
      const cost = columnMap.cost !== null ? toNumber(r[columnMap.cost]) : null
      const brand =
        columnMap.brand !== null && r[columnMap.brand] != null
          ? String(r[columnMap.brand]).trim() || null
          : null
      const ean =
        columnMap.ean !== null && r[columnMap.ean] != null
          ? String(r[columnMap.ean]).trim() || null
          : null
      const pack = columnMap.pack !== null ? toNumber(r[columnMap.pack]) : null
      const weight = columnMap.weight !== null ? toNumber(r[columnMap.weight]) : null

      // saltar filas sin sku Y sin descripción (ruido / totales)
      if (!sku && !description) continue

      const errors: string[] = []
      if (!sku) errors.push('Sin SKU')
      if (cost == null && price == null) errors.push('Sin precio ni costo')

      parsedRows.push({
        row_number: headerRow + i + 1, // 1-based para mostrar al user
        sku,
        description,
        price,
        cost,
        brand,
        ean,
        pack,
        weight,
        raw: rawObj,
        product_id: null,
        matched: false,
        current_cost: null,
        current_price: null,
        cost_change_pct: null,
        errors,
      })
    }

    if (parsedRows.length === 0) {
      return NextResponse.json(
        { error: 'No se encontraron filas con datos válidos', headers, columnMap },
        { status: 400 }
      )
    }

    // Match contra tt_products por SKU
    const supabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )

    const skus = Array.from(new Set(parsedRows.map((r) => r.sku).filter((s): s is string => !!s)))
    const productsBySku: Record<string, { id: string; sku: string; cost_eur: number | null; price_eur: number | null }> = {}

    if (skus.length > 0) {
      // Postgres puede ser case-sensitive en igualdad. Hacemos batch en bloques de 200 para evitar URL gigante.
      const BATCH = 200
      for (let i = 0; i < skus.length; i += BATCH) {
        const slice = skus.slice(i, i + BATCH)
        const { data, error } = await supabase
          .from('tt_products')
          .select('id, sku, cost_eur, price_eur')
          .in('sku', slice)
        if (error) {
          console.warn('[supplier-offers parse-excel] product lookup error:', error.message)
          continue
        }
        if (data) {
          for (const p of data) {
            if (p.sku) productsBySku[p.sku] = p
          }
        }
      }
    }

    let matchedCount = 0
    for (const row of parsedRows) {
      if (!row.sku) continue
      const prod = productsBySku[row.sku]
      if (prod) {
        row.product_id = prod.id
        row.matched = true
        row.current_cost = prod.cost_eur != null ? Number(prod.cost_eur) : null
        row.current_price = prod.price_eur != null ? Number(prod.price_eur) : null
        if (row.cost != null && row.current_cost != null && row.current_cost > 0) {
          row.cost_change_pct = Number((((row.cost - row.current_cost) / row.current_cost) * 100).toFixed(2))
        }
        matchedCount++
      }
    }

    // Validar supplier si vino
    let supplierName: string | null = null
    if (supplierId) {
      const { data: sup } = await supabase
        .from('tt_suppliers')
        .select('id, name')
        .eq('id', supplierId)
        .maybeSingle()
      if (sup) supplierName = (sup as { name: string }).name
    }

    return NextResponse.json({
      ok: true,
      sheet: {
        used: useSheet,
        available: sheetNames,
        header_row: headerRow,
      },
      headers,
      column_map: columnMap,
      stats: {
        total_rows: parsedRows.length,
        matched: matchedCount,
        unmatched: parsedRows.length - matchedCount,
        with_errors: parsedRows.filter((r) => r.errors.length > 0).length,
      },
      supplier: supplierId ? { id: supplierId, name: supplierName } : null,
      rows: parsedRows,
    })
  } catch (err) {
    console.error('[supplier-offers parse-excel] exception:', err)
    return NextResponse.json(
      { error: (err as Error).message || 'Error inesperado' },
      { status: 500 }
    )
  }
}
