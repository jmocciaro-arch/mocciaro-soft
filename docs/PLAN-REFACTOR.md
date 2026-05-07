# Plan de refactor — Mocciaro Soft

> **Versión:** 2026-05-07 (post-auditoría externa)
> **Decisión de fondo:** **NO reescribir desde cero**. Refactor agresivo en 4 fases.
> **Tiempo total realista:** 40–65 días dev senior FT = 8–13 semanas = 2–3 meses.
> **Estado del modelo:** 4 modelos de datos coexisten (legacy A vertical, legacy B híbrido, unificado nuevo, outlier OCs). Ver `docs/MAPA-FLUJO-DOCUMENTAL.md` §0.

## ¿Por qué no reescribir?

| Argumento popular | Realidad |
|---|---|
| "Lo hago bien desde cero" | Second-System Effect (Brooks 1975). Rewrites tardan 3–5x lo estimado y nunca alcanzan funcionalidad del original. |
| "Stack viejo" | Falso. Next 16 + React 19 + TS strict + Supabase + RLS = stack 2026. La deuda es de **modelado**, no de stack. |
| "Tengo el dominio claro" | Falso. El conocimiento crítico vive en edge-cases descubiertos en producción: numeración atómica, RLS cross-company, derivaciones con remanentes, OCs en 4 idiomas. Nada de eso está en docs, está en el código. Reescribir = redescubrir cada bug en producción. |
| "El actual sigue funcionando mientras reescribo" | Sí, sin mejoras durante 6–12 meses. Doble migración al cutover. |

**Costo rewrite:** 6–12 meses dev FT + U$D 30–60k tercerizado + 100% prob. de regresiones.
**Costo refactor agresivo:** 8–13 semanas + U$D 8–15k + datos vivos que ya validaron el modelo.

---

## Fase 0 — Cimientos (10–14 días). NO se puede saltear.

Sin esta fase, el resto colapsa en silencio. El brief original la omitió y por eso las estimaciones eran fantasiosas.

| # | Tarea | Días | Por qué crítico |
|---|---|---|---|
| 0.1 | Suite E2E Playwright cubriendo: cotización→pedido→albarán→factura→cobro × 2 empresas distintas, con datos seed reproducibles | 4–5 | Sin esto, cualquier refactor rompe en silencio |
| 0.2 | Tests RLS cross-company (user empresa A intenta leer empresa B → debe fallar) en cada endpoint `/api/*` | 2 | Una línea olvidada = data leak entre clientes |
| 0.3 | ER diagram autogenerado + commiteado (`pg_dump --schema-only` → dbdiagram.io export) en `/docs/ER-DIAGRAM.svg` | 1 | Sin esto, programador externo pierde 1 semana entendiendo tablas |
| 0.4 | Setup staging environment (Vercel preview persistente + Supabase branch DB) | 1 | Sin esto, cada refactor sale a prod directo |
| 0.5 | Backup automático off-site (Supabase backup diario + dump semanal a S3 o Backblaze) | 1 | Un `DROP TABLE` accidental = empresa muerta |
| 0.6 | Observabilidad: Sentry para errors + log de cron jobs con alerta por fallo (Discord webhook o email) | 2 | Sin esto, no te enterás cuando algo falla |
| 0.7 | Cifrado de tokens OAuth Gmail en `tt_system_params` (pgcrypto o Supabase Vault) | 1 | Bug de seguridad latente confirmado |

**Criterio de cierre Fase 0:**
- [ ] CI rechaza PRs si E2E happy-path falla.
- [ ] CI rechaza PRs si cualquier test cross-company falla.
- [ ] `/docs/ER-DIAGRAM.svg` actualizado y referenciado desde README.
- [ ] Vercel Preview funciona contra Supabase branch (no contra prod).
- [ ] Sentry recibe errores reales (probado con un throw deliberado).
- [ ] Backup off-site verificado vía restore en staging.
- [ ] Tokens Gmail leídos de DB salen cifrados; función `getGmailTokens()` los descifra.

