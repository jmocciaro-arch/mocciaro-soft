-- =====================================================
-- MIGRATION V5: PROCESS ENGINE + CHAT + ADDRESSES
-- Master Spec v3.0 — April 2026
--
-- REGLA: NO modifica tablas existentes. Solo agrega.
-- Las tablas tt_* existentes quedan intactas.
-- =====================================================

-- =====================================================
-- 1. ADDRESSES (normalized, reusable)
-- =====================================================
CREATE TABLE IF NOT EXISTS tt_addresses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  line1 TEXT NOT NULL,
  line2 TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  country_code TEXT NOT NULL DEFAULT 'ES',
  latitude NUMERIC(10,7),
  longitude NUMERIC(10,7),
  label TEXT, -- 'billing', 'shipping', 'warehouse', 'office'
  entity_type TEXT, -- 'customer', 'supplier', 'company', 'warehouse'
  entity_id UUID, -- FK logica a cualquier entidad
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_tt_addresses_entity ON tt_addresses(entity_type, entity_id);

-- =====================================================
-- 2. BANK ACCOUNTS (for suppliers, companies)
-- =====================================================
CREATE TABLE IF NOT EXISTS tt_bank_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_name TEXT NOT NULL,
  iban TEXT,
  swift_bic TEXT,
  bank_name TEXT,
  currency TEXT DEFAULT 'EUR',
  description TEXT,
  entity_type TEXT, -- 'supplier', 'company', 'customer'
  entity_id UUID,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_tt_bank_accounts_entity ON tt_bank_accounts(entity_type, entity_id);

-- =====================================================
-- 3. PROCESS STAGE DEFINITIONS (templates per process type)
-- =====================================================
CREATE TABLE IF NOT EXISTS tt_process_stage_definitions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  process_type TEXT NOT NULL,
  stage_order INT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#6B7280',
  icon TEXT, -- lucide icon name
  is_mandatory BOOLEAN DEFAULT true,
  auto_advance_condition TEXT, -- optional: JSON rule for auto-advance
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(process_type, code),
  UNIQUE(process_type, stage_order)
);

CREATE INDEX idx_tt_psd_type ON tt_process_stage_definitions(process_type);

-- =====================================================
-- 4. PROCESS INSTANCES (live process executions)
-- =====================================================
CREATE TABLE IF NOT EXISTS tt_process_instances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  process_type TEXT NOT NULL,
  name TEXT NOT NULL, -- descriptive name: "Venta NORDEX OC-49683"

  -- Linked entities (polymorphic)
  customer_id UUID REFERENCES tt_clients(id),
  supplier_id UUID REFERENCES tt_suppliers(id),
  company_id UUID REFERENCES tt_companies(id),

  -- Primary document that originated this process
  origin_document_id UUID REFERENCES tt_documents(id),

  -- Current state
  current_stage_code TEXT, -- code from stage_definitions
  current_stage_order INT DEFAULT 1,
  current_status TEXT DEFAULT 'active' CHECK (current_status IN ('active', 'paused', 'completed', 'cancelled', 'blocked')),
  progress_percent NUMERIC(5,2) DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
  color_code TEXT DEFAULT '#6B7280', -- computed from rules: green/yellow/red/blue

  -- Ownership
  assigned_to_user_id UUID REFERENCES tt_users(id),
  created_by_user_id UUID REFERENCES tt_users(id),

  -- Dates
  started_at TIMESTAMPTZ DEFAULT now(),
  expected_end_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Flexible metadata
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_tt_pi_type ON tt_process_instances(process_type);
CREATE INDEX idx_tt_pi_status ON tt_process_instances(current_status);
CREATE INDEX idx_tt_pi_customer ON tt_process_instances(customer_id);
CREATE INDEX idx_tt_pi_supplier ON tt_process_instances(supplier_id);
CREATE INDEX idx_tt_pi_company ON tt_process_instances(company_id);
CREATE INDEX idx_tt_pi_origin_doc ON tt_process_instances(origin_document_id);

