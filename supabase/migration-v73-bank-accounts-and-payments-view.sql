-- ════════════════════════════════════════════════════════════════════════
-- migration-v73: Bank accounts normalizado + tt_payments compat view
-- ════════════════════════════════════════════════════════════════════════
-- FASE 1.2 — Cobros funcional.
--
-- PROBLEMAS QUE RESUELVE:
--   1. tt_bank_accounts (v5) tiene esquema entity_type/entity_id genérico.
--      FASE 1.2 pide esquema concreto (company_id, iban_or_cbu, etc.).
--      Solución: ALTER ADD COLUMN para los nuevos campos, manteniendo los
--      viejos como nullable. Tabla de cuentas reales se sembrará desde la
--      app (admin UI).
--
--   2. tt_payments no existe — todo el código (registerPayment,
--      CobrosTab, document-helpers.paymentToRow) referencia esa tabla y
--      falla silently. La tabla real con cobros es tt_invoice_payments (v36).
--      Solución: VIEW tt_payments sobre tt_invoice_payments con los aliases
--      que espera el código (method ← payment_method, reference ←
--      bank_reference, payment_date ← payment_date) + INSTEAD OF triggers
--      para soportar INSERT/UPDATE/DELETE desde el código viejo.
--
-- IDEMPOTENTE.
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 1. Normalizar tt_bank_accounts: agregar company_id, account_holder,
--    iban_or_cbu, is_active, notes. Mantener entity_type/entity_id por
--    retrocompatibilidad con código que aún use el esquema viejo.
-- ─────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  -- company_id explícito (más fuerte que entity_type='company' + entity_id)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='tt_bank_accounts' AND column_name='company_id'
  ) THEN
    ALTER TABLE public.tt_bank_accounts
      ADD COLUMN company_id UUID REFERENCES public.tt_companies(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='tt_bank_accounts' AND column_name='account_holder'
  ) THEN
    ALTER TABLE public.tt_bank_accounts ADD COLUMN account_holder TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='tt_bank_accounts' AND column_name='iban_or_cbu'
  ) THEN
    ALTER TABLE public.tt_bank_accounts ADD COLUMN iban_or_cbu TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='tt_bank_accounts' AND column_name='is_active'
  ) THEN
    ALTER TABLE public.tt_bank_accounts ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='tt_bank_accounts' AND column_name='notes'
  ) THEN
    ALTER TABLE public.tt_bank_accounts ADD COLUMN notes TEXT;
  END IF;
END $$;

-- Backfill: si entity_type='company' + entity_id IS NOT NULL, copiar a company_id
UPDATE public.tt_bank_accounts
SET company_id = entity_id
WHERE company_id IS NULL
  AND entity_type = 'company'
  AND entity_id IS NOT NULL;

-- Backfill: si iban_or_cbu vacío pero iban tiene valor, copiarlo
UPDATE public.tt_bank_accounts
SET iban_or_cbu = iban
WHERE iban_or_cbu IS NULL AND iban IS NOT NULL;

-- Backfill: account_holder ← owner_name
UPDATE public.tt_bank_accounts
SET account_holder = owner_name
WHERE account_holder IS NULL AND owner_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tt_bank_accounts_company
  ON public.tt_bank_accounts (company_id)
  WHERE is_active = true;

-- ─────────────────────────────────────────────────────────────────────
-- 2. tt_payments compat VIEW sobre tt_invoice_payments
-- ─────────────────────────────────────────────────────────────────────
-- El código (registerPayment, CobrosTab, document-helpers) usa:
--   SELECT id, invoice_id, amount, method, reference, payment_date, status
--     FROM tt_payments WHERE invoice_id = ?
--   INSERT INTO tt_payments (invoice_id, amount, method, reference,
--                            payment_date, status) VALUES (...)
-- La tabla real (v36) tiene: payment_method, bank_reference.
-- Mapeo: method ↔ payment_method, reference ↔ bank_reference.
-- Status no existe en la tabla real → derivamos siempre 'completed' en
-- el VIEW (la app sólo registra cobros completados; pendientes/parciales
-- se calculan sobre tt_invoices.status).
-- ─────────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.tt_payments CASCADE;

CREATE VIEW public.tt_payments AS
SELECT
  id,
  invoice_id,
  amount,
  currency,
  payment_date,
  payment_method AS method,
  bank_reference AS reference,
  bank_account AS bank_account_legacy,
  notes,
  receipt_url,
  created_by,
  created_at,
  'completed'::TEXT AS status,
  document_id,
  -- FASE 1.2 — nuevo: bank_account_id apunta a tt_bank_accounts.
  -- Persistido en la tabla real desde abajo (ALTER ADD COLUMN).
  bank_account_id
FROM public.tt_invoice_payments;

COMMENT ON VIEW public.tt_payments IS
  'Compat view de tt_invoice_payments para código que aún referencia tt_payments. Alias: method=payment_method, reference=bank_reference. Soporta INSERT/UPDATE/DELETE via INSTEAD OF triggers.';

