-- Crear UNIQUE CONSTRAINT (no partial) en stelorder_id.
-- Supabase/PostgREST necesita un constraint formal para usar ON CONFLICT.
-- NULLs no chocan entre sí en UNIQUE (NULL != NULL).

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'stelorder_id'
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'tt_%'
  LOOP
    -- Drop el index partial si existe (no sirve para ON CONFLICT)
    EXECUTE format('DROP INDEX IF EXISTS public.idx_%s_stelorder_id_unique', r.table_name);
    -- Agregar el constraint UNIQUE
    BEGIN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I UNIQUE (stelorder_id)',
        r.table_name,
        r.table_name || '_stelorder_id_key'
      );
    EXCEPTION
      WHEN duplicate_table OR duplicate_object THEN
        NULL;
      WHEN OTHERS THEN
        RAISE NOTICE 'Skip %: %', r.table_name, SQLERRM;
    END;
  END LOOP;
END $$;