-- =====================================================
-- 5. PROCESS STAGES (actual stage instances per process)
-- =====================================================
CREATE TABLE IF NOT EXISTS tt_process_stages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  process_instance_id UUID NOT NULL REFERENCES tt_process_instances(id) ON DELETE CASCADE,
  stage_definition_id UUID NOT NULL REFERENCES tt_process_stage_definitions(id),
  stage_order INT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,

  -- State
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped', 'blocked')),

  -- Dates
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  due_date TIMESTAMPTZ,

  -- Assignment
  assigned_to_user_id UUID REFERENCES tt_users(id),

  -- Related documents created at this stage
  document_id UUID REFERENCES tt_documents(id),

  -- Notes and data for this stage
  notes TEXT,
  stage_data JSONB DEFAULT '{}', -- flexible: diagnostic results, approval data, etc.

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_tt_ps_instance ON tt_process_stages(process_instance_id);
CREATE INDEX idx_tt_ps_status ON tt_process_stages(status);

-- =====================================================
-- 6. PROCESS-DOCUMENT LINKS (many-to-many)
-- A process can have many documents, a document can belong to multiple processes
-- =====================================================
CREATE TABLE IF NOT EXISTS tt_process_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  process_instance_id UUID NOT NULL REFERENCES tt_process_instances(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES tt_documents(id),
  stage_code TEXT, -- at which stage was this document created/linked
  role TEXT DEFAULT 'related', -- 'origin', 'quote', 'order', 'delivery', 'invoice', 'payment', 'related'
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(process_instance_id, document_id)
);

CREATE INDEX idx_tt_pd_process ON tt_process_documents(process_instance_id);
CREATE INDEX idx_tt_pd_document ON tt_process_documents(document_id);

-- =====================================================
-- 7. THREADS (internal chat, attached to any entity)
-- =====================================================
CREATE TABLE IF NOT EXISTS tt_threads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type TEXT NOT NULL, -- 'process_instance', 'document', 'customer', 'supplier', 'product', 'sat_ticket'
  entity_id UUID NOT NULL,
  title TEXT,
  is_resolved BOOLEAN DEFAULT false,
  created_by_user_id UUID REFERENCES tt_users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_tt_threads_entity ON tt_threads(entity_type, entity_id);

-- =====================================================
-- 8. MESSAGES (chat messages within threads)
-- =====================================================
CREATE TABLE IF NOT EXISTS tt_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  thread_id UUID NOT NULL REFERENCES tt_threads(id) ON DELETE CASCADE,
  author_user_id UUID REFERENCES tt_users(id),
  content TEXT NOT NULL,
  is_internal BOOLEAN DEFAULT true, -- internal = staff only, false = visible to customer
  is_system BOOLEAN DEFAULT false, -- auto-generated messages (stage changes, etc.)

  -- Attachments and mentions
  attachments JSONB DEFAULT '[]', -- [{name, url, size, type}]
  mentions JSONB DEFAULT '[]', -- [user_id, user_id, ...]

  -- Never deleted, only soft-hidden
  is_hidden BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_tt_messages_thread ON tt_messages(thread_id);
CREATE INDEX idx_tt_messages_author ON tt_messages(author_user_id);

-- =====================================================
-- 9. AUDIT LOG EXTENSION (add old/new values to existing tt_activity_log)
-- =====================================================
-- We DON'T modify tt_activity_log. Instead, create a parallel enhanced table.
-- The app will write to both during transition, then migrate fully.

CREATE TABLE IF NOT EXISTS tt_audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  action TEXT NOT NULL, -- 'create', 'update', 'delete', 'status_change', 'stage_advance', 'assign'
  changed_by_user_id UUID REFERENCES tt_users(id),
  changed_at TIMESTAMPTZ DEFAULT now(),
  old_values JSONB, -- previous field values
  new_values JSONB, -- new field values
  description TEXT,
  ip_address TEXT,
  user_agent TEXT
);

CREATE INDEX idx_tt_audit_entity ON tt_audit_log(entity_type, entity_id);
CREATE INDEX idx_tt_audit_action ON tt_audit_log(action);
CREATE INDEX idx_tt_audit_date ON tt_audit_log(changed_at);
CREATE INDEX idx_tt_audit_user ON tt_audit_log(changed_by_user_id);

-- =====================================================
-- 10. ADDITIONAL COLUMNS ON EXISTING TABLES (non-breaking)
-- These are ALTER TABLE ADD COLUMN IF NOT EXISTS
-- They add optional FKs to connect existing data to new process engine
-- =====================================================

