-- ════════════════════════════════════════════════════════════════════════
-- Migration v65 — Renombrar FK de tt_document_events.actor_id
-- ════════════════════════════════════════════════════════════════════════
--
-- WHY:
--   v61 creó tt_document_events con columna user_id (FK a tt_users). El
--   constraint quedó nombrado `tt_document_events_user_id_fkey`.
--   v62 renombró user_id → actor_id (RENAME COLUMN preserva FK pero NO
--   renombra el constraint). Resultado: la columna se llama actor_id
--   pero el constraint sigue llamado *_user_id_fkey.
--
--   El endpoint GET /api/documents/[id]/events hace
--     .select('*, actor:tt_users!tt_document_events_actor_id_fkey(...)')
--   que requiere el constraint con nombre exacto. Como no existe, devuelve
--   "Could not find a relationship between tt_document_events and tt_users
--   in the schema cache".
--
--   Esta migración renombra el constraint para que coincida con el nombre
--   que el código espera.
--
-- HOW TO APPLY: Supabase SQL Editor → Run. Idempotente.
-- ROLLBACK: ver al final.
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE
  old_name text;
BEGIN
  -- Buscar constraint FK actual sobre actor_id que NO se llame ya
  -- *_actor_id_fkey
  SELECT c.conname INTO old_name
  FROM pg_constraint c
  JOIN pg_class t ON c.conrelid = t.oid
  JOIN pg_namespace n ON t.relnamespace = n.oid
  WHERE n.nspname = 'public'
    AND t.relname = 'tt_document_events'
    AND c.contype = 'f'
    AND c.conkey = ARRAY[
      (SELECT attnum FROM pg_attribute
       WHERE attrelid = t.oid AND attname = 'actor_id')
    ]::int2[]
    AND c.conname <> 'tt_document_events_actor_id_fkey'
  LIMIT 1;

  IF old_name IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE public.tt_document_events RENAME CONSTRAINT %I TO tt_document_events_actor_id_fkey',
      old_name
    );
    RAISE NOTICE 'Renamed constraint % → tt_document_events_actor_id_fkey', old_name;
  ELSE
    -- Verificar si ya existe con el nombre correcto
    IF EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      WHERE t.relname = 'tt_document_events'
        AND c.conname = 'tt_document_events_actor_id_fkey'
    ) THEN
      RAISE NOTICE 'Constraint tt_document_events_actor_id_fkey ya existe — skip';
    ELSE
      -- No hay FK sobre actor_id — la creo
      RAISE NOTICE 'No hay FK sobre actor_id, creandola...';
      ALTER TABLE public.tt_document_events
        ADD CONSTRAINT tt_document_events_actor_id_fkey
        FOREIGN KEY (actor_id)
        REFERENCES public.tt_users(id)
        ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════
-- ROLLBACK (no hace falta normalmente — el rename es benigno)
-- ════════════════════════════════════════════════════════════════════════
-- BEGIN;
-- ALTER TABLE public.tt_document_events
--   RENAME CONSTRAINT tt_document_events_actor_id_fkey TO tt_document_events_user_id_fkey;
-- COMMIT;
