-- ════════════════════════════════════════════════════════════════════════
-- Migration v61 — Alineación de naming oficial del modelo documental
-- ════════════════════════════════════════════════════════════════════════
--
-- WHY:
--   Naming objetivo del soft (cadena oficial):
--     producto → tt_document_lines → tt_documents
--              → tt_document_relations → tt_document_events
--              → stock / finanzas / estadísticas
--
--   Hoy las tablas viven con nombres legacy (`tt_document_items`,
--   `tt_document_links`, columna `type` en `tt_documents`) y la tabla
--   `tt_document_events` no existe. Esta migración alinea los nombres
--   in-place sin pérdida de datos (las tablas afectadas están vacías,
--   verificado vía pg_stat_user_tables y query SELECT count(*) previa).
--
-- CAMBIOS:
--   1. tt_document_items            → tt_document_lines
--   2. tt_document_links            → tt_document_relations
--   3. tt_document_item_components  → tt_document_line_components
--   4. tt_documents.type            → tt_documents.doc_type
--   5. CREATE TABLE tt_document_events (audit/timeline)
--   6. Renombrar índices, constraints y policies que contengan los
--      nombres viejos para mantener consistencia.
--   7. RLS y policies para tt_document_events.
--
-- HOW TO APPLY:
--   Pegar este archivo entero en Supabase SQL Editor → Run.
--   Idempotente: usa IF EXISTS / IF NOT EXISTS / DO blocks defensivos.
--
-- ROLLBACK:
--   Ver bloque "ROLLBACK DOCUMENTADO" al final del archivo (comentado).
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 0. Pre-check: las tablas a renombrar deben existir y estar vacías
-- ─────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  cnt_items integer;
  cnt_links integer;
  cnt_components integer;
  cnt_documents integer;
BEGIN
  -- Si las tablas viejas no existen, asumimos que ya se renombraron antes
  -- (idempotencia). Si existen pero tienen datos, abortamos.
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='tt_document_items') THEN
    EXECUTE 'SELECT count(*) FROM tt_document_items' INTO cnt_items;
    IF cnt_items > 0 THEN
      RAISE EXCEPTION 'tt_document_items tiene % filas. Migrar datos primero.', cnt_items;
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='tt_document_links') THEN
    EXECUTE 'SELECT count(*) FROM tt_document_links' INTO cnt_links;
    IF cnt_links > 0 THEN
      RAISE EXCEPTION 'tt_document_links tiene % filas. Migrar datos primero.', cnt_links;
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='tt_document_item_components') THEN
    EXECUTE 'SELECT count(*) FROM tt_document_item_components' INTO cnt_components;
    IF cnt_components > 0 THEN
      RAISE EXCEPTION 'tt_document_item_components tiene % filas. Migrar datos primero.', cnt_components;
    END IF;
  END IF;

  -- tt_documents puede tener filas (la columna se renombra in-place sin perder datos)
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='tt_documents') THEN
    EXECUTE 'SELECT count(*) FROM tt_documents' INTO cnt_documents;
    RAISE NOTICE 'tt_documents tiene % filas. RENAME COLUMN preserva datos.', cnt_documents;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- 1. Rename tt_document_items → tt_document_lines
-- ─────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='tt_document_items') THEN
    ALTER TABLE public.tt_document_items RENAME TO tt_document_lines;
    RAISE NOTICE 'Renamed tt_document_items → tt_document_lines';
  ELSE
    RAISE NOTICE 'tt_document_items no existe (ya renombrada o nunca creada) — skip';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- 2. Rename tt_document_links → tt_document_relations
-- ─────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='tt_document_links') THEN
    ALTER TABLE public.tt_document_links RENAME TO tt_document_relations;
    RAISE NOTICE 'Renamed tt_document_links → tt_document_relations';
  ELSE
    RAISE NOTICE 'tt_document_links no existe — skip';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- 3. Rename tt_document_item_components → tt_document_line_components