-- tt_documents: link to process instance
ALTER TABLE tt_documents ADD COLUMN IF NOT EXISTS process_instance_id UUID REFERENCES tt_process_instances(id);
CREATE INDEX IF NOT EXISTS idx_tt_docs_process ON tt_documents(process_instance_id);

-- tt_clients: add address FKs
ALTER TABLE tt_clients ADD COLUMN IF NOT EXISTS billing_address_id UUID REFERENCES tt_addresses(id);
ALTER TABLE tt_clients ADD COLUMN IF NOT EXISTS shipping_address_id UUID REFERENCES tt_addresses(id);
ALTER TABLE tt_clients ADD COLUMN IF NOT EXISTS risk_limit NUMERIC(14,2);

-- tt_suppliers: add bank account FK
ALTER TABLE tt_suppliers ADD COLUMN IF NOT EXISTS bank_account_id UUID REFERENCES tt_bank_accounts(id);
ALTER TABLE tt_suppliers ADD COLUMN IF NOT EXISTS supplier_family TEXT;

-- tt_products: add kit flag
ALTER TABLE tt_products ADD COLUMN IF NOT EXISTS is_kit BOOLEAN DEFAULT false;
ALTER TABLE tt_products ADD COLUMN IF NOT EXISTS unit_of_measure TEXT DEFAULT 'Uni';

-- Kit components
CREATE TABLE IF NOT EXISTS tt_kit_components (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  kit_product_id UUID NOT NULL REFERENCES tt_products(id) ON DELETE CASCADE,
  component_product_id UUID NOT NULL REFERENCES tt_products(id),
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(kit_product_id, component_product_id)
);

-- =====================================================
-- 11. SEED: PROCESS STAGE DEFINITIONS
-- =====================================================

-- LEAD_TO_CASH (ventas completas)
INSERT INTO tt_process_stage_definitions (process_type, stage_order, code, name, color, icon, is_mandatory) VALUES
('LEAD_TO_CASH', 1, 'LEAD_CAPTURE', 'Captura de Lead', '#6B7280', 'UserPlus', true),
('LEAD_TO_CASH', 2, 'QUALIFICATION', 'Calificacion', '#8B5CF6', 'Search', true),
('LEAD_TO_CASH', 3, 'QUOTE_PREPARED', 'Cotizacion preparada', '#3B82F6', 'FileText', true),
('LEAD_TO_CASH', 4, 'QUOTE_SENT', 'Cotizacion enviada', '#06B6D4', 'Send', true),
('LEAD_TO_CASH', 5, 'NEGOTIATION', 'Negociacion', '#F59E0B', 'MessageSquare', false),
('LEAD_TO_CASH', 6, 'ORDER_CONFIRMED', 'Pedido confirmado', '#10B981', 'ShoppingCart', true),
('LEAD_TO_CASH', 7, 'DELIVERY', 'Entrega / Albaran', '#8B5CF6', 'Truck', true),
('LEAD_TO_CASH', 8, 'INVOICE_ISSUED', 'Factura emitida', '#F97316', 'CreditCard', true),
('LEAD_TO_CASH', 9, 'PAYMENT_RECEIVED', 'Cobro recibido', '#10B981', 'DollarSign', true),
('LEAD_TO_CASH', 10, 'CLOSED', 'Cerrado', '#3B82F6', 'CheckCircle', true)
ON CONFLICT (process_type, code) DO NOTHING;

-- PURCHASE_TO_PAY (compras completas)
INSERT INTO tt_process_stage_definitions (process_type, stage_order, code, name, color, icon, is_mandatory) VALUES
('PURCHASE_TO_PAY', 1, 'PURCHASE_REQUEST', 'Solicitud de compra', '#6B7280', 'ClipboardList', true),
('PURCHASE_TO_PAY', 2, 'SUPPLIER_SELECTION', 'Seleccion proveedor', '#8B5CF6', 'Search', true),
('PURCHASE_TO_PAY', 3, 'PO_ISSUED', 'OC emitida', '#3B82F6', 'FileText', true),
('PURCHASE_TO_PAY', 4, 'CONFIRMATION', 'Confirmacion proveedor', '#06B6D4', 'CheckCircle', true),
('PURCHASE_TO_PAY', 5, 'SHIPPING', 'En transito', '#F59E0B', 'Truck', true),
('PURCHASE_TO_PAY', 6, 'RECEPTION', 'Recepcion', '#10B981', 'Package', true),
('PURCHASE_TO_PAY', 7, 'SUPPLIER_INVOICE', 'Factura proveedor', '#F97316', 'Receipt', true),
('PURCHASE_TO_PAY', 8, 'PAYMENT_SCHEDULED', 'Pago programado', '#EF4444', 'Calendar', true),
('PURCHASE_TO_PAY', 9, 'PAYMENT_DONE', 'Pago realizado', '#10B981', 'DollarSign', true),
('PURCHASE_TO_PAY', 10, 'CLOSED', 'Cerrado', '#3B82F6', 'CheckCircle', true)
ON CONFLICT (process_type, code) DO NOTHING;

