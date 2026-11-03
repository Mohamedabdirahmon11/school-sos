ALTER TABLE public.users ADD COLUMN IF NOT EXISTS staff_id VARCHAR(40);
UPDATE public.users SET staff_id = 'STF-' || upper(substr(md5(school_id || ':' || id), 1, 10))
  WHERE staff_id IS NULL AND school_id IS NOT NULL AND role IN ('school_admin','teacher','accountant');
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_school_staff_id ON public.users(school_id, lower(staff_id)) WHERE staff_id IS NOT NULL;
ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS staff_id VARCHAR(40);
UPDATE public.teachers t SET staff_id = u.staff_id FROM public.users u WHERE t.user_id = u.id AND t.staff_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_teachers_school_staff_id ON public.teachers(school_id, lower(staff_id)) WHERE staff_id IS NOT NULL;
ALTER TABLE public.staff_members ADD COLUMN IF NOT EXISTS staff_id VARCHAR(40);
UPDATE public.staff_members s SET staff_id = COALESCE(u.staff_id, 'STF-' || upper(substr(md5(s.school_id || ':' || s.id), 1, 10)))
  FROM public.users u WHERE s.user_id = u.id AND s.staff_id IS NULL;
UPDATE public.staff_members SET staff_id = 'STF-' || upper(substr(md5(school_id || ':' || id), 1, 10)) WHERE staff_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_members_school_staff_id ON public.staff_members(school_id, lower(staff_id));
NOTIFY pgrst, 'reload schema';
