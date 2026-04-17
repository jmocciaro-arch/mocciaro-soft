-- =====================================================
-- Migration v13: SAT FEIN — fotos de activos y servicios
-- =====================================================
-- Agrega soporte para fotos:
--   1. tt_sat_assets.photos         — JSONB array con URLs de fotos del catalogo del activo
--   2. tt_sat_service_history.photos_in / photos_out — fotos de ingreso y egreso
--   3. Crea bucket 'sat-photos' en Supabase Storage con policies publicas read + authenticated write
-- =====================================================

-- 1) Fotos del activo (foto original, foto de catalogo, fotos generales)
ALTER TABLE tt_sat_assets
  ADD COLUMN IF NOT EXISTS photos JSONB DEFAULT '[]'::JSONB;

COMMENT ON COLUMN tt_sat_assets.photos IS 'Array de {url, caption, uploaded_at, uploaded_by} con fotos del activo';

-- 2) Fotos de ingreso y egreso en cada servicio
ALTER TABLE tt_sat_service_history
  ADD COLUMN IF NOT EXISTS photos_in JSONB DEFAULT '[]'::JSONB,
  ADD COLUMN IF NOT EXISTS photos_out JSONB DEFAULT '[]'::JSONB;

COMMENT ON COLUMN tt_sat_service_history.photos_in IS 'Fotos de ingreso al taller (como llego)';
COMMENT ON COLUMN tt_sat_service_history.photos_out IS 'Fotos de egreso del taller (como se fue)';

-- 3) Crear bucket sat-photos si no existe
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'sat-photos',
  'sat-photos',
  true,  -- publico para leer (las URLs van a producto/ticket)
  10485760,  -- 10MB por archivo
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 4) Policies para el bucket (cualquier autenticado puede upload/read/delete)
DROP POLICY IF EXISTS "sat_photos_authenticated_upload" ON storage.objects;
CREATE POLICY "sat_photos_authenticated_upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'sat-photos');

DROP POLICY IF EXISTS "sat_photos_authenticated_select" ON storage.objects;
CREATE POLICY "sat_photos_authenticated_select"
  ON storage.objects FOR SELECT
  TO authenticated, anon
  USING (bucket_id = 'sat-photos');

DROP POLICY IF EXISTS "sat_photos_authenticated_delete" ON storage.objects;
CREATE POLICY "sat_photos_authenticated_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'sat-photos');

DROP POLICY IF EXISTS "sat_photos_authenticated_update" ON storage.objects;
CREATE POLICY "sat_photos_authenticated_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'sat-photos')
  WITH CHECK (bucket_id = 'sat-photos');
