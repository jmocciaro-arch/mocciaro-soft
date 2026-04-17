'use client';

// ============================================================================
// Mocciaro Soft ERP — PWA Init
// Componente global que registra el SW e inicializa los componentes PWA
// Se incluye una sola vez en el root layout
// ============================================================================

import { useEffect } from 'react';
import { registerServiceWorker, setupInstallPrompt } from '@/lib/pwa';
import { InstallPrompt } from '@/components/pwa/install-prompt';
import { OfflineIndicator } from '@/components/pwa/offline-indicator';

export function PWAInit() {
  useEffect(() => {
    // Registrar SW en segundo plano, sin bloquear el render inicial
    registerServiceWorker().catch((err) => {
      console.warn('[PWAInit] No se pudo registrar el SW:', err);
    });

    // Preparar el install prompt
    setupInstallPrompt();
  }, []);

  return (
    <>
      <OfflineIndicator />
      <InstallPrompt />
    </>
  );
}
