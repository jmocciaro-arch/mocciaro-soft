'use client';

// ============================================================================
// Mocciaro Soft ERP — Install PWA Banner
// Muestra el banner de instalación a partir de la 2da visita
// Solo se muestra si el install prompt está disponible y no fue descartado
// ============================================================================

import { useEffect, useState } from 'react';
import { Download, X, Smartphone } from 'lucide-react';
import { showInstallPrompt, onPWAEvent, setupInstallPrompt, isPWAInstalled } from '@/lib/pwa';

const DISMISS_KEY = 'mocciaro-install-dismissed';
const VISIT_COUNT_KEY = 'mocciaro-visit-count';

export function InstallPrompt() {
  const [canInstall, setCanInstall] = useState(false);
  const [dismissed, setDismissed] = useState(true);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    // No mostrar si ya está instalada
    if (isPWAInstalled()) return;

    // No mostrar si fue descartada permanentemente
    if (localStorage.getItem(DISMISS_KEY)) return;

    // Contar visitas — solo mostrar a partir de la 2da
    const visitCount = parseInt(localStorage.getItem(VISIT_COUNT_KEY) ?? '0', 10) + 1;
    localStorage.setItem(VISIT_COUNT_KEY, String(visitCount));
    if (visitCount < 2) return;

    setDismissed(false);

    // Inicializar el listener del install prompt
    setupInstallPrompt();

    // Escuchar cuando el install prompt esté disponible
    const cleanup1 = onPWAEvent('install-prompt-available', () => {
      setCanInstall(true);
    });

    // Escuchar si la app fue instalada
    const cleanup2 = onPWAEvent('app-installed', () => {
      setCanInstall(false);
    });

    return () => {
      cleanup1();
      cleanup2();
    };
  }, []);

  const handleInstall = async () => {
    setInstalling(true);
    const accepted = await showInstallPrompt();
    setInstalling(false);
    if (accepted) {
      setCanInstall(false);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem(DISMISS_KEY, 'true');
  };

  if (!canInstall || dismissed) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[9998] p-4 pointer-events-none"
      style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
    >
      <div
        className="max-w-md mx-auto pointer-events-auto rounded-2xl border border-[#f97316]/30 p-4 flex items-center gap-3 shadow-2xl"
        style={{
          background: '#151821',
          boxShadow: '0 -4px 32px rgba(0,0,0,0.6)',
          animation: 'pwa-slide-up 0.35s ease-out',
        }}
      >
        {/* Icono */}
        <div className="w-11 h-11 rounded-xl bg-[#f97316] flex items-center justify-center shrink-0 shadow-lg shadow-orange-500/30">
          <Smartphone size={20} className="text-white" />
        </div>

        {/* Texto */}
        <div className="flex-1 min-w-0">
          <p className="text-[#F0F2F5] text-sm font-semibold leading-tight">
            Instalá Mocciaro Soft en tu dispositivo
          </p>
          <p className="text-[#6B7280] text-xs mt-0.5 leading-tight">
            Acceso rápido sin abrir el navegador
          </p>
        </div>

        {/* Botones */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleDismiss}
            className="p-1.5 rounded-lg text-[#6B7280] hover:text-[#9CA3AF] hover:bg-[#1E2330] transition-colors"
            title="Cerrar"
          >
            <X size={16} />
          </button>
          <button
            onClick={handleInstall}
            disabled={installing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#f97316] hover:bg-[#e5680f] text-white text-xs font-semibold transition-colors disabled:opacity-60 disabled:cursor-wait"
          >
            <Download size={12} />
            {installing ? 'Instalando...' : 'Instalar'}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes pwa-slide-up {
          from { transform: translateY(120%); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>
    </div>
  );
}