-- IMPORT_OPERATION (importaciones internacionales)
INSERT INTO tt_process_stage_definitions (process_type, stage_order, code, name, color, icon, is_mandatory) VALUES
('IMPORT_OPERATION', 1, 'PROFORMA_INVOICE', 'Factura proforma', '#6B7280', 'FileText', true),
('IMPORT_OPERATION', 2, 'BOOKING', 'Reserva transporte', '#3B82F6', 'Truck', true),
('IMPORT_OPERATION', 3, 'EXPORT_CUSTOMS', 'Aduana exportacion', '#F59E0B', 'Shield', true),
('IMPORT_OPERATION', 4, 'IN_TRANSIT', 'En transito', '#06B6D4', 'Globe', true),
('IMPORT_OPERATION', 5, 'ARRIVAL_PORT', 'Llegada a puerto', '#8B5CF6', 'Anchor', true),
('IMPORT_OPERATION', 6, 'IMPORT_CUSTOMS', 'Aduana importacion', '#F59E0B', 'Shield', true),
('IMPORT_OPERATION', 7, 'DELIVERY_WAREHOUSE', 'Entrega almacen', '#10B981', 'Warehouse', true),
('IMPORT_OPERATION', 8, 'COST_ALLOCATION', 'Liquidacion costos', '#F97316', 'Calculator', true),
('IMPORT_OPERATION', 9, 'CLOSED', 'Cerrado', '#3B82F6', 'CheckCircle', true)
ON CONFLICT (process_type, code) DO NOTHING;

-- MAINTENANCE_FLOW (SAT — basado en BuscaTools Mantenimiento)
INSERT INTO tt_process_stage_definitions (process_type, stage_order, code, name, color, icon, is_mandatory) VALUES
('MAINTENANCE_FLOW', 1, 'DIAGNOSTICO', 'Diagnostico', '#FF6600', 'Search', true),
('MAINTENANCE_FLOW', 2, 'COTIZACION', 'Cotizacion', '#3B82F6', 'FileText', true),
('MAINTENANCE_FLOW', 3, 'REPARACION', 'Reparacion', '#F59E0B', 'Wrench', true),
('MAINTENANCE_FLOW', 4, 'TORQUE', 'Torque / Calibracion', '#10B981', 'Gauge', true),
('MAINTENANCE_FLOW', 5, 'CIERRE', 'Cierre', '#6B7280', 'CheckCircle', true)
ON CONFLICT (process_type, code) DO NOTHING;

-- COLLECTION_FLOW (gestion de cobros)
INSERT INTO tt_process_stage_definitions (process_type, stage_order, code, name, color, icon, is_mandatory) VALUES
('COLLECTION_FLOW', 1, 'INVOICE_ISSUED', 'Factura emitida', '#3B82F6', 'FileText', true),
('COLLECTION_FLOW', 2, 'REMINDER_1', 'Primer recordatorio', '#F59E0B', 'Bell', false),
('COLLECTION_FLOW', 3, 'REMINDER_2', 'Segundo recordatorio', '#F97316', 'Bell', false),
('COLLECTION_FLOW', 4, 'NEGOTIATION', 'Negociacion', '#EF4444', 'MessageSquare', false),
('COLLECTION_FLOW', 5, 'PARTIAL_PAYMENT', 'Pago parcial', '#8B5CF6', 'DollarSign', false),
('COLLECTION_FLOW', 6, 'FULL_PAYMENT', 'Pago completo', '#10B981', 'DollarSign', true),
('COLLECTION_FLOW', 7, 'CLOSED', 'Cerrado', '#3B82F6', 'CheckCircle', true)
ON CONFLICT (process_type, code) DO NOTHING;