---

## Fase 1 — Modelo unificado (15–25 días)

| # | Tarea | Días | Notas críticas |
|---|---|---|---|
| 1.1 | **Extender `tt_document_lines`** con campos faltantes que hoy viven en `tt_document_items`: `qty_reserved`, `qty_received`, `qty_cancelled`, `requires_po`, `po_status`, `po_document_id`, `warehouse_id`, `stock_at_creation`, `oc_line_ref`, `internal_description`, `cost_snapshot`. Migración v60 con tests. Actualizar triggers v38 y RLS para cubrir nuevos campos. | 4–5 | El brief original proponía "mapear columnas" — eso perdía info. Esta es la versión correcta. |
| 1.2 | **OC parseada como attachment + metadata de `tt_documents`**, no tabla separada. El PDF queda en bucket `client-pos` referenciado desde `tt_documents.metadata.attachments[]`. La data parseada va a `tt_documents.metadata.oc_parsed` (`{ numero_oc, confidence, discrepancies[], ai_provider }`). `tt_oc_parsed` queda como vista read-only de histórico. | 4–6 | Esto es lo más visible para el usuario. |
| 1.3 | Migrar datos `tt_document_items` → `tt_document_lines` (script idempotente + dry-run + rollback) | 3–4 | Después de 1.1, no antes. |
| 1.4 | Migrar datos `tt_quotes` + `tt_quote_items` → `tt_documents` + `tt_document_lines` (mapeo de status legacy a nuevo) | 3–4 | |
| 1.5 | Migrar datos `tt_sales_orders` + `tt_so_items` → `tt_documents` | 2–3 | |
| 1.6 | Drop tablas legacy (después de **2 sprints** de coexistencia validada con métricas: cero escrituras nuevas durante 30 días) | 1 | NO antes. |

**Criterio de cierre Fase 1:**
- [ ] `tt_document_lines` cubre 100% de los campos de `tt_document_items`.
- [ ] No hay nuevas filas escribiéndose en tablas legacy (verificado con métrica en Sentry/log).
- [ ] Cotizaciones, pedidos, albaranes, facturas se crean y leen solo desde modelo unificado.
- [ ] Tests E2E de Fase 0 siguen pasando.
- [ ] Cross-company RLS sigue funcionando.

---

## Fase 2 — UX y bugs visibles (10–15 días)

| # | Tarea | Días |
|---|---|---|
| 2.1 | OC como puerta de entrada en `/cotizador → Nueva` (eliminar módulo `/ventas/importar-oc` como acceso primario; queda como vista histórica) | 3–4 |
| 2.2 | Layout estilo StelOrder completo: tabla densa de líneas, filtros laterales en `/cotizador`, quick-view modal al hover sobre código de doc | 3–4 |
| 2.3 | Tema claro/oscuro auditado: contraste WCAG AA verificado en cada pantalla con axe-core, no romper en ningún componente | 2 |
| 2.4 | Bugs P3: Cobros vacía, dashboard widgets, stock seed para nuevas empresas, precio truncado en cards de productos, tooltips workflow bar ocultos por z-index | 2–3 |
| 2.5 | Keyboard shortcuts globales: `/` foco buscador, `n` nuevo, `e` emitir, `Esc` cerrar modal. Cheatsheet con `?` | 1–2 |

**Criterio de cierre Fase 2:**
- [ ] Subir un PDF de OC desde `/cotizador → Nueva` crea una cotización con items + PDF como adjunto.
- [ ] Todo texto/icono cumple ratio mínimo 4.5:1 en ambos temas (WCAG AA).
- [ ] Bugs listados ya no se reproducen.
- [ ] Cheatsheet de shortcuts visible con `?`.

---

## Fase 3 — Endurecimiento (5–10 días)

Decisiones pendientes que hoy son **trampas latentes**, no bugs activos.

