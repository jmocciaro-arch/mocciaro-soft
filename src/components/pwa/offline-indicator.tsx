'use client';

// ============================================================================
// Mocciaro Soft ERP — Offline Status Indicator
// Barra superior que muestra el estado de conexión
// ============================================================================

import { useEffect, useState } from 'react';
import { WifiOff, Wifi, RefreshCw } from 'lucide-react';
import { useOnlineStatus } from '@/hooks/use-online-status';

export function OfflineIndicator() {
  const { isOnline: navigatorOnline, pendingCount } = useOnlineStatus();
  const [reallyOffline, setReallyOffline] = useState(false);
  const [showReconnected, setShowReconnected] = useState(false);
  const [visible, setVisible] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);

  // Verificación real: navigator.onLine puede dar false positives con service workers.
  // Hacemos un fetch real para confirmar.
  useEffect(() => {
    async function checkReal() {
      if (navigatorOnline) {
        setReallyOffline(false);
        return;
      }
      try {
        const r = await fetch('/api/health/sales-chain', { method: 'HEAD', cache: 'no-store' });
        setReallyOffline(!r.ok);
      } catch {
        setReallyOffline(true);
      }
    }
    checkReal();
    const interval = setInterval(checkReal, 15000);
    return () => clearInterval(interval);
  }, [navigatorOnline]);

  const isOnline = !reallyOffline;

  useEffect(() => {
    if (!isOnline) {
      setWasOffline(true);
      setVisible(true);
      setShowReconnected(false);
    } else if (wasOffline && isOnline) {
      setShowReconnected(true);

      const timer = setTimeout(() => {
        if (pendingCount === 0) {
          setVisible(false);
          setWasOffline(false);
          setTimeout(() => setShowReconnected(false), 300);
        }
      }, 4000);

      return () => clearTimeout(timer);
    }
  }, [isOnline, wasOffline, pendingCount]);

  // Ocultar cuando ya no hay pendientes después de sincronizar
  useEffect(() => {
    if (showReconnected && pendingCount === 0) {
      const timer = setTimeout(() => {
        setVisible(false);
        setWasOffline(false);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [showReconnected, pendingCount]);

  if (isOnline && !showReconnected && !visible) return null;

  const isOfflineMode = !isOnline;
  const isSyncing = showReconnected && pendingCount > 0;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-0 left-0 right-0 z-[9999] transition-transform duration-300"
      style={{
        transform: visible || isOfflineMode ? 'translateY(0)' : 'translateY(-100%)',
      }}
    >
      <div
        className="flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium text-white"
        style={{
          background: isOfflineMode
            ? 'linear-gradient(90deg, #DC2626, #B91C1C)'
            : isSyncing
              ? 'linear-gradient(90deg, #D97706, #B45309)'
              : 'linear-gradient(90deg, #16A34A, #15803D)',
        }}
      >
        {isOfflineMode ? (
          <WifiOff size={12} className="shrink-0" />
        ) : isSyncing ? (
          <RefreshCw size={12} className="shrink-0 animate-spin" />
        ) : (
          <Wifi size={12} className="shrink-0" />
        )}

        <span>
          {isOfflineMode && (
            <>
              Sin conexión — modo offline
              {pendingCount > 0 && (
                <span className="opacity-80 ml-1">
                  · {pendingCount} {pendingCount === 1 ? 'acción pendiente' : 'acciones pendientes'}
                </span>
              )}
            </>
          )}
          {isSyncing && (
            <>
              Reconectado — sincronizando {pendingCount}{' '}
              {pendingCount === 1 ? 'acción' : 'acciones'}...
            </>
          )}
          {showReconnected && !isSyncing && (
            'Reconectado — todo sincronizado'
          )}
        </span>
      </div>
    </div>
  );
}
