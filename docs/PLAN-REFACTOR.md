# Plan de Refactor — Mocciaro Soft

> **Fecha:** 2026-05-07
> **Objetivo:** llevar el sistema de "deuda técnica triple coexistente" a "modelo unificado en producción, testeado, observable, escalable".
> **Duración total estimada:** 8-13 semanas dev senior FT (40-65 días).
> **Regla:** ejecutar fases en orden estricto. NO saltear.

---

## Estado de partida (auditoría 2026-05-07)

El sistema tiene **cuatro modelos coexistiendo** (no dos como decía el brief original):

1. **Legacy A (vertical):** `tt_quotes/tt_quote_items`, `tt_sales_orders/tt_so_items`, `tt_purchase_orders/tt_po_items`.
2. **Legacy B (híbrido):** `tt_document_items`, `tt_document_links`.
3. **Nuevo unificado:** `tt_documents`, `tt_document_lines`, `tt_document_relations`, `tt_document_configs`, `tt_document_numbering`, `tt_document_events`.
4. **Outlier IA:** `tt_oc_parsed`.

El modelo nuevo está bien diseñado pero usado parcialmente. La UI mezcla los 4. Cada refactor sin tests rompe en silencio.

**Problemas adicionales detectados:**
- Sin staging environment (push a `main` → producción directa).
- Sin tests E2E reales (solo 1 smoke test).
- Sin tests automatizados de RLS cross-company.
- Sin observabilidad de errores ni de cron jobs.
- Tokens OAuth Gmail sin cifrar en reposo.
- Sin backup off-site documentado.
- 7 cron jobs concurrentes sin alertas de fallo.
- Decisiones de negocio pendientes mezcladas con bugs (ver §8 al final).

---

## Tabla maestra de fases

| Fase | Nombre | Días | Bloquea a | Estado |
|---|---|---|---|---|
| **0** | Cimientos | 10-14 | Todas | ⏳ Pendiente |
| **1** | Modelo unificado | 15-25 | Fase 2 (parcialmente) | ⏳ Pendiente |
| **2** | UX y bugs visibles | 10-15 | — | ⏳ Pendiente |
| **3** | Endurecimiento | 5-10 | — | ⏳ Pendiente |
| **Total** | | **40-64** | | |

---

# Fase 0 — Cimientos (10-14 días)

**Objetivo:** crear la red de seguridad que hoy no existe. Sin esto, cualquier refactor de la Fase 1 va a romper algo en producción que nadie va a detectar hasta que reclame un cliente.

**No se puede saltear.** Si Juan presiona por adelantar Fase 1, la respuesta es: "sin Fase 0 el riesgo es inaceptable, mostrame el incidente que estás dispuesto a aceptar".

## 0.1 Suite E2E del happy path completo

**Estimación:** 4-5 días
**Por qué crítico:** sin esto, refactor = ruleta rusa.

**Qué hacer:**
- Setup de seed reproducible: script `npm run seed:test` que crea 2 empresas, 5 clientes, 10 productos, 3 usuarios con distintos roles, en una DB limpia.
- Test E2E `tests/e2e/full-cycle.spec.ts` que ejecuta: login → crear cotización → emitir → derivar a pedido → emitir pedido → derivar a albarán → emitir albarán → derivar a factura → emitir factura → registrar cobro → verificar status `paid`.
- Mismo test corriendo en empresa A y empresa B en paralelo.
- Test E2E `tests/e2e/oc-flow.spec.ts`: subir PDF de OC → parsear → match con cotización → convertir a pedido.
- Tests deben correr en CI antes de cada merge a `main`.

**Criterio de aceptación:**
- [ ] `npm run seed:test` ejecuta limpio en DB vacía
- [ ] Tests pasan localmente y en Vercel Preview
- [ ] CI bloquea merge si fallan
- [ ] Documentación en `/docs/TESTING.md` de cómo correr y debugear

## 0.2 Tests RLS cross-company

**Estimación:** 2 días
**Por qué crítico:** una sola línea olvidada en cualquier endpoint API = data leak entre clientes pagos.

**Qué hacer:**
- Test `tests/e2e/rls-cross-company.spec.ts` que itera sobre cada endpoint `/api/*`:
  - Autenticarse como user de empresa A.
  - Intentar leer/modificar recurso de empresa B (con ID conocido).
  - Debe responder 403 o 404. NUNCA 200 con datos.
