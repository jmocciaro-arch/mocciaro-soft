-- Agregar UNIQUE constraint en stelorder_id (que las migraciones usan como ON CONFLICT).
-- Idempotente: si ya existen, no falla.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'stelorder_id'
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname LIKE 'tt_%'
  LOOP
    BEGIN
      EXECUTE format(
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_%s_stelorder_id_unique ON public.%I (stelorder_id) WHERE stelorder_id IS NOT NULL',
        r.table_name, r.table_name
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Skip %: %', r.table_name, SQLERRM;
    END;
  END LOOP;
END $$;

-- Listado de las tablas que ahora tienen el índice UNIQUE
SELECT
  t.relname AS table_name,
  i.relname AS index_name
FROM pg_class t
JOIN pg_index ix ON ix.indrelid = t.oid
JOIN pg_class i ON i.oid = ix.indexrelid
WHERE t.relnamespace = 'public'::regnamespace
  AND t.relname LIKE 'tt_%'
  AND i.relname LIKE 'idx_%_stelorder_id_unique'
ORDER BY t.relname;
