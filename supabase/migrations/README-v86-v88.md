# Migraciones v86 / v87 / v88 — SESIÓN 2 (RLS) + SESIÓN 3 (Performance DB)

Generado: 2026-05-23. **NO se aplicó nada todavía — solo archivos SQL listos para revisión.**

> Nota sobre carpeta: el resto del repo histórico vive en `supabase/migration-vNN-*.sql` (plano), pero estas v86–v88 viven en `supabase/migrations/v86_*.sql` (subcarpeta estándar Supabase CLI). Cuando las apliques, mové los archivos a `supabase/` o ajustá la convención que prefiera el equipo.

---

## Resumen

| Migración | Tipo | Riesgo | Tablas afectadas | Items |
|---|---|---|---|---|
| **v86** `enable_rls_critical_tables.sql` | RLS multi-empresa | **ALTO** (puede ocultar datos si endpoints no usan service_role) | tt_invoices, tt_clients, tt_payments, tt_purchase_invoices, tt_bank_movements | 5 tablas, 25 policies |
| **v87** `index_critical_fks.sql` | Performance — índices | **BAJO** (solo agrega índices, no destructivo) | 60+ tablas | 162 CREATE INDEX CONCURRENTLY |
| **v88** `fix_rls_initplan.sql` | Performance — RLS planner | **BAJO** (semántica idéntica, solo cambia plan) | 11 tablas | 20 DROP + CREATE POLICY |

---

## Orden de aplicación recomendado

**1. v87 primero (más seguro, máximo beneficio inmediato).**
   - Solo agrega índices. No puede romper nada funcionalmente.
   - Mejora performance de SELECT/JOIN/DELETE/UPDATE en TODA la app.
   - Usa `CREATE INDEX CONCURRENTLY` → no bloquea writes.
   - Tarda ~5 min (la mayoría de tablas son chicas).

**2. v88 segundo (semi-seguro, ganancia notable a escala).**
   - DROP + CREATE de 20 policies, manteniendo lógica IDÉNTICA.
   - El único cambio es envolver `auth.uid()` en `(SELECT auth.uid())`.
   - Beneficio mayor en tt_import_jobs / tt_import_templates / tt_cron_runs cuando crezcan en volumen.
   - Aplicar en una transacción `BEGIN; \i ...; COMMIT;` para rollback fácil.

**3. v86 último (requiere smoke test previo).**
   - Activa RLS — si algún endpoint client-side lee con anon/authenticated y no respeta company_id, los datos van a "desaparecer".
   - **Pre-requisitos antes de aplicar**:
     - Revisar TODOS los endpoints que tocan tt_invoices / tt_clients / tt_payments / tt_purchase_invoices / tt_bank_movements.
     - Confirmar que server-side jobs (crons, webhooks, integraciones Tango) usan `supabaseAdmin` (service_role).
     - Si algún endpoint client-side filtra por company_id manualmente, va a seguir funcionando (RLS solo agrega capa extra).
   - Aplicar en horario de baja carga + tener rollback listo.

---

## Smoke tests sugeridos

### v87 (índices)
```sql
-- Antes y después: EXPLAIN ANALYZE en queries críticas
EXPLAIN ANALYZE
SELECT * FROM tt_invoices WHERE company_id = '<uuid>' LIMIT 100;

EXPLAIN ANALYZE
SELECT * FROM tt_quote_items WHERE quote_id = '<uuid>';

-- Verificar no haya índices inválidos (CONCURRENTLY que fallaron a la mitad)
SELECT i.indrelid::regclass AS tabla, c.relname AS indice
FROM pg_index i
JOIN pg_class c ON c.oid = i.indexrelid
WHERE NOT i.indisvalid
  AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname='public');
-- Esperado: 0 filas.
```

### v88 (RLS initplan)
```sql
-- Confirmar que el advisor ya no detecta initplan
-- (vía MCP Supabase): get_advisors(type=performance) → buscar auth_rls_initplan
-- Debería ser 0.
```

Funcionalmente:
- Login user normal → ver "Mis templates de import" → debe listar igual que antes.
- Login admin → /admin/observability → debe ver runs de cron.
- Login user no-admin → /admin/observability → NO debe ver runs.

### v86 (RLS company isolation)
- Login user de empresa A → ver facturas de empresa A solamente.
- Login user de empresa B → NO ve facturas de A.
- Crear factura via cotizador (POST /api/invoices) → funciona (server-side service_role).
- Cron alertas-pago → corre OK (service_role).
- Listado clientes → ve los suyos + clientes con company_id NULL (legacy).
- Listado bank_movements → ve TODOS (todavía no hay aislamiento por empresa — ver VERIFICAR en v86).

---

## Rollback

### v87
```sql
DROP INDEX CONCURRENTLY IF EXISTS public.<idx_name>;
-- Para los 162: scripteable con un loop sobre pg_indexes WHERE indexname LIKE 'idx_%' AND ...
```

### v88
Re-aplicar las definiciones originales de cada policy (están en las migraciones históricas: v47, v48, v50, v59, v66). Patrón: revertir `(SELECT auth.uid())` → `auth.uid()` y `(SELECT auth.role())` → `auth.role()`.

### v86 (el más crítico — tener listo el snippet)
```sql
ALTER TABLE public.tt_invoices           DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tt_clients            DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tt_payments           DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tt_purchase_invoices  DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tt_bank_movements     DISABLE ROW LEVEL SECURITY;
-- Las policies quedan creadas pero inactivas mientras RLS esté deshabilitado.
-- Opcionalmente DROP POLICY ... ON ... para limpiar.
```

---

## Pendientes (no incluidos en estas migraciones)

- **30 tablas más con RLS deshabilitado** (advisor crítico): tt_companies, tt_users, tt_products, tt_warehouses, tt_stock, tt_quotes, tt_quote_items, tt_sales_orders, tt_so_items, tt_delivery_notes, tt_dn_items, tt_invoice_items, tt_opportunities, tt_purchase_orders, tt_po_items, tt_sat_tickets, tt_system_params, tt_suppliers, tt_assets, tt_historical_data, tt_supplier_contacts, tt_teams, tt_roles, tt_permissions, tt_role_permissions, tt_user_roles, tt_user_teams, tt_client_relations, tt_contact_sync_log, tt_document_sequences, tt_sku_aliases. → cuando se cierren estas 5 sin romper nada, planificar v89+ con el resto.
- **9 multiple_permissive_policies** (advisor performance): tablas con 2 policies para el mismo role/action (ej. tt_catalog_feeds tiene `auth_all` + `catalog_feeds_public_read` para anon SELECT). Consolidar.
- **131 unused_index** (advisor performance): índices nunca usados — candidatos a drop para liberar storage / acelerar writes. Requiere análisis antes de borrar (índices recientes pueden no haberse usado todavía).
- **2 duplicate_index**: tt_client_addresses y otra — drop el redundante.
- **tt_bank_movements** sin company_id → migración futura para agregarlo + actualizar policy v86.
