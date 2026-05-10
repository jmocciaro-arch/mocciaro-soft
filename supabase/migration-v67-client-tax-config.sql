-- =====================================================
-- v67 — Configuración fiscal por cliente
-- =====================================================
-- Cada cliente puede tener configurado por defecto:
--   - subject_iva   → si se le aplica IVA (default true)
--   - iva_rate      → % de IVA por defecto (default 21)
--   - subject_irpf  → si se le retiene IRPF (default false)
--   - irpf_rate     → % IRPF (default 15)
--   - subject_re    → si se le aplica recargo de equivalencia (default false)
--   - re_rate       → % R.E. (default 5.2)
--
-- En la cotización estos defaults se cargan automáticamente al seleccionar
-- cliente, pero el operador puede activarlos/desactivarlos puntualmente.
-- =====================================================

-- Cliente
ALTER TABLE tt_clients ADD COLUMN IF NOT EXISTS subject_iva  BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE tt_clients ADD COLUMN IF NOT EXISTS iva_rate     NUMERIC(5,2) NOT NULL DEFAULT 21;
ALTER TABLE tt_clients ADD COLUMN IF NOT EXISTS subject_irpf BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE tt_clients ADD COLUMN IF NOT EXISTS irpf_rate    NUMERIC(5,2) NOT NULL DEFAULT 15;
ALTER TABLE tt_clients ADD COLUMN IF NOT EXISTS subject_re   BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE tt_clients ADD COLUMN IF NOT EXISTS re_rate      NUMERIC(5,2) NOT NULL DEFAULT 5.2;

COMMENT ON COLUMN tt_clients.subject_iva  IS 'Si se le aplica IVA por defecto. False = exento (ej: cliente extranjero, exportación)';
COMMENT ON COLUMN tt_clients.iva_rate     IS 'Tipo de IVA habitual (21, 10, 4, 0)';
COMMENT ON COLUMN tt_clients.subject_irpf IS 'Si se le retiene IRPF (clientes que requieren retención)';
COMMENT ON COLUMN tt_clients.irpf_rate    IS 'Porcentaje de IRPF a retener';
COMMENT ON COLUMN tt_clients.subject_re   IS 'Si está sujeto a Recargo de Equivalencia';
COMMENT ON COLUMN tt_clients.re_rate      IS 'Porcentaje de Recargo de Equivalencia';

-- Cotizaciones — agregar flag explícito de "iva activo" para esta cotización
-- (independiente de tax_rate por si el operador desactiva manualmente)
ALTER TABLE tt_quotes ADD COLUMN IF NOT EXISTS subject_iva BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN tt_quotes.subject_iva IS 'Si esta cotización lleva IVA. Se inicializa desde el cliente pero puede sobrescribirse en el cotizador.';
