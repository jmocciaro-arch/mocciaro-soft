-- =====================================================
-- v69 — Condiciones comerciales completas del cliente
-- =====================================================
-- Agrega todos los campos importantes que un cliente debe tener
-- como datos comerciales: moneda, condicion de venta, forma de
-- pago, lugar y condiciones de entrega, condicion fiscal segun
-- pais (ES + AR), retenciones, datos bancarios.
--
-- La v67 ya cubrio IVA / IRPF / RE (Espania). Aqui sumamos lo
-- que faltaba para tener la ficha comercial completa, pensada
-- para empresas que venden desde ES (TorqueTools SL) y desde
-- AR (Torquear SA, BuscaTools SA, etc.).
-- =====================================================

-- ── Moneda ─────────────────────────────────────────────
ALTER TABLE tt_clients ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'EUR';
COMMENT ON COLUMN tt_clients.currency IS
  'Moneda en la que se opera con el cliente (EUR, ARS, USD, BRL, CLP, UYU, MXN, GBP). Default segun la empresa que vende.';

-- ── Condiciones de venta y pago ────────────────────────
ALTER TABLE tt_clients ADD COLUMN IF NOT EXISTS sale_condition TEXT;
COMMENT ON COLUMN tt_clients.sale_condition IS
  'Condicion de venta: contado, cuenta_corriente, anticipo, contra_entrega, mixto, consignacion';

ALTER TABLE tt_clients ADD COLUMN IF NOT EXISTS payment_method TEXT;
COMMENT ON COLUMN tt_clients.payment_method IS
  'Forma de pago habitual: transferencia, efectivo, cheque, tarjeta, paypal, mercado_pago, debito_automatico, pagare';

ALTER TABLE tt_clients ADD COLUMN IF NOT EXISTS payment_terms_days INTEGER DEFAULT 0;
COMMENT ON COLUMN tt_clients.payment_terms_days IS
  'Dias de credito (0 = contado, 30 = 30 dias FF, etc). Numerico para calculos. payment_terms (texto) queda como descripcion libre.';

ALTER TABLE tt_clients ADD COLUMN IF NOT EXISTS bank_account TEXT;
COMMENT ON COLUMN tt_clients.bank_account IS
  'Datos bancarios del cliente (IBAN/CBU) para domiciliacion o referencia';

-- ── Entrega ────────────────────────────────────────────
ALTER TABLE tt_clients ADD COLUMN IF NOT EXISTS delivery_address TEXT;
ALTER TABLE tt_clients ADD COLUMN IF NOT EXISTS delivery_city TEXT;
ALTER TABLE tt_clients ADD COLUMN IF NOT EXISTS delivery_state TEXT;
ALTER TABLE tt_clients ADD COLUMN IF NOT EXISTS delivery_postal_code TEXT;
ALTER TABLE tt_clients ADD COLUMN IF NOT EXISTS delivery_country TEXT;
ALTER TABLE tt_clients ADD COLUMN IF NOT EXISTS delivery_contact TEXT;
ALTER TABLE tt_clients ADD COLUMN IF NOT EXISTS delivery_phone TEXT;
COMMENT ON COLUMN tt_clients.delivery_address IS
  'Direccion de entrega por defecto (puede diferir de la fiscal)';

ALTER TABLE tt_clients ADD COLUMN IF NOT EXISTS incoterm TEXT;
COMMENT ON COLUMN tt_clients.incoterm IS
  'Incoterm: EXW, FCA, FOB, CFR, CIF, CPT, CIP, DAP, DPU, DDP';

ALTER TABLE tt_clients ADD COLUMN IF NOT EXISTS delivery_method TEXT;
COMMENT ON COLUMN tt_clients.delivery_method IS
  'Metodo: transporte_propio, mensajeria, retira_cliente, agencia, courier_internacional';

ALTER TABLE tt_clients ADD COLUMN IF NOT EXISTS delivery_terms TEXT;
COMMENT ON COLUMN tt_clients.delivery_terms IS
  'Plazo / condiciones de entrega (ej: "48h habiles", "stock disponible 7 dias", etc.)';

