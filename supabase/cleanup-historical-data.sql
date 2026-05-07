-- ════════════════════════════════════════════════════════════════════════
-- CLEANUP DATA HISTÓRICA / DE PRUEBA — 2026-05-07
-- ════════════════════════════════════════════════════════════════════════
--
-- WHY: durante el desarrollo se generó mucha data seed/de prueba
-- (cotizaciones, pedidos, OCs, facturas inventadas) que ensucia las
-- vistas y dificulta probar el sistema. Este script borra todo lo
-- transaccional y deja solo los catálogos: clientes, proveedores,
-- productos, empresas, usuarios, configuración.
--
-- IRREVERSIBLE. Asumimos que NO hay data fiscal real que conservar.
-- Si tenés alguna factura emitida real, ABORTAR y avisar.
--
-- HOW TO APPLY:
--   1. Pegar este SQL en Supabase Dashboard → SQL Editor.
--   2. Primero ejecutar SOLO la sección [CONTEO] para ver qué hay.
--   3. Si los números tienen sentido, ejecutar la sección [LIMPIEZA]
--      completa. Está envuelta en BEGIN/COMMIT — si algo falla, rollback.
--   4. (Opcional) Vaciar buckets de Storage desde la UI (ocs/, attachments).
--
-- ════════════════════════════════════════════════════════════════════════

-- ═══ [CONTEO] dry-run, no borra nada ════════════════════════════════════
-- Ejecutar primero esta consulta y revisar números antes de continuar.
SELECT 'tt_documents' AS tabla, COUNT(*) AS filas FROM tt_documents
UNION ALL SELECT 'tt_document_items', COUNT(*) FROM tt_document_items
UNION ALL SELECT 'tt_document_links', COUNT(*) FROM tt_document_links
UNION ALL SELECT 'tt_quotes (legacy)', COUNT(*) FROM tt_quotes
UNION ALL SELECT 'tt_quote_items (legacy)', COUNT(*) FROM tt_quote_items
UNION ALL SELECT 'tt_sales_orders (legacy)', COUNT(*) FROM tt_sales_orders
UNION ALL SELECT 'tt_so_items (legacy)', COUNT(*) FROM tt_so_items
UNION ALL SELECT 'tt_purchase_orders', COUNT(*) FROM tt_purchase_orders
UNION ALL SELECT 'tt_po_items', COUNT(*) FROM tt_po_items
UNION ALL SELECT 'tt_oc_parsed', COUNT(*) FROM tt_oc_parsed
UNION ALL SELECT 'tt_invoice_payments', COUNT(*) FROM tt_invoice_payments
UNION ALL SELECT 'tt_stock_reservations', COUNT(*) FROM tt_stock_reservations
UNION ALL SELECT 'tt_stock_movements', COUNT(*) FROM tt_stock_movements
UNION ALL SELECT 'tt_inv_movements', COUNT(*) FROM tt_inv_movements
UNION ALL SELECT 'tt_leads', COUNT(*) FROM tt_leads
UNION ALL SELECT 'tt_opportunities', COUNT(*) FROM tt_opportunities
UNION ALL SELECT 'tt_supplier_offers', COUNT(*) FROM tt_supplier_offers
UNION ALL SELECT 'tt_messages', COUNT(*) FROM tt_messages
UNION ALL SELECT 'tt_sat_tickets', COUNT(*) FROM tt_sat_tickets
UNION ALL SELECT 'tt_alerts', COUNT(*) FROM tt_alerts
UNION ALL SELECT 'tt_notifications', COUNT(*) FROM tt_notifications
UNION ALL SELECT '— se mantienen —', NULL
UNION ALL SELECT 'tt_clients (mantener)', COUNT(*) FROM tt_clients
UNION ALL SELECT 'tt_products (mantener)', COUNT(*) FROM tt_products
UNION ALL SELECT 'tt_companies (mantener)', COUNT(*) FROM tt_companies
ORDER BY 1;


-- ═══ [LIMPIEZA] borrar todo lo transaccional ════════════════════════════
-- Cuando los números del CONTEO te cierren, ejecutar este bloque entero.
-- Está en BEGIN…COMMIT — si algo falla, hace rollback automáticamente.

BEGIN;

-- 1. Workflow / proceso (depende de documentos)
TRUNCATE TABLE
  tt_process_documents,
  tt_process_stages,
  tt_process_instances,
  tt_agent_tasks
RESTART IDENTITY CASCADE;

