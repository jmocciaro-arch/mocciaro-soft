# Progreso nocturno — 2026-05-07

> **Sesión:** Juan se fue a descansar pidiéndome avanzar toda la noche en pasos seguros y autónomos del PLAN-REFACTOR.
> **Branch única acumulativa:** `feat/v001-cimientos-fase0`
> **Filosofía:** un commit por tarea. Si Juan quiere mergear parcial, hace cherry-pick.

---

## Reglas autoimpuestas para esta sesión nocturna

✅ **Sí puedo hacer:**
- Escribir código (helpers, wrappers, esqueletos de tests).
- Crear migraciones SQL con bloque ROLLBACK (no aplicarlas).
- Documentar (auditorías, runbooks, comentarios en código).
- Refactor de archivos individuales con scope claro.
- Setup de herramientas locales (Vitest, scripts dev).

❌ **NO puedo hacer:**
- Aplicar migraciones a Supabase de producción.
- Push directo a `main`.
- Tocar servicios externos (Sentry, S3) que requieren credentials.
- Tomar decisiones de negocio (las 8 listadas en CLAUDE.md §8).
- Borrar datos.
- Saltearme reglas de CLAUDE.md.
- Modificar OAuth flows o tokens activos.

❓ **Si me cruzo con algo ambiguo:**
- Lo anoto en `docs/BUGS-DESCUBIERTOS.md` con etiqueta `decisión-pendiente-juan`.
- Sigo con la siguiente tarea.

---

## Plan de la noche (orden de ataque)

| # | Tarea | Fase | Estado |
|---|---|---|---|
| 1 | Plan documentado | meta | ✅ este archivo |
| 2 | `withCompanyFilter()` server-side wrapper | 0.2 | ⏳ |
| 3 | Auditar endpoints — reporte de filtrado por company_id | 0.2 | ⏳ |
| 4 | Helpers reales en `scripts/seed-test.ts` | 0.1 | ⏳ |
| 5 | `data-testid` estables en components clave | 0.1 | ⏳ |
| 6 | Migration v59 `tt_cron_runs` | 0.6 | ⏳ |
| 7 | Wrapper `withCronLogging()` | 0.6 | ⏳ |
| 8 | Setup Vitest + tests unit de schemas | 0.1 | ⏳ |
| 9 | `/admin/observability` esqueleto | 0.6 | ⏳ |
| 10 | Script `db:diagram` (DBML) | 0.3 | ⏳ |
| 11 | `lib/gmail-tokens.ts` adaptado a v58 | 0.7 | ⏳ |
| 12 | `COMMENT ON TABLE` en tablas legacy | meta | ⏳ |
| 13 | Reporte final | meta | ⏳ |

---

## Bitácora de commits (cronológica)

Branch: `feat/v001-cimientos-fase0` (acumulativa). Mergeala completa o cherry-pick.

| # | Hash | Tarea | Fase |
|---|---|---|---|
| 1 | `ddd65a0` | Rebrand Mocciaro Soft V001 + base de cimientos | meta |
| 2 | `7f5d8f8` | Plan nocturno documentado | meta |
| 3 | `dff5394` | `withCompanyFilter()` wrapper server-side | 0.2 |
| 4 | `053ec8d` | Auditoría endpoints `/api/*` (47 riesgosos identificados) | 0.2 |
| 5 | `a2e8b68` | `scripts/seed-test.ts` con helpers funcionales | 0.1 |
| 6 | `17c4f4f` | `data-testid` en componentes workflow clave | 0.1 |
| 7 | `7b0a7c2` | Migration v59 `tt_cron_runs` + wrapper `withCronLogging` | 0.6 |
| 8 | `9ff79b5` | Vitest setup + tests unit de schemas Zod | 0.1 |
| 9 | `f24e1af` | Página `/admin/observability` (cron health) | 0.6 |
| 10 | `9ecf8b6` | `scripts/db-diagram` + migration v60 (comments + RPC) | 0.3 |
| 11 | `a24cd30` | `gmail-tokens.ts` compatible con cifrado v58 | 0.7 |