- Test que verifica que `service_role` solo se importe desde `@/lib/supabase/admin.ts` (grep en CI).
- Wrapper obligatorio `withCompanyFilter()` en helper compartido. PR que añada endpoint sin él: rechazado.

**Criterio de aceptación:**
- [ ] Test cubre 100% de endpoints en `src/app/api/`
- [ ] Test corre en cada PR
- [ ] Helper `withCompanyFilter` documentado en `/docs/SECURITY.md`

## 0.3 ER diagram autogenerado

**Estimación:** 1 día
**Por qué crítico:** programador externo o Claude Code pierden 1 semana entendiendo 30+ tablas leyendo prosa.

**Qué hacer:**
- Script `npm run db:diagram` que corre `pg_dump --schema-only` y genera SVG con dbdiagram.io API o herramienta equivalente (`schemaspy`, `dbml-cli`).
- SVG commiteado en `/docs/diagrams/er-current.svg`.
- Regenerar en cada migración (hook pre-push opcional).

**Criterio de aceptación:**
- [ ] Diagrama navegable en SVG
- [ ] Script reproducible
- [ ] Linkeado desde MAPA-FLUJO-DOCUMENTAL.md

## 0.4 Staging environment

**Estimación:** 1 día
**Por qué crítico:** push a `main` va directo a producción. Bug en cliente real.

**Qué hacer:**
- Crear branch `staging` en GitHub.
- Vercel: deploy automático de `staging` a `staging.mocciaro.app` (subdominio).
- Supabase: usar branching (Supabase Branches o segundo proyecto `mocciaro-staging`).
- Variables de entorno separadas en Vercel.
- Política nueva: PRs van a `staging` primero, se validan, después se promueven a `main` con merge fast-forward.

**Criterio de aceptación:**
- [ ] `staging.mocciaro.app` accesible
- [ ] DB de staging poblada con seed (no datos reales)
- [ ] Doc en `/docs/DEPLOYMENT.md` con flujo PR → staging → main

## 0.5 Backup off-site automático

**Estimación:** 1 día
**Por qué crítico:** Supabase Pro hace backup diario 7 días. Para datos contables/fiscales argentinos y españoles necesitás 5-10 años de retención.

**Qué hacer:**
- Cron diario (GitHub Action o Vercel Cron) que ejecuta `pg_dump` y sube a S3/Backblaze B2.
- Retención: diario 30 días, semanal 12 semanas, mensual 24 meses, anual permanente.
- Cifrado en reposo con clave gestionada (no en repo).
- Test trimestral de restore en DB temporal.

**Criterio de aceptación:**
- [ ] Backup corre y sube exitosamente
- [ ] Restore probado en DB efímera
- [ ] Documentación en `/docs/BACKUP.md` con runbook de restore

## 0.6 Observabilidad

**Estimación:** 2 días
**Por qué crítico:** si un cron falla 3 días, no te enterás hasta que el cliente reclame.

**Qué hacer:**
- Sentry integrado en Next.js (frontend + API routes).
- Logger estructurado (`pino` o similar) en endpoints.
- Cada cron en `vercel.json` reportando inicio/éxito/fallo a Sentry o a tabla `tt_cron_runs`.
- Alerta por email si un cron falla 2 veces consecutivas.
- Dashboard simple en `/admin/observability` con últimas N corridas.

**Criterio de aceptación:**
- [ ] Sentry capturando errores en preview y prod
- [ ] Tabla `tt_cron_runs` con histórico
- [ ] Alerta probada (forzar fallo de cron, verificar email)

## 0.7 Cifrado de tokens OAuth Gmail

**Estimación:** 1 día
**Por qué crítico:** `access_token` y `refresh_token` de Gmail en `tt_system_params` en plain text = leak = control total del Gmail del owner.

**Qué hacer:**
- Migración v60 que crea columnas `*_encrypted` y migra datos existentes con `pgcrypto` o Supabase Vault.
- Helper `getOAuthTokens(companyId)` que descifra al leer.
- Drop de columnas plain después de validar 1 sprint.
- Rotación de tokens (refresh forzado) post-migración.

**Criterio de aceptación:**
- [ ] Tokens cifrados en reposo
- [ ] Endpoint Gmail sigue funcionando
- [ ] Plain text removido de DB

---

# Fase 1 — Modelo unificado (15-25 días)

