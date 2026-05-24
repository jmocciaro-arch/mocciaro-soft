// ============================================================================
// Mocciaro Soft — Cache Fetchers
// Cada fetcher trae el listado completo de una entidad desde Supabase,
// paginando por bloques, y persiste en IndexedDB via entity-cache.
// ============================================================================

import { createClient } from '@/lib/supabase/client'
import {
  writeCache,
  invalidate,
  emitCacheEvent,
  type CachedEntity,
} from './entity-cache'

const PAGE_SIZE = 1000

interface CompanyScope {
  /** IDs de empresas activas (vacío = sin acceso, devuelve []). */
  companyIds: string[]
  /** Si true, ignora filtro de empresa (entidades globales como productos). */
  global?: boolean
}

export function buildCompanyKey(scope: CompanyScope): string {
  if (scope.global) return 'global'
  if (scope.companyIds.length === 0) return 'none'
  if (scope.companyIds.length === 1) return scope.companyIds[0]
  return 'multi:' + [...scope.companyIds].sort().join(',')
}

// ============================================================================
// Helper: paginar una tabla completa con un filtro opcional por empresa
// ============================================================================

// Tipos laxos para queries de Supabase — cada paso devuelve un builder
// distinto y queremos un único helper genérico que sepa encadenar.
type AnyQuery = {
  eq: (c: string, v: unknown) => AnyQuery;
  neq: (c: string, v: unknown) => AnyQuery;
  in: (c: string, v: unknown[]) => AnyQuery;
  gte: (c: string, v: unknown) => AnyQuery;
  lte: (c: string, v: unknown) => AnyQuery;
  order: (c: string, opt?: { ascending?: boolean }) => AnyQuery;
  range: (a: number, b: number) => Promise<{ data: unknown; error: unknown }> & AnyQuery;
  or: (filter: string) => AnyQuery;
  not: (c: string, op: string, v: unknown) => AnyQuery;
}

interface FetchOptions {
  table: string
  select: string
  orderBy?: { column: string; ascending?: boolean }
  extraFilter?: (q: AnyQuery) => AnyQuery
  companyColumn?: string
  scope: CompanyScope
}

async function fetchAllPaged<T>({
  table,
  select,
  orderBy,
  extraFilter,
  companyColumn = 'company_id',
  scope,
}: FetchOptions): Promise<T[]> {
  const supabase = createClient()
  // Sin empresa seleccionada → no traemos nada (evita leaks)
  if (!scope.global && scope.companyIds.length === 0) return []

  let all: T[] = []
  let from = 0
  let keep = true

  while (keep) {
    let q = supabase.from(table).select(select) as unknown as AnyQuery
    if (orderBy) {
      q = q.order(orderBy.column, { ascending: orderBy.ascending ?? true })
    }
    if (!scope.global && scope.companyIds.length > 0) {
      q = scope.companyIds.length === 1
        ? q.eq(companyColumn, scope.companyIds[0])
        : q.in(companyColumn, scope.companyIds)
    }
    if (extraFilter) q = extraFilter(q)
    q = q.range(from, from + PAGE_SIZE - 1)
    const { data, error } = await (q as unknown as Promise<{ data: T[] | null; error: unknown }>)
    if (error) throw error
    const batch = (data || []) as T[]
    all = all.concat(batch)
    if (batch.length < PAGE_SIZE) keep = false
    else from += PAGE_SIZE
  }
  return all
}

// ============================================================================
// Fetchers por entidad
// ============================================================================

export interface FetchResult {
  entity: CachedEntity
  companyKey: string
  count: number
  ms: number
}

async function runAndCache<T extends { id: string | number }>(
  entity: CachedEntity,
  companyKey: string,
  run: () => Promise<T[]>
): Promise<FetchResult> {
  const t0 = performance.now()
  emitCacheEvent({ kind: 'refreshing', entity, companyKey })
  try {
    const rows = await run()
    await writeCache(entity, companyKey, rows)
    const ms = performance.now() - t0
    emitCacheEvent({ kind: 'updated', entity, companyKey, count: rows.length })
    console.log(`[cache] ${entity} (${companyKey}): ${rows.length} filas en ${ms.toFixed(0)}ms`)
    return { entity, companyKey, count: rows.length, ms }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    emitCacheEvent({ kind: 'error', entity, companyKey, message })
    console.error(`[cache] error refrescando ${entity}:`, err)
    throw err
  }
}

export async function refreshClients(scope: CompanyScope): Promise<FetchResult> {
  const companyKey = buildCompanyKey(scope)
  return runAndCache('clients', companyKey, () =>
    fetchAllPaged<{ id: string }>({
      table: 'tt_clients',
      select: '*',
      orderBy: { column: 'legal_name', ascending: true },
      extraFilter: (q) => q.eq('active', true),
      scope,
    })
  )
}