-- ─────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='tt_document_item_components') THEN
    ALTER TABLE public.tt_document_item_components RENAME TO tt_document_line_components;
    RAISE NOTICE 'Renamed tt_document_item_components → tt_document_line_components';
  ELSE
    RAISE NOTICE 'tt_document_item_components no existe — skip';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- 4. Rename columna tt_documents.type → tt_documents.doc_type
-- ─────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='tt_documents' AND column_name='type'
  ) THEN
    ALTER TABLE public.tt_documents RENAME COLUMN type TO doc_type;
    RAISE NOTICE 'Renamed tt_documents.type → tt_documents.doc_type';
  ELSE
    RAISE NOTICE 'tt_documents.type ya renombrada o no existe — skip';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- 5. Renombrar índices que contengan los nombres viejos
--    (PostgreSQL no los renombra automáticamente con ALTER TABLE)
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
      AND (
        indexname LIKE '%document_items%'
        OR indexname LIKE '%document_links%'
        OR indexname LIKE '%document_item_components%'
        OR indexname LIKE '%_ditems_%'
        OR indexname LIKE '%_dlinks_%'
        OR indexname LIKE '%_dic_%'
      )
  LOOP
    new_name := r.indexname;
    new_name := replace(new_name, 'document_item_components', 'document_line_components');
    new_name := replace(new_name, 'document_items', 'document_lines');
    new_name := replace(new_name, 'document_links', 'document_relations');
    new_name := replace(new_name, '_ditems_', '_dlines_');
    new_name := replace(new_name, '_dlinks_', '_drels_');
    new_name := replace(new_name, '_dic_', '_dlc_');

    IF new_name <> r.indexname THEN
      EXECUTE format('ALTER INDEX public.%I RENAME TO %I', r.indexname, new_name);
      RAISE NOTICE 'Renamed index % → %', r.indexname, new_name;
    END IF;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- 6. Renombrar constraints (FKs, CHECKs, PKs, UNIQUEs) que contengan
--    los nombres viejos
-- ─────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  r record;
  new_name text;
BEGIN
  FOR r IN
    SELECT c.conname, n.nspname, t.relname
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE n.nspname = 'public'
      AND (
        c.conname LIKE '%document_items%'
        OR c.conname LIKE '%document_links%'
        OR c.conname LIKE '%document_item_components%'
      )
  LOOP
    new_name := r.conname;
    new_name := replace(new_name, 'document_item_components', 'document_line_components');
    new_name := replace(new_name, 'document_items', 'document_lines');
    new_name := replace(new_name, 'document_links', 'document_relations');

    IF new_name <> r.conname THEN
      EXECUTE format(
        'ALTER TABLE public.%I RENAME CONSTRAINT %I TO %I',
        r.relname, r.conname, new_name
      );
      RAISE NOTICE 'Renamed constraint % on %.% → %', r.conname, r.nspname, r.relname, new_name;
    END IF;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- 7. Crear tabla tt_document_events (audit/timeline)
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tt_document_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Documento al que pertenece el evento
  document_id     UUID NOT NULL REFERENCES public.tt_documents(id) ON DELETE CASCADE,
  related_document_id UUID REFERENCES public.tt_documents(id) ON DELETE SET NULL,

  -- Tipo de evento
  event_type      TEXT NOT NULL,
  -- created | updated | status_changed | sent | received | validated
  -- relation_added | relation_removed | line_added | line_modified | line_removed
  -- attachment_added | attachment_removed | comment_added
  -- locked | unlocked | cancelled | restored

  -- Metadatos del evento
  payload         JSONB DEFAULT '{}'::jsonb,
  message         TEXT,

  -- Quién y cuándo
  user_id         UUID REFERENCES public.tt_users(id) ON DELETE SET NULL,
  company_id      UUID REFERENCES public.tt_companies(id) ON DELETE CASCADE,

  -- Trazabilidad de cambio (status_changed)
  prev_status     TEXT,
  new_status      TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tt_devents_document
  ON public.tt_document_events(document_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tt_devents_event_type
  ON public.tt_document_events(event_type);

CREATE INDEX IF NOT EXISTS idx_tt_devents_related
  ON public.tt_document_events(related_document_id)
  WHERE related_document_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tt_devents_company
  ON public.tt_document_events(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tt_devents_user
  ON public.tt_document_events(user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────
-- 8. RLS y policies para tt_document_events
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.tt_document_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS docev_service_all   ON public.tt_document_events;
DROP POLICY IF EXISTS docev_authenticated_select ON public.tt_document_events;
DROP POLICY IF EXISTS docev_authenticated_insert ON public.tt_document_events;

CREATE POLICY docev_service_all
  ON public.tt_document_events
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Lectura: usuarios autenticados que pertenezcan a la empresa del documento
CREATE POLICY docev_authenticated_select
  ON public.tt_document_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tt_documents d
      WHERE d.id = tt_document_events.document_id
        AND d.company_id IN (
          SELECT company_id FROM public.tt_user_companies
          WHERE user_id = auth.uid()
        )
    )
  );

-- Escritura: usuarios autenticados sobre documentos de su empresa
CREATE POLICY docev_authenticated_insert
  ON public.tt_document_events
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tt_documents d
      WHERE d.id = tt_document_events.document_id
        AND d.company_id IN (
          SELECT company_id FROM public.tt_user_companies
          WHERE user_id = auth.uid()
        )
    )
  );

