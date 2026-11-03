-- Teacher sign-in identifiers are entered without a school code, so they must be globally unique.
-- Existing data was checked for duplicate non-empty staff IDs before this index was added.
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_staff_id_global
  ON public.users (lower(staff_id))
  WHERE staff_id IS NOT NULL AND btrim(staff_id) <> '';