ALTER TABLE tt_clients ADD COLUMN IF NOT EXISTS delivery_notes TEXT;
COMMENT ON COLUMN tt_clients.delivery_notes IS
  'Instrucciones especiales de entrega (horario, persona contacto, restricciones)';

-- ── Fiscal — extension multipais ───────────────────────
ALTER TABLE tt_clients ADD COLUMN IF NOT EXISTS fiscal_condition TEXT;
COMMENT ON COLUMN tt_clients.fiscal_condition IS
  'Condicion fiscal: ES (general, intracomunitario, exento, exportacion) o AR (responsable_inscripto, monotributo, exento, consumidor_final, no_responsable)';

ALTER TABLE tt_clients ADD COLUMN IF NOT EXISTS tax_id_type TEXT;
COMMENT ON COLUMN tt_clients.tax_id_type IS
  'Tipo de identificacion: CIF, NIF, NIE, CUIT, CUIL, RUT, EIN, otro';

-- Retenciones AR — Ingresos Brutos
ALTER TABLE tt_clients ADD COLUMN IF NOT EXISTS subject_iibb BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE tt_clients ADD COLUMN IF NOT EXISTS iibb_rate NUMERIC(5,2) NOT NULL DEFAULT 0;
ALTER TABLE tt_clients ADD COLUMN IF NOT EXISTS iibb_jurisdiction TEXT;
COMMENT ON COLUMN tt_clients.subject_iibb IS
  'Si esta sujeto a retencion / percepcion de Ingresos Brutos (Argentina)';
COMMENT ON COLUMN tt_clients.iibb_jurisdiction IS
  'Jurisdiccion / provincia AR donde tributa IIBB (CABA, BA, etc.)';

-- Retenciones AR — Ganancias
ALTER TABLE tt_clients ADD COLUMN IF NOT EXISTS subject_ganancias BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE tt_clients ADD COLUMN IF NOT EXISTS ganancias_rate NUMERIC(5,2) NOT NULL DEFAULT 0;

-- ── Comercial / notas ──────────────────────────────────
ALTER TABLE tt_clients ADD COLUMN IF NOT EXISTS commercial_notes TEXT;
COMMENT ON COLUMN tt_clients.commercial_notes IS
  'Notas comerciales internas (no se imprimen en documentos)';

ALTER TABLE tt_clients ADD COLUMN IF NOT EXISTS preferred_language TEXT DEFAULT 'es';
COMMENT ON COLUMN tt_clients.preferred_language IS
  'Idioma preferido para comunicaciones y documentos (es, en, pt, fr, it)';

-- ── Indices utiles ─────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_clients_currency ON tt_clients(currency);
CREATE INDEX IF NOT EXISTS idx_clients_fiscal_condition ON tt_clients(fiscal_condition);
CREATE INDEX IF NOT EXISTS idx_clients_sale_condition ON tt_clients(sale_condition);

-- ── Backfill suave por pais ────────────────────────────
-- Default de moneda segun pais cuando esta NULL
UPDATE tt_clients SET currency = 'EUR'
  WHERE currency IS NULL AND country IN ('ES','PT','FR','IT','DE','GB');
UPDATE tt_clients SET currency = 'ARS'
  WHERE currency IS NULL AND country = 'AR';
UPDATE tt_clients SET currency = 'USD'
  WHERE currency IS NULL AND country = 'US';
UPDATE tt_clients SET currency = 'EUR'
  WHERE currency IS NULL;

-- Tipo de identificacion fiscal segun pais cuando esta NULL
UPDATE tt_clients SET tax_id_type = 'CIF'
  WHERE tax_id_type IS NULL AND country = 'ES' AND tax_id IS NOT NULL;
UPDATE tt_clients SET tax_id_type = 'CUIT'
  WHERE tax_id_type IS NULL AND country = 'AR' AND tax_id IS NOT NULL;
