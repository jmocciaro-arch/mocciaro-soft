-- migration-v75-drop-tt-document-links-after-sync.sql
--
-- ⚠️ CORRER SOLO DESPUÉS de migration-v73-sync-document-relations.sql,
-- confirmada y con el dry-run OK. Este archivo asume que esos 457
-- vínculos ya viven también en tt_document_relations.
--
-- CONTEXTO (auditoría 2026-08-01): tt_document_links y tt_document_relations
-- tienen schema idéntico. tt_document_links es la que quedó poblada con los
-- 457 vínculos reales de trazabilidad (migración de 2026-06-19), pero NINGÚN
-- archivo de src/ la usa — ni para leer ni para escribir (grep sin
-- resultados). Todo el código (document-chain.tsx, oc/match,
-- oc/convert-to-order, documents/convert, quoteToOrder, etc.) usa
-- tt_document_relations. Una vez sincronizados los datos (v73), esta tabla
-- queda como duplicado muerto.
--
-- La guarda de abajo aborta el drop si tt_document_relations tiene MENOS
-- filas que tt_document_links (señal de que v73 no corrió, o corrió mal).

do $$
begin
  if (select count(*) from tt_document_relations) < (select count(*) from tt_document_links) then
    raise exception 'tt_document_relations (% filas) tiene menos filas que tt_document_links (% filas) — correr primero migration-v73-sync-document-relations.sql y confirmar el resultado antes de este drop.',
      (select count(*) from tt_document_relations), (select count(*) from tt_document_links);
  end if;
end $$;

drop table if exists tt_document_links;

-- ROLLBACK:
-- create table tt_document_links (
--   id uuid primary key default gen_random_uuid(),
--   parent_id uuid,
--   child_id uuid,
--   relation_type text,
--   fulfillment_pct numeric,
--   item_mapping jsonb,
--   notes text,
--   created_at timestamptz default now()
-- );
-- insert into tt_document_links (id, parent_id, child_id, relation_type, fulfillment_pct, item_mapping, notes, created_at)
-- select id, parent_id, child_id, relation_type, fulfillment_pct, item_mapping, notes, created_at
-- from tt_document_relations;
-- (Para un rollback fiel, restaurar desde el backup previo a este drop en
-- vez de confiar en esta recreación — tt_document_relations puede haber
-- sumado filas nuevas después de la migración que no estaban en el
-- tt_document_links original.)