-- ─────────────────────────────────────────────────────────────────────
-- 9. Comments en tablas renombradas
-- ─────────────────────────────────────────────────────────────────────

COMMENT ON TABLE public.tt_document_lines IS
  'Líneas de documentos del modelo unificado. Renamed desde tt_document_items en v61. Cada fila es una línea de producto/servicio dentro de un documento (cotización, OC, pedido, factura, etc.).';

COMMENT ON TABLE public.tt_document_relations IS
  'Vínculos entre documentos del modelo unificado (cotización↔OC, pedido↔remito, etc.). Renamed desde tt_document_links en v61.';

COMMENT ON TABLE public.tt_document_line_components IS
  'Desglose interno de una línea (ej. "kit de ferretería" = 5 productos). Renamed desde tt_document_item_components en v61.';

COMMENT ON TABLE public.tt_document_events IS
  'Bitácora de eventos / audit log / timeline cronológico para cada documento. Creada en v61. Sustituye a tablas dispersas de logs.';

COMMENT ON COLUMN public.tt_documents.doc_type IS
  'Tipo de documento (quote, sales_order, invoice, purchase_order, reception, delivery_note, payment, request, client_oc). Renamed desde "type" en v61.';

COMMIT;

-- ════════════════════════════════════════════════════════════════════════
-- ROLLBACK DOCUMENTADO (comentado — pegar y correr SOLO si hay que revertir)
-- ════════════════════════════════════════════════════════════════════════
--
-- BEGIN;
--
-- -- Revertir rename de columna
-- ALTER TABLE public.tt_documents RENAME COLUMN doc_type TO type;
--
-- -- Revertir rename de tablas (orden inverso al apply)
-- ALTER TABLE public.tt_document_line_components RENAME TO tt_document_item_components;
-- ALTER TABLE public.tt_document_relations       RENAME TO tt_document_links;
-- ALTER TABLE public.tt_document_lines           RENAME TO tt_document_items;
--
-- -- Drop tabla nueva
-- DROP TABLE IF EXISTS public.tt_document_events CASCADE;
--
-- -- Revertir índices renombrados (manual: ver pg_indexes y revertir cada uno)
-- -- Revertir constraints (manual: ver pg_constraint y revertir cada uno)
-- -- Comments quedan obsoletos pero no rompen nada
--
-- COMMIT;
--
-- ════════════════════════════════════════════════════════════════════════
