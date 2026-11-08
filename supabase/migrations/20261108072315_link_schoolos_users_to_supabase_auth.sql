-- Additive bridge from Supabase Auth identities to existing SchoolOS users.
-- Never rewrite public.users.id: many application tables reference that stable ID.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS auth_user_id uuid;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_auth_user_id_fkey'
      AND conrelid = 'public.users'::regclass
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_auth_user_id_fkey
      FOREIGN KEY (auth_user_id)
      REFERENCES auth.users(id)
      ON DELETE SET NULL;
  END IF;
END
$migration$;

CREATE UNIQUE INDEX IF NOT EXISTS users_auth_user_id_uidx
  ON public.users(auth_user_id)
  WHERE auth_user_id IS NOT NULL;

-- Backfill only exact UUID matches. No email/phone guessing and no new Auth users.
UPDATE public.users AS u
SET auth_user_id = a.id
FROM auth.users AS a
WHERE u.id = a.id::text
  AND u.auth_user_id IS NULL;

-- Existing RLS helpers use this function to resolve auth.uid() to the stable
-- SchoolOS public.users.id used by existing foreign keys and tenant policies.
CREATE OR REPLACE FUNCTION private.auth_user_id()
RETURNS character varying
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT COALESCE(
    (
      SELECT u.id
      FROM public.users AS u
      WHERE u.auth_user_id = auth.uid()
      LIMIT 1
    ),
    auth.uid()::text,
    pg_catalog.current_setting('request.jwt.claim.sub', true)
  );
$function$;

COMMENT ON COLUMN public.users.auth_user_id IS
  'Optional stable link to Supabase Auth. Keep public.users.id unchanged for SchoolOS relationships.';
