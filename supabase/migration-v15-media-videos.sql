-- =====================================================
-- Migration v15: permitir videos en bucket sat-photos
-- =====================================================

UPDATE storage.buckets
SET
  allowed_mime_types = ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
    'video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska'
  ],
  file_size_limit = 104857600  -- 100 MB por archivo (para videos)
WHERE id = 'sat-photos';