| # | Tarea | Días |
|---|---|---|
| 3.1 | Stock strict mode toggleable por empresa (no permitir albarán sin reserva si está activado) | 2 |
| 3.2 | Bloquear conversión OC→pedido si `discrepancies.severity = high` sin validación explícita + nota de razón | 1 |
| 3.3 | `doc_subtype` enum constraint (no más texto libre) | 0.5 |
| 3.4 | Cache de PDFs parseados por SHA-256 (no pagar 2x el mismo PDF a Anthropic/Gemini) | 1 |
| 3.5 | Gmail Pub/Sub push (eliminar cron `check-emails` de polling) | 2 |
| 3.6 | Auditoría de cambios en cabecera draft (trigger genérico que loguea diff JSONB en `tt_document_events`) | 1–2 |
| 3.7 | Partitioning de `tt_document_events` por año + archivado a tabla fría tras 2 años | 1 |

**Criterio de cierre Fase 3:**
- [ ] Empresa con stock strict no puede emitir albarán sin reserva.
- [ ] OC con discrepancia HIGH muestra modal de confirmación con razón obligatoria.
- [ ] Subir el mismo PDF dos veces no genera dos llamadas pagas a IA.
- [ ] Cron `check-emails` eliminado; Pub/Sub recibe pushes en tiempo real.

---

## Riesgos transversales (a vigilar en todas las fases)

1. **service_role bypassea RLS** en endpoints `/api/*`: hasta que exista `withCompanyFilter()` server-side único, cada PR que toque endpoints requiere review manual del filtrado por `company_id`.
2. **Vercel crons sin observabilidad** (8 crons activos hoy): cualquier fallo silencioso pasa desapercibido. Fase 0.6 lo cubre, no relajar.
3. **Signed URLs de PDFs en emails caducan en 1h** (OCs). Si el cliente abre el mail 2h después → 404. Fix: ruta `/p/:token` propia que regenera la URL on demand.
4. **Bulk inserts de líneas disparan `fn_recompute_document_totals` por fila**: si una migración escribe 1000 líneas, recalcula 1000 veces. Verificar trigger STATEMENT vs ROW antes de migrar masivo.
5. **`tt_document_events` sin TTL ni partitioning**: en 2–3 años con uso real, queries de "histórico de doc X" se ponen lentas. Fase 3.7 lo cubre.

---

## Lo que el dev humano hace y lo que Claude Code hace

| Actividad | Humano | Claude Code |
|---|---|---|
| Decisiones de arquitectura y modelo de datos | ✅ | ❌ |
| Aplicar migraciones en producción | ✅ | ❌ (escribe, no ejecuta) |
| Tocar RLS sin tests previos | ✅ con cuidado | ❌ |
| Code review final antes de merge | ✅ | ❌ |
| Escribir tests | parcial | ✅ |
| Implementar features con scope acotado | parcial | ✅ |
| Refactor mecánico (renames, splits) | parcial | ✅ |
| Generar migraciones SQL para revisar | ❌ | ✅ |
| Documentación técnica | parcial | ✅ |

**Regla de oro:** Claude Code ejecuta. El humano decide y aprueba.

---

## Costos operativos reales (post-auditoría)

| Servicio | Plan mínimo realista | Costo mensual |
|---|---|---|
| Vercel Pro (uso comercial requerido por TOS) | Pro | U$D 20 |
| Supabase Pro (free pausa el proyecto) | Pro | U$D 25 |
| Anthropic Claude (50 OCs/día × U$D 0.05) | Pay-as-you-go | U$D 75–300 |
| Gemini Tier 1 (rate limits para producción) | Tier 1 | U$D 0–50 |
| Resend (escala con clientes) | Pro | U$D 0–20 |
| Sentry (errors + replays) | Team | U$D 26 |
| StelOrder | (lo paga TorqueTools) | — |
| **Total realista** | | **U$D 146–441/mes** |

Si vendés esto a otros distribuidores: pricing con margen ≥ U$D 250–500/mes/cliente para sostener costos + roadmap.
