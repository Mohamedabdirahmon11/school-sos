-- Let each school choose SMS or WhatsApp for automatic attendance alerts.
BEGIN;

ALTER TABLE public.communication_settings
  ADD COLUMN IF NOT EXISTS default_channel VARCHAR(20) NOT NULL DEFAULT 'sms';

ALTER TABLE public.communication_settings
  DROP CONSTRAINT IF EXISTS communication_settings_default_channel_check;

ALTER TABLE public.communication_settings
  ADD CONSTRAINT communication_settings_default_channel_check
  CHECK (default_channel IN ('sms', 'whatsapp'));

NOTIFY pgrst, 'reload schema';
COMMIT;