**Objetivo:** colapsar los 4 modelos en uno solo (`tt_documents` + `tt_document_lines` + `tt_document_relations`). Eliminar deuda estructural.

**Pre-requisito:** Fase 0 completa al 100%. No empezar antes.

## 1.1 Extender `tt_document_lines` con campos operativos

**Estimación:** 4-5 días
**Por qué primero:** las migraciones siguientes copian datos hacia `tt_document_lines`, que hoy NO tiene los campos operativos de `tt_document_items`.

**Qué hacer:**
- Migración v61: agregar columnas a `tt_document_lines`:
  ```sql
  ALTER TABLE tt_document_lines
    ADD COLUMN qty_reserved NUMERIC(14,4) DEFAULT 0,
    ADD COLUMN qty_received NUMERIC(14,4) DEFAULT 0,
    ADD COLUMN qty_cancelled NUMERIC(14,4) DEFAULT 0,
    ADD COLUMN requires_po BOOLEAN DEFAULT false,
    ADD COLUMN po_status TEXT,
    ADD COLUMN po_document_id UUID REFERENCES tt_documents(id),
    ADD COLUMN warehouse_id UUID REFERENCES tt_warehouses(id),
    ADD COLUMN stock_at_creation NUMERIC(14,4),
    ADD COLUMN oc_line_ref TEXT,
    ADD COLUMN internal_description TEXT,
    ADD COLUMN cost_snapshot NUMERIC(14,4);
  ```
- Actualizar triggers de v38 para incluir nuevos campos en validaciones.
- Actualizar Zod schemas en `src/lib/schemas/documents.ts`.
- Actualizar índices: `idx_doc_lines_po_document` para joins de cross-purchase.

**Criterio de aceptación:**
- [ ] Migración aplicada en staging sin errores
- [ ] Tests E2E pasan
- [ ] Schemas TS reflejan nuevas columnas
- [ ] Rollback documentado y probado

## 1.2 OC parseada como attachment+metadata de `tt_documents`

**Estimación:** 4-6 días
**Por qué:** hoy `tt_oc_parsed` es módulo huérfano. El usuario lo percibe como "todo desconectado".

**Qué hacer:**
- Mover botón "Importar OC" dentro de `/cotizador → Nueva` como segunda opción (junto a "En blanco").
- Endpoint refactor `POST /api/oc/create-quote`:
  - Crea `tt_documents(doc_type=quote, doc_subtype='cotizacion_desde_oc')`.
  - PDF original sube a Storage como attachment vinculado al documento.
  - Items extraídos van a `tt_document_lines`.
  - `customer_po_number` ← número de OC del cliente.
  - Discrepancias en `metadata.oc_parsed.discrepancies` (JSONB).
  - Hash SHA-256 del PDF en `metadata.oc_parsed.pdf_hash` (para cache de re-parseos).
- `/ventas/importar-oc` queda como vista histórica read-only.
- Migración v62: marcar `tt_oc_parsed` como deprecada (no drop todavía).

**Criterio de aceptación:**
- [ ] Desde `/cotizador → Nueva` se sube PDF de OC y se crea cotización con items extraídos
- [ ] PDF original visible en tab "Adjuntos" del documento
- [ ] Discrepancias visibles en card dentro del detalle
- [ ] No se crean filas nuevas en `tt_oc_parsed` (las viejas se mantienen)
- [ ] Cache funciona: subir mismo PDF 2x no llama a Anthropic 2x

## 1.3 Migrar datos de `tt_document_items` → `tt_document_lines`

**Estimación:** 3-4 días
**Por qué:** dos tablas para los mismos items.

**Qué hacer:**
- Script SQL `supabase/migration-v63-migrate-doc-items.sql`:
  - INSERT idempotente con UPSERT por clave compuesta.
  - Mapeo explícito de columnas (incluyendo las nuevas de v61).
  - Bloque de verificación: counts antes/después por documento.
- Modo dry-run: variable `DRY_RUN=true` solo cuenta, no inserta.
- Endpoint check `/api/admin/migration-status` que reporta progreso.
- Refactorizar todos los endpoints que escriben en `tt_document_items` a escribir en `tt_document_lines`.
- `tt_document_items` queda como vista (`CREATE VIEW tt_document_items_legacy AS SELECT ...`) por 2 sprints.
- Drop final en migración v66 después de validar.