export async function refreshSuppliers(scope: CompanyScope): Promise<FetchResult> {
  const companyKey = buildCompanyKey(scope)
  return runAndCache('suppliers', companyKey, () =>
    fetchAllPaged<{ id: string }>({
      table: 'tt_suppliers',
      select: '*',
      orderBy: { column: 'legal_name', ascending: true },
      extraFilter: (q) => q.eq('active', true),
      scope,
    })
  )
}

export async function refreshProducts(): Promise<FetchResult> {
  // Productos son globales (no filtran por empresa)
  return runAndCache('products', 'global', () =>
    fetchAllPaged<{ id: string }>({
      table: 'tt_products',
      // Solo columnas necesarias para listados/búsquedas (no specs JSONB pesado)
      select: 'id, sku, name, brand, category, subcategory, encastre, price_eur, cost_eur, active, lifecycle_status, image_url',
      orderBy: { column: 'sku', ascending: true },
      extraFilter: (q) => q.eq('active', true),
      scope: { companyIds: [], global: true },
    })
  )
}

export async function refreshProductCategories(): Promise<FetchResult> {
  return runAndCache('product_categories', 'global', () =>
    fetchAllPaged<{ id: string }>({
      table: 'tt_product_categories',
      select: '*',
      orderBy: { column: 'name', ascending: true },
      scope: { companyIds: [], global: true },
    })
  )
}

export async function refreshWarehouses(scope: CompanyScope): Promise<FetchResult> {
  const companyKey = buildCompanyKey(scope)
  return runAndCache('warehouses', companyKey, () =>
    fetchAllPaged<{ id: string }>({
      table: 'tt_warehouses',
      select: '*',
      orderBy: { column: 'name', ascending: true },
      scope,
    })
  )
}

export async function refreshDocuments(scope: CompanyScope): Promise<FetchResult> {
  // Solo los últimos 90 días de documentos: balance entre utilidad offline y peso.
  const NINETY_DAYS_AGO = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
  const companyKey = buildCompanyKey(scope)
  return runAndCache('documents', companyKey, () =>
    fetchAllPaged<{ id: string }>({
      table: 'tt_documents',
      // Columnas suficientes para listados, búsqueda y vista resumen
      select: 'id, doc_type, system_code, display_ref, status, total, client_id, company_id, currency, created_at, updated_at, metadata',
      orderBy: { column: 'created_at', ascending: false },
      extraFilter: (q) => q.gte('created_at', NINETY_DAYS_AGO),
      scope,
    })
  )
}

export async function refreshClientContacts(): Promise<FetchResult> {
  // Contactos son globales (FK a clientes); filtran por client_id en uso
  return runAndCache('client_contacts', 'global', () =>
    fetchAllPaged<{ id: string }>({
      table: 'tt_client_contacts',
      select: 'id, client_id, name, position, email, phone, is_primary',
      orderBy: { column: 'name', ascending: true },
      scope: { companyIds: [], global: true },
    })
  )
}

export async function refreshCompanies(): Promise<FetchResult> {
  return runAndCache('companies', 'global', () =>
    fetchAllPaged<{ id: string }>({
      table: 'tt_companies',
      select: 'id, name, country, currency, company_type',
      orderBy: { column: 'name', ascending: true },
      scope: { companyIds: [], global: true },
    })
  )
}

// ============================================================================
// Prefetch — corre al loguearse / cambiar de empresa
// ============================================================================

export interface PrefetchOptions {
  companyIds: string[]
  /** Si true, fuerza refresh aunque haya cache fresco. */
  force?: boolean
  /** Llamado por cada entidad terminada (para UI de progreso). */
  onEntity?: (result: FetchResult) => void
}

export async function prefetchAll(opts: PrefetchOptions): Promise<void> {
  const scope: CompanyScope = { companyIds: opts.companyIds }
  // Disparamos en paralelo pero no rompemos si una falla
  const tasks: Promise<FetchResult | null>[] = [
    refreshCompanies().catch(() => null),
    refreshProducts().catch(() => null),
    refreshProductCategories().catch(() => null),
    refreshClients(scope).catch(() => null),
    refreshSuppliers(scope).catch(() => null),
    refreshWarehouses(scope).catch(() => null),
    refreshDocuments(scope).catch(() => null),
    refreshClientContacts().catch(() => null),
  ]
  const results = await Promise.all(tasks)
  for (const r of results) if (r && opts.onEntity) opts.onEntity(r)
}

// ============================================================================
// Invalidaciones convenientes (las llaman las páginas tras CRUD)
// ============================================================================

export const cacheInvalidate = {
  clients: () => invalidate('clients'),
  suppliers: () => invalidate('suppliers'),
  products: () => invalidate('products'),
  productCategories: () => invalidate('product_categories'),
  warehouses: () => invalidate('warehouses'),
  companies: () => invalidate('companies'),
  documents: () => invalidate('documents'),
  clientContacts: () => invalidate('client_contacts'),
}
