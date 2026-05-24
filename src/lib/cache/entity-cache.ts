// ============================================================================
// Mocciaro Soft — Entity Cache (IndexedDB)
// Cache local de entidades (clientes, productos, proveedores, etc.) con
// versionado por empresa, TTL y stale-while-revalidate.
//
// Patrón: la UI lee del cache de inmediato (instantáneo) y dispara una
// revalidación en background. Las mutaciones llaman a invalidate(entity).
// ============================================================================

const DB_NAME = 'mocciaro-cache';
const DB_VERSION = 1;
const META_STORE = '_meta';

export type CachedEntity =
  | 'clients'
  | 'products'
  | 'suppliers'
  | 'warehouses'
  | 'product_categories'
  | 'companies'
  | 'users';

const ENTITY_STORES: CachedEntity[] = [
  'clients',
  'products',
  'suppliers',
  'warehouses',
  'product_categories',
  'companies',
  'users',
];

export interface CacheMeta {
  key: string;            // `${entity}::${companyKey}`
  entity: CachedEntity;
  companyKey: string;     // 'all' | company_id | 'multi:id1,id2'
  fetchedAt: number;      // epoch ms
  count: number;
  ttlMs: number;
  version: number;        // schema/source version
}

// TTL por defecto: 12 horas. Las mutaciones invalidan antes igual.
const DEFAULT_TTL_MS = 12 * 60 * 60 * 1000;

// ============================================================================
// DB open
// ============================================================================

let dbInstance: IDBDatabase | null = null;
let openPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);
  if (openPromise) return openPromise;

  openPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (ev) => {
      const db = (ev.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'key' });
      }
      for (const name of ENTITY_STORES) {
        if (!db.objectStoreNames.contains(name)) {
          const store = db.createObjectStore(name, { keyPath: 'id' });
          // Índice por empresa para filtrado rápido
          try {
            store.createIndex('company_id', 'company_id', { unique: false });
          } catch {}
        }
      }
    };

    req.onsuccess = () => {
      dbInstance = req.result;
      dbInstance.onclose = () => { dbInstance = null; openPromise = null; };
      resolve(dbInstance);
    };

    req.onerror = () => {
      openPromise = null;
      reject(req.error);
    };
  });

  return openPromise;
}

function idbReq<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

// ============================================================================
// Meta helpers
// ============================================================================

function metaKey(entity: CachedEntity, companyKey: string) {
  return `${entity}::${companyKey}`;
}

export async function getMeta(entity: CachedEntity, companyKey: string): Promise<CacheMeta | null> {
  try {
    const db = await openDB();
    const tx = db.transaction(META_STORE, 'readonly');
    const store = tx.objectStore(META_STORE);
    const data = await idbReq<CacheMeta | undefined>(store.get(metaKey(entity, companyKey)));
    return data ?? null;
  } catch {
    return null;
  }
}

async function setMeta(meta: CacheMeta): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(META_STORE, 'readwrite');
  tx.objectStore(META_STORE).put(meta);
  await txDone(tx);
}

// ============================================================================
// API pública
// ============================================================================

export interface CacheEntry<T> {
  data: T[];
  meta: CacheMeta | null;
  isStale: boolean;
  isEmpty: boolean;
}

/**
 * Lee todas las filas cacheadas de una entidad para una empresa.
 * Devuelve también el meta con la antigüedad para que la UI decida si refresca.
 */
export async function readCache<T = unknown>(
  entity: CachedEntity,
  companyKey: string
): Promise<CacheEntry<T>> {
  try {
    const db = await openDB();
    const tx = db.transaction([entity, META_STORE], 'readonly');
    const store = tx.objectStore(entity);
    const all = await idbReq<T[]>(store.getAll());
    const meta = await idbReq<CacheMeta | undefined>(
      tx.objectStore(META_STORE).get(metaKey(entity, companyKey))
    );
    const m = meta ?? null;
    const isStale = !m || (Date.now() - m.fetchedAt) > m.ttlMs;
    // Si no hay meta para esta company, filtramos en memoria por si quedó
    // algo de otra empresa (ej. usuario cambió de compañía sin recargar).
    const filtered = m
      ? all
      : all.filter((row) => {
          const r = row as Record<string, unknown>;
          if (companyKey === 'all') return true;
          if (!('company_id' in r)) return true;
          return r.company_id === companyKey;
        });
    return {
      data: filtered,
      meta: m,
      isStale,
      isEmpty: filtered.length === 0,
    };
  } catch (err) {
    console.warn('[cache] readCache error', entity, err);
    return { data: [], meta: null, isStale: true, isEmpty: true };
  }
}

