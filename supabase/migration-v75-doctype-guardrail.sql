-- =============================================================================
-- migration-v75-doctype-guardrail.sql
-- GUARDRAIL TOLERANTE de vocabulario doc_type en tt_documents.
--
-- Objetivo: poner un CHECK constraint que IMPIDA que entren doc_type nuevos no
-- contemplados (typos, vocabulario inglés-abstracto tipo 'sales_order'/'quotation',
-- etc.) SIN romper a ningún escritor vivo ni tocar filtros de lectura.
--
-- Por qué TOLERANTE (no estricto a los 10 canónicos):
--   El colapso del vocabulario divergente ('presupuesto','quote','remito') al
--   canónico ('cotizacion','albaran') arrastra ~10+ filtros de lectura, tipos TS
--   y label maps que hoy asumen el vocabulario viejo. Hacerlo a medias rompe
--   vistas en producción. Ese realineamiento completo es un PR aparte. Este CHECK
--   solo frena la DERIVA FUTURA: admite el set que el código vivo escribe hoy.
--
-- Contexto verificado (read-only) sobre PRODUCCIÓN (2026-06-21):
--   - tt_documents NO tiene hoy CHECK sobre doc_type (por eso entró 'presupuesto').
--   - tt_documents NO tiene columna 'direction'; la tabla real es la legacy en español.
--   - Distribución real de doc_type (11 valores): cotizacion 806, orden_compra 375,
--     factura_compra 320, albaran_compra 287, factura 284, pedido 171, albaran 128,
--     gasto 110, nota_credito 9, packing_list 1, presupuesto 1.
--   - Escritores vivos no-canónicos que el CHECK debe TOLERAR (para no romperlos):
--       cotizador/page.tsx -> 'presupuesto'
--       api/oc/create-quote -> 'quote'
--       api/invoices/tango/sync-remitos -> 'remito'
--     (Estos se colapsarán a su canónico en el PR de realineamiento, y luego un
--      migration posterior podrá ESTRECHAR este CHECK a los 10 canónicos.)
--
-- IMPORTANTE: este SQL se GENERA para correr con dry-run. NO se aplica desde la sesión.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Guard de pre-condición: abortar si existiera CUALQUIER doc_type fuera del
--    set tolerado. Con los datos actuales NO debería disparar; protege contra
--    sorpresas (valores inesperados creados en staging/dev) antes de crear el
--    constraint, para no fallar a mitad de validación.
-- -----------------------------------------------------------------------------
do $$
declare
  v_bad text;
begin
  select string_agg(distinct doc_type, ', ')
    into v_bad
    from public.tt_documents
   where doc_type is null
      or doc_type not in (
           -- 10 canónicos (con datos)
           'cotizacion','pedido','factura','factura_compra','orden_compra',
           'albaran','albaran_compra','gasto','nota_credito','packing_list',
           -- divergentes que el código vivo aún escribe (tolerados transitoriamente)
           'presupuesto','quote','remito'
         );
  if v_bad is not null then
    raise exception 'v75 abortada: doc_type fuera del set tolerado en datos: %', v_bad;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 2. CHECK constraint TOLERANTE. NOT VALID + VALIDATE en dos pasos para no tomar
--    el lock pesado de validación bajo el lock de DDL (validación corre con
--    SHARE UPDATE EXCLUSIVE; tabla chica ~2.5k filas, es trivial).
-- -----------------------------------------------------------------------------
alter table public.tt_documents
  drop constraint if exists tt_documents_doc_type_check;

alter table public.tt_documents
  add constraint tt_documents_doc_type_check
  check (doc_type in (
    -- canónicos
    'cotizacion',
    'pedido',
    'factura',
    'factura_compra',
    'orden_compra',
    'albaran',
    'albaran_compra',
    'gasto',
    'nota_credito',
    'packing_list',
    -- divergentes tolerados (eliminar en el PR de realineamiento + migration posterior)
    'presupuesto',
    'quote',
    'remito'
  )) not valid;

alter table public.tt_documents
  validate constraint tt_documents_doc_type_check;

commit;

-- =============================================================================
-- -- ROLLBACK:
-- =============================================================================
-- begin;
--   alter table public.tt_documents
--     drop constraint if exists tt_documents_doc_type_check;
-- commit;
-- =============================================================================
