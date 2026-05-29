ALTER TABLE public.tt_quotes
  ADD COLUMN IF NOT EXISTS participating_contact_ids UUID[] DEFAULT NULL;

COMMENT ON COLUMN public.tt_quotes.participating_contact_ids IS
  'IDs de tt_client_contacts seleccionados como participantes/destinatarios de la cotización. Se usan para pre-cargar destinatarios en el modal de envío y para mostrar en el PDF como "Atención: ...".';