-- ─────────────────────────────────────────────────────────────────────
-- 3. Columna bank_account_id en tt_invoice_payments (FK normalizado)
-- ─────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='tt_invoice_payments' AND column_name='bank_account_id'
  ) THEN
    ALTER TABLE public.tt_invoice_payments
      ADD COLUMN bank_account_id UUID REFERENCES public.tt_bank_accounts(id);
    CREATE INDEX idx_tt_invoice_payments_bank_account ON public.tt_invoice_payments(bank_account_id);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- 4. INSTEAD OF triggers para que la VIEW sea writable
-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION tt_payments_view_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.tt_invoice_payments (
    id, invoice_id, document_id, amount, currency, payment_date,
    payment_method, bank_reference, bank_account, bank_account_id,
    notes, receipt_url, created_by, created_at
  ) VALUES (
    COALESCE(NEW.id, gen_random_uuid()),
    NEW.invoice_id,
    NEW.document_id,
    NEW.amount,
    COALESCE(NEW.currency, 'EUR'),
    COALESCE(NEW.payment_date, CURRENT_DATE),
    COALESCE(NEW.method, 'transferencia'),
    NEW.reference,
    NEW.bank_account_legacy,
    NEW.bank_account_id,
    NEW.notes,
    NEW.receipt_url,
    NEW.created_by,
    COALESCE(NEW.created_at, now())
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION tt_payments_view_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.tt_invoice_payments SET
    invoice_id = NEW.invoice_id,
    document_id = NEW.document_id,
    amount = NEW.amount,
    currency = COALESCE(NEW.currency, currency),
    payment_date = NEW.payment_date,
    payment_method = COALESCE(NEW.method, payment_method),
    bank_reference = NEW.reference,
    bank_account_id = NEW.bank_account_id,
    notes = NEW.notes,
    receipt_url = NEW.receipt_url
  WHERE id = OLD.id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION tt_payments_view_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM public.tt_invoice_payments WHERE id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS tt_payments_view_ins ON public.tt_payments;
CREATE TRIGGER tt_payments_view_ins
  INSTEAD OF INSERT ON public.tt_payments
  FOR EACH ROW EXECUTE FUNCTION tt_payments_view_insert();

DROP TRIGGER IF EXISTS tt_payments_view_upd ON public.tt_payments;
CREATE TRIGGER tt_payments_view_upd
  INSTEAD OF UPDATE ON public.tt_payments
  FOR EACH ROW EXECUTE FUNCTION tt_payments_view_update();

DROP TRIGGER IF EXISTS tt_payments_view_del ON public.tt_payments;
CREATE TRIGGER tt_payments_view_del
  INSTEAD OF DELETE ON public.tt_payments
  FOR EACH ROW EXECUTE FUNCTION tt_payments_view_delete();

-- ─────────────────────────────────────────────────────────────────────
-- 5. Helper: detectar facturas vencidas (status='overdue' computado)
-- ─────────────────────────────────────────────────────────────────────
-- La columna tt_invoices.status hoy tiene draft/sent/paid/partial pero no
-- 'overdue'. Esto se computa: due_date < today AND total > paid_amount.
-- Función helper para que /ventas tab Cobros pueda filtrar y badgear.
CREATE OR REPLACE FUNCTION tt_invoices_overdue(p_company_id UUID DEFAULT NULL)
RETURNS TABLE (
  invoice_id    UUID,
  doc_number    TEXT,
  client_id     UUID,
  total         NUMERIC,
  paid_amount   NUMERIC,
  outstanding   NUMERIC,
  due_date      DATE,
  days_overdue  INT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    i.id,
    i.doc_number,
    i.client_id,
    i.total,
    COALESCE((
      SELECT SUM(amount) FROM tt_invoice_payments WHERE invoice_id = i.id
    ), 0),
    i.total - COALESCE((
      SELECT SUM(amount) FROM tt_invoice_payments WHERE invoice_id = i.id
    ), 0),
    i.due_date,
    GREATEST(0, CURRENT_DATE - i.due_date)
  FROM tt_invoices i
  WHERE i.status NOT IN ('paid', 'cancelled', 'voided')
    AND i.due_date IS NOT NULL
    AND i.due_date < CURRENT_DATE
    AND (p_company_id IS NULL OR i.company_id = p_company_id)
  ORDER BY i.due_date ASC;
$$;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════
-- ROLLBACK:
--   BEGIN;
--   DROP TRIGGER IF EXISTS tt_payments_view_ins ON tt_payments;
--   DROP TRIGGER IF EXISTS tt_payments_view_upd ON tt_payments;
--   DROP TRIGGER IF EXISTS tt_payments_view_del ON tt_payments;
--   DROP FUNCTION IF EXISTS tt_payments_view_insert();
--   DROP FUNCTION IF EXISTS tt_payments_view_update();
--   DROP FUNCTION IF EXISTS tt_payments_view_delete();
--   DROP FUNCTION IF EXISTS tt_invoices_overdue(uuid);
--   DROP VIEW IF EXISTS tt_payments;
--   ALTER TABLE tt_invoice_payments DROP COLUMN IF EXISTS bank_account_id;
--   -- Columnas en tt_bank_accounts se dejan (no destructivo).
--   COMMIT;
-- ════════════════════════════════════════════════════════════════════════
