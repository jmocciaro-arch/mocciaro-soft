-- Fase 2: DROP de las 8 tablas legacy + VIEWs read-only sobre tt_documents.

DROP TABLE IF EXISTS public.tt_quote_items CASCADE;
DROP TABLE IF EXISTS public.tt_so_items CASCADE;
DROP TABLE IF EXISTS public.tt_dn_items CASCADE;
DROP TABLE IF EXISTS public.tt_invoice_items CASCADE;
DROP TABLE IF EXISTS public.tt_quotes CASCADE;
DROP TABLE IF EXISTS public.tt_sales_orders CASCADE;
DROP TABLE IF EXISTS public.tt_delivery_notes CASCADE;
DROP TABLE IF EXISTS public.tt_invoices CASCADE;

-- Agregar metadata a tt_document_lines para mantener links como source_line_id
ALTER TABLE public.tt_document_lines ADD COLUMN IF NOT EXISTS metadata jsonb;

CREATE OR REPLACE VIEW public.tt_quotes AS
SELECT
  id, display_ref AS number, company_id, client_id, user_id, status, currency,
  exchange_rate, subtotal, tax_amount, total, tax_rate, incoterm, payment_terms,
  notes, internal_notes, valid_until,
  NULL::timestamptz AS closed_at,
  NULL::uuid AS parent_quote_id,
  created_at, updated_at,
  (metadata->>'payment_days')::integer AS payment_days,
  metadata->>'payment_terms_type' AS payment_terms_type,
  metadata->>'stelorder_id' AS stelorder_id,
  metadata->>'stelorder_pdf_url' AS stelorder_pdf_url,
  subtype AS doc_subtype,
  COALESCE((metadata->>'irpf_rate')::numeric, 0) AS irpf_rate,
  COALESCE((metadata->>'irpf_amount')::numeric, 0) AS irpf_amount,
  COALESCE((metadata->>'re_rate')::numeric, 0) AS re_rate,
  COALESCE((metadata->>'re_amount')::numeric, 0) AS re_amount,
  COALESCE((metadata->>'subject_iva')::boolean, true) AS subject_iva,
  NULL::uuid[] AS participating_contact_ids,
  display_ref AS doc_number
FROM public.tt_documents
WHERE doc_type IN ('presupuesto', 'coti', 'quote');

CREATE OR REPLACE VIEW public.tt_quote_items AS
SELECT l.id, l.document_id AS quote_id, l.product_id, l.sku, l.description,
  l.quantity, l.unit_price, l.discount_pct, l.subtotal, l.notes, l.sort_order, l.created_at
FROM public.tt_document_lines l
JOIN public.tt_documents d ON d.id = l.document_id
WHERE d.doc_type IN ('presupuesto', 'coti', 'quote');

CREATE OR REPLACE VIEW public.tt_sales_orders AS
SELECT
  id, display_ref AS number, company_id, client_id, user_id,
  (metadata->>'quote_id')::uuid AS quote_id,
  status, currency, subtotal, tax_amount, total, delivery_date, notes,
  created_at, updated_at, payment_terms,
  (metadata->>'payment_days')::integer AS payment_days,
  metadata->>'stelorder_id' AS stelorder_id,
  metadata->>'stelorder_pdf_url' AS stelorder_pdf_url,
  display_ref AS doc_number
FROM public.tt_documents
WHERE doc_type IN ('pedido', 'order', 'so');

CREATE OR REPLACE VIEW public.tt_so_items AS
SELECT l.id, l.document_id AS sales_order_id, l.product_id, l.sku, l.description,
  l.quantity AS qty_ordered, l.qty_reserved, l.qty_delivered, l.qty_invoiced, l.qty_cancelled,
  l.unit_price, l.discount_pct, l.subtotal,
  NULL::text AS line_status, l.sort_order, l.created_at,
  l.quantity
FROM public.tt_document_lines l
JOIN public.tt_documents d ON d.id = l.document_id
WHERE d.doc_type IN ('pedido', 'order', 'so');

CREATE OR REPLACE VIEW public.tt_delivery_notes AS
SELECT
  id, display_ref AS number, company_id, client_id, user_id,
  (metadata->>'sales_order_id')::uuid AS sales_order_id,
  status, delivery_address, delivery_date, notes,
  NULL::text AS signed_by, NULL::text AS signature_url,
  created_at, updated_at, display_ref AS doc_number, total
FROM public.tt_documents
WHERE doc_type IN ('albaran', 'delivery_note', 'remito');

CREATE OR REPLACE VIEW public.tt_dn_items AS
SELECT l.id, l.document_id AS delivery_note_id,
  (l.metadata->>'source_line_id')::uuid AS so_item_id,
  l.product_id, l.sku, l.description,
  l.qty_delivered, l.created_at, l.quantity
FROM public.tt_document_lines l
JOIN public.tt_documents d ON d.id = l.document_id
WHERE d.doc_type IN ('albaran', 'delivery_note', 'remito');

CREATE OR REPLACE VIEW public.tt_invoices AS
SELECT
  id, display_ref AS number, company_id, client_id, user_id,
  CASE WHEN doc_type = 'factura_abono' THEN 'credit_note' ELSE 'sale' END AS type,
  status, currency, subtotal, tax_amount, total, tax_rate,
  metadata->>'external_number' AS external_number,
  metadata->>'external_system' AS external_system,
  (metadata->>'due_date')::date AS due_date,
  (metadata->>'paid_at')::timestamptz AS paid_at,
  notes, created_at, updated_at,
  display_ref AS doc_number,
  (metadata->>'sales_order_id')::uuid AS sales_order_id,
  (metadata->>'delivery_note_id')::uuid AS delivery_note_id,
  COALESCE((metadata->>'paid_amount')::numeric, 0) AS paid_amount,
  COALESCE((metadata->>'payment_count')::integer, 0) AS payment_count
FROM public.tt_documents
WHERE doc_type IN ('factura', 'factura_abono');

CREATE OR REPLACE VIEW public.tt_invoice_items AS
SELECT l.id, l.document_id AS invoice_id, NULL::uuid AS delivery_note_id,
  l.product_id, l.sku, l.description, l.quantity, l.unit_price,
  l.cost_snapshot, l.discount_pct, l.subtotal, l.created_at
FROM public.tt_document_lines l
JOIN public.tt_documents d ON d.id = l.document_id
WHERE d.doc_type IN ('factura', 'factura_abono');

GRANT SELECT ON public.tt_quotes TO authenticated;
GRANT SELECT ON public.tt_quote_items TO authenticated;
GRANT SELECT ON public.tt_sales_orders TO authenticated;
GRANT SELECT ON public.tt_so_items TO authenticated;
GRANT SELECT ON public.tt_delivery_notes TO authenticated;
GRANT SELECT ON public.tt_dn_items TO authenticated;
GRANT SELECT ON public.tt_invoices TO authenticated;
GRANT SELECT ON public.tt_invoice_items TO authenticated;
