// ============================================================================
// Mocciaro Soft ERP — Offline Store (IndexedDB)
// Sistema de almacenamiento offline completo con sync last-write-wins.
//
// DB_VERSION 2 (2026-05-20): se agregaron stores para Stock, Compras, SAT,
// Ventas y Documentos. Last-write-wins: cada item guarda __local_updated_at,
// y el sync compara contra el server antes de pisar.
// ============================================================================

const DB_NAME = 'torquetools-offline';
export const DB_VERSION = 2;

// ============================================================================
// Tipos
// ============================================================================

export interface PendingAction {
  id: string;
  type: string;
  url: string;
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body: Record<string, unknown>;
  createdAt: number;
  description: string;
}

export interface OfflineProduct {
  id: string;
  [key: string]: unknown;
}

export interface OfflineClient {
  id: string;
  [key: string]: unknown;
}

export interface OfflineQuote {
  id: string;
  [key: string]: unknown;
}

export interface UserSetting {
  key: string;
  value: unknown;
}

/**
 * Definición de stores. Si agregás uno nuevo, subí DB_VERSION arriba y
 * agregalo acá — el upgrade handler lo crea si no existe.
 */
interface StoreDef {
  name: string;
  indices?: Array<{ name: string; keyPath: string; unique?: boolean }>;
}

const STORE_DEFS: StoreDef[] = [
  // === Catálogo ===
  { name: 'products', indices: [{ name: 'brand', keyPath: 'brand' }] },
  { name: 'product_categories' },
  { name: 'warehouses' },

  // === Stock ===
  {
    name: 'stock',
    indices: [
      { name: 'product_id', keyPath: 'product_id' },
      { name: 'warehouse_id', keyPath: 'warehouse_id' },
    ],
  },

  // === Clientes ===
  { name: 'clients', indices: [{ name: 'assigned_to', keyPath: 'assigned_to' }] },
  { name: 'client_contacts', indices: [{ name: 'client_id', keyPath: 'client_id' }] },

  // === Proveedores ===
  { name: 'suppliers' },
  { name: 'supplier_contacts', indices: [{ name: 'supplier_id', keyPath: 'supplier_id' }] },

  // === Compras ===
  { name: 'purchase_orders', indices: [{ name: 'supplier_id', keyPath: 'supplier_id' }] },
  { name: 'po_items', indices: [{ name: 'po_id', keyPath: 'po_id' }] },
  { name: 'purchase_invoices', indices: [{ name: 'supplier_id', keyPath: 'supplier_id' }] },
  { name: 'purchase_payments', indices: [{ name: 'invoice_id', keyPath: 'invoice_id' }] },

  // === Ventas (legacy local) ===
  { name: 'quotes', indices: [
    { name: 'client_id', keyPath: 'client_id' },
    { name: 'created_at', keyPath: 'created_at' },
  ]},
  { name: 'sales_orders', indices: [{ name: 'client_id', keyPath: 'client_id' }] },
  { name: 'invoices', indices: [{ name: 'client_id', keyPath: 'client_id' }] },
  { name: 'payments', indices: [{ name: 'invoice_id', keyPath: 'invoice_id' }] },

  // === Documentos unificados (workflow) ===
  {
    name: 'documents',
    indices: [
      { name: 'client_id', keyPath: 'client_id' },
      { name: 'type', keyPath: 'type' },
      { name: 'company_id', keyPath: 'company_id' },
    ],
  },
  { name: 'document_items', indices: [{ name: 'document_id', keyPath: 'document_id' }] },
  { name: 'document_links', indices: [
    { name: 'from_document_id', keyPath: 'from_document_id' },
    { name: 'to_document_id', keyPath: 'to_document_id' },
  ]},

  // === SAT ===
  { name: 'sat_tickets', indices: [{ name: 'client_id', keyPath: 'client_id' }] },

  // === Companies / Auth ===
  { name: 'companies' },
  { name: 'users' },

  // === Cola de sync + settings ===
  {
    name: 'pending_actions',
    indices: [
      { name: 'createdAt', keyPath: 'createdAt' },
      { name: 'type', keyPath: 'type' },
      { name: 'synced', keyPath: 'synced' },
    ],
  },
  { name: 'user_settings' },
];

// Tablas que tienen cache offline (alineado con use-offline-data.ts)
export const OFFLINE_TABLES: readonly string[] = STORE_DEFS
  .map((s) => s.name)
  .filter((n) => n !== 'pending_actions' && n !== 'user_settings') as readonly string[];

// ============================================================================
// Abrir / crear la base de datos
// ============================================================================

let dbInstance: IDBDatabase | null = null;

