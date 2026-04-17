-- =====================================================
-- Migration v14: agregar pdf_url a tt_sat_service_history
-- =====================================================
-- Para almacenar el PDF asociado a cada servicio (notas de trabajo
-- viejas que se migran desde archivos PDF escaneados/generados).
-- =====================================================

ALTER TABLE tt_sat_service_history
  ADD COLUMN IF NOT EXISTS pdf_url TEXT,
  ADD COLUMN IF NOT EXISTS ntt_number TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT;

COMMENT ON COLUMN tt_sat_service_history.pdf_url IS 'URL al PDF de la nota de trabajo firmada';
COMMENT ON COLUMN tt_sat_service_history.ntt_number IS 'Numero de nota de trabajo origen (NTT00027, etc.)';
COMMENT ON COLUMN tt_sat_service_history.source IS 'Origen: fein_legacy_import / workflow / manual';

-- Bucket para PDFs
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'sat-pdfs',
  'sat-pdfs',
  true,
  20971520,  -- 20MB
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "sat_pdfs_authenticated_upload" ON storage.objects;
CREATE POLICY "sat_pdfs_authenticated_upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'sat-pdfs');

DROP POLICY IF EXISTS "sat_pdfs_authenticated_select" ON storage.objects;
CREATE POLICY "sat_pdfs_authenticated_select"
  ON storage.objects FOR SELECT
  TO authenticated, anon
  USING (bucket_id = 'sat-pdfs');

DROP POLICY IF EXISTS "sat_pdfs_authenticated_delete" ON storage.objects;
CREATE POLICY "sat_pdfs_authenticated_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'sat-pdfs');
