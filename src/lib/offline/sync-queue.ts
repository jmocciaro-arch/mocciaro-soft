// ============================================================================
// Mocciaro Soft ERP — Offline Sync Queue
// Cola de acciones para sincronizar cuando vuelve la conexión
// ============================================================================

import { createClient } from '@/lib/supabase/client';

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
  // Timestamp del próximo retry permitido (ms epoch). Si está en el futuro,
  // el item se saltea en este pase de sync.
  nextRetryAt?: number;
}

// ============================================================================
// Configuración de retry / dead letter
// ============================================================================

const MAX_RETRIES = 5;
const DEAD_LETTER_STORE = 'dead_letter';

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
      // Store de dead letter para items que superan MAX_RETRIES
      if (!db.objectStoreNames.contains(DEAD_LETTER_STORE)) {
        db.createObjectStore(DEAD_LETTER_STORE, { keyPath: 'id' });
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
  // LWW: garantizar que cada item lleve un updated_at del cliente. Si el
  // payload ya trae uno explícito (caller lo seteó) lo respetamos.
  const dataWithTimestamp: Record<string, unknown> = {
    ...data,
    updated_at: data.updated_at ?? new Date().toISOString(),
  };

  const item: SyncQueueItem = {
    id: `sq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    action,
    table,
    data: dataWithTimestamp,
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

// ============================================================================
// Dead letter — items que superan MAX_RETRIES
// ============================================================================

async function moveToDeadLetter(item: SyncQueueItem): Promise<void> {
  console.error(
    `[SyncQueue] DEAD LETTER: ${item.action} en ${item.table} (${item.id}) ` +
      `tras ${item.retries} reintentos. Último error: ${item.lastError || 'N/A'}`,
    item
  );

  if (isIndexedDBAvailable()) {
    try {
      const db = await openSyncDB();
      const tx = db.transaction([STORE_NAME, DEAD_LETTER_STORE], 'readwrite');
      tx.objectStore(DEAD_LETTER_STORE).put({
        ...item,
        movedToDeadLetterAt: Date.now(),
      });
      tx.objectStore(STORE_NAME).delete(item.id);
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      return;
    } catch (err) {
      console.warn('[SyncQueue] No se pudo mover a dead letter en IDB:', err);
    }
  }

  // Fallback: sacarlo de localStorage (sin DL persistente en LS)
  const queue = lsGetQueue().filter((i) => i.id !== item.id);
  lsSaveQueue(queue);
}

/**
 * Actualiza retries + nextRetryAt + lastError en un item para backoff exponencial.
 */
async function bumpRetry(item: SyncQueueItem, errorText: string): Promise<void> {
  const newRetries = (item.retries || 0) + 1;
  const backoffMs = Math.pow(2, newRetries) * 60_000; // 2,4,8,16,32 min
  const updated: SyncQueueItem = {
    ...item,
    retries: newRetries,
    lastError: errorText,
    nextRetryAt: Date.now() + backoffMs,
  };

  if (newRetries > MAX_RETRIES) {
    await moveToDeadLetter(updated);
    return;
  }

  if (isIndexedDBAvailable()) {
    try {
      const db = await openSyncDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      await idbRun(tx.objectStore(STORE_NAME).put(updated));
      return;
    } catch {
      // fallback
    }
  }
  const queue = lsGetQueue();
  const idx = queue.findIndex((i) => i.id === item.id);
  if (idx !== -1) {
    queue[idx] = updated;
    lsSaveQueue(queue);
  }
}

// ============================================================================
// Lock concurrente entre tabs — BroadcastChannel + localStorage
// ============================================================================

const LOCK_KEY = 'sync-queue-lock';
const LOCK_CHANNEL = 'sync-queue';
const LOCK_TTL_MS = 60_000; // si el lock está más viejo que esto, es stale

interface LockState {
  ownerId: string;
  channel: BroadcastChannel | null;
  cleanup: (() => void) | null;
}

function genLockId(): string {
  return `lock_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Intenta tomar el lock cross-tab. Resuelve true si lo obtuvo (y devuelve un
 * release() que limpia), o false si otro tab tiene el lock activo.
 */
async function acquireSyncLock(): Promise<{ acquired: boolean; release: () => void }> {
  const noop = { acquired: false, release: () => {} };

  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') {
    // Sin BroadcastChannel no podemos coordinar — asumimos lock libre.
    return { acquired: true, release: () => {} };
  }

  const myId = genLockId();
  const channel = new BroadcastChannel(LOCK_CHANNEL);

  // 1) Preguntar si alguien tiene el lock activo
  let someoneHolds = false;
  const probe = new Promise<void>((resolve) => {
    const onMessage = (ev: MessageEvent) => {
      if (ev.data?.type === 'lock-held') {
        someoneHolds = true;
      }
    };
    channel.addEventListener('message', onMessage);
    channel.postMessage({ type: 'lock-request', id: myId });
    setTimeout(() => {
      channel.removeEventListener('message', onMessage);
      resolve();
    }, 100);
  });
  await probe;

  if (someoneHolds) {
    channel.close();
    return noop;
  }

  // 2) Chequear localStorage por lock stale de un tab que crasheó
  try {
    const existing = localStorage.getItem(LOCK_KEY);
    if (existing) {
      const [, tsRaw] = existing.split('|');
      const ts = parseInt(tsRaw || '0', 10);
      if (Date.now() - ts < LOCK_TTL_MS) {
        // Lock vigente de otro tab que no respondió al probe — abort por seguridad
        channel.close();
        return noop;
      }
    }
  } catch {
    /* ignorar */
  }

  // 3) Tomar el lock
  try {
    localStorage.setItem(LOCK_KEY, `${myId}|${Date.now()}`);
  } catch {
    /* ignorar — no es fatal */
  }

  // 4) Responder a otros tabs que pregunten mientras tengamos el lock
  const onMessage = (ev: MessageEvent) => {
    if (ev.data?.type === 'lock-request' && ev.data?.id !== myId) {
      channel.postMessage({ type: 'lock-held', id: myId });
    }
  };
  channel.addEventListener('message', onMessage);

  const state: LockState = { ownerId: myId, channel, cleanup: null };

  const release = () => {
    try {
      channel.removeEventListener('message', onMessage);
      channel.close();
    } catch {
      /* ignorar */
    }
    try {
      const current = localStorage.getItem(LOCK_KEY);
      if (current && current.startsWith(`${myId}|`)) {
        localStorage.removeItem(LOCK_KEY);
      }
    } catch {
      /* ignorar */
    }
    if (state.cleanup) {
      window.removeEventListener('unload', state.cleanup);
      window.removeEventListener('pagehide', state.cleanup);
    }
  };

  state.cleanup = release;
  window.addEventListener('unload', release, { once: true });
  window.addEventListener('pagehide', release, { once: true });

  return { acquired: true, release };
}

// ============================================================================
// Sync principal
// ============================================================================

/**
 * Procesa la cola: ejecuta cada acción pendiente contra Supabase REST API.
 * Retorna estadísticas de la operación.
 *
 * Importante:
 * - Usa el JWT del session de Supabase (no ANON_KEY), respetando RLS.
 * - Toma un lock cross-tab vía BroadcastChannel para evitar duplicados.
 * - Cada item se marca synced INMEDIATAMENTE al éxito (no batch al final).
 * - clearSynced se ejecuta en finally → un throw no deja items huérfanos.
 * - Items con error suben retries con backoff exponencial; al pasar el cap
 *   van a un store dead_letter en lugar de reintentar para siempre.
 */
export async function sync(): Promise<{
  processed: number;
  failed: number;
  errors: Array<{ id: string; error: string }>;
}> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('[SyncQueue] Supabase no configurado, no se puede sincronizar');
    return { processed: 0, failed: 0, errors: [] };
  }

  // Obtener JWT del session — NO usamos ANON_KEY para escribir; eso rompe RLS
  // y deja inserts sin owner.
  const supabase = createClient();
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData?.session?.access_token) {
    throw new Error('No hay session — no se puede sincronizar offline');
  }
  const accessToken = sessionData.session.access_token;

  // Lock cross-tab — si otro tab está sincronizando, abort.
  const lock = await acquireSyncLock();
  if (!lock.acquired) {
    console.log('[SyncQueue] Otro tab tiene el lock — sync abortado');
    return { processed: 0, failed: 0, errors: [] };
  }

  let processed = 0;
  let failed = 0;
  const errors: Array<{ id: string; error: string }> = [];

  try {
    const queue = await getQueue();
    const now = Date.now();
    const pending = queue.filter(
      (i) => !i.synced && (!i.nextRetryAt || i.nextRetryAt <= now)
    );

    if (pending.length === 0) {
      return { processed: 0, failed: 0, errors: [] };
    }

    console.log(`[SyncQueue] Sincronizando ${pending.length} acciones...`);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
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
            // LWW: solo aplicar el PATCH si el server tiene un updated_at
            // anterior al del cliente. Si el server es más nuevo, ignorar.
            const clientTs = item.data.updated_at as string | undefined;
            const filters = [`id=eq.${item.data.id}`];
            if (clientTs) {
              filters.push(`updated_at=lt.${encodeURIComponent(clientTs)}`);
            }
            url += `?${filters.join('&')}`;
          }
        } else if (item.action.startsWith('delete_')) {
          method = 'DELETE';
          if (item.data.id) {
            url += `?id=eq.${item.data.id}`;
          }
        }

        const body = method === 'DELETE' ? undefined : JSON.stringify(item.data);

        const res = await fetch(url, { method, headers, body });

        if (res.ok || res.status === 201 || res.status === 204) {
          // Marcar synced INMEDIATAMENTE — no esperar al final del loop
          await markSynced(item.id);
          processed++;
          console.log(`[SyncQueue] OK: ${item.action} (${item.id})`);
        } else {
          const errText = await res.text().catch(() => `HTTP ${res.status}`);
          failed++;
          errors.push({ id: item.id, error: errText });
          await bumpRetry(item, errText);
        }
      } catch (err) {
        failed++;
        const msg = err instanceof Error ? err.message : 'Error desconocido';
        errors.push({ id: item.id, error: msg });
        console.error(`[SyncQueue] Error procesando ${item.id}:`, err);
        await bumpRetry(item, msg);
      }
    }

    console.log(`[SyncQueue] Sync terminado: ${processed} ok, ${failed} fallidos`);
    return { processed, failed, errors };
  } finally {
    // Siempre limpiar sincronizados y liberar el lock, incluso si hubo throw
    try {
      await clearSynced();
    } catch (err) {
      console.error('[SyncQueue] Error en clearSynced final:', err);
    }
    lock.release();
  }
}