export function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB no disponible'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const tx = (event.target as IDBOpenDBRequest).transaction;

      for (const def of STORE_DEFS) {
        let store: IDBObjectStore;
        if (!db.objectStoreNames.contains(def.name)) {
          const keyPath = def.name === 'user_settings' ? 'key' : 'id';
          store = db.createObjectStore(def.name, { keyPath });
        } else {
          if (!tx) continue;
          store = tx.objectStore(def.name);
        }

        for (const idx of def.indices ?? []) {
          if (!store.indexNames.contains(idx.name)) {
            try {
              store.createIndex(idx.name, idx.keyPath, { unique: !!idx.unique });
            } catch (err) {
              // El índice ya existe con otra config: ignorar
              console.warn(`[OfflineStore] No se pudo crear índice ${idx.name} en ${def.name}:`, err);
            }
          }
        }
      }
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      dbInstance.onclose = () => {
        dbInstance = null;
      };
      // Si otro tab pide upgrade, cerrar la conexión para no bloquear
      dbInstance.onversionchange = () => {
        dbInstance?.close();
        dbInstance = null;
      };
      resolve(dbInstance);
    };

    request.onerror = () => {
      console.error('[OfflineStore] Error abriendo IndexedDB:', request.error);
      reject(request.error);
    };

    request.onblocked = () => {
      console.warn('[OfflineStore] DB bloqueada — hay otra pestaña con versión vieja');
    };
  });
}

// ============================================================================
// Helpers genéricos
// ============================================================================

async function getStore(
  storeName: string,
  mode: IDBTransactionMode = 'readonly'
): Promise<IDBObjectStore> {
  const db = await openDB();
  const tx = db.transaction(storeName, mode);
  return tx.objectStore(storeName);
}

function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getAllFromStore<T>(storeName: string): Promise<T[]> {
  const store = await getStore(storeName);
  return idbRequest<T[]>(store.getAll());
}

async function putInStore<T>(storeName: string, data: T): Promise<void> {
  const store = await getStore(storeName, 'readwrite');
  await idbRequest(store.put(data));
}

async function putManyInStore<T>(storeName: string, items: T[]): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(storeName, 'readwrite');
  const store = tx.objectStore(storeName);
  for (const item of items) {
    store.put(item);
  }
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteFromStore(storeName: string, key: string): Promise<void> {
  const store = await getStore(storeName, 'readwrite');
  await idbRequest(store.delete(key));
}

async function clearStore(storeName: string): Promise<void> {
  const store = await getStore(storeName, 'readwrite');
  await idbRequest(store.clear());
}

// ============================================================================
// API genérica para CUALQUIER tabla offline
// ============================================================================

/**
 * Guarda una colección completa en el store. Reemplaza todo (clearStore + putMany).
 */
export async function saveCollection<T extends { id: string }>(
  table: string,
  items: T[]
): Promise<void> {
  if (!OFFLINE_TABLES.includes(table)) {
    console.warn(`[OfflineStore] Tabla "${table}" no tiene store offline`);
    return;
  }
  await clearStore(table);
  await putManyInStore(table, items);
  await markSyncedAt(table);
  console.log(`[OfflineStore] ${items.length} items guardados en ${table}`);
}

/**
 * Merge: actualiza/inserta sin borrar lo que no venga. Útil para sync incremental.
 */
export async function upsertCollection<T extends { id: string }>(
  table: string,
  items: T[]
): Promise<void> {
  if (!OFFLINE_TABLES.includes(table)) {
    console.warn(`[OfflineStore] Tabla "${table}" no tiene store offline`);
    return;
  }
  await putManyInStore(table, items);
  await markSyncedAt(table);
}

export async function getCollection<T>(table: string): Promise<T[]> {
  if (!OFFLINE_TABLES.includes(table)) return [];
  return getAllFromStore<T>(table);
}

export async function getOne<T>(table: string, id: string): Promise<T | undefined> {
  if (!OFFLINE_TABLES.includes(table)) return undefined;
  const store = await getStore(table);
  return idbRequest<T | undefined>(store.get(id));
}

export async function saveOne<T extends { id: string }>(
  table: string,
  item: T
): Promise<void> {
  if (!OFFLINE_TABLES.includes(table)) return;
  // Marcar timestamp local para LWW
  const stamped = { ...item, __local_updated_at: Date.now() };
  await putInStore(table, stamped);
}

export async function deleteOne(table: string, id: string): Promise<void> {
  if (!OFFLINE_TABLES.includes(table)) return;
  await deleteFromStore(table, id);
}

/** Devuelve items filtrados por un campo + valor (usa índice si existe) */
export async function queryByIndex<T>(
  table: string,
  indexName: string,
  value: IDBValidKey
): Promise<T[]> {
  if (!OFFLINE_TABLES.includes(table)) return [];
  const store = await getStore(table);
  if (!store.indexNames.contains(indexName)) {
    // Fallback: full scan
    const all = await idbRequest<T[]>(store.getAll());
    return all.filter((item) => (item as Record<string, unknown>)[indexName] === value);
  }
  const index = store.index(indexName);
  return idbRequest<T[]>(index.getAll(value));
}

