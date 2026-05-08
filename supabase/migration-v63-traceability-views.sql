-- ════════════════════════════════════════════════════════════════════════
-- Migration v63 — Vistas SQL de trazabilidad producto ↔ cliente
-- ════════════════════════════════════════════════════════════════════════
--
-- WHY:
--   Para mostrar "qué productos compró cada cliente" y "qué clientes
--   compraron cada producto" sin hacer joins pesados desde el cliente,
--   creamos 2 vistas materializadas conceptualmente — son VIEW normales
--   (no MATERIALIZED VIEW) porque la cantidad de docs/lineas es chica
--   (4-100k filas). Si crece a millones, migrar a MATERIALIZED VIEW.
--
--   Las vistas agregan por (client_id, product_id) o (product_id, client_id)
--   con totales, último precio pactado, primera/última compra, etc.
--
--   Limitan a `doc_type IN ('quote','sales_order','invoice','delivery_note')`
--   para excluir documentos de compras (orden hacia proveedor) y notas
--   de crédito. Solo cuenta lo que el cliente "le compró" a la empresa.
--
-- HOW TO APPLY:
--   Pegar este archivo entero en Supabase SQL Editor → Run.
--   Idempotente: usa CREATE OR REPLACE VIEW.
--
-- ROLLBACK:
--   DROP VIEW IF EXISTS v_client_product_history, v_product_client_history;
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 1. Vista: v_client_product_history
--    Una fila por (cliente, producto) con todas las métricas agregadas.
--    Permite mostrar en la ficha del cliente: qué compró, cuándo,
--    a qué precio, con qué frecuencia.
-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_client_product_history AS
SELECT
  d.client_id                              AS client_id,
  d.company_id                             AS company_id,
  l.product_id                             AS product_id,
  l.sku                                    AS sku,
  COALESCE(p.name, l.description)          AS product_name,
  p.brand                                  AS product_brand,

  -- Conteos
  COUNT(DISTINCT d.id)                     AS docs_count,
  COUNT(DISTINCT d.id) FILTER (WHERE d.doc_type = 'quote')          AS quotes_count,
  COUNT(DISTINCT d.id) FILTER (WHERE d.doc_type = 'sales_order')    AS orders_count,
  COUNT(DISTINCT d.id) FILTER (WHERE d.doc_type = 'invoice')        AS invoices_count,
  COUNT(DISTINCT d.id) FILTER (WHERE d.doc_type = 'delivery_note')  AS deliveries_count,

  -- Cantidades
  SUM(l.quantity)                          AS total_quantity,
  AVG(l.quantity)                          AS avg_quantity_per_doc,

  -- Importes
  SUM(l.subtotal)                          AS total_subtotal,
  AVG(l.unit_price)                        AS avg_unit_price,
  MIN(l.unit_price) FILTER (WHERE l.unit_price > 0) AS min_unit_price,
  MAX(l.unit_price) FILTER (WHERE l.unit_price > 0) AS max_unit_price,

  -- Último precio pactado (ordena por created_at desc)
  (
    SELECT l2.unit_price
    FROM public.tt_document_lines l2
    JOIN public.tt_documents     d2 ON d2.id = l2.document_id
    WHERE d2.client_id  = d.client_id
      AND l2.product_id = l.product_id
      AND d2.doc_type IN ('quote','sales_order','invoice','delivery_note')
    ORDER BY d2.created_at DESC
    LIMIT 1
  ) AS last_unit_price,

  -- Moneda más reciente (puede haber mezcla histórica)
  (
    SELECT d3.currency
    FROM public.tt_documents d3
    JOIN public.tt_document_lines l3 ON l3.document_id = d3.id
    WHERE d3.client_id  = d.client_id
      AND l3.product_id = l.product_id
      AND d3.doc_type IN ('quote','sales_order','invoice','delivery_note')
    ORDER BY d3.created_at DESC
    LIMIT 1
  ) AS last_currency,

  -- Fechas
  MIN(d.created_at)                        AS first_purchase_at,
  MAX(d.created_at)                        AS last_purchase_at

FROM public.tt_documents d
JOIN public.tt_document_lines l ON l.document_id = d.id
LEFT JOIN public.tt_products  p ON p.id = l.product_id
WHERE d.client_id IS NOT NULL
  AND l.product_id IS NOT NULL
  AND d.doc_type IN ('quote','sales_order','invoice','delivery_note')
  AND d.status NOT IN ('cancelled','voided')
