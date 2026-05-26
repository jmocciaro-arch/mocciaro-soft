// ============================================================================
// TorqueTools ERP — PWA Utilities
// Registro de Service Worker, detección de estado, install prompt
// ============================================================================

// ============================================================================
// Service Worker Registration
// ============================================================================

let swRegistration: ServiceWorkerRegistration | null = null;

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    console.warn('[PWA] Service Workers no soportados en este navegador');
    return null;
  }

  // En desarrollo NO registramos SW (causa falsos positivos de "Sin conexión"
  // por timeouts cortos vs compilación lenta de webpack). Además desinstalamos
  // cualquier SW viejo y limpiamos caches obsoletas.
  if (process.env.NODE_ENV === 'development') {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const reg of regs) {
        await reg.unregister();
        console.log('[PWA] SW viejo desinstalado (modo dev)');
      }
      if ('caches' in window) {
        const cacheKeys = await caches.keys();
        await Promise.all(cacheKeys.map((k) => caches.delete(k)));
        if (cacheKeys.length > 0) {
          console.log(`[PWA] ${cacheKeys.length} caches limpiadas (modo dev)`);
        }
      }
    } catch (err) {
      console.warn('[PWA] No se pudo limpiar SW/caches en dev:', err);
    }
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });

    swRegistration = registration;
    console.log('[PWA] Service Worker registrado correctamente');

    // Detectar actualizaciones
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (!newWorker) return;

      newWorker.addEventListener('statechange', () => {
        if (
          newWorker.state === 'installed' &&
          navigator.serviceWorker.controller
        ) {
          // Hay una actualización disponible
          console.log('[PWA] Nueva version del Service Worker disponible');
          dispatchPWAEvent('sw-update-available', { registration });
        }
      });
    });

    // Escuchar mensajes del SW
    navigator.serviceWorker.addEventListener('message', (event) => {
      const { type } = event.data || {};
      if (type === 'SYNC_COMPLETE') {
        dispatchPWAEvent('sync-complete', event.data);
      }
    });

    return registration;
  } catch (error) {
    console.error('[PWA] Error registrando Service Worker:', error);
    return null;
  }
}

/** Forzar actualización del Service Worker */
export function applyServiceWorkerUpdate(): void {
  if (swRegistration?.waiting) {
    swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
    window.location.reload();
  }
}

// ============================================================================
// Online Status
// ============================================================================

export function isOnline(): boolean {
  if (typeof window === 'undefined') return true;
  return navigator.onLine;
}

export function onOnlineStatusChange(
  callback: (online: boolean) => void
): () => void {
  if (typeof window === 'undefined') return () => {};

  const handleOnline = () => callback(true);
  const handleOffline = () => callback(false);

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  // Retornar función de limpieza
  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}

// ============================================================================
// PWA Install Prompt
// ============================================================================

let deferredInstallPrompt: BeforeInstallPromptEvent | null = null;

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

export function setupInstallPrompt(): void {
  if (typeof window === 'undefined') return;

  window.addEventListener('beforeinstallprompt', (event) => {
    // Prevenir que el navegador muestre su propio prompt
    event.preventDefault();
    deferredInstallPrompt = event as BeforeInstallPromptEvent;
    console.log('[PWA] Install prompt disponible');
    dispatchPWAEvent('install-prompt-available', {});
  });

  window.addEventListener('appinstalled', () => {
    console.log('[PWA] App instalada correctamente');
    deferredInstallPrompt = null;
    dispatchPWAEvent('app-installed', {});
  });
}

export async function showInstallPrompt(): Promise<boolean> {
  if (!deferredInstallPrompt) {
    console.warn('[PWA] No hay install prompt disponible');
    return false;
  }

  try {
    await deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    console.log(`[PWA] Install prompt resultado: ${outcome}`);
    deferredInstallPrompt = null;
    return outcome === 'accepted';
  } catch (error) {
    console.error('[PWA] Error mostrando install prompt:', error);
    return false;
  }
}

export function canShowInstallPrompt(): boolean {
  return deferredInstallPrompt !== null;
}

// ============================================================================
// PWA Detection
// ============================================================================

export function isPWAInstalled(): boolean {
  if (typeof window === 'undefined') return false;

  // Método 1: display-mode standalone
  if (window.matchMedia('(display-mode: standalone)').matches) return true;

  // Método 2: iOS Safari standalone
  if (
    'standalone' in window.navigator &&
    (window.navigator as Navigator & { standalone: boolean }).standalone
  ) {
    return true;
  }

  return false;
}

// ============================================================================
// Push Notifications
// ============================================================================

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    console.warn('[PWA] Notificaciones no soportadas');
    return 'denied';
  }

  if (Notification.permission === 'granted') return 'granted';

  try {
    const permission = await Notification.requestPermission();
    console.log(`[PWA] Permiso de notificaciones: ${permission}`);
    return permission;
  } catch (error) {
    console.error('[PWA] Error pidiendo permiso de notificaciones:', error);
    return 'denied';
  }
}

export function getNotificationPermission(): NotificationPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'denied';
  return Notification.permission;
}

// ============================================================================
// Custom Events
// ============================================================================

function dispatchPWAEvent(name: string, detail: unknown): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(`pwa:${name}`, { detail }));
}

export function onPWAEvent(
  name: string,
  callback: (detail: unknown) => void
): () => void {
  if (typeof window === 'undefined') return () => {};

  const handler = (event: Event) => {
    callback((event as CustomEvent).detail);
  };

  window.addEventListener(`pwa:${name}`, handler);
  return () => window.removeEventListener(`pwa:${name}`, handler);
}
