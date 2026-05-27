-- Índices de performance — GIN full-text + B-tree en columnas de filtro frecuente.
-- Crear extensión pg_trgm si no existe (necesario para GIN trigram en búsquedas ILIKE).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================
-- TT_PRODUCTS — catálogo gigante, búsqueda + filtros facetados
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON tt_products USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_sku_trgm ON tt_products USING GIN (sku gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_brand ON tt_products (brand) WHERE brand IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_category ON tt_products (category) WHERE category IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_active ON tt_products (active) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_products_price ON tt_products (price_eur) WHERE price_eur IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_brand_category ON tt_products (brand, category);

-- ============================================================
-- TT_CLIENTS — buscador y filtros
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_clients_name_trgm ON tt_clients USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_clients_legal_name_trgm ON tt_clients USING GIN (legal_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_clients_tax_id ON tt_clients (tax_id) WHERE tax_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clients_company_active ON tt_clients (company_id, active);
CREATE INDEX IF NOT EXISTS idx_clients_assigned_to ON tt_clients (assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clients_country ON tt_clients (country) WHERE country IS NOT NULL;

-- ============================================================
-- TT_SUPPLIERS — espejo de clientes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_suppliers_name_trgm ON tt_suppliers USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_suppliers_legal_name_trgm ON tt_suppliers USING GIN (legal_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_suppliers_company_active ON tt_suppliers (company_id, active);

-- ============================================================
-- TT_DOCUMENTS — el corazón del workflow unificado
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_documents_company_type_status ON tt_documents (company_id, doc_type, status);
CREATE INDEX IF NOT EXISTS idx_documents_client_created ON tt_documents (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_assigned ON tt_documents (assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_created_at_desc ON tt_documents (created_at DESC);

-- ============================================================
-- TT_STOCK — joins frecuentes con warehouse + product
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_stock_warehouse_product ON tt_stock (warehouse_id, product_id);
CREATE INDEX IF NOT EXISTS idx_stock_product ON tt_stock (product_id);

-- ============================================================
-- TT_PURCHASE_ORDERS / TT_PURCHASE_INVOICES — compras y calendario pagos
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_po_company_status ON tt_purchase_orders (company_id, status);
CREATE INDEX IF NOT EXISTS idx_po_created ON tt_purchase_orders (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pi_supplier_status ON tt_purchase_invoices (supplier_id, status);
CREATE INDEX IF NOT EXISTS idx_pi_due_date ON tt_purchase_invoices (due_date) WHERE due_date IS NOT NULL;

-- ============================================================
-- TT_OPPORTUNITIES — CRM pipeline
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_opportunities_stage ON tt_opportunities (stage);
CREATE INDEX IF NOT EXISTS idx_opportunities_assigned ON tt_opportunities (assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_opportunities_close_date ON tt_opportunities (expected_close_date) WHERE expected_close_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_opportunities_company_stage ON tt_opportunities (company_id, stage);

-- ============================================================
-- TT_SAT_TICKETS — servicio técnico
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_sat_tickets_status ON tt_sat_tickets (status);
CREATE INDEX IF NOT EXISTS idx_sat_tickets_client ON tt_sat_tickets (client_id);
CREATE INDEX IF NOT EXISTS idx_sat_tickets_assigned ON tt_sat_tickets (assigned_to) WHERE assigned_to IS NOT NULL;
