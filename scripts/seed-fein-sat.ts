/**
 * scripts/seed-fein-sat.ts
 *
 * Seed de datos FEIN AccuTec al modulo SAT del Mocciaro Soft.
 * - Parsea /Mi unidad/.../buscatools-fein/js/data.js (sin ejecutar JS)
 * - Inserta en tt_fein_models (9), tt_sat_spare_parts (~418), tt_sat_assets (330)
 * - Para cada activo: fuzzy-match contra tt_clients por nombre normalizado.
 *   Si no existe, crea el cliente con source='fein_seed'.
 * - Todo asociado a TorqueTools SL (company_id configurable por env).
 *
 * Uso:
 *   npx tsx scripts/seed-fein-sat.ts
 *
 * Variables necesarias en .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Opcional:
 *   FEIN_DATA_JS=/ruta/a/data.js      (default: Mi unidad/.../buscatools-fein/js/data.js)
 *   TARGET_COMPANY_NAME=TorqueTools SL (default)
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local')
  process.exit(1)
}

const DATA_JS_PATH = process.env.FEIN_DATA_JS || resolve(
  process.env.HOME!,
  'Mi unidad/@ADMINISTRACION JMJM/CLAUDE CODE JMJM 2026/buscatools-fein/js/data.js'
)
const TARGET_COMPANY = process.env.TARGET_COMPANY_NAME || 'TorqueTools SL'

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

// ------------------------------------------------------------------
// Parser: extrae arrays JS como JSON sin ejecutar el codigo
// ------------------------------------------------------------------
function extractArray(text: string, varName: string): any[] | null {
  const re = new RegExp(`const\\s+${varName}\\s*=\\s*(\\[|\\{)`, 'm')
  const m = re.exec(text)
  if (!m) return null
  const startChar = m[1]
  const closeChar = startChar === '[' ? ']' : '}'
  let start = m.index + m[0].length - 1
  let depth = 0
  let i = start
  let inString: string | null = null
  while (i < text.length) {
    const c = text[i]
    if (inString) {
      if (c === '\\') i++
      else if (c === inString) inString = null
    } else if (c === '"' || c === "'") {
      inString = c
    } else if (c === startChar) depth++
    else if (c === closeChar) {
      depth--
      if (depth === 0) break
    }
    i++
  }
  const chunk = text.slice(start, i + 1)
  // Normalizar a JSON valido: remover comentarios //, keys sin comillas → con comillas, single→double, trailing commas
  const normalized = chunk
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"])\/\/.*$/gm, '$1')
    .replace(/([\{,]\s*)([a-zA-Z_$][\w$]*)\s*:/g, '$1"$2":')
    .replace(/'((?:[^'\\]|\\.)*)'/g, (_s, body) => `"${body.replace(/"/g, '\\"')}"`)
    .replace(/,(\s*[\}\]])/g, '$1')
  try {
    return JSON.parse(normalized)
  } catch (e: any) {
    console.error(`Error parsing ${varName}:`, e.message)
    console.error('Chunk preview:', normalized.slice(0, 300))
    return null
  }
}

function extractObject(text: string, varName: string): Record<string, any> | null {
  const arr = extractArray(text, varName)
  if (Array.isArray(arr)) return arr as any
  return arr as any
}

// ------------------------------------------------------------------
// Utils
// ------------------------------------------------------------------
function norm(s?: string | null): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim()
}

async function chunked<T>(arr: T[], size: number, fn: (batch: T[]) => Promise<any>): Promise<void> {
  for (let i = 0; i < arr.length; i += size) {
    await fn(arr.slice(i, i + size))
  }
}

// ------------------------------------------------------------------
// MAIN
// ------------------------------------------------------------------
async function main() {
  console.log(`Leyendo data.js desde: ${DATA_JS_PATH}`)
  const text = readFileSync(DATA_JS_PATH, 'utf-8')

  const ACTIVOS = extractArray(text, 'ACTIVOS_BASE')
  const REPUESTOS = extractArray(text, 'REPUESTOS_FEIN')
  const ACCESORIOS = extractArray(text, 'ACCESORIOS_FEIN')
  const MODELOS = extractArray(text, 'MODELOS_FEIN')
  const FEIN_SPECS = extractObject(text, 'FEIN_SPECS')

  console.log(`  ACTIVOS_BASE:    ${ACTIVOS?.length || 0}`)
  console.log(`  REPUESTOS_FEIN:  ${REPUESTOS?.length || 0}`)
  console.log(`  ACCESORIOS_FEIN: ${ACCESORIOS?.length || 0}`)
  console.log(`  MODELOS_FEIN:    ${MODELOS?.length || 0}`)
  console.log(`  FEIN_SPECS:      ${FEIN_SPECS ? Object.keys(FEIN_SPECS).length : 0}`)

  if (!ACTIVOS || !REPUESTOS || !MODELOS) {
    console.error('Error: no se pudieron parsear las constantes principales. Revisar data.js.')
    process.exit(1)
  }

  // -- 1) Buscar company_id de TorqueTools SL ---------------------
  const { data: companies, error: compErr } = await sb
    .from('tt_companies')
    .select('id, name')
    .ilike('name', `%${TARGET_COMPANY}%`)
    .limit(1)
  if (compErr || !companies?.length) {
    console.error(`No se encontro la empresa "${TARGET_COMPANY}":`, compErr?.message)
    process.exit(1)
  }
  const COMPANY_ID = companies[0].id
  console.log(`\nEmpresa target: ${companies[0].name}  (${COMPANY_ID})`)

  // -- 2) Insertar tt_fein_models ---------------------------------
  console.log('\n▶ Insertando tt_fein_models...')
  const modelsToInsert: any[] = []
  if (FEIN_SPECS) {
    for (const [code, spec] of Object.entries(FEIN_SPECS)) {
      const s: any = spec
      modelsToInsert.push({
        model_code: code,
        name: s.nombre || s.name || code,
        tipo: s.tipo || null,
        par_min: s.par_min ?? null,
        par_max: s.par_max ?? null,
        par_unit: s.par_unit || 'Nm',
        vel_min: s.vel_min ?? null,
        vel_max: s.vel_max ?? null,
        vel_fabrica: s.vel_fabrica ?? null,
        vel_unit: s.vel_unit || 'rpm',
        peso: s.peso ?? null,
        peso_unit: s.peso_unit || 'kg',
        interfaz: s.interfaz || null,
        precision: s.precision || null,
        uso: s.uso || null,
        nro_pedido: s.nro_pedido || null,
        extra_specs: {},
      })
    }
  }
  if (modelsToInsert.length) {
    const { error } = await sb
      .from('tt_fein_models')
      .upsert(modelsToInsert, { onConflict: 'model_code' })
    if (error) { console.error('  Error:', error.message); process.exit(1) }
    console.log(`  ✓ ${modelsToInsert.length} modelos insertados`)
  }

  // -- 3) Insertar repuestos como productos en el Catalogo (tt_products) ----
  console.log('\n▶ Insertando repuestos en tt_products (Catalogo, category=Repuestos FEIN)...')

  const productsToInsert: any[] = []
  const addPart = (r: any, tipo: 'repuesto' | 'accesorio') => {
    const sku = r.sku || `${tipo.toUpperCase()}.${r.codigo || r.pos || Math.random().toString(36).slice(2, 8)}`
    const desc = r.desc || r.descripcion || ''
    productsToInsert.push({
      sku,
      name: desc,
      brand: 'FEIN',
      category: 'Repuestos FEIN',
      subcategory: tipo,
      cost_eur: r.precio_eur || 0,
      price_eur: r.precio_eur || 0,
      price_usd: r.precio_venta || 0,
      image_url: r.img_url || null,
      modelo: (r.modelos || []).join(', '),
      specs: {
        pos: r.pos || null,
        codigo_fein: r.codigo || null,
        modelos_compatibles: r.modelos || [],
        tipo,
        origen: 'fein_sat_migration',
      },
      active: true,
    })
  }
  for (const r of REPUESTOS || []) addPart(r, 'repuesto')
  for (const a of ACCESORIOS || []) addPart(a, 'accesorio')

  // Deduplicar por sku
  const seenSkus = new Set<string>()
  const productsUnique = productsToInsert.filter((p) => {
    if (seenSkus.has(p.sku)) return false
    seenSkus.add(p.sku)
    return true
  })
  const dupes = productsToInsert.length - productsUnique.length
  if (dupes > 0) console.log(`  (${dupes} SKUs duplicados eliminados)`)
  await chunked(productsUnique, 200, async (batch) => {
    const { error } = await sb
      .from('tt_products')
      .upsert(batch, { onConflict: 'sku' })
    if (error) { console.error('  Error batch:', error.message); throw error }
  })
  console.log(`  ✓ ${productsUnique.length} productos en Catalogo (${REPUESTOS?.length || 0} repuestos + ${ACCESORIOS?.length || 0} accesorios)`)

  // -- 4) Fuzzy match de clientes y alta de faltantes --------------
  console.log('\n▶ Resolviendo clientes...')
  const uniqueClients = new Map<string, { raw: string; ciudad?: string; provincia?: string; refCli?: string }>()
  for (const a of ACTIVOS) {
    const name = (a.cliente || '').trim()
    if (!name) continue
    const key = norm(name)
    if (!uniqueClients.has(key)) {
      uniqueClients.set(key, {
        raw: name,
        ciudad: a.ciudad || undefined,
        provincia: a.provincia || undefined,
        refCli: a.ref_cli || undefined,
      })
    }
  }
  console.log(`  Clientes unicos en ACTIVOS_BASE: ${uniqueClients.size}`)

  // Traer todos los clientes existentes
  const { data: existingClients } = await sb
    .from('tt_clients')
    .select('id, name')
    .limit(10000)
  const clientLookup = new Map<string, string>() // normalized name → id
  for (const c of existingClients || []) {
    clientLookup.set(norm(c.name as string), c.id as string)
  }

  const clientsToInsert: any[] = []
  const resolved = new Map<string, string>() // normalized → id
  let matched = 0
  for (const [key, info] of uniqueClients) {
    if (clientLookup.has(key)) {
      resolved.set(key, clientLookup.get(key)!)
      matched++
    } else {
      clientsToInsert.push({
        name: info.raw,
        city: info.ciudad || null,
        state: info.provincia || null,
        country: 'AR',
        active: true,
        source: 'fein_seed',
      })
    }
  }
  console.log(`  Matched con tt_clients: ${matched}`)
  console.log(`  Nuevos a crear:          ${clientsToInsert.length}`)

  if (clientsToInsert.length) {
    const { data: inserted, error } = await sb
      .from('tt_clients')
      .insert(clientsToInsert)
      .select('id, name')
    if (error) { console.error('  Error creando clientes:', error.message); process.exit(1) }
    for (const c of inserted || []) {
      resolved.set(norm(c.name as string), c.id as string)
    }
    console.log(`  ✓ ${inserted?.length || 0} clientes creados con source='fein_seed'`)
  }

  // -- 5) Insertar tt_sat_assets ----------------------------------
  console.log('\n▶ Insertando tt_sat_assets...')
  const assets: any[] = ACTIVOS.map((a: any) => {
    const clientKey = norm(a.cliente)
    return {
      ref: a.ref,
      internal_id: a.id || null,
      serial_number: a.serie || null,
      brand: 'FEIN',
      model: a.modelo || null,
      model_normalized: (a.modelo_norm || a.modelo || '')
        .replace(/\s+/g, '')
        .replace(/-PC$/i, '')
        .toUpperCase() || null,
      client_id: resolved.get(clientKey) || null,
      client_name_raw: a.cliente || null,
      company_id: COMPANY_ID,
      city: a.ciudad || null,
      province: a.provincia || null,
      country: a.pais || 'AR',
      is_new: false,
    }
  })
  await chunked(assets, 200, async (batch) => {
    const { error } = await sb
      .from('tt_sat_assets')
      .upsert(batch, { onConflict: 'ref' })
    if (error) { console.error('  Error batch:', error.message); throw error }
  })
  console.log(`  ✓ ${assets.length} activos insertados`)

  // -- 6) Resumen --------------------------------------------------
  console.log('\n═══════════════════════════════════════')
  console.log('  RESUMEN SEED')
  console.log('═══════════════════════════════════════')
  console.log(`  tt_fein_models:      ${modelsToInsert.length}`)
  console.log(`  tt_products (Catalogo FEIN): ${productsUnique.length}`)
  console.log(`  tt_clients (new):    ${clientsToInsert.length}`)
  console.log(`  tt_sat_assets:       ${assets.length}`)
  console.log(`  Empresa:             ${TARGET_COMPANY}`)
  console.log('\n✓ Seed completado.')
}

main().catch((e) => {
  console.error('ERROR FATAL:', e)
  process.exit(1)
})