-- 2. AI / cache / logs derivados
TRUNCATE TABLE
  tt_ai_summaries,
  tt_ai_cache,
  tt_ai_usage,
  tt_oc_audit_log,
  tt_email_log,
  tt_contact_sync_log,
  tt_digest_log,
  tt_activity_log,
  tt_audit_log,
  tt_migration_log,
  tt_import_jobs
RESTART IDENTITY CASCADE;

-- 3. Alertas / notificaciones (se regeneran solas)
TRUNCATE TABLE
  tt_alerts,
  tt_generated_alerts,
  tt_notifications,
  tt_mail_followups
RESTART IDENTITY CASCADE;

-- 4. Stock — movimientos y reservas (NO toca productos ni warehouses)
TRUNCATE TABLE
  tt_stock_reservations,
  tt_stock_movements,
  tt_inv_movements,
  tt_stock,
  tt_inv_stock
RESTART IDENTITY CASCADE;

-- 5. CRM transaccional
TRUNCATE TABLE
  tt_lead_interactions,
  tt_leads,
  tt_opportunities,
  tt_supplier_interactions,
  tt_supplier_offer_items,
  tt_supplier_offers,
  tt_whatsapp_messages,
  tt_messages,
  tt_threads
RESTART IDENTITY CASCADE;

-- 6. Compras / facturas de compra
TRUNCATE TABLE
  tt_purchase_credit_note_items,
  tt_purchase_credit_notes,
  tt_purchase_invoice_items,
  tt_po_items,
  tt_purchase_orders
RESTART IDENTITY CASCADE;

-- 7. Cobros / pagos / recurrentes
TRUNCATE TABLE
  tt_invoice_payments,
  tt_recurring_invoice_items,
  tt_recurring_invoices,
  tt_bank_statement_lines,
  tt_bank_statements,
  tt_cashflow_snapshots
RESTART IDENTITY CASCADE;

-- 8. OCs del cliente (parseadas por IA)
TRUNCATE TABLE tt_oc_parsed RESTART IDENTITY CASCADE;

-- 9. SAT (servicio técnico)
TRUNCATE TABLE
  tt_sat_service_history,
  tt_sat_paused_workflows,
  tt_sat_bulk_quotes,
  tt_sat_tickets
RESTART IDENTITY CASCADE;

-- 10. Legacy ventas (cotizaciones / pedidos viejos)
TRUNCATE TABLE
  tt_quote_comments,
  tt_quote_tokens,
  tt_quote_items,
  tt_quotes,
  tt_so_items,
  tt_sales_orders
RESTART IDENTITY CASCADE;

-- 11. Documentos unificados (último — barre la mayor parte)
TRUNCATE TABLE
  tt_document_item_components,
  tt_document_items,
  tt_document_links,
  tt_documents
RESTART IDENTITY CASCADE;

-- 12. Reset de secuencias de numeración por empresa (si las usás)
--     Si NO querés resetear los contadores de COT/PED/FAC, comentá esto.
UPDATE tt_document_sequences SET last_number = 0;

COMMIT;


-- ═══ [VERIFICACIÓN POST-LIMPIEZA] ═══════════════════════════════════════
-- Ejecutar después de la limpieza para confirmar que catálogos siguen ok.
SELECT 'tt_clients' AS tabla, COUNT(*) AS filas FROM tt_clients
UNION ALL SELECT 'tt_products', COUNT(*) FROM tt_products
UNION ALL SELECT 'tt_companies', COUNT(*) FROM tt_companies
UNION ALL SELECT 'tt_users', COUNT(*) FROM tt_users
UNION ALL SELECT 'tt_warehouses', COUNT(*) FROM tt_warehouses
UNION ALL SELECT 'tt_documents (debería ser 0)', COUNT(*) FROM tt_documents
UNION ALL SELECT 'tt_quotes (debería ser 0)', COUNT(*) FROM tt_quotes
UNION ALL SELECT 'tt_purchase_orders (debería ser 0)', COUNT(*) FROM tt_purchase_orders
UNION ALL SELECT 'tt_oc_parsed (debería ser 0)', COUNT(*) FROM tt_oc_parsed
ORDER BY 1;


-- ════════════════════════════════════════════════════════════════════════
-- BUCKETS DE STORAGE (limpiar aparte)
-- ════════════════════════════════════════════════════════════════════════
-- Los archivos físicos (PDFs de OCs, adjuntos, etc.) NO se borran con
-- este script. Para vaciarlos, en Supabase Dashboard → Storage:
--   - bucket "ocs"          → borrar todo
--   - bucket "attachments"  → borrar todo
--   - bucket "documents"    → borrar todo (si existe)
-- O si querés, te paso un script para borrarlos vía API.
-- ════════════════════════════════════════════════════════════════════════
