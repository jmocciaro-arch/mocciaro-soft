# Deployment — Mocciaro Soft V001

> **Última actualización:** 2026-05-07
> **Estado:** push directo a `main` → producción. Staging pendiente de Fase 0.4.

---

## Estado actual (sin staging)

```
PR → main → Vercel auto-deploy → mocciaro-soft.vercel.app
```

⚠ **Sin red de seguridad**. Cualquier merge a `main` toca clientes pagos en segundos.

---

## Estado objetivo (Fase 0.4 del PLAN-REFACTOR)

```
PR (feat/*) → staging branch → staging.mocciaro.app
                ↓ (validado)
            promote → main → mocciaro.app
```

**Reglas nuevas (post Fase 0.4):**
1. Toda PR mergea primero a `staging`.
2. Validación manual + tests E2E en staging.
3. Merge fast-forward de `staging` → `main` solo cuando staging está verde por 24h.

---

## Variables de entorno

### Producción (Vercel)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ANTHROPIC_API_KEY`
- `GEMINI_API_KEY`
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI`
- `RESEND_API_KEY`
- `STELORDER_APIKEY_TORQUETOOLS`
- `CRON_SECRET`

### Staging (Vercel — pendiente)
Las mismas pero con sufijo `_STAGING`. Setear en Vercel → Settings → Environment Variables.

### CI (GitHub Actions)
Secrets en GitHub Settings → Secrets:
- `NEXT_PUBLIC_SUPABASE_URL_STAGING`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY_STAGING`
- `E2E_BASE_URL_STAGING`

---

## Cron jobs (Vercel)

8 crons activos en `vercel.json`. Verificar plan Vercel actual permite ese número (Hobby histórico = 2; Pro permite más).

| Cron | Schedule UTC | Endpoint |
|---|---|---|
| Alertas | `0 8 * * *` | `/api/cron/alerts` |
| Daily digest | `5 8 * * *` | `/api/cron/daily-digest` |
| FX rates | `0 10 * * *` | `/api/fx/rates` |
| Sequences | `0 9 * * *` | `/api/sequences/process` |
| AI summary | `0 7 * * *` | `/api/ai/daily-summary?cron=1` |
| Check emails | `0 11 * * *` | `/api/cron/check-emails` (deprecará tras 3.5) |
| Scheduled exports | `0 7 * * *` | `/api/cron/scheduled-exports` |

⚠ **Sin observabilidad de cron fallos hasta Fase 0.6**. Si un cron falla 3 días, no te enterás.

---

## Migraciones SQL

**NUNCA aplicar desde Claude Code.** Flujo correcto:

1. Claude Code escribe `supabase/migration-vNN-*.sql` con bloque `ROLLBACK`.
2. PR contiene la migración + cambios de código que dependen de ella.
3. Después de mergear, Juan abre Supabase Dashboard → SQL Editor.
4. **Primero en staging** (cuando exista — Fase 0.4): pegar y ejecutar.
5. Validar que los tests E2E pasan contra staging.
6. **Después en producción**: pegar el mismo SQL en SQL Editor de prod.
7. Verificar con queries de smoke.

---

## Rollback de deploy

### Vercel (rápido)
- Vercel Dashboard → Deployments → seleccionar el último OK → "Promote to Production".
- Útil cuando un bug en código aparece en producción sin requerir cambios de DB.

### Migración SQL (lento)
- Cada migración tiene bloque `ROLLBACK` documentado al final.
- Para drops de tablas legacy (Fase 1.6): requiere restaurar desde backup off-site (Fase 0.5).

---

## Smoke checklist post-deploy

Después de cualquier merge a `main`:

- [ ] `mocciaro-soft.vercel.app/login` carga
- [ ] Login con cuenta de prueba funciona
- [ ] `/cotizador` lista cotizaciones
- [ ] Sentry no muestra errores nuevos en últimos 5 min (cuando esté Fase 0.6)
- [ ] Cron jobs últimos 24h: todos OK (cuando esté Fase 0.6)
