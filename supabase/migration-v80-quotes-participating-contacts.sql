-- ============================================================================
-- MIGRACIÓN v80 — Contactos participantes en cotizaciones
-- Aplicada: 2026-05-14
-- ============================================================================
-- Permite seleccionar varios contactos del cliente (tt_client_contacts)
-- como "participantes" de una cotización. Estilo StelOrder.
--
-- Uso:
--   1) En la card "Cliente" del cotizador, al seleccionar el cliente
--      aparecen sus contactos con checkboxes.
--   2) Al guardar, se persiste el array de UUIDs.
--   3) Al abrir "Enviar al cliente", el modal pre-carga los emails de
--      los contactos marcados como destinatarios TO.
--   4) En el PDF impreso, aparece "Atención: Nombre1, Nombre2".
-- ============================================================================

ALTER TABLE public.tt_quotes
  ADD COLUMN IF NOT EXISTS participating_contact_ids UUID[] DEFAULT NULL;

COMMENT ON COLUMN public.tt_quotes.participating_contact_ids IS
  'IDs de tt_client_contacts seleccionados como participantes/destinatarios de la cotización.';