// ============================================================================
// PRODUCTOS — APIs específicas (compat)
// ============================================================================

export async function saveProducts(products: OfflineProduct[]): Promise<void> {
  return saveCollection('products', products);
}

export async function getProducts(): Promise<OfflineProduct[]> {
  return getCollection<OfflineProduct>('products');
}

export async function getProduct(id: string): Promise<OfflineProduct | undefined> {
  return getOne<OfflineProduct>('products', id);
}

// ============================================================================
// CLIENTES — APIs específicas (compat)
// ============================================================================

export async function saveClients(clients: OfflineClient[]): Promise<void> {
  return saveCollection('clients', clients);
}

export async function getClients(): Promise<OfflineClient[]> {
  return getCollection<OfflineClient>('clients');
}

export async function getClient(id: string): Promise<OfflineClient | undefined> {
  return getOne<OfflineClient>('clients', id);
}

export async function saveClient(client: OfflineClient): Promise<void> {
  return saveOne('clients', client);
}

// ============================================================================
// COTIZACIONES — APIs específicas (compat)
// ============================================================================

export async function saveQuotes(quotes: OfflineQuote[]): Promise<void> {
  return saveCollection('quotes', quotes);
}

export async function getQuotes(): Promise<OfflineQuote[]> {
  return getCollection<OfflineQuote>('quotes');
}

export async function getQuote(id: string): Promise<OfflineQuote | undefined> {
  return getOne<OfflineQuote>('quotes', id);
}

export async function saveQuote(quote: OfflineQuote): Promise<void> {
  return saveOne('quotes', quote);
}

// ============================================================================
// ACCIONES PENDIENTES — Cola de sincronización
// ============================================================================

export async function addPendingAction(
  action: Omit<PendingAction, 'id' | 'createdAt'>
): Promise<string> {
  const id = `pending_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const fullAction: PendingAction = {
    ...action,
    id,
    createdAt: Date.now(),
  };

  await putInStore('pending_actions', fullAction);
  console.log(`[OfflineStore] Accion pendiente agregada: ${action.type} (${id})`);

  // Intentar registrar background sync
  try {
    const registration = await navigator.serviceWorker?.ready;
    if (registration && 'sync' in registration) {
      await (registration as ServiceWorkerRegistration & {
        sync: { register: (tag: string) => Promise<void> };
      }).sync.register('sync-pending-actions');
    }
  } catch (err) {
    console.warn('[OfflineStore] No se pudo registrar background sync:', err);
  }

  return id;
}

export async function getPendingActions(): Promise<PendingAction[]> {
  const actions = await getAllFromStore<PendingAction>('pending_actions');
  return actions.sort((a, b) => a.createdAt - b.createdAt);
}

export async function getPendingActionsCount(): Promise<number> {
  const actions = await getPendingActions();
  return actions.length;
}

export async function clearPendingAction(id: string): Promise<void> {
  await deleteFromStore('pending_actions', id);
}

export async function clearAllPendingActions(): Promise<void> {
  await clearStore('pending_actions');
}

// ============================================================================
// SINCRONIZACIÓN — Last-write-wins
// ============================================================================

/**
 * Lee el `updated_at` actual del server para un (table, id) y compara contra
 * el `client_updated_at` del payload. Devuelve true si el cliente gana (puede
 * pisar), false si gana el server (descarta + loguea conflicto).
 */
async function clientWins(
  table: string,
  id: string,
  clientUpdatedAt: number,
  supabaseUrl: string,
  apiKey: string,
  authToken: string
): Promise<{ wins: boolean; serverUpdatedAt?: string }> {
  try {
    const url = `${supabaseUrl}/rest/v1/${table}?id=eq.${id}&select=updated_at`;
    const res = await fetch(url, {
      headers: { apikey: apiKey, Authorization: `Bearer ${authToken}` },
    });
    if (!res.ok) return { wins: true }; // si no podemos leer, aplicamos el cambio
    const rows = (await res.json()) as Array<{ updated_at?: string }>;
    if (rows.length === 0) return { wins: true }; // no existe en server, es un create efectivo
    const serverTs = rows[0].updated_at ? new Date(rows[0].updated_at).getTime() : 0;
    return { wins: clientUpdatedAt >= serverTs, serverUpdatedAt: rows[0].updated_at };
  } catch {
    return { wins: true };
  }
}

async function logConflict(
  table: string,
  recordId: string,
  detail: Record<string, unknown>,
  supabaseUrl: string,
  apiKey: string,
  authToken: string
): Promise<void> {
  try {
    await fetch(`${supabaseUrl}/rest/v1/tt_activity_log`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: apiKey,
        Authorization: `Bearer ${authToken}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        entity_type: table,
        entity_id: recordId,
        action: 'sync_conflict_lww',
        detail,
      }),
    });
  } catch (err) {
    console.warn('[OfflineStore] No se pudo loguear conflicto LWW:', err);
  }
}

