// ============================================================================
// TorqueTools ERP — Offline Store (IndexedDB)
// Sistema de almacenamiento offline completo con sync
// ============================================================================
//
// Stores activos en esta versión (DB_VERSION=1):
//   1. products
//   2. clients
//   3. quotes  (índices: client_id, created_at)
//   4. pending_actions  (índices: createdAt, type)
//   5. user_settings
//
// NOTE: La memoria del proyecto (project_mocciaro_offline_pwa.md) menciona 21
// stores planeados para PWA full-offline (compras, ventas, stock, sat,
// catálogo, leads, etc.). Hoy hay 5 activos — el resto está en roadmap. Si
// agregás un store nuevo, subí DB_VERSION y registralo en onupgradeneeded.
// ============================================================================

const DB_NAME = 'torquetools-offline';
const DB_VERSION = 1;

// Tipos para las acciones pendientes
export interface PendingAction {
  id: string;
  type: 'create_quote' | 'update_quote' | 'create_client' | 'update_client' | 'delete_quote' | string;
  url: string;
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body: Record<string, unknown>;
  createdAt: number;
  description: string; // Descripción legible para mostrar al usuario
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

// ============================================================================
// Abrir / crear la base de datos
// ============================================================================

let dbInstance: IDBDatabase | null = null;

export function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Store de productos (catálogo offline)
      if (!db.objectStoreNames.contains('products')) {
        db.createObjectStore('products', { keyPath: 'id' });
      }

      // Store de clientes
      if (!db.objectStoreNames.contains('clients')) {
        db.createObjectStore('clients', { keyPath: 'id' });
      }

      // Store de cotizaciones
      if (!db.objectStoreNames.contains('quotes')) {
        const quotesStore = db.createObjectStore('quotes', { keyPath: 'id' });
        quotesStore.createIndex('client_id', 'client_id', { unique: false });
        quotesStore.createIndex('created_at', 'created_at', { unique: false });
      }

      // Store de acciones pendientes (cola de sincronización)
      if (!db.objectStoreNames.contains('pending_actions')) {
        const pendingStore = db.createObjectStore('pending_actions', { keyPath: 'id' });
        pendingStore.createIndex('createdAt', 'createdAt', { unique: false });
        pendingStore.createIndex('type', 'type', { unique: false });
      }

      // Store de configuración del usuario
      if (!db.objectStoreNames.contains('user_settings')) {
        db.createObjectStore('user_settings', { keyPath: 'key' });
      }
    };

    request.onsuccess = () => {
      dbInstance = request.result;

      // Si se cierra la conexión inesperadamente, limpiar la instancia
      dbInstance.onclose = () => {
        dbInstance = null;
      };

      resolve(dbInstance);
    };

    request.onerror = () => {
      console.error('[OfflineStore] Error abriendo IndexedDB:', request.error);
      reject(request.error);
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

/**
 * Inyecta updated_at (ms epoch) si el record no lo trae. Necesario para LWW
 * (last-write-wins) en sync con el servidor — ver sync-queue.ts.
 * No tocamos pending_actions ni user_settings, que tienen su propio timestamp.
 */
function withUpdatedAt<T>(storeName: string, data: T): T {
  if (storeName === 'pending_actions' || storeName === 'user_settings') {
    return data;
  }
  if (data && typeof data === 'object' && !('updated_at' in (data as object))) {
    return { ...(data as object), updated_at: Date.now() } as T;
  }
  return data;
}

async function putInStore<T>(storeName: string, data: T): Promise<void> {
  const store = await getStore(storeName, 'readwrite');
  await idbRequest(store.put(withUpdatedAt(storeName, data)));
}

async function putManyInStore<T>(storeName: string, items: T[]): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(storeName, 'readwrite');
  const store = tx.objectStore(storeName);

  for (const item of items) {
    store.put(withUpdatedAt(storeName, item));
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
// PRODUCTOS — Catálogo offline
// ============================================================================

export async function saveProducts(products: OfflineProduct[]): Promise<void> {
  // Upsert por id — NO hacemos clear previo. Antes, el clear dejaba al
  // usuario offline sin productos durante el rebuild. Si después necesitamos
  // sweep de ids obsoletos, hay que hacerlo comparando ids post-success.
  await putManyInStore('products', products);
  console.log(`[OfflineStore] ${products.length} productos upserteados offline`);
}

/**
 * Elimina del store local los productos cuyo id NO esté en el set provisto.
 * Llamalo DESPUÉS de un saveProducts exitoso si querés purgar borrados del server.
 */
export async function pruneProducts(keepIds: Set<string>): Promise<number> {
  const all = await getProducts();
  const toDelete = all.filter((p) => !keepIds.has(p.id));
  for (const p of toDelete) {
    await deleteFromStore('products', p.id);
  }
  return toDelete.length;
}

export async function getProducts(): Promise<OfflineProduct[]> {
  return getAllFromStore<OfflineProduct>('products');
}

export async function getProduct(id: string): Promise<OfflineProduct | undefined> {
  const store = await getStore('products');
  return idbRequest<OfflineProduct | undefined>(store.get(id));
}

// ============================================================================
// CLIENTES — Lista de clientes offline
// ============================================================================

export async function saveClients(clients: OfflineClient[]): Promise<void> {
  // Upsert por id — sin clear previo (ver comentario en saveProducts).
  await putManyInStore('clients', clients);
  console.log(`[OfflineStore] ${clients.length} clientes upserteados offline`);
}

export async function pruneClients(keepIds: Set<string>): Promise<number> {
  const all = await getClients();
  const toDelete = all.filter((c) => !keepIds.has(c.id));
  for (const c of toDelete) {
    await deleteFromStore('clients', c.id);
  }
  return toDelete.length;
}

export async function getClients(): Promise<OfflineClient[]> {
  return getAllFromStore<OfflineClient>('clients');
}

export async function getClient(id: string): Promise<OfflineClient | undefined> {
  const store = await getStore('clients');
  return idbRequest<OfflineClient | undefined>(store.get(id));
}

export async function saveClient(client: OfflineClient): Promise<void> {
  await putInStore('clients', client);
}

// ============================================================================
// COTIZACIONES — Cotizaciones offline
// ============================================================================

export async function saveQuotes(quotes: OfflineQuote[]): Promise<void> {
  // Upsert por id — sin clear previo (ver comentario en saveProducts).
  await putManyInStore('quotes', quotes);
  console.log(`[OfflineStore] ${quotes.length} cotizaciones upserteadas offline`);
}

export async function pruneQuotes(keepIds: Set<string>): Promise<number> {
  const all = await getQuotes();
  const toDelete = all.filter((q) => !keepIds.has(q.id));
  for (const q of toDelete) {
    await deleteFromStore('quotes', q.id);
  }
  return toDelete.length;
}

export async function getQuotes(): Promise<OfflineQuote[]> {
  return getAllFromStore<OfflineQuote>('quotes');
}

export async function getQuote(id: string): Promise<OfflineQuote | undefined> {
  const store = await getStore('quotes');
  return idbRequest<OfflineQuote | undefined>(store.get(id));
}

export async function saveQuote(quote: OfflineQuote): Promise<void> {
  await putInStore('quotes', quote);
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
      await (registration as ServiceWorkerRegistration & { sync: { register: (tag: string) => Promise<void> } }).sync.register('sync-pending-actions');
      console.log('[OfflineStore] Background sync registrado');
    }
  } catch (err) {
    console.warn('[OfflineStore] No se pudo registrar background sync:', err);
  }

  return id;
}

