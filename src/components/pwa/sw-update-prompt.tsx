'use client';

// ============================================================================
// Mocciaro Soft ERP — Service Worker Update Prompt
// Toast no intrusivo que aparece cuando hay nueva versión del SW disponible.
// Botón "Actualizar" llama a applyServiceWorkerUpdate() y refresca la app.
// ============================================================================

import { useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { onPWAEvent, applyServiceWorkerUpdate } from '@/lib/pwa';

export function SwUpdatePrompt() {
  const [show, setShow] = useState(false);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    const cleanup = onPWAEvent('sw-update-available', () => {
      setShow(true);
    });
    return cleanup;
  }, []);

  if (!show) return null;

  const handleUpdate = () => {
    setUpdating(true);
    // applyServiceWorkerUpdate hace reload — no hace falta cerrar nada
    applyServiceWorkerUpdate();
  };

  const handleDismiss = () => setShow(false);

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[9997] p-4 pointer-events-none"
      style={{ paddingBottom: 'max(5rem, calc(env(safe-area-inset-bottom) + 4.5rem))' }}
    >
      <div
        className="max-w-md mx-auto pointer-events-auto rounded-2xl border border-emerald-500/30 p-4 flex items-center gap-3 shadow-2xl"
        style={{
          background: '#151821',
          boxShadow: '0 -4px 32px rgba(0,0,0,0.6)',
          animation: 'sw-slide-up 0.35s ease-out',
        }}
      >
        <div className="w-11 h-11 rounded-xl bg-emerald-500 flex items-center justify-center shrink-0 shadow-lg shadow-emerald-500/30">
          <RefreshCw size={20} className="text-white" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[#F0F2F5] text-sm font-semibold leading-tight">
            Nueva versión disponible
          </p>
          <p className="text-[#6B7280] text-xs mt-0.5 leading-tight">
            Refrescá para actualizar la app
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleDismiss}
            className="p-1.5 rounded-lg text-[#6B7280] hover:text-[#9CA3AF] hover:bg-[#1E2330] transition-colors"
            title="Más tarde"
          >
            <X size={16} />
          </button>
          <button
            onClick={handleUpdate}
            disabled={updating}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold transition-colors disabled:opacity-60 disabled:cursor-wait"
          >
            <RefreshCw size={12} className={updating ? 'animate-spin' : ''} />
            {updating ? 'Actualizando...' : 'Actualizar'}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes sw-slide-up {
          from { transform: translateY(120%); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>
    </div>
  );
}
