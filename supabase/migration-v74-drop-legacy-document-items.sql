-- migration-v74-drop-legacy-document-items.sql
--
-- CONTEXTO (auditoría 2026-08-01):
-- `tt_document_items` y `tt_document_item_components` son las tablas que
-- CLAUDE.md ya lista explícitamente como legacy prohibidas para escritura
-- (regla 6). En la práctica están completamente muertas, no solo
-- "en coexistencia":
--   - 0 filas en ambas (verificado en vivo).
--   - Ningún archivo de src/ las referencia (grep sin resultados) — ni
--     siquiera en modo lectura.
--   - `tt_document_lines` (su reemplazo, creado en v37/v61) es la que usan
--     todos los flujos activos (cotizador, oc/parse, oc/convert-to-order,
--     orderToDeliveryNote, quoteToOrder, etc.) y tiene datos reales.
--
-- Este DROP es seguro porque no hay filas que perder y ningún código las
-- toca. Por las dudas, la guarda de abajo aborta si alguna tiene filas.

do $$
begin
  if (select count(*) from tt_document_items) > 0 then
    raise exception 'tt_document_items tiene % filas — no se esperaba, abortando drop. Revisar antes de continuar.', (select count(*) from tt_document_items);
  end if;
  if (select count(*) from tt_document_item_components) > 0 then
    raise exception 'tt_document_item_components tiene % filas — no se esperaba, abortando drop. Revisar antes de continuar.', (select count(*) from tt_document_item_components);
  end if;
end $$;

drop table if exists tt_document_item_components;
drop table if exists tt_document_items;

-- ROLLBACK:
-- create table tt_document_items (
--   id uuid primary key default gen_random_uuid(),
--   document_id uuid,
--   sort_order integer,
--   sku text,
--   description text,
--   internal_description text,
--   notes text,
--   product_id uuid,
--   quantity numeric,
--   unit_price numeric,
--   unit_cost numeric,
--   discount_pct numeric,
--   subtotal numeric,
--   cost_snapshot numeric,
--   oc_line_ref text,
--   po_document_id uuid,
--   po_status text,
--   qty_delivered numeric,
--   qty_invoiced numeric,
--   qty_received numeric,
--   qty_reserved numeric,
--   qty_cancelled numeric,
--   requires_po boolean,
--   stock_at_creation integer,
--   warehouse_id uuid,
--   created_at timestamptz default now()
-- );
-- create table tt_document_item_components (
--   id uuid primary key default gen_random_uuid(),
--   parent_item_id uuid,
--   product_id uuid,
--   sku text,
--   description text,
--   quantity numeric,
--   unit_cost numeric,
--   source_oc_line_ref text,
--   created_at timestamptz default now()
-- );
-- (Rollback recrea las columnas; no replica FKs/índices/RLS originales —
-- ambas tablas estaban vacías y sin uso, así que en la práctica no hace
-- falta más que esto si alguna vez hiciera falta revertir.)
