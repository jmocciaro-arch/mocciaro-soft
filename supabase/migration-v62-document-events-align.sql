-- ════════════════════════════════════════════════════════════════════════
-- Migration v62 — Alinear schema de tt_document_events con el código
-- ════════════════════════════════════════════════════════════════════════
--
-- WHY:
--   La migración v61 creó tt_document_events con nombres distintos a los
--   que el código TypeScript ya espera (lib/documents/engine.ts y
--   /api/documents/[id]/events). Esta migración renombra columnas para
--   alinear:
--
--   v61 (mal)         →  v62 (correcto, lo que código espera)
--   ─────────────────    ─────────────────────────────────────
--   user_id           →  actor_id
--   prev_status       →  from_status
--   new_status        →  to_status
--   message           →  notes
--
--   Además agrega trigger de inmutabilidad (append-only) — los events
--   son audit log, jamás se modifican ni borran.
--
-- HOW TO APPLY:
--   Pegar este archivo entero en Supabase SQL Editor → Run.
--   Idempotente: chequea existencia de cada columna antes de renombrar.
--
-- ROLLBACK:
--   Ver bloque al final del archivo (comentado).
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 1. Rename columnas
-- ─────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='tt_document_events' AND column_name='user_id'
  ) THEN
    ALTER TABLE public.tt_document_events RENAME COLUMN user_id TO actor_id;
    RAISE NOTICE 'Renamed tt_document_events.user_id → actor_id';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='tt_document_events' AND column_name='prev_status'
  ) THEN
    ALTER TABLE public.tt_document_events RENAME COLUMN prev_status TO from_status;
    RAISE NOTICE 'Renamed tt_document_events.prev_status → from_status';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='tt_document_events' AND column_name='new_status'
  ) THEN
    ALTER TABLE public.tt_document_events RENAME COLUMN new_status TO to_status;
    RAISE NOTICE 'Renamed tt_document_events.new_status → to_status';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='tt_document_events' AND column_name='message'
  ) THEN
    ALTER TABLE public.tt_document_events RENAME COLUMN message TO notes;
    RAISE NOTICE 'Renamed tt_document_events.message → notes';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- 2. Renombrar índices que contengan los nombres viejos de columna
-- ─────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  r record;
  new_name text;
BEGIN
  FOR r IN
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname='public'
      AND tablename = 'tt_document_events'
      AND (
        indexname LIKE '%user_id%'
        OR indexname LIKE '%prev_status%'
        OR indexname LIKE '%new_status%'
      )
  LOOP
    new_name := r.indexname;
    new_name := replace(new_name, 'user_id', 'actor_id');
    new_name := replace(new_name, 'prev_status', 'from_status');
    new_name := replace(new_name, 'new_status', 'to_status');
    IF new_name <> r.indexname THEN
      EXECUTE format('ALTER INDEX public.%I RENAME TO %I', r.indexname, new_name);
      RAISE NOTICE 'Renamed index % → %', r.indexname, new_name;
    END IF;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- 3. Crear índice por (document_id, created_at desc) si no existe
--    (es la query más común: timeline de un documento ordenado por fecha)
-- ─────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_tt_document_events_doc_created
  ON public.tt_document_events(document_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────
-- 4. Trigger de inmutabilidad (append-only)
--    Los events son audit log: solo INSERT permitido. UPDATE/DELETE
--    se bloquean. RLS adicional refuerza vía policies.
-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_tt_document_events_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'tt_document_events es append-only (operación % denegada)', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

DROP TRIGGER IF EXISTS tg_tt_document_events_no_update ON public.tt_document_events;
DROP TRIGGER IF EXISTS tg_tt_document_events_no_delete ON public.tt_document_events;

CREATE TRIGGER tg_tt_document_events_no_update
  BEFORE UPDATE ON public.tt_document_events
  FOR EACH ROW
  EXECUTE FUNCTION fn_tt_document_events_immutable();

CREATE TRIGGER tg_tt_document_events_no_delete
  BEFORE DELETE ON public.tt_document_events
  FOR EACH ROW
  EXECUTE FUNCTION fn_tt_document_events_immutable();

-- ─────────────────────────────────────────────────────────────────────
-- 5. Comments
-- ─────────────────────────────────────────────────────────────────────

COMMENT ON COLUMN public.tt_document_events.actor_id IS
  'Usuario que disparó el evento. NULL para eventos del sistema (cron, parser AI, etc.)';
COMMENT ON COLUMN public.tt_document_events.from_status IS
  'Status anterior (solo para event_type=status_changed)';
COMMENT ON COLUMN public.tt_document_events.to_status IS
  'Status nuevo (solo para event_type=status_changed)';
COMMENT ON COLUMN public.tt_document_events.notes IS
  'Texto libre asociado al evento (motivo de cancelación, observación, etc.)';

COMMIT;

-- ════════════════════════════════════════════════════════════════════════
-- ROLLBACK DOCUMENTADO (comentado)
-- ════════════════════════════════════════════════════════════════════════
-- BEGIN;
-- DROP TRIGGER IF EXISTS tg_tt_document_events_no_update ON public.tt_document_events;
-- DROP TRIGGER IF EXISTS tg_tt_document_events_no_delete ON public.tt_document_events;
-- DROP FUNCTION IF EXISTS fn_tt_document_events_immutable();
-- ALTER TABLE public.tt_document_events RENAME COLUMN actor_id TO user_id;
-- ALTER TABLE public.tt_document_events RENAME COLUMN from_status TO prev_status;
-- ALTER TABLE public.tt_document_events RENAME COLUMN to_status TO new_status;
-- ALTER TABLE public.tt_document_events RENAME COLUMN notes TO message;
-- COMMIT;
-- ════════════════════════════════════════════════════════════════════════
