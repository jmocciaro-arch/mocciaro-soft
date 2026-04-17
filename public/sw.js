// ============================================================================
// TorqueTools ERP — Service Worker
// Soporte offline completo con sincronización en segundo plano
// ============================================================================

const CACHE_VERSION = 'v1';
const STATIC_CACHE = `torquetools-static-${CACHE_VERSION}`;
const API_CACHE = `torquetools-api-${CACHE_VERSION}`;
const OFFLINE_PAGE = '/offline.html';

// Assets estáticos para pre-cachear en install
const PRECACHE_URLS = [
  '/',
  '/dashboard',
  '/dashboard/ejecutivo',
  '/cotizador',
  '/sat',
  '/scanner',
  '/offline.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// ============================================================================
// INSTALL — Pre-cachear assets críticos
// ============================================================================
self.addEventListener('install', (event) => {
  console.log('[SW] Instalando Service Worker...');
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Pre-cacheando assets estáticos');
        return cache.addAll(PRECACHE_URLS);
      })
      .then(() => self.skipWaiting())
  );
});

// ============================================================================
// ACTIVATE — Limpiar caches viejos
// ============================================================================
self.addEventListener('activate', (event) => {
  console.log('[SW] Activando Service Worker...');
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter(
              (name) =>
                name.startsWith('torquetools-') &&
                name !== STATIC_CACHE &&
                name !== API_CACHE
            )
            .map((name) => {
              console.log(`[SW] Eliminando cache viejo: ${name}`);
              return caches.delete(name);
            })
        )
      )
      .then(() => self.clients.claim())
  );
});

// ============================================================================
// FETCH — Estrategias de cache según tipo de request
// ============================================================================
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignorar requests que no sean GET (POST se manejan con background sync)
  if (request.method !== 'GET') return;

  // Ignorar extensiones de Chrome y URLs internas de Next.js HMR
  if (
    url.protocol === 'chrome-extension:' ||
    url.pathname.startsWith('/_next/webpack-hmr')
  ) {
    return;
  }

  // --- Llamadas a Supabase API → Network First ---
  if (isApiCall(url)) {
    event.respondWith(networkFirstStrategy(request));
    return;
  }

  // --- Assets estáticos (JS, CSS, imágenes, fuentes) → Cache First ---
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirstStrategy(request));
    return;
  }

  // --- Páginas de navegación → Network First con fallback a offline ---
  if (request.mode === 'navigate') {
    event.respondWith(navigationStrategy(request));
    return;
  }

  // --- Todo lo demás → Network First ---
  event.respondWith(networkFirstStrategy(request));
});

// ============================================================================
// Estrategias de cache
// ============================================================================

/**
 * Cache First — Para assets estáticos que casi nunca cambian.
 * Busca en cache primero, si no está va a la red y lo guarda.
 */
async function cacheFirstStrategy(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    // Si falla la red y no hay cache, devolver un response vacío
    return new Response('', { status: 503, statusText: 'Offline' });
  }
}

/**
 * Network First — Para datos de API que necesitan estar frescos.
 * Intenta la red primero, si falla usa cache.
 */
