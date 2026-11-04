-- Protect the school library catalogue and keep writes behind validated server routes.
BEGIN;

ALTER TABLE public.library_books ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS library_books_school_read ON public.library_books;
CREATE POLICY library_books_school_read ON public.library_books
  FOR SELECT TO authenticated
  USING (auth_user_role() = 'super_admin' OR school_id::text = auth_school_id()::text);

DROP POLICY IF EXISTS library_books_school_scope ON public.library_books;
CREATE POLICY library_books_school_scope ON public.library_books AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (auth_user_role() = 'super_admin' OR
    (school_id::text = auth_school_id()::text AND
      auth_user_role() IN ('school_admin','accountant','teacher','parent','student')));

REVOKE ALL ON public.library_books FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.library_books TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
