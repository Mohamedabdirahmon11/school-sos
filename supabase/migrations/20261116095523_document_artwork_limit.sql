-- Increase the private document artwork image limit to the documented 10 MB cap.
UPDATE storage.buckets
SET file_size_limit=10485760,
    allowed_mime_types=ARRAY['image/png','image/jpeg','image/webp']::text[]
WHERE id='school-document-images' AND public=false;
NOTIFY pgrst,'reload schema';
