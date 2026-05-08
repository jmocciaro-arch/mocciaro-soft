# Testing — Mocciaro Soft V001

> **Última actualización:** 2026-05-07
> **Estado:** Fase 0.1 del PLAN-REFACTOR en curso. Solo smoke tests reales.

---

## Niveles de test

| Nivel | Herramienta | Ubicación | Scope |
|---|---|---|---|
| Unit | Vitest (pendiente) | `tests/unit/` | Funciones puras, helpers, schemas Zod |
| E2E smoke | Playwright | `tests/e2e/smoke.spec.ts` | Páginas públicas accesibles |
| E2E auth | Playwright | `tests/e2e/auth-flow.spec.ts` | Login, logout, sesión |
| **E2E full-cycle** | Playwright | `tests/e2e/full-cycle.spec.ts` | **Pendiente: cotización→cobro × 2 empresas** |
| **E2E RLS** | Playwright | `tests/e2e/rls-cross-company.spec.ts` | **Pendiente: aislamiento cross-company** |

---

## Cómo correr local

```bash
# 1. Levantar la app local
npm run dev

# 2. En otra terminal — smoke (no requiere auth)
E2E_BASE_URL=http://localhost:3000 npm run test:e2e -- tests/e2e/smoke.spec.ts

# 3. Tests con auth — requiere credenciales en .env.local
#    E2E_USER_EMAIL, E2E_USER_PASSWORD, E2E_USER_A_*, E2E_USER_B_*
npm run test:e2e

# 4. UI mode (watch + debug visual)
npm run test:e2e:ui
```

---

## Cómo correr contra staging (producción no)

⚠ **Nunca correr full-cycle contra producción real.** Crea documentos reales que después rompen reportes.

```bash
E2E_BASE_URL=https://staging.mocciaro.app npm run test:e2e
```

---

## Seed reproducible

```bash
# Requiere SUPABASE_URL apuntando a staging y SUPABASE_SERVICE_ROLE_KEY
npm run seed:test
```

Genera:
- 2 empresas test (TT-TEST, BT-TEST)
- 5 clientes por empresa
- 10 productos compartidos
- 3 usuarios con roles distintos
- Fixtures en `tests/e2e/fixtures/seed-context.json`

**Aborta automáticamente si SUPABASE_URL apunta a producción.**

---

## CI

`.github/workflows/ci.yml` corre en cada PR:
- `typecheck`
- `lint`
- `build`
- `smoke.spec.ts`
- guard de imports de `service_role`
- guard de escrituras a tablas legacy

Branch protection en `main` requiere que todos pasen antes de mergear.

---

## Debugging

```bash
# Ver test fallando con browser visible
PWDEBUG=1 npm run test:e2e -- tests/e2e/smoke.spec.ts

# Trace viewer (después de un fail)
npx playwright show-trace test-results/.../trace.zip

# Reporte HTML
npx playwright show-report
```

---

## TODO Fase 0.1

Ver `docs/PLAN-REFACTOR.md §Fase 0.1`. Pendiente:
- [ ] Implementar helpers en `tests/e2e/full-cycle.spec.ts`.
- [ ] Implementar funciones de seed en `scripts/seed-test.ts`.
- [ ] Agregar `data-testid` estables a componentes clave (cotizador, document detail, modales).
- [ ] Coverage de RLS para 100% de endpoints `/api/*`.
- [ ] Pipeline E2E en CI corriendo contra staging.
