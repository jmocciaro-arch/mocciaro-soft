// ============================================================================
// TorqueTools ERP — Service Worker
// Soporte offline completo con sincronización en segundo plano
// ============================================================================

const CACHE_VERSION = 'v3-fix-offline-on-redirect';
const STATIC_CACHE = `torquetools-static-${CACHE_VERSION}`;
const API_CACHE = `torquetools-api-${CACHE_VERSION}`;
const PAGE_CACHE = `torquetools-pages-${CACHE_VERSION}`;
const OFFLINE_PAGE = '/offline.html';

// Assets estáticos y rutas públicas para pre-cachear en install.
// IMPORTANTE: NO incluir rutas autenticadas (/dashboard, /cotizador, etc.) —
// si el user no está logueado, esas rutas devuelven redirect a login y el
// HTML cacheado sería del login, no de la página real.
const PRECACHE_URLS = [
  '/',
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
        // addAll falla si alguna URL no responde 200 — usamos add por URL
        // y toleramos errores individuales (ej. ruta protegida por auth).
        return Promise.all(
          PRECACHE_URLS.map((url) =>
            cache.add(url).catch((err) => {
              console.warn(`[SW] No pude precachear ${url}:`, err.message);
            })
          )
        );
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
                name !== API_CACHE &&
                name !== PAGE_CACHE
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

  // --- Supabase REST/Auth/Storage → PASS-THROUGH, NO cachear ---
  // SEGURIDAD: cachear responses de Supabase guarda tokens y datos
  // específicos de usuario en un cache compartido, filtrando datos entre
  // sesiones distintas en el mismo browser. Siempre ir a la red.
  if (
    url.hostname.endsWith('.supabase.co') ||
    url.hostname.endsWith('.supabase.in') ||
    url.pathname.startsWith('/rest/v1/') ||
    url.pathname.startsWith('/auth/v1/') ||
    url.pathname.startsWith('/storage/v1/') ||
    url.pathname.startsWith('/realtime/v1/')
  ) {
    return; // dejá que el browser haga el fetch normal, sin tocar
  }

  // --- Llamadas a API internas (/api/*) → Network First ---
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
 * Navigation Strategy — Stale-While-Revalidate.
 * Si hay versión cacheada de la página, la sirve INMEDIATAMENTE y refresca
 * en background. Si no hay cache, intenta la red con timeout corto y cae
 * al fallback offline si todo falla. Esto hace que la app abra al instante
 * sin internet siempre que ya hayas visitado la ruta una vez.
 */
async function navigationStrategy(request) {
  const cache = await caches.open(PAGE_CACHE);
  const cached = await cache.match(request);

  // Refresh en background (no bloquea respuesta si hay cache)
  const networkPromise = fetch(request)
    .then((res) => {
      // Solo cachear responses 2xx (no redirects ni errores)
      if (res && res.ok) {
        cache.put(request, res.clone()).catch(() => {});
      }
      return res;
    })
    .catch(() => null);

  // 1. Si hay cache → servir YA, refresh en background
  if (cached) {
    networkPromise.catch(() => {});
    return cached;
  }

  // 2. Sin cache: intentar red con timeout de 4s
  const timeoutPromise = new Promise((resolve) =>
    setTimeout(() => resolve(null), 4000)
  );
  const fresh = await Promise.race([networkPromise, timeoutPromise]);
  // FIX (2026-05-25): aceptar también redirects (3xx) — antes solo aceptaba
  // 2xx, lo que hacía caer al fallback offline cuando el proxy/middleware
  // hacía un 307 a /login, mostrando "Sin conexión" en lugar de la app.
  // Si el server respondió cualquier cosa < 500, no estamos offline.
  if (fresh && fresh.status < 500) return fresh;

  // 3. Red falló o tardó demasiado → fallback offline
  const offlinePage = await caches.match(OFFLINE_PAGE);
  if (offlinePage) return offlinePage;

  return new Response('<h1>Sin conexion</h1>', {
    status: 503,
    headers: { 'Content-Type': 'text/html' },
  });
}

// ============================================================================
// Helpers — Clasificación de requests
// ============================================================================

function isApiCall(url) {
  // Solo APIs internas de Next.js. Supabase ya se filtra antes en el handler
  // de fetch con pass-through total — no debe llegar acá nunca.
  return url.pathname.startsWith('/api/');
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
