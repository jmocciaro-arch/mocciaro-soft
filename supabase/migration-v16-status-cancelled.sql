-- =====================================================
-- Migration v16: permitir status='cancelled' en tt_sat_tickets
-- =====================================================
-- El CHECK constraint original (v6) no incluía 'cancelled' como
-- valor válido. Lo agregamos para que el botón "Cancelar hoja" funcione.
-- =====================================================

ALTER TABLE tt_sat_tickets DROP CONSTRAINT IF EXISTS tt_sat_tickets_status_check;

ALTER TABLE tt_sat_tickets ADD CONSTRAINT tt_sat_tickets_status_check
  CHECK (status IN (
    'abierto', 'en_proceso', 'esperando_repuesto', 'resuelto', 'cerrado', 'cancelado',
    'open', 'in_progress', 'waiting_parts', 'resolved', 'closed', 'cancelled'
  ));