/**
 * Reemplaza el contenido cacheado de una entidad para una empresa.
 * (Borra y reescribe — los listados son completos, no incrementales.)
 */
export async function writeCache<T extends { id: string | number }>(
  entity: CachedEntity,
  companyKey: string,
  rows: T[],
  opts?: { ttlMs?: number; version?: number }
): Promise<void> {
  const db = await openDB();
  const tx = db.transaction([entity, META_STORE], 'readwrite');
  const store = tx.objectStore(entity);
  store.clear();
  for (const row of rows) {
    try { store.put(row); } catch {}
  }
  const meta: CacheMeta = {
    key: metaKey(entity, companyKey),
    entity,
    companyKey,
    fetchedAt: Date.now(),
    count: rows.length,
    ttlMs: opts?.ttlMs ?? DEFAULT_TTL_MS,
    version: opts?.version ?? 1,
  };
  tx.objectStore(META_STORE).put(meta);
  await txDone(tx);
}

/**
 * Marca el cache como sucio (próxima lectura forzará refetch).
 * No borra los datos, así la UI sigue mostrando algo mientras revalida.
 */
export async function invalidate(entity: CachedEntity, companyKey?: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(META_STORE, 'readwrite');
    const store = tx.objectStore(META_STORE);
    if (companyKey) {
      const m = await idbReq<CacheMeta | undefined>(store.get(metaKey(entity, companyKey)));
      if (m) {
        m.fetchedAt = 0;
        store.put(m);
      }
    } else {
      // invalidar todas las companies para esa entidad
      const allMeta = await idbReq<CacheMeta[]>(store.getAll());
      for (const m of allMeta) {
        if (m.entity === entity) {
          m.fetchedAt = 0;
          store.put(m);
        }
      }
    }
    await txDone(tx);
  } catch (err) {
    console.warn('[cache] invalidate error', entity, err);
  }
}

/**
 * Borra completamente una entidad cacheada (útil al cambiar de empresa).
 */
export async function clearEntity(entity: CachedEntity): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction([entity, META_STORE], 'readwrite');
    tx.objectStore(entity).clear();
    // Borrar todos los metas de esa entidad
    const metaStore = tx.objectStore(META_STORE);
    const allMeta = await idbReq<CacheMeta[]>(metaStore.getAll());
    for (const m of allMeta) {
      if (m.entity === entity) metaStore.delete(m.key);
    }
    await txDone(tx);
  } catch (err) {
    console.warn('[cache] clearEntity error', entity, err);
  }
}

/**
 * Borra todo el cache (logout, debug).
 */
export async function clearAll(): Promise<void> {
  for (const e of ENTITY_STORES) await clearEntity(e);
}

/**
 * Devuelve metadata de todas las entidades cacheadas (para UI de estado).
 */
export async function listMeta(): Promise<CacheMeta[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(META_STORE, 'readonly');
    return await idbReq<CacheMeta[]>(tx.objectStore(META_STORE).getAll());
  } catch {
    return [];
  }
}

// ============================================================================
// Eventos para sincronizar pestañas y notificar a la UI
// ============================================================================

const channelName = 'mocciaro-cache-events';
let bc: BroadcastChannel | null = null;
function getChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined') return null;
  if (typeof BroadcastChannel === 'undefined') return null;
  if (!bc) {
    try { bc = new BroadcastChannel(channelName); } catch { bc = null; }
  }
  return bc;
}

export type CacheEvent =
  | { kind: 'updated'; entity: CachedEntity; companyKey: string; count: number }
  | { kind: 'invalidated'; entity: CachedEntity; companyKey?: string }
  | { kind: 'refreshing'; entity: CachedEntity; companyKey: string }
  | { kind: 'error'; entity: CachedEntity; companyKey: string; message: string };

export function emitCacheEvent(ev: CacheEvent) {
  getChannel()?.postMessage(ev);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('mocciaro-cache', { detail: ev }));
  }
}

export function onCacheEvent(handler: (ev: CacheEvent) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const winHandler = (e: Event) => handler((e as CustomEvent<CacheEvent>).detail);
  window.addEventListener('mocciaro-cache', winHandler);
  const ch = getChannel();
  const msgHandler = (e: MessageEvent) => handler(e.data as CacheEvent);
  ch?.addEventListener('message', msgHandler);
  return () => {
    window.removeEventListener('mocciaro-cache', winHandler);
    ch?.removeEventListener('message', msgHandler);
  };
}