export async function syncPendingActions(): Promise<{
  synced: number;
  failed: number;
  conflicts: number;
  errors: Array<{ id: string; error: string }>;
}> {
  const actions = await getPendingActions();
  let synced = 0;
  let failed = 0;
  let conflicts = 0;
  const errors: Array<{ id: string; error: string }> = [];

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

  console.log(`[OfflineStore] Sincronizando ${actions.length} acciones pendientes...`);

  for (const action of actions) {
    try {
      const body = action.body as Record<string, unknown>;
      const isUpdate = action.method === 'PATCH' || action.method === 'PUT';
      const clientUpdatedAt = typeof body.__client_updated_at === 'number'
        ? (body.__client_updated_at as number)
        : 0;

      // LWW: si es update y tenemos timestamp, comparar
      if (isUpdate && clientUpdatedAt > 0 && supabaseUrl && body.id && body.__table) {
        const { wins, serverUpdatedAt } = await clientWins(
          body.__table as string,
          body.id as string,
          clientUpdatedAt,
          supabaseUrl,
          supabaseKey,
          supabaseKey
        );
        if (!wins) {
          conflicts++;
          await logConflict(
            body.__table as string,
            body.id as string,
            {
              action: action.type,
              client_updated_at: new Date(clientUpdatedAt).toISOString(),
              server_updated_at: serverUpdatedAt,
              dropped_payload: body,
            },
            supabaseUrl,
            supabaseKey,
            supabaseKey
          );
          await clearPendingAction(action.id);
          console.warn(`[OfflineStore] LWW conflict descartado: ${action.id} (server más nuevo)`);
          continue;
        }
      }

      // Limpiar metadata interna antes de enviar
      const cleanBody = { ...body };
      delete cleanBody.__client_updated_at;
      delete cleanBody.__table;

      const response = await fetch(action.url, {
        method: action.method,
        headers: {
          'Content-Type': 'application/json',
          ...action.headers,
        },
        body: action.method === 'DELETE' ? undefined : JSON.stringify(cleanBody),
      });

      if (response.ok) {
        await clearPendingAction(action.id);
        synced++;
      } else {
        const errorText = await response.text().catch(() => `HTTP ${response.status}`);
        failed++;
        errors.push({ id: action.id, error: `HTTP ${response.status}: ${errorText}` });
      }
    } catch (err) {
      failed++;
      const errorMsg = err instanceof Error ? err.message : 'Error desconocido';
      errors.push({ id: action.id, error: errorMsg });
    }
  }

  await markSyncedAt('__last_full_sync__');
  console.log(`[OfflineStore] Sync: ${synced} ok, ${conflicts} conflicts LWW, ${failed} fallidos`);
  return { synced, failed, conflicts, errors };
}

// ============================================================================
// USER SETTINGS + sync timestamps
// ============================================================================

export async function saveSetting(key: string, value: unknown): Promise<void> {
  await putInStore('user_settings', { key, value });
}

export async function getSetting<T = unknown>(key: string): Promise<T | undefined> {
  const store = await getStore('user_settings');
  const result = await idbRequest<UserSetting | undefined>(store.get(key));
  return result?.value as T | undefined;
}

async function markSyncedAt(table: string): Promise<void> {
  await saveSetting(`last_synced:${table}`, Date.now());
}

export async function getLastSyncedAt(table: string): Promise<number | undefined> {
  return getSetting<number>(`last_synced:${table}`);
}

/** Última vez que se hizo un full sync exitoso */
export async function getLastFullSync(): Promise<number | undefined> {
  return getLastSyncedAt('__last_full_sync__');
}

// ============================================================================
// UTILIDADES
// ============================================================================

export async function clearAllOfflineData(): Promise<void> {
  for (const def of STORE_DEFS) {
    try {
      await clearStore(def.name);
    } catch (err) {
      console.warn(`[OfflineStore] No se pudo limpiar ${def.name}:`, err);
    }
  }
  console.log('[OfflineStore] Todos los datos offline eliminados');
}

export async function getOfflineStats(): Promise<Record<string, number>> {
  const stats: Record<string, number> = {};
  await Promise.all(
    STORE_DEFS.map(async (def) => {
      try {
        const items = await getAllFromStore(def.name);
        stats[def.name] = items.length;
      } catch {
        stats[def.name] = 0;
      }
    })
  );
  return stats;
}