export async function getPendingActions(): Promise<PendingAction[]> {
  const actions = await getAllFromStore<PendingAction>('pending_actions');
  // Ordenar por fecha de creación (más viejas primero)
  return actions.sort((a, b) => a.createdAt - b.createdAt);
}

export async function getPendingActionsCount(): Promise<number> {
  const actions = await getPendingActions();
  return actions.length;
}

export async function clearPendingAction(id: string): Promise<void> {
  await deleteFromStore('pending_actions', id);
  console.log(`[OfflineStore] Accion pendiente eliminada: ${id}`);
}

export async function clearAllPendingActions(): Promise<void> {
  await clearStore('pending_actions');
  console.log('[OfflineStore] Todas las acciones pendientes eliminadas');
}

// ============================================================================
// SINCRONIZACIÓN — Enviar acciones pendientes al servidor
// ============================================================================

export async function syncPendingActions(): Promise<{
  synced: number;
  failed: number;
  errors: Array<{ id: string; error: string }>;
}> {
  const actions = await getPendingActions();
  let synced = 0;
  let failed = 0;
  const errors: Array<{ id: string; error: string }> = [];

  console.log(`[OfflineStore] Sincronizando ${actions.length} acciones pendientes...`);

  for (const action of actions) {
    try {
      const response = await fetch(action.url, {
        method: action.method,
        headers: {
          'Content-Type': 'application/json',
          ...action.headers,
        },
        body: JSON.stringify(action.body),
      });

      if (response.ok) {
        await clearPendingAction(action.id);
        synced++;
        console.log(`[OfflineStore] Sincronizado: ${action.type} (${action.id})`);
      } else {
        const errorText = await response.text();
        failed++;
        errors.push({ id: action.id, error: `HTTP ${response.status}: ${errorText}` });
        console.warn(`[OfflineStore] Error HTTP sincronizando ${action.id}:`, response.status);
      }
    } catch (err) {
      failed++;
      const errorMsg = err instanceof Error ? err.message : 'Error desconocido';
      errors.push({ id: action.id, error: errorMsg });
      console.error(`[OfflineStore] Error sincronizando ${action.id}:`, err);
    }
  }

  console.log(`[OfflineStore] Sync completado: ${synced} ok, ${failed} fallidos`);
  return { synced, failed, errors };
}

// ============================================================================
// USER SETTINGS — Configuración del usuario
// ============================================================================

export async function saveSetting(key: string, value: unknown): Promise<void> {
  await putInStore('user_settings', { key, value });
}

export async function getSetting<T = unknown>(key: string): Promise<T | undefined> {
  const store = await getStore('user_settings');
  const result = await idbRequest<UserSetting | undefined>(store.get(key));
  return result?.value as T | undefined;
}

// ============================================================================
// UTILIDADES
// ============================================================================

/** Limpiar toda la base de datos offline */
export async function clearAllOfflineData(): Promise<void> {
  await clearStore('products');
  await clearStore('clients');
  await clearStore('quotes');
  await clearStore('pending_actions');
  await clearStore('user_settings');
  console.log('[OfflineStore] Todos los datos offline eliminados');
}

/** Obtener estadísticas del almacenamiento offline */
export async function getOfflineStats(): Promise<{
  products: number;
  clients: number;
  quotes: number;
  pendingActions: number;
}> {
  const [products, clients, quotes, pendingActions] = await Promise.all([
    getProducts(),
    getClients(),
    getQuotes(),
    getPendingActions(),
  ]);

  return {
    products: products.length,
    clients: clients.length,
    quotes: quotes.length,
    pendingActions: pendingActions.length,
  };
}
