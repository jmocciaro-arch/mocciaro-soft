'use client';

// ============================================================================
// Mocciaro Soft ERP — Sync Status Badge
// Muestra las acciones pendientes de sincronizar en la topbar
// ============================================================================

import { useEffect, useState, useCallback } from 'react';
import { CloudOff, RefreshCw } from 'lucide-react';
import { getPendingActionsCount, syncPendingActions } from '@/lib/offline-store';
import { useOnlineStatus } from '@/hooks/use-online-status';
import { cn } from '@/lib/utils';

export function SyncStatus() {
  const { isOnline } = useOnlineStatus();
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [justSynced, setJustSynced] = useState(false);

  const refreshCount = useCallback(async () => {
    try {
      const count = await getPendingActionsCount();
      setPendingCount(count);
    } catch {
      setPendingCount(0);
    }
  }, []);

  // Auto-sync cuando volvemos online
  const doSync = useCallback(async () => {
    if (isSyncing || pendingCount === 0) return;
    setIsSyncing(true);
    try {
      await syncPendingActions();
      setJustSynced(true);
      await refreshCount();
      setTimeout(() => setJustSynced(false), 3000);
    } catch (err) {
      console.error('[SyncStatus] Error sincronizando:', err);
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, pendingCount, refreshCount]);

  // Polling cada 8 segundos
  useEffect(() => {
    refreshCount();
    const interval = setInterval(refreshCount, 8000);
    return () => clearInterval(interval);
  }, [refreshCount]);

  // Trigger sync al volver online
  useEffect(() => {
    if (isOnline && pendingCount > 0) {
      doSync();
    }
  }, [isOnline, pendingCount, doSync]);

  // No mostrar nada si no hay pendientes y no estamos sincronizando
  if (pendingCount === 0 && !isSyncing && !justSynced) return null;

  return (
    <button
      onClick={isOnline ? doSync : undefined}
      disabled={isSyncing || !isOnline}
      title={
        isSyncing
          ? 'Sincronizando...'
          : pendingCount > 0
            ? `${pendingCount} ${pendingCount === 1 ? 'acción pendiente' : 'acciones pendientes'}`
            : 'Todo sincronizado'
      }
      className={cn(
        'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-200',
        justSynced
          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
          : isOnline && pendingCount > 0
            ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20 hover:bg-amber-500/25 cursor-pointer'
            : 'bg-red-500/15 text-red-400 border border-red-500/20'
      )}
    >
      {isSyncing ? (
        <RefreshCw size={12} className="animate-spin" />
      ) : justSynced ? (
        <span className="w-2 h-2 rounded-full bg-emerald-400" />
      ) : (
        <CloudOff size={12} />
      )}

      <span>
        {isSyncing
          ? 'Sincronizando...'
          : justSynced
            ? 'Sincronizado'
            : `${pendingCount} pendiente${pendingCount !== 1 ? 's' : ''}`}
      </span>
    </button>
  );
}
