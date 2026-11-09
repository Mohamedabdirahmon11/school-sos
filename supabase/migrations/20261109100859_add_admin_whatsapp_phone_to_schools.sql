-- Store the administrator's WhatsApp contact separately from the school's public telephone.
-- Existing schools keep their current phone values; the new contact remains unset until configured.
BEGIN;
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS whatsapp_phone VARCHAR(50);
COMMENT ON COLUMN public.schools.whatsapp_phone IS
  'Dedicated international WhatsApp number used by the school administrator for manually messaging parents.';
COMMIT;