-- PRODUCTION_FLOW
INSERT INTO tt_process_stage_definitions (process_type, stage_order, code, name, color, icon, is_mandatory) VALUES
('PRODUCTION_FLOW', 1, 'PLANNING', 'Planificacion', '#6B7280', 'ClipboardList', true),
('PRODUCTION_FLOW', 2, 'MATERIALS_AVAILABLE', 'Materiales disponibles', '#3B82F6', 'Package', true),
('PRODUCTION_FLOW', 3, 'IN_PRODUCTION', 'En produccion', '#F59E0B', 'Cog', true),
('PRODUCTION_FLOW', 4, 'QUALITY_CHECK', 'Control calidad', '#8B5CF6', 'CheckCircle', true),
('PRODUCTION_FLOW', 5, 'READY_DELIVERY', 'Listo para entrega', '#10B981', 'Truck', true),
('PRODUCTION_FLOW', 6, 'CLOSED', 'Cerrado', '#3B82F6', 'CheckCircle', true)
ON CONFLICT (process_type, code) DO NOTHING;

-- INTERNAL_REQUEST_FLOW
INSERT INTO tt_process_stage_definitions (process_type, stage_order, code, name, color, icon, is_mandatory) VALUES
('INTERNAL_REQUEST_FLOW', 1, 'REQUEST', 'Solicitud', '#6B7280', 'MessageSquare', true),
('INTERNAL_REQUEST_FLOW', 2, 'REVIEW', 'Revision', '#3B82F6', 'Search', true),
('INTERNAL_REQUEST_FLOW', 3, 'APPROVAL', 'Aprobacion', '#F59E0B', 'CheckCircle', true),
('INTERNAL_REQUEST_FLOW', 4, 'EXECUTION', 'Ejecucion', '#10B981', 'Cog', true),
('INTERNAL_REQUEST_FLOW', 5, 'CLOSED', 'Cerrado', '#3B82F6', 'CheckCircle', true)
ON CONFLICT (process_type, code) DO NOTHING;

-- =====================================================
-- 12. RLS POLICIES (allow authenticated access)
-- =====================================================
ALTER TABLE tt_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE tt_bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE tt_process_stage_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tt_process_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE tt_process_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE tt_process_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE tt_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE tt_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE tt_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE tt_kit_components ENABLE ROW LEVEL SECURITY;

-- Open policies (same as existing tables)
CREATE POLICY "addresses_all" ON tt_addresses FOR ALL TO authenticated USING (true);
CREATE POLICY "bank_accounts_all" ON tt_bank_accounts FOR ALL TO authenticated USING (true);
CREATE POLICY "psd_all" ON tt_process_stage_definitions FOR ALL TO authenticated USING (true);
CREATE POLICY "pi_all" ON tt_process_instances FOR ALL TO authenticated USING (true);
CREATE POLICY "ps_all" ON tt_process_stages FOR ALL TO authenticated USING (true);
CREATE POLICY "pd_all" ON tt_process_documents FOR ALL TO authenticated USING (true);
CREATE POLICY "threads_all" ON tt_threads FOR ALL TO authenticated USING (true);
CREATE POLICY "messages_all" ON tt_messages FOR ALL TO authenticated USING (true);
CREATE POLICY "audit_all" ON tt_audit_log FOR ALL TO authenticated USING (true);
CREATE POLICY "kit_all" ON tt_kit_components FOR ALL TO authenticated USING (true);

-- =====================================================
-- 13. TRIGGERS (auto-update updated_at)
-- =====================================================
CREATE TRIGGER set_updated_at BEFORE UPDATE ON tt_addresses FOR EACH ROW EXECUTE FUNCTION tt_update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON tt_bank_accounts FOR EACH ROW EXECUTE FUNCTION tt_update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON tt_process_stage_definitions FOR EACH ROW EXECUTE FUNCTION tt_update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON tt_process_instances FOR EACH ROW EXECUTE FUNCTION tt_update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON tt_process_stages FOR EACH ROW EXECUTE FUNCTION tt_update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON tt_threads FOR EACH ROW EXECUTE FUNCTION tt_update_updated_at();

-- =====================================================
-- FIN MIGRATION V5
-- =====================================================