**Criterio de aceptación:**
- [ ] Dry-run reporta totales correctos
- [ ] Migración real exitosa en staging
- [ ] No hay nuevas filas escribiéndose en `tt_document_items`
- [ ] Toda la UI lee de `tt_document_lines`
- [ ] Tests E2E del flujo completo siguen pasando

## 1.4 Migrar `tt_quotes` → `tt_documents`

**Estimación:** 3-4 días
**Por qué:** completar modelo unificado en cotizaciones.

**Qué hacer:**
- Migración v64: copiar `tt_quotes` y `tt_quote_items` a `tt_documents` y `tt_document_lines`.
- Mapeo de status legacy → nuevos:
  ```
  borrador  → draft
  enviada   → sent
  aceptada  → accepted
  rechazada → rejected
  expirada  → cancelled (con metadata.expired=true)
  facturada → invoiced
  ```
- Endpoints `/api/quotes/*` redirigen a `/api/documents?doc_type=quote`.
- Componente cotizador unificado en `/cotizador`.
- Vista `tt_quotes_legacy` por 2 sprints.

**Criterio de aceptación:**
- [ ] Listado de cotizaciones lee solo de `tt_documents`
- [ ] Cotizaciones nuevas se crean en `tt_documents`
- [ ] Cotizaciones legacy migradas se ven igual que las nuevas
- [ ] Dashboard widgets que dependían de `tt_quotes` apuntan ahora a `tt_documents`

## 1.5 Migrar `tt_sales_orders` → `tt_documents`

**Estimación:** 2-3 días
**Por qué:** mismo motivo que 1.4 para pedidos.

**Qué hacer:**
- Migración v65 análoga a v64.
- Mapeo de status legacy.
- Refactorizar `src/app/(dashboard)/ventas/` para leer de `tt_documents`.

**Criterio de aceptación:**
- [ ] Pedidos legacy migrados visibles en UI nueva
- [ ] Nuevos pedidos solo en `tt_documents`
- [ ] Tests E2E siguen pasando

## 1.6 Drop de tablas legacy

**Estimación:** 1 día
**Por qué:** cierra la deuda. Después de 2 sprints de coexistencia validada.

**Qué hacer:**
- Migración v66: DROP de `tt_quotes`, `tt_quote_items`, `tt_sales_orders`, `tt_so_items`, `tt_document_items`, `tt_oc_parsed` (después de validar que vista funciona como fallback de queries históricas, si las hay).
- Backup explícito antes del drop.
- Rollback documentado: restore desde backup S3.

**Criterio de aceptación:**
- [ ] Backup confirmado antes del drop
- [ ] Migración aplicada en staging primero
- [ ] Sentry sin errores 24h post-drop en staging antes de aplicar a prod

---

# Fase 2 — UX y bugs visibles (10-15 días)

**Objetivo:** lo que el usuario ve. Sin Fase 1 algunas tareas no se pueden completar (los dashboards leerán datos rotos).

## 2.1 Layout estilo StelOrder completo

**Estimación:** 3-4 días
**Estado actual:** sticky footer + header 2 columnas ya está (commit `6a57ac6`).

**Qué falta:**
- Tabla de líneas con columnas exactas: `lupa | abrir | Ref | Nombre | Descripción | Precio base | Uds | % Dto | Subtotal | trash | menú`.
- Densidad: `line-height: 1.3`, padding celda `6-8px`.
- Filtros laterales en `/cotizador`: estado, cliente, fecha, monto.
- Quick view modal al hover sobre código del documento.
- Sticky header de tabla con scroll vertical.

**Criterio de aceptación:**
- [ ] Tabla muestra 25+ filas en pantalla 1080p sin scroll
- [ ] Filtros funcionan combinados (AND)
- [ ] Quick view abre <100ms (precarga)
- [ ] Funciona en tema claro y oscuro

## 2.2 Auditoría de tema claro/oscuro (WCAG AA)

**Estimación:** 2 días
**Estado actual:** toggle implementado (commit `82298bf`). Falta auditoría sistemática.

**Qué hacer:**
- Integrar `axe-core` en Playwright. Test que itera sobre cada página en cada tema y verifica contraste.
- Tokens de color en `src/app/globals.css` revisados:
  ```css
  [data-theme="dark"]  { --bg: #141820; --fg: #F0F2F5; --accent: #FF6600; ... }
  [data-theme="light"] { --bg: #FFFFFF; --fg: #1A1A1A; --accent: #E55C00; ... }
  ```
