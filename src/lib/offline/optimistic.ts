// ============================================================================
// Mocciaro Soft ERP — Optimistic Offline Mutations
// Wrappers para mutaciones que funcionan online u offline:
//   - online: ejecuta la mutación contra Supabase y actualiza cache.
//   - offline (o si falla la red): escribe en cache local + encola para sync.
//
// Convención de tablas:
//   - `supabaseTable` es el nombre completo (ej. 'tt_clients').
//   - El store IndexedDB usa el mismo nombre sin prefijo (ej. 'clients').
// ============================================================================

import { createClient } from '@/lib/supabase/client';
import { saveOne, deleteOne, OFFLINE_TABLES } from '@/lib/offline-store';
import { enqueue, enqueueUpdate } from '@/lib/offline/sync-queue';
import type { SyncActionType } from '@/lib/offline/sync-queue';

function storeFromTable(supabaseTable: string): string {
  return supabaseTable.startsWith('tt_') ? supabaseTable.slice(3) : supabaseTable;
}

function isOnline(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine;
}

export interface OptimisticResult<T> {
  data: T;
  /** true si la mutación se encoló para sync posterior */
  queued: boolean;
  /** Error si la operación online falló */
  error?: string;
}

/**
 * UPDATE optimista. Escribe en cache offline siempre. Si hay red, hace el
 * UPDATE en Supabase. Si la red falla o estamos offline, encola con LWW.
 *
 * @example
 *   await optimisticUpdate({
 *     supabaseTable: 'tt_clients',
 *     action: 'update_client',
 *     data: { id: clientId, name: 'Nuevo nombre' },
 *   });
 */
export async function optimisticUpdate<T extends { id: string }>(opts: {
  supabaseTable: string;
  action: SyncActionType;
  data: T;
}): Promise<OptimisticResult<T>> {
  const { supabaseTable, action, data } = opts;
  const store = storeFromTable(supabaseTable);

  // 1) Escribir en cache local (optimismo)
  if (OFFLINE_TABLES.includes(store)) {
    try {
      await saveOne(store, data);
    } catch (err) {
      console.warn(`[optimistic] No se pudo cachear ${store}:`, err);
    }
  }

  // 2) Si offline, encolar inmediatamente
  if (!isOnline()) {
    await enqueueUpdate(action, supabaseTable, data as unknown as Record<string, unknown> & { id: string });
    return { data, queued: true };
  }

  // 3) Online: intentar mutación
  try {
    const supabase = createClient();
    const { id, ...rest } = data as { id: string } & Record<string, unknown>;
    const { error } = await supabase.from(supabaseTable).update(rest).eq('id', id);
    if (error) throw error;
    return { data, queued: false };
  } catch (err) {
    // Red falló: encolar
    const msg = err instanceof Error ? err.message : 'Error desconocido';
    console.warn(`[optimistic] update online falló para ${supabaseTable}, encolando:`, msg);
    await enqueueUpdate(action, supabaseTable, data as unknown as Record<string, unknown> & { id: string });
    return { data, queued: true, error: msg };
  }
}

/**
 * INSERT optimista. Si offline, genera un id temporal local. Cuando sincronice,
 * Supabase genera el id real. Para FK seguros, usar uuidv4 del cliente.
 */
export async function optimisticCreate<T extends { id?: string }>(opts: {
  supabaseTable: string;
  action: SyncActionType;
  data: T;
  /** Generador de id si data.id no está. Por defecto crypto.randomUUID() */
  idGenerator?: () => string;
}): Promise<OptimisticResult<T & { id: string }>> {
  const { supabaseTable, action, data } = opts;
  const store = storeFromTable(supabaseTable);
  const id = data.id ?? (opts.idGenerator?.() ?? crypto.randomUUID());
  const enriched = { ...data, id } as T & { id: string };

  if (OFFLINE_TABLES.includes(store)) {
    try {
      await saveOne(store, enriched);
    } catch (err) {
      console.warn(`[optimistic] No se pudo cachear ${store}:`, err);
    }
  }

  if (!isOnline()) {
    await enqueue(action, supabaseTable, enriched as unknown as Record<string, unknown>);
    return { data: enriched, queued: true };
  }

  try {
    const supabase = createClient();
    const { error } = await supabase.from(supabaseTable).insert(enriched);
    if (error) throw error;
    return { data: enriched, queued: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error desconocido';
    console.warn(`[optimistic] insert online falló para ${supabaseTable}, encolando:`, msg);
    await enqueue(action, supabaseTable, enriched as unknown as Record<string, unknown>);
    return { data: enriched, queued: true, error: msg };
  }
}

/**
 * DELETE optimista. Borra del cache local y de Supabase si hay red,
 * o encola para borrar al sincronizar.
 */
export async function optimisticDelete(opts: {
  supabaseTable: string;
  action: SyncActionType;
  id: string;
}): Promise<OptimisticResult<{ id: string }>> {
  const { supabaseTable, action, id } = opts;
  const store = storeFromTable(supabaseTable);

  if (OFFLINE_TABLES.includes(store)) {
    try {
      await deleteOne(store, id);
    } catch (err) {
      console.warn(`[optimistic] No se pudo borrar de cache ${store}:`, err);
    }
  }

  if (!isOnline()) {
    await enqueue(action, supabaseTable, { id });
    return { data: { id }, queued: true };
  }

  try {
    const supabase = createClient();
    const { error } = await supabase.from(supabaseTable).delete().eq('id', id);
    if (error) throw error;
    return { data: { id }, queued: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error desconocido';
    console.warn(`[optimistic] delete online falló para ${supabaseTable}, encolando:`, msg);
    await enqueue(action, supabaseTable, { id });
    return { data: { id }, queued: true, error: msg };
  }
}
