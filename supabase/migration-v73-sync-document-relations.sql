-- migration-v73-sync-document-relations.sql
--
-- CONTEXTO (auditoría 2026-08-01):
-- El 2026-06-19 se aplicó una migración (sin archivo numerado en el repo,
-- corrida directa vía MCP — referenciada en memoria como "v74") que pobló
-- `tt_document_links` con 457 aristas reales de trazabilidad, extraídas de
-- `tt_documents.metadata` (cotizacion->pedido, pedido->albaran, albaran->factura, etc.).
--
-- Pero TODO el código actual de la app (20 archivos: document-chain.tsx,
-- documentos/[id]/page.tsx, api/oc/match, api/oc/convert-to-order,
-- api/documents/convert, etc.) lee y escribe exclusivamente
-- `tt_document_relations` — una tabla con schema idéntico que quedó en 0 filas.
--
-- Resultado: la app nunca pudo mostrar la cadena de trazabilidad de ningún
-- documento, porque mira la tabla equivocada. Esta migración copia los 457
-- vínculos reales a la tabla que la app efectivamente usa, sin duplicar si
-- ya existiera algo ahí. No borra `tt_document_links` todavía (eso queda
-- para una migración de limpieza posterior, una vez confirmado que todo
-- sigue funcionando).

insert into tt_document_relations (id, parent_id, child_id, relation_type, fulfillment_pct, item_mapping, notes, created_at)
select l.id, l.parent_id, l.child_id, l.relation_type, l.fulfillment_pct, l.item_mapping, l.notes, l.created_at
from tt_document_links l
where not exists (
  select 1 from tt_document_relations r
  where r.parent_id = l.parent_id
    and r.child_id = l.child_id
    and r.relation_type = l.relation_type
);

-- ROLLBACK:
-- delete from tt_document_relations
-- where id in (select id from tt_document_links);