- Reglas mínimas:
  - Texto sobre fondo: ratio ≥4.5:1
  - Texto grande (≥18pt): ratio ≥3:1
  - Iconos / bordes: ratio ≥3:1
- Test corre en CI, falla si algún componente baja del umbral.

**Criterio de aceptación:**
- [ ] axe-core test pasa en todas las páginas, ambos temas
- [ ] Screenshots de regresión en `tests/e2e/screenshots/`
- [ ] Acento `#FF6600` ajustado en tema claro a `#E55C00` o variante con contraste OK

## 2.3 Workflow bar — fix tooltips

**Estimación:** 1 día
**Bug:** tooltips ocultos detrás de otros elementos (z-index).

**Qué hacer:**
- Revisar `src/components/workflow/document-process-bar.tsx`.
- `z-index: 50+`, `position: absolute`, `top` calculado.
- Test E2E: hover sobre step → tooltip visible.

**Criterio de aceptación:**
- [ ] Tooltips visibles en todos los steps
- [ ] Test de regresión

## 2.4 Bugs P3

**Estimación:** 2-3 días total

| Bug | Síntoma | Fix probable |
|---|---|---|
| Cobros vacía | `/cobros` no muestra nada | Endpoint filtro company_id roto o `tt_invoice_payments` vacío post-limpieza |
| Precio truncado en card de producto | Texto cortado en `/productos` | CSS card: `tabular-nums` + `text-right` + width suficiente |
| Dashboard widgets vacíos | Home muestra "0" | Queries dependen de legacy; tras Fase 1.4 apuntan a `tt_documents` |
| Stock seed para nuevas empresas | Stock vacío sin botón init | Verificar banner en `src/app/(dashboard)/stock/page.tsx` y endpoint `POST /api/stock/seed` |

## 2.5 Keyboard shortcuts

**Estimación:** 1-2 días
**Por qué:** usuarios power necesitan velocidad. Hoy todo es click.

**Qué hacer:**
- Hook `useKeyboardShortcut` reutilizable.
- Shortcuts globales:
  - `/` → foco en buscador global
  - `n` → nuevo documento (según contexto: cotización en /cotizador, etc.)
  - `?` → modal con cheatsheet
- Shortcuts en doc detail:
  - `e` → emitir
  - `Esc` → volver al listado
  - `Ctrl+S` → guardar draft
- Shortcuts en tabla:
  - `j/k` → navegar filas
  - `Enter` → abrir
- Documentado en footer y en modal `?`.

**Criterio de aceptación:**
- [ ] Cheatsheet visible con `?`
- [ ] Shortcuts no entran en conflicto con inputs (skip cuando focus está en `<input>`/`<textarea>`)
- [ ] Test E2E de al menos 3 shortcuts críticos

---

# Fase 3 — Endurecimiento (5-10 días)

**Objetivo:** decisiones de negocio pendientes + optimizaciones de bajo riesgo y alto valor.

**Cada item requiere decisión explícita de Juan antes de empezar.** Ver §8.

## 3.1 Stock strict mode toggleable

**Estimación:** 2 días
**Decisión pendiente:** ¿activar strict por default? ¿por empresa?

**Qué hacer (si Juan dice sí):**
- Columna `tt_companies.stock_strict_mode BOOLEAN DEFAULT false`.
- Validación en `POST /api/documents/:id/derive` cuando target=delivery_note: si strict y no hay reserva activa, retorna 422 con mensaje claro.
- UI: toggle en config de empresa.

## 3.2 Bloquear conversión OC con discrepancias HIGH

**Estimación:** 1 día
**Decisión pendiente:** ¿bloquear hard o soft (advertir + doble confirmación)?

**Qué hacer (recomendación: soft):**
- Endpoint `POST /api/oc/convert-to-order` valida `tt_documents.metadata.oc_parsed.discrepancies`.
- Si hay severity=high y status no es `validated`, retorna 422.
- UI muestra modal con discrepancias y botón "Validar y convertir" que requiere nota explicativa.
- Nota queda en `metadata.oc_parsed.validation_note` con timestamp y user_id.

## 3.3 `doc_subtype` como enum

**Estimación:** 0.5 día
**Decisión pendiente:** ¿lista cerrada o tabla referencial editable?