async function networkFirstStrategy(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(API_CACHE);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(
      JSON.stringify({ error: 'offline', message: 'Sin conexion — usando datos guardados' }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

/**
 * Navigation Strategy — Para páginas HTML.
 * Intenta la red, si falla sirve la página offline.
 */
async function navigationStrategy(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    // Intentar servir la página desde cache
    const cached = await caches.match(request);
    if (cached) return cached;

    // Fallback a la página offline
    const offlinePage = await caches.match(OFFLINE_PAGE);
    if (offlinePage) return offlinePage;

    return new Response('<h1>Sin conexion</h1>', {
      status: 503,
      headers: { 'Content-Type': 'text/html' },
    });
  }
}

// ============================================================================
// Helpers — Clasificación de requests
// ============================================================================

function isApiCall(url) {
  return (
    url.hostname.includes('supabase') ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/rest/') ||
    url.hostname.includes('supabase.co')
  );
}

function isStaticAsset(url) {
  const staticExtensions = [
    '.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg',
    '.ico', '.woff', '.woff2', '.ttf', '.eot', '.webp', '.avif',
  ];
  return (
    staticExtensions.some((ext) => url.pathname.endsWith(ext)) ||
    url.pathname.startsWith('/_next/static/')
  );
}

// ============================================================================
// BACKGROUND SYNC — Sincronizar acciones pendientes cuando vuelve la conexión
// ============================================================================
self.addEventListener('sync', (event) => {
  console.log(`[SW] Background sync: ${event.tag}`);

  if (event.tag === 'sync-pending-actions') {
    event.waitUntil(syncPendingActions());
  }
});

/**
 * Sincroniza todas las acciones pendientes almacenadas en IndexedDB.
 */
async function syncPendingActions() {
  try {
    const db = await openIndexedDB();
    const tx = db.transaction('pending_actions', 'readonly');
    const store = tx.objectStore('pending_actions');
    const actions = await idbGetAll(store);

    console.log(`[SW] Sincronizando ${actions.length} acciones pendientes...`);

    for (const action of actions) {
      try {
        const response = await fetch(action.url, {
          method: action.method || 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...action.headers,
          },
          body: JSON.stringify(action.body),
        });

        if (response.ok) {
          // Eliminar la acción sincronizada
          const deleteTx = db.transaction('pending_actions', 'readwrite');
          deleteTx.objectStore('pending_actions').delete(action.id);
          console.log(`[SW] Accion sincronizada: ${action.type} (${action.id})`);
        }
      } catch (err) {
        console.warn(`[SW] Error sincronizando accion ${action.id}:`, err);
      }
    }

    // Notificar a los clientes que se completó la sincronización
    const clients = await self.clients.matchAll();
    clients.forEach((client) => {
      client.postMessage({
        type: 'SYNC_COMPLETE',
        synced: actions.length,
      });
    });
  } catch (err) {
    console.error('[SW] Error en background sync:', err);
  }
}

// ============================================================================
// IndexedDB helpers para el Service Worker
// ============================================================================

function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('torquetools-offline', 1);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('pending_actions')) {
        db.createObjectStore('pending_actions', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('products')) {
        db.createObjectStore('products', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('clients')) {
        db.createObjectStore('clients', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('quotes')) {
        db.createObjectStore('quotes', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('user_settings')) {
        db.createObjectStore('user_settings', { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function idbGetAll(store) {
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ============================================================================
// PUSH NOTIFICATIONS — Estructura para notificaciones push
// ============================================================================
self.addEventListener('push', (event) => {
  console.log('[SW] Push notification recibida');

  let data = {
    title: 'TorqueTools',
    body: 'Tenés una nueva notificación',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-72.png',
    tag: 'torquetools-notification',
  };

  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch {
      data.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon,
      badge: data.badge,
      tag: data.tag,
      data: data.data || {},
      actions: data.actions || [],
      vibrate: [200, 100, 200],
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notificación clickeada');
  event.notification.close();

  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Si ya hay una ventana abierta, enfocarla
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.navigate(urlToOpen);
            return client.focus();
          }
        }
        // Si no, abrir una nueva
        return self.clients.openWindow(urlToOpen);
      })
  );
});

// ============================================================================
// MESSAGE — Comunicación con la app
// ============================================================================
self.addEventListener('message', (event) => {
  const { type, payload } = event.data || {};

  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;

    case 'CACHE_URLS':
      // Permite a la app cachear URLs específicas
      if (payload?.urls) {
        caches.open(STATIC_CACHE).then((cache) => {
          cache.addAll(payload.urls).catch((err) => {
            console.warn('[SW] Error cacheando URLs:', err);
          });
        });
      }
      break;

    case 'CLEAR_API_CACHE':
      caches.delete(API_CACHE).then(() => {
        console.log('[SW] API cache limpiado');
      });
      break;

    default:
      break;
  }
});

console.log('[SW] Service Worker cargado correctamente');