GROUP BY
  d.client_id, d.company_id, l.product_id, l.sku,
  p.name, p.brand, l.description;

COMMENT ON VIEW public.v_client_product_history IS
  'Trazabilidad agregada por (cliente, producto). Para usar en ficha cliente: lista de productos comprados con totales, último precio, primera/última compra. Excluye docs cancelados/anulados y compras a proveedor.';

-- ─────────────────────────────────────────────────────────────────────
-- 2. Vista: v_product_client_history
--    Inversa de la anterior. Una fila por (producto, cliente).
--    Permite mostrar en la ficha del producto: qué clientes lo compraron,
--    cuál es el cliente que más compra, etc.
-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_product_client_history AS
SELECT
  l.product_id                             AS product_id,
  l.sku                                    AS sku,
  d.client_id                              AS client_id,
  d.company_id                             AS company_id,
  c.name                                   AS client_name,
  c.legal_name                             AS client_legal_name,
  c.tax_id                                 AS client_tax_id,

  -- Conteos
  COUNT(DISTINCT d.id)                     AS docs_count,
  COUNT(DISTINCT d.id) FILTER (WHERE d.doc_type = 'quote')          AS quotes_count,
  COUNT(DISTINCT d.id) FILTER (WHERE d.doc_type = 'sales_order')    AS orders_count,
  COUNT(DISTINCT d.id) FILTER (WHERE d.doc_type = 'invoice')        AS invoices_count,
  COUNT(DISTINCT d.id) FILTER (WHERE d.doc_type = 'delivery_note')  AS deliveries_count,

  -- Cantidades
  SUM(l.quantity)                          AS total_quantity,

  -- Importes
  SUM(l.subtotal)                          AS total_subtotal,
  AVG(l.unit_price)                        AS avg_unit_price,
  MIN(l.unit_price) FILTER (WHERE l.unit_price > 0) AS min_unit_price,
  MAX(l.unit_price) FILTER (WHERE l.unit_price > 0) AS max_unit_price,

  -- Último precio pactado al cliente
  (
    SELECT l2.unit_price
    FROM public.tt_document_lines l2
    JOIN public.tt_documents     d2 ON d2.id = l2.document_id
    WHERE d2.client_id  = d.client_id
      AND l2.product_id = l.product_id
      AND d2.doc_type IN ('quote','sales_order','invoice','delivery_note')
    ORDER BY d2.created_at DESC
    LIMIT 1
  ) AS last_unit_price,

  -- Fechas
  MIN(d.created_at)                        AS first_purchase_at,
  MAX(d.created_at)                        AS last_purchase_at

FROM public.tt_documents d
JOIN public.tt_document_lines l ON l.document_id = d.id
LEFT JOIN public.tt_clients   c ON c.id = d.client_id
WHERE d.client_id IS NOT NULL
  AND l.product_id IS NOT NULL
  AND d.doc_type IN ('quote','sales_order','invoice','delivery_note')
  AND d.status NOT IN ('cancelled','voided')
GROUP BY
  l.product_id, l.sku, d.client_id, d.company_id,
  c.name, c.legal_name, c.tax_id;

COMMENT ON VIEW public.v_product_client_history IS
  'Trazabilidad agregada por (producto, cliente). Para usar en ficha producto: lista de clientes que lo compraron, ranking, último precio pactado por cliente.';

-- ─────────────────────────────────────────────────────────────────────
-- 3. Permisos: las vistas heredan permisos de las tablas subyacentes
--    pero garantizamos que authenticated y service_role puedan SELECT.
-- ─────────────────────────────────────────────────────────────────────

GRANT SELECT ON public.v_client_product_history TO authenticated, service_role;
GRANT SELECT ON public.v_product_client_history  TO authenticated, service_role;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════
-- ROLLBACK DOCUMENTADO
-- ════════════════════════════════════════════════════════════════════════
-- BEGIN;
-- DROP VIEW IF EXISTS public.v_client_product_history;
-- DROP VIEW IF EXISTS public.v_product_client_history;
-- COMMIT;
-- ════════════════════════════════════════════════════════════════════════
