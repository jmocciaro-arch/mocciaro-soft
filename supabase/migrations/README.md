# Migraciones Supabase — formato nuevo

Esta carpeta usa el formato estándar de **Supabase CLI**:

```
{timestamp}_{nombre_descriptivo}.sql
```

Donde `timestamp` es `YYYYMMDDHHMMSS` (UTC) y `nombre_descriptivo` es snake_case
con un sufijo legible. Ej: `20260514103136_v76_sku_aliases.sql`.

## Convivencia con formato viejo

El repo tiene dos formatos en paralelo durante un período de transición:

| Período | Ubicación | Patrón | Estado |
|---|---|---|---|
| v2 – v69 | `supabase/migration-vNN-*.sql` (raíz) | nombre suelto | Legacy, no tocar |
| v76+ | `supabase/migrations/{ts}_{nombre}.sql` | carpeta + timestamp | Activo |

Las migraciones nuevas van **siempre** en `supabase/migrations/` con este formato.

## Reconstrucción del historial (2026-05-27)

Este conjunto de migraciones fue sincronizado al repo desde
`supabase_migrations.schema_migrations` después de detectar que el repo estaba
desfasado respecto a producción. Las 22 migraciones aquí ya estaban
**aplicadas en producción**.

### Migraciones que no se conservaron en el repo

Los siguientes números aparecen mencionados en commits o PRs pero **nunca
existieron** como archivo SQL ni en `schema_migrations` de Supabase:

- `v70`, `v71`, `v72`, `v73`, `v74`, `v75`
- `v81`, `v82`, `v83`, `v84`
- `v86`

Probablemente fueron cambios ad-hoc aplicados directamente desde el dashboard
de Supabase o desde una sesión SQL sin tracking. El estado actual de prod ya
los incluye implícitamente — no hay nada que "recuperar".

### Cómo aplicar todas estas migraciones desde cero

```bash
# Branch Supabase efímero
supabase db push --linked

# O manualmente, en orden cronológico (clave: el rollback va en el medio)
ls supabase/migrations/*.sql | sort | xargs -I{} psql -f {}
```

El orden cronológico es **crítico** porque la migración
`20260526000942_rollback_sesion_2026_05_25.sql` deshace casi todo lo del
día anterior (DROP de las views, recreación de tablas legacy, DISABLE RLS).
Aplicarlas en orden reproduce el estado real de prod.

## Reglas para nuevas migraciones

Seguir lo del CLAUDE.md raíz del repo:

1. Nombre: `{timestamp_UTC}_descripcion_corta.sql` (snake_case).
2. Prefijo `tt_` para tablas, `fn_` para funciones, `idx_` para índices.
3. Idempotente cuando sea posible (`IF NOT EXISTS`, `OR REPLACE`).
4. Bloque `-- ROLLBACK:` al final con las sentencias inversas.
5. **Nunca** aplicar en prod desde sesión del agente — el SQL lo aplica Juan
   con dry-run primero.
6. Para crear una migración con Supabase CLI:
   ```bash
   supabase migration new descripcion_corta
   ```
