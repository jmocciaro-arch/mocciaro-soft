// ============================================================================
// Mocciaro Soft ERP — Offline Sync Queue
// Cola de acciones para sincronizar cuando vuelve la conexión.
// Comparte la misma IndexedDB que offline-store (mismo DB_NAME y DB_VERSION).
// ============================================================================

import { openDB } from '@/lib/offline-store';

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
  | 'update_sat_ticket'
  | 'create_client'
  | 'update_client'
  | 'create_supplier'
  | 'update_supplier'
  | 'create_purchase_order'
  | 'update_purchase_order'
  | 'create_purchase_invoice'
  | 'update_purchase_invoice'
  | 'create_document'
  | 'update_document'
  | 'delete_document'
  | 'update_stock'
  | 'create_sales_order'
  | 'update_sales_order'
  | 'create_invoice'
  | 'update_invoice'
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

const STORE_NAME = 'pending_actions';

// ============================================================================
// localStorage fallback (entornos sin IndexedDB)
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

function idbRun<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function isIndexedDBAvailable(): boolean {
  return typeof window !== 'undefined' && typeof indexedDB !== 'undefined';
}

// ============================================================================
// API pública
// ============================================================================

/**
 * Agrega una acción a la cola de sincronización.
 * Para updates con LWW, usar enqueueUpdate() que marca __client_updated_at.
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
      const db = await openDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      await idbRun(tx.objectStore(STORE_NAME).put(item));
      console.log(`[SyncQueue] Encolado: ${action} en ${table} (${item.id})`);
      return item.id;
    } catch (err) {
      console.warn('[SyncQueue] IDB falló, usando localStorage:', err);
    }
  }

  const queue = lsGetQueue();
  queue.push(item);
  lsSaveQueue(queue);
  return item.id;
}

/**
 * Encola un update con marca de tiempo local para resolución LWW.
 * Cuando el sync procese este item, comparará __client_updated_at contra
 * el updated_at del server. Si el server es más nuevo, descarta y loguea.
 */
export async function enqueueUpdate(
  action: SyncActionType,
  table: string,
  data: Record<string, unknown> & { id: string }
): Promise<string> {
  return enqueue(action, table, {
    ...data,
    __client_updated_at: Date.now(),
    __table: table,
  });
}

export async function getQueue(): Promise<SyncQueueItem[]> {
  if (isIndexedDBAvailable()) {
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_NAME, 'readonly');
      const all = await idbRun<SyncQueueItem[]>(tx.objectStore(STORE_NAME).getAll());
      return all.sort((a, b) => a.createdAt - b.createdAt);
    } catch {
      // fallback
    }
  }
  return lsGetQueue().sort((a, b) => a.createdAt - b.createdAt);
}

export async function getPendingCount(): Promise<number> {
  const queue = await getQueue();
  return queue.filter((i) => !i.synced).length;
}

export async function markSynced(id: string): Promise<void> {
  if (isIndexedDBAvailable()) {
    try {
      const db = await openDB();
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

export async function clearSynced(): Promise<void> {
  if (isIndexedDBAvailable()) {
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const all = await idbRun<SyncQueueItem[]>(store.getAll());
      const synced = all.filter((i) => i.synced);
      for (const item of synced) {
        store.delete(item.id);
      }
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
 * Soporta LWW: para updates con __client_updated_at, compara contra server
 * y descarta si el server es más nuevo (loguea en tt_activity_log).
 */
export async function sync(): Promise<{
  processed: number;
  failed: number;
  conflicts: number;
  errors: Array<{ id: string; error: string }>;
}> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.warn('[SyncQueue] Supabase no configurado');
    return { processed: 0, failed: 0, conflicts: 0, errors: [] };
  }

  const queue = await getQueue();
  const pending = queue.filter((i) => !i.synced);

  if (pending.length === 0) return { processed: 0, failed: 0, conflicts: 0, errors: [] };

  console.log(`[SyncQueue] Sincronizando ${pending.length} acciones...`);

  let processed = 0;
  let failed = 0;
  let conflicts = 0;
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
      const isUpdate = item.action.startsWith('update_');
      const isDelete = item.action.startsWith('delete_');

      if (isUpdate) {
        method = 'PATCH';
        if (item.data.id) url += `?id=eq.${item.data.id}`;
      } else if (isDelete) {
        method = 'DELETE';
        if (item.data.id) url += `?id=eq.${item.data.id}`;
      }

      // LWW: comparar timestamps para updates
      const clientUpdatedAt = typeof item.data.__client_updated_at === 'number'
        ? (item.data.__client_updated_at as number)
        : 0;

      if (isUpdate && clientUpdatedAt > 0 && item.data.id) {
        const checkUrl = `${supabaseUrl}/rest/v1/${item.table}?id=eq.${item.data.id}&select=updated_at`;
        try {
          const checkRes = await fetch(checkUrl, {
            headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
          });
          if (checkRes.ok) {
            const rows = (await checkRes.json()) as Array<{ updated_at?: string }>;
            if (rows.length > 0 && rows[0].updated_at) {
              const serverTs = new Date(rows[0].updated_at).getTime();
              if (serverTs > clientUpdatedAt) {
                // Server gana — descartar y loguear conflicto
                await fetch(`${supabaseUrl}/rest/v1/tt_activity_log`, {
                  method: 'POST',
                  headers,
                  body: JSON.stringify({
                    entity_type: item.table,
                    entity_id: item.data.id,
                    action: 'sync_conflict_lww',
                    detail: {
                      action: item.action,
                      client_updated_at: new Date(clientUpdatedAt).toISOString(),
                      server_updated_at: rows[0].updated_at,
                      dropped_payload: item.data,
                    },
                  }),
                }).catch(() => null);

                conflicts++;
                await markSynced(item.id);
                console.warn(`[SyncQueue] LWW conflict — server más nuevo: ${item.id}`);
                continue;
              }
            }
          }
        } catch {
          // si el check falla, continuamos con el update normal
        }
      }

      // Limpiar metadata interna antes de enviar
      const cleanData: Record<string, unknown> = { ...item.data };
      delete cleanData.__client_updated_at;
      delete cleanData.__table;

      const body = method === 'DELETE' ? undefined : JSON.stringify(cleanData);
      const res = await fetch(url, { method, headers, body });

      if (res.ok || res.status === 201 || res.status === 204) {
        await markSynced(item.id);
        processed++;
      } else {
        const errText = await res.text().catch(() => `HTTP ${res.status}`);
        failed++;
        errors.push({ id: item.id, error: errText });

        // Bump retries
        if (isIndexedDBAvailable()) {
          try {
            const db = await openDB();
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const fresh = await idbRun<SyncQueueItem | undefined>(store.get(item.id));
            if (fresh) {
              fresh.retries = (fresh.retries || 0) + 1;
              fresh.lastError = errText;
              store.put(fresh);
            }
          } catch {
            /* ignorar */
          }
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
  console.log(`[SyncQueue] Sync: ${processed} ok, ${conflicts} conflicts LWW, ${failed} fallidos`);
  return { processed, failed, conflicts, errors };
}