**Qué hacer (recomendación: enum):**
- Migración v67: crear tipo enum `doc_subtype_enum` con valores:
  ```
  cotizacion, presupuesto, oferta, proforma, packing_list,
  cotizacion_desde_oc, factura_a, factura_b, factura_c, ticket
  ```
- ALTER COLUMN con USING para conversión (con DEFAULT para rows existentes).

## 3.4 Cache de PDFs parseados por SHA-256

**Estimación:** 1 día
**Por qué:** subir 2x el mismo PDF → 2 llamadas pagas a Anthropic.

**Qué hacer:**
- Tabla `tt_oc_parse_cache(pdf_sha256 PRIMARY KEY, parsed_json JSONB, ai_provider, parsed_at, expires_at)`.
- Endpoint `POST /api/oc/parse` calcula hash, consulta cache. Si hit y no expirado → devuelve cache.
- TTL default 30 días.
- Métrica: % de cache hits visible en `/admin/observability`.

## 3.5 Gmail Pub/Sub push (eliminar polling)

**Estimación:** 2 días
**Por qué:** detectar respuestas con 24h de delay es inaceptable en 2026.

**Qué hacer:**
- Setup de Google Cloud Pub/Sub topic `gmail-replies`.
- Endpoint `/api/webhooks/gmail` recibe push.
- Cron `check-emails` removido de `vercel.json`.
- Endpoint con verificación de firma Pub/Sub.

## 3.6 Auditoría de cambios en cabecera draft

**Estimación:** 1-2 días
**Por qué:** si cliente reclama "yo dije precio X y vos pusiste Y", no hay trail.

**Qué hacer:**
- Trigger `trg_audit_doc_header_changes` en `tt_documents`:
  - BEFORE UPDATE.
  - Si cambia `counterparty_*`, `notes`, `valid_until`, `due_date`, etc. → INSERT en `tt_document_events` con `event_type='header_changed'` y `payload` = diff JSONB.
- Solo aplica en status='draft' (después de issued ya está locked).

## 3.7 Partitioning de `tt_document_events`

**Estimación:** 1 día
**Por qué:** en 2-3 años con uso real esa tabla va a tener millones de filas.

**Qué hacer:**
- Migración v68: convertir `tt_document_events` a partitioned table por `created_at` (RANGE partitioning anual).
- Particiones existentes: 2024, 2025, 2026.
- Particiones futuras: cron mensual que crea la del año siguiente cuando faltan 2 meses.
- Política de archivo: particiones >2 años → tablespace separado o exportar a S3.

---

# Cronograma sugerido

```
Semana 1-2:    Fase 0 (cimientos)
Semana 3-7:    Fase 1 (modelo unificado)
Semana 8-10:   Fase 2 (UX y bugs)
Semana 11-13:  Fase 3 (endurecimiento)
```

Total: **13 semanas FT** o **~6 meses part-time**.

---

# Decisiones pendientes del usuario

Antes de empezar Fase 3, Juan tiene que definir:

| # | Decisión | Default sugerido |
|---|---|---|
| D1 | Stock strict mode | Off por default, opt-in por empresa |
| D2 | OC discrepancies HIGH | Soft block (modal + nota) |
| D3 | `doc_subtype` enum vs tabla | Enum (más simple, validable) |
| D4 | Numeración fiscal cross-empresa | Independiente (como hoy) |
| D5 | Retención `tt_document_events` | Partition + archivo a S3 después de 2 años |
| D6 | Plan Vercel | Pro (U$D 20/mes) — hobby no permite uso comercial |
| D7 | Plan Supabase | Pro (U$D 25/mes) — branching + backup 7d incluido |

Sin estas decisiones, Fase 3 no arranca.

---

# Reglas de ejecución

1. **Una fase por vez.** No mezclar items de fases distintas en el mismo PR.
2. **Cada item requiere PR propio.** PRs ≤ 500 líneas de diff.
3. **Cada item requiere tests.** Sin tests, no merge.
4. **Cada migración SQL requiere dry-run en staging primero.**
5. **Cada cambio de DB requiere backup confirmado antes de aplicar a prod.**
6. **Cada decisión ambigua se documenta y se pregunta.** No se asume.
7. **Cada bug fuera de scope se anota en `/docs/BUGS-DESCUBIERTOS.md`.** No se arregla en el PR actual.

---

> **Documento vivo.** Actualizar después de cada fase con lo aprendido. Si una estimación se desvía >50%, documentar por qué y recalibrar las siguientes.
