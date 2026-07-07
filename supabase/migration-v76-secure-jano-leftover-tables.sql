-- migration-v76-secure-jano-leftover-tables.sql
-- Seguridad: dos tablas huérfanas de una importación de catálogo ("jano")
-- tenían Row Level Security DESACTIVADO y quedaban expuestas al anon key
-- (incluyendo datos sensibles: cost_eur, private_notes, cuentas contables):
--   - _jano_stg               → staging de importación (2617 filas)
--   - tt_products_backup_jano → snapshot de tt_products del 2026-06-21 (1326 filas)
-- Ninguna es referenciada por código, vistas, FKs ni funciones (verificado).
--
-- PASO 1 (esta migración): activar RLS SIN políticas ⇒ los roles anon y
-- authenticated quedan bloqueados por completo. El backend (service_role)
-- mantiene acceso (bypassa RLS), pero como nada las usa, no rompe nada.
-- No se borran datos: es totalmente reversible (ver ROLLBACK).

ALTER TABLE public._jano_stg               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tt_products_backup_jano ENABLE ROW LEVEL SECURITY;

-- PASO 2 (DIFERIDO — NO se ejecuta acá):
-- Limpieza definitiva cuando se confirme que las tablas ya no se necesitan.
-- Recomendado: exportar antes a un archivo (respaldo fuera de la base) y luego
-- correr esto en una migración posterior (v77+):
--   DROP TABLE IF EXISTS public._jano_stg;
--   DROP TABLE IF EXISTS public.tt_products_backup_jano;

-- ROLLBACK:
-- ALTER TABLE public._jano_stg               DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.tt_products_backup_jano DISABLE ROW LEVEL SECURITY;
