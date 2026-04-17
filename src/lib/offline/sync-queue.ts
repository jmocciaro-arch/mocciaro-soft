// ============================================================================
// Mocciaro Soft ERP — Offline Sync Queue
// Cola de acciones para sincronizar cuando vuelve la conexión
// ============================================================================

export type SyncActionType =
  | 'create_lead'
  | 'update_lead'
  | 'create_quote'
  | 'update_quote'
  | 'create_quote_line'
  | 'update_quote_line'
  | 'delete_quote_line'
  | 'update_sat_step'
  | 'create_sat_ticket'
  | 'create_client'
  | 'update_client'
  | string;

export interface SyncQueueItem {
  id: string;
  action: SyncActionType;
  table: string;
  data: Record<string, unknown>;
  createdAt: number;
  synced: boolean;
  retries: number;
  lastError?: string;
}

// ============================================================================
// IndexedDB helpers (sin dependencias externas)
// ============================================================================

const DB_NAME = 'torquetools-offline';
const DB_VERSION = 1;
const STORE_NAME = 'pending_actions';

function openSyncDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB no disponible'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
        store.createIndex('synced', 'synced', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbRun<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ============================================================================
// localStorage fallback (para entornos sin IndexedDB)
// ============================================================================

const LS_KEY = 'mocciaro-sync-queue';

function lsGetQueue(): SyncQueueItem[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as SyncQueueItem[]) : [];
  } catch {
    return [];
  }
}

function lsSaveQueue(items: SyncQueueItem[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(items));
  } catch {
    console.warn('[SyncQueue] localStorage lleno — no se pudo guardar');
  }
}

// ============================================================================
// Detección de soporte
// ============================================================================

function isIndexedDBAvailable(): boolean {
  return typeof window !== 'undefined' && typeof indexedDB !== 'undefined';
}

// ============================================================================
// API pública del sync queue
// ============================================================================

/**
 * Agrega una acción a la cola de sincronización.
 * Retorna el id generado.
 */
export async function enqueue(
  action: SyncActionType,
  table: string,
  data: Record<string, unknown>
): Promise<string> {
  const item: SyncQueueItem = {
    id: `sq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    action,
    table,
    data,
    createdAt: Date.now(),
    synced: false,
    retries: 0,
  };

  if (isIndexedDBAvailable()) {
    try {
      const db = await openSyncDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      await idbRun(tx.objectStore(STORE_NAME).put(item));
      console.log(`[SyncQueue] Encolado: ${action} en ${table} (${item.id})`);
      return item.id;
    } catch (err) {
      console.warn('[SyncQueue] IDB falló, usando localStorage:', err);
    }
  }

  // Fallback: localStorage
  const queue = lsGetQueue();
  queue.push(item);
  lsSaveQueue(queue);
  return item.id;
}

/**
 * Obtiene todos los items de la cola (no sincronizados primero).
 */
export async function getQueue(): Promise<SyncQueueItem[]> {
  if (isIndexedDBAvailable()) {
    try {
      const db = await openSyncDB();
      const tx = db.transaction(STORE_NAME, 'readonly');
      const all = await idbRun<SyncQueueItem[]>(tx.objectStore(STORE_NAME).getAll());
      return all.sort((a, b) => a.createdAt - b.createdAt);
    } catch {
      // fallback
    }
  }
  return lsGetQueue().sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * Obtiene la cantidad de items pendientes (no sincronizados).
 */
export async function getPendingCount(): Promise<number> {
  const queue = await getQueue();
  return queue.filter((i) => !i.synced).length;
}

/**
 * Marca un item como sincronizado.
 */
export async function markSynced(id: string): Promise<void> {
  if (isIndexedDBAvailable()) {
    try {
      const db = await openSyncDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const item = await idbRun<SyncQueueItem | undefined>(store.get(id));
      if (item) {
        item.synced = true;
        await idbRun(store.put(item));
      }
      return;
    } catch {
      // fallback
    }
  }
  const queue = lsGetQueue();
  const idx = queue.findIndex((i) => i.id === id);
  if (idx !== -1) {
    queue[idx].synced = true;
    lsSaveQueue(queue);
  }
}

/**
 * Elimina todos los items ya sincronizados.
 */
export async function clearSynced(): Promise<void> {
  if (isIndexedDBAvailable()) {
    try {
      const db = await openSyncDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const all = await idbRun<SyncQueueItem[]>(store.getAll());
      const synced = all.filter((i) => i.synced);
      for (const item of synced) {
        store.delete(item.id);
      }
      console.log(`[SyncQueue] ${synced.length} items sincronizados eliminados`);
      return;
    } catch {
      // fallback
    }
  }
  const queue = lsGetQueue().filter((i) => !i.synced);
  lsSaveQueue(queue);
}

/**
 * Procesa la cola: ejecuta cada acción pendiente contra Supabase REST API.
 * Retorna estadísticas de la operación.
 */
export async function sync(): Promise<{
  processed: number;
  failed: number;
  errors: Array<{ id: string; error: string }>;
}> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.warn('[SyncQueue] Supabase no configurado, no se puede sincronizar');
    return { processed: 0, failed: 0, errors: [] };
  }

  const queue = await getQueue();
  const pending = queue.filter((i) => !i.synced);

  if (pending.length === 0) return { processed: 0, failed: 0, errors: [] };

  console.log(`[SyncQueue] Sincronizando ${pending.length} acciones...`);

  let processed = 0;
  let failed = 0;
  const errors: Array<{ id: string; error: string }> = [];

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    Prefer: 'return=minimal',
  };

  for (const item of pending) {
    try {
      let url = `${supabaseUrl}/rest/v1/${item.table}`;
      let method = 'POST';

      // Determinar método HTTP según la acción
      if (item.action.startsWith('update_')) {
        method = 'PATCH';
        if (item.data.id) {
          url += `?id=eq.${item.data.id}`;
        }
      } else if (item.action.startsWith('delete_')) {
        method = 'DELETE';
        if (item.data.id) {
          url += `?id=eq.${item.data.id}`;
        }
      }

      const body =
        method === 'DELETE' ? undefined : JSON.stringify(item.data);

      const res = await fetch(url, { method, headers, body });

      if (res.ok || res.status === 201 || res.status === 204) {
        await markSynced(item.id);
        processed++;
        console.log(`[SyncQueue] OK: ${item.action} (${item.id})`);
      } else {
        const errText = await res.text().catch(() => `HTTP ${res.status}`);
        failed++;
        errors.push({ id: item.id, error: errText });

        // Incrementar retries en IDB
        if (isIndexedDBAvailable()) {
          try {
            const db = await openSyncDB();
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const fresh = await idbRun<SyncQueueItem | undefined>(store.get(item.id));
            if (fresh) {
              fresh.retries = (fresh.retries || 0) + 1;
              fresh.lastError = errText;
              store.put(fresh);
            }
          } catch { /* ignorar */ }
        }
      }
    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      errors.push({ id: item.id, error: msg });
      console.error(`[SyncQueue] Error procesando ${item.id}:`, err);
    }
  }

  await clearSynced();
  console.log(`[SyncQueue] Sync terminado: ${processed} ok, ${failed} fallidos`);
  return { processed, failed, errors };
}
