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

## Bitácora de commits (ordenada cronológicamente)

Se actualiza al final de cada tarea con:
- Hash del commit
- Archivos tocados
- Tests / typecheck status
- Próximo paso

> Bitácora vacía al inicio. Se llena durante la noche.
