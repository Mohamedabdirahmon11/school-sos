-- Idempotency log for subscription expiry reminder emails (server-only).
CREATE TABLE IF NOT EXISTS public.subscription_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id VARCHAR(64) NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  stage TEXT NOT NULL CHECK (stage IN ('before_7','before_3','before_1','grace','read_only')),
  valid_until TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, stage, valid_until)
);

CREATE INDEX IF NOT EXISTS idx_subscription_reminders_school_id
  ON public.subscription_reminders (school_id);

ALTER TABLE public.subscription_reminders ENABLE ROW LEVEL SECURITY;

-- No anon/authenticated policies: accessed only by the server service role.
REVOKE ALL ON TABLE public.subscription_reminders FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.subscription_reminders TO service_role;

COMMENT ON TABLE public.subscription_reminders IS
  'One row per reminder email stage sent for a school subscription period; the unique key prevents duplicate sends.';
