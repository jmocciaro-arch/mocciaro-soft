# Tests E2E (Playwright)

Suite básica de smoke tests + flujos autenticados para verificar que la app no se rompe en regresiones.

## Setup inicial (una vez)

```bash
npm install
npm run test:e2e:install   # baja chromium ~150 MB
```

## Correr smoke tests (sin auth)

Por default apunta a producción (`https://cotizador-torquetools.vercel.app`):

```bash
npm run test:e2e
```

Para correr contra local (con `npm run dev` en otra terminal):

```bash
E2E_BASE_URL=http://localhost:3000 npm run test:e2e
```

UI mode (visual):

```bash
npm run test:e2e:ui
```

## Correr tests autenticados

Requieren credenciales en env vars:

```bash
E2E_USER_EMAIL=test@example.com \
E2E_USER_PASSWORD=xxx \
npm run test:e2e
```

> **NUNCA** uses credenciales de producción reales. Crear un usuario dedicado de E2E en Supabase Auth con permisos limitados (un solo rol viewer en una empresa de testing).

## Qué se verifica hoy

### `smoke.spec.ts` — sin auth (siempre activos)

- `/login` carga con botón Google OAuth.
- `/api/health/sales-chain` devuelve summary válido (28+ checks).
- Rutas protegidas redirigen a `/login`.
- `/api/auth/google` arma URL OAuth con `client_id` no vacío (regresión de bug previo).
- Endpoints públicos no exponen catálogo sin token.
- Endpoints internos (`/api/documents`, `/api/companies`, etc.) rechazan sin auth.
- `/api/cron/*` rechaza sin `CRON_SECRET`.
- `/manifest.json` existe (PWA básica).

### `auth-flow.spec.ts` — con auth (skipped sin credenciales)

- Dashboard carga con `CompanySelector` visible.
- Listado de cotizaciones carga sin React error #310 (regresión).
- Listado de clientes carga ≥1 fila.
- Listado de compras carga proveedores (regresión BUG3 "Sin proveedor").

## Roadmap próximos tests

- Crear cotización → derivar pedido → verificar reserva de stock (PR-D + PR-C).
- Crear albarán desde pedido → verificar consume.
- Cancelar pedido → verificar release.
- Subir extracto bancario → matching → confirmar pago.
- OCR de OC → matching con cotización → conversión a pedido.

## Integración con CI (próximo PR)

Hoy los tests no corren en CI. Próximo PR:
- GitHub Action que corre smoke tests en cada push a `main`.
- Tests con auth solo en branches con label `e2e:auth`.
- Reporte HTML publicado como artifact.
