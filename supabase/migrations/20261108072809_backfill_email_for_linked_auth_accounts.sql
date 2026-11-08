-- Fill only missing profile emails from an already-linked Auth identity.
-- Existing non-empty SchoolOS emails are never overwritten.
UPDATE public.users AS u
SET email = a.email
FROM auth.users AS a
WHERE u.auth_user_id = a.id
  AND u.email IS NULL
  AND a.email IS NOT NULL;