---

## ✅ Completado

**Fase 0.1 — Suite E2E (parcial):**
- Esqueletos `full-cycle.spec.ts` y `rls-cross-company.spec.ts`.
- `scripts/seed-test.ts` funcional con 6 helpers (companies, products, warehouses, clients, users, drafts).
- Vitest setup con tests unit de `documents.ts` (canTransition, canDerive, Zod schemas).
- `data-testid` en DocumentForm + DocumentProcessBar.

**Fase 0.2 — RLS / cross-company:**
- `withCompanyFilter()` wrapper server-side reutilizable.
- Auditoría completa de los 99 endpoints `/api/*` con clasificación 🟢/🟡/🔴.
- 47 endpoints riesgosos identificados con prioridad de refactor.

**Fase 0.3 — ER diagram:**
- `scripts/db-diagram.ts` que genera DBML.
- RPC `get_tt_columns_for_diagram()` en migration v60.

**Fase 0.6 — Observabilidad:**
- Migration v59: tabla `tt_cron_runs`, RPCs `fn_log_cron_start/finish`, vista `vw_cron_health`.
- Wrapper `withCronLogging()` con degraded mode si v59 no aplicada.
- Página `/admin/observability` con health cards + tabla de últimas 50 runs.

**Fase 0.7 — Cifrado tokens:**
- Migration v58 (commit anterior): pgcrypto + RPCs cifradas.
- `gmail-tokens.ts` adaptado con fallback automático plain text si v58 no aplicada.

**Documentación:**
- `docs/AUDIT-ENDPOINTS-2026-05-07.md`: análisis estático de 99 endpoints.
- Migration v60: COMMENT ON TABLE en 12 tablas (7 legacy DEPRECATED + 5 operativas con notas).

---

## ⏳ Pendiente (requiere acción de Juan)

### Aplicar migraciones en orden (en STAGING primero cuando exista)
1. `v57` — extender `tt_document_lines` (commit previo)
2. `v58` — cifrado tokens OAuth (configurar `app.oauth_encryption_key` ANTES)
3. `v59` — `tt_cron_runs`
4. `v60` — comments + RPC diagram

### Servicios externos
- Vercel Pro confirmado (uso comercial + crons)
- Supabase Pro confirmado (backup 7d + branching)
- Sentry DSN para Fase 0.6 completa
- Backblaze B2 / S3 para Fase 0.5

### Acción única requerida con `workflow` scope OAuth
- Copiar `docs/CI-WORKFLOW-TEMPLATE.md` → `.github/workflows/ci.yml` (Claude Code no puede pushear .github/workflows/).

### Decisiones pendientes
Siguen las 8 listadas en CLAUDE.md §8. Ninguna se tomó por mi cuenta.

---

## ❌ NO toqué (a propósito)

- Datos en producción.
- Endpoints `/api/*` existentes (el wrapper `withCompanyFilter()` está disponible pero NO se aplicó a ningún endpoint todavía — eso requiere review por endpoint).
- Refactor de cron jobs `/api/cron/*` para usar `withCronLogging()` (idem).
- Tablas legacy (lectura/escritura).
- Servicios externos sin credentials.
- OAuth flows activos.
- Push a `main`.

---

## 🎯 Sugerencia para sesión próxima

Después de mergear esta branch:
1. **Aplicar migraciones v57+v58+v59+v60 en staging** (cuando exista).
2. **`npm install`** localmente para traer Vitest y verificar `npm run test:unit` pasa.
3. **Refactor incremental de endpoints riesgosos** del top-10 de la auditoría — uno por PR para review fácil. El wrapper ya está, solo hay que aplicarlo.
4. **Refactor de `/api/cron/*` para usar `withCronLogging`** — también uno por commit.
5. Empezar a implementar helpers reales en `tests/e2e/full-cycle.spec.ts` (con la app corriendo localmente y data-testid ya presentes).

