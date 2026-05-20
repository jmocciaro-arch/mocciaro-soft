'use client';

// ============================================================================
// Mocciaro Soft ERP — useOfflineData Hook
// Offline-first: cuando hay red, lee de Supabase y guarda en IndexedDB.
// Cuando no, lee desde IndexedDB. Soporta cualquier tabla en OFFLINE_TABLES.
// ============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { useOnlineStatus } from './use-online-status';
import {
  saveCollection,
  getCollection,
  OFFLINE_TABLES,
} from '@/lib/offline-store';

// Mapeo tabla supabase (tt_*) → store offline (sin prefijo)
function offlineStoreName(supabaseTable: string): string {
  return supabaseTable.startsWith('tt_') ? supabaseTable.slice(3) : supabaseTable;
}

interface OfflineDataState<T> {
  /** Los datos (de Supabase o IndexedDB) */
  data: T[];
  /** true mientras carga */
  loading: boolean;
  /** true si los datos vienen del cache offline */
  isOffline: boolean;
  /** Error si hubo alguno */
  error: string | null;
  /** Forzar recarga de datos */
  refetch: () => void;
}

interface UseOfflineDataOptions {
  select?: string;
  filters?: Record<string, string>;
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
  limit?: number;
  enabled?: boolean;
  /** Si true, guarda en cache aunque haya filtros (default: solo cachea full table) */
  cacheFiltered?: boolean;
}

export function useOfflineData<T = Record<string, unknown>>(
  table: string,
  options: UseOfflineDataOptions = {}
): OfflineDataState<T> {
  const { isOnline } = useOnlineStatus();
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchIdRef = useRef(0);

  const {
    select = '*',
    filters,
    orderBy,
    orderDirection = 'asc',
    limit,
    enabled = true,
    cacheFiltered = false,
  } = options;

  const storeName = offlineStoreName(table);
  const hasOfflineStore = OFFLINE_TABLES.includes(storeName);

  const loadFromCache = useCallback(async (): Promise<T[]> => {
    if (!hasOfflineStore) {
      console.warn(`[useOfflineData] No hay cache offline para "${table}" (store: "${storeName}")`);
      return [];
    }
    const cached = await getCollection<T>(storeName);

    // Aplicar filtros en memoria sobre el cache
    let result = cached;
    if (filters) {
      result = result.filter((item) => {
        return Object.entries(filters).every(([k, v]) => {
          return String((item as Record<string, unknown>)[k] ?? '') === v;
        });
      });
    }
    if (orderBy) {
      result = [...result].sort((a, b) => {
        const av = (a as Record<string, unknown>)[orderBy];
        const bv = (b as Record<string, unknown>)[orderBy];
        if (av === bv) return 0;
        const cmp = (av as number | string) > (bv as number | string) ? 1 : -1;
        return orderDirection === 'asc' ? cmp : -cmp;
      });
    }
    if (limit && result.length > limit) {
      result = result.slice(0, limit);
    }
    return result;
  }, [hasOfflineStore, storeName, table, filters, orderBy, orderDirection, limit]);

  const saveToCache = useCallback(
    async (items: T[]) => {
      if (!hasOfflineStore) return;
      // Por defecto solo cacheamos cuando no hay filtros (= full table snapshot)
      if (filters && !cacheFiltered) return;
      try {
        await saveCollection(storeName, items as Array<{ id: string }>);
      } catch (err) {
        console.warn(`[useOfflineData] No se pudo cachear "${storeName}":`, err);
      }
    },
    [hasOfflineStore, storeName, filters, cacheFiltered]
  );

  const fetchData = useCallback(async () => {
    if (!enabled) return;

    const fetchId = ++fetchIdRef.current;
    setLoading(true);
    setError(null);

    if (isOnline) {
      try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseKey) {
          throw new Error('Variables de Supabase no configuradas');
        }

        let url = `${supabaseUrl}/rest/v1/${table}?select=${encodeURIComponent(select)}`;

        if (filters) {
          for (const [key, value] of Object.entries(filters)) {
            url += `&${key}=eq.${encodeURIComponent(value)}`;
          }
        }
        if (orderBy) url += `&order=${orderBy}.${orderDirection}`;
        if (limit) url += `&limit=${limit}`;

        const response = await fetch(url, {
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
          },
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const result = (await response.json()) as T[];

        if (fetchId !== fetchIdRef.current) return;

        setData(result);
        setIsOffline(false);
        setLoading(false);

        // Guardar snapshot en cache offline
        await saveToCache(result);
      } catch (err) {
        console.warn(`[useOfflineData] Online falló para "${table}", usando cache:`, err);
        const cached = await loadFromCache();
        if (fetchId !== fetchIdRef.current) return;
        setData(cached);
        setIsOffline(true);
        setLoading(false);
        if (cached.length === 0) setError('Sin datos en cache');
      }
    } else {
      try {
        const cached = await loadFromCache();
        if (fetchId !== fetchIdRef.current) return;
        setData(cached);
        setIsOffline(true);
        setLoading(false);
        if (cached.length === 0) {
          setError('Sin datos en cache — conectate a internet para descargar');
        }
      } catch (err) {
        if (fetchId !== fetchIdRef.current) return;
        setData([]);
        setIsOffline(true);
        setLoading(false);
        setError('Error leyendo datos offline');
        console.error(`[useOfflineData] Error offline para "${table}":`, err);
      }
    }
  }, [
    isOnline,
    table,
    select,
    filters,
    orderBy,
    orderDirection,
    limit,
    enabled,
    loadFromCache,
    saveToCache,
  ]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const refetch = useCallback(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, isOffline, error, refetch };
}
