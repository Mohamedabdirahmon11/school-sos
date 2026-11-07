-- Email-only password reset support for super admins, school admins, and accountants.
-- Requests for unknown/ineligible emails are stored as rate-limit markers with no user or code hash.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.password_reset_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT REFERENCES public.users(id) ON DELETE CASCADE,
  code_hash TEXT,
  request_email_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  request_ip TEXT
);

CREATE INDEX IF NOT EXISTS idx_password_reset_codes_user_id
  ON public.password_reset_codes (user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_codes_expires_at
  ON public.password_reset_codes (expires_at);
CREATE INDEX IF NOT EXISTS idx_password_reset_codes_email_hash_created
  ON public.password_reset_codes (request_email_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_password_reset_codes_ip_created
  ON public.password_reset_codes (request_ip, created_at DESC);

ALTER TABLE public.password_reset_codes ENABLE ROW LEVEL SECURITY;

-- No anon/authenticated policies: this table is accessed only by the server service role.
REVOKE ALL ON TABLE public.password_reset_codes FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.password_reset_codes TO service_role;

COMMENT ON TABLE public.password_reset_codes IS
  'Server-only password reset codes and privacy-preserving request markers. Code values are never stored in plaintext.';
COMMENT ON COLUMN public.password_reset_codes.request_email_hash IS
  'HMAC-SHA256 of the normalized email, used for per-email rate limiting without storing the address.';
COMMENT ON COLUMN public.users.password_changed_at IS
  'Password reset/version timestamp included in signed sessions to invalidate cookies issued before a password change.';
