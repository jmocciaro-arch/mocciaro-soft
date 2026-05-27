-- ROLLBACK de cambios de la sesión 2026-05-25.
-- Reconstruye las 8 tablas legacy (eran VIEWs) y deshabilita RLS para que
-- el código del último commit (a34d4a2) funcione sin sorpresas.

-- 1. DROP de las VIEWs creadas para mapear legacy → tt_documents
DROP VIEW IF EXISTS public.tt_quote_items CASCADE;
DROP VIEW IF EXISTS public.tt_so_items CASCADE;
DROP VIEW IF EXISTS public.tt_dn_items CASCADE;
DROP VIEW IF EXISTS public.tt_invoice_items CASCADE;
DROP VIEW IF EXISTS public.tt_quotes CASCADE;
DROP VIEW IF EXISTS public.tt_sales_orders CASCADE;
DROP VIEW IF EXISTS public.tt_delivery_notes CASCADE;
DROP VIEW IF EXISTS public.tt_invoices CASCADE;

-- 2. Recrear tablas vacías con su schema original
CREATE TABLE public.tt_quotes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  number text,
  company_id uuid,
  client_id uuid,
  user_id uuid,
  status text DEFAULT 'borrador',
  currency text DEFAULT 'EUR',
  exchange_rate numeric DEFAULT 1,
  subtotal numeric DEFAULT 0,
  tax_amount numeric DEFAULT 0,
  total numeric DEFAULT 0,
  tax_rate numeric DEFAULT 21,
  incoterm text,
  payment_terms text,
  notes text,
  internal_notes text,
  valid_until timestamptz,
  closed_at timestamptz,
  parent_quote_id uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  payment_days integer,
  payment_terms_type text,
  stelorder_id text,
  stelorder_pdf_url text,
  doc_subtype text,
  irpf_rate numeric DEFAULT 0,
  irpf_amount numeric DEFAULT 0,
  re_rate numeric DEFAULT 0,
  re_amount numeric DEFAULT 0,
  subject_iva boolean DEFAULT true,
  participating_contact_ids uuid[]
);

CREATE TABLE public.tt_quote_items (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  quote_id uuid REFERENCES public.tt_quotes(id) ON DELETE CASCADE,
  product_id uuid,
  sku text,
  description text,
  quantity numeric DEFAULT 0,
  unit_price numeric DEFAULT 0,
  discount_pct numeric DEFAULT 0,
  subtotal numeric DEFAULT 0,
  notes text,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.tt_sales_orders (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  number text,
  company_id uuid,
  client_id uuid,
  user_id uuid,
  quote_id uuid,
  status text DEFAULT 'open',
  currency text DEFAULT 'EUR',
  subtotal numeric DEFAULT 0,
  tax_amount numeric DEFAULT 0,
  total numeric DEFAULT 0,
  delivery_date date,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  payment_terms text,
  payment_days integer,
  stelorder_id text,
  stelorder_pdf_url text
);

CREATE TABLE public.tt_so_items (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  sales_order_id uuid REFERENCES public.tt_sales_orders(id) ON DELETE CASCADE,
  product_id uuid,
  sku text,
  description text,
  qty_ordered numeric DEFAULT 0,
  qty_reserved numeric DEFAULT 0,
  qty_delivered numeric DEFAULT 0,
  qty_invoiced numeric DEFAULT 0,
  qty_cancelled numeric DEFAULT 0,
  unit_price numeric DEFAULT 0,
  discount_pct numeric DEFAULT 0,
  subtotal numeric DEFAULT 0,
  line_status text,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.tt_delivery_notes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  number text,
  company_id uuid,
  client_id uuid,
  sales_order_id uuid,
  user_id uuid,
  status text DEFAULT 'pending',
  delivery_address text,
  delivery_date date,
  notes text,
  signed_by text,
  signature_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.tt_dn_items (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  delivery_note_id uuid REFERENCES public.tt_delivery_notes(id) ON DELETE CASCADE,
  so_item_id uuid,
  product_id uuid,
  sku text,
  description text,
  qty_delivered numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.tt_invoices (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  number text,
  company_id uuid,
  client_id uuid,
  user_id uuid,
  type text DEFAULT 'sale',
  status text DEFAULT 'draft',
  currency text DEFAULT 'EUR',
  subtotal numeric DEFAULT 0,
  tax_amount numeric DEFAULT 0,
  total numeric DEFAULT 0,
  tax_rate numeric DEFAULT 21,
  external_number text,
  external_system text,
  due_date date,
  paid_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.tt_invoice_items (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id uuid REFERENCES public.tt_invoices(id) ON DELETE CASCADE,
  delivery_note_id uuid,
  product_id uuid,
  sku text,
  description text,
  quantity numeric DEFAULT 0,
  unit_price numeric DEFAULT 0,
  cost_snapshot numeric,
  discount_pct numeric DEFAULT 0,
  subtotal numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- 3. Deshabilitar RLS en TODAS las tablas tt_* — el código viejo no espera RLS
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT c.relname AS table_name
    FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace
      AND c.relname LIKE 'tt_%'
      AND c.relkind = 'r'
      AND c.relrowsecurity = true
  LOOP
    EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', r.table_name);
  END LOOP;
END $$;

-- 4. Drop policies company-aware y baseline (limpieza)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tablename, policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename LIKE 'tt_%'
      AND policyname IN ('authenticated_all', 'company_aware_select', 'company_aware_modify')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- 5. Drop helper functions del matcher
DROP FUNCTION IF EXISTS public.auth_user_company_ids() CASCADE;
DROP FUNCTION IF EXISTS public.auth_tt_user_id() CASCADE;

-- 6. Borrar tabla del matcher (no se usa más sin el código nuevo)
DROP TABLE IF EXISTS public.tt_app_errors CASCADE;
