-- Library lending and returns with tenant-bound references and concurrency-safe copy limits.
BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS idx_library_books_id_school_unique ON public.library_books(id, school_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_students_id_school_unique ON public.students(id, school_id);

CREATE TABLE IF NOT EXISTS public.library_loans (
  id VARCHAR(64) PRIMARY KEY,
  school_id VARCHAR(64) NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  book_id VARCHAR(64) NOT NULL,
  student_id VARCHAR(64) NOT NULL,
  due_date DATE NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  issued_by VARCHAR(64) NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  status VARCHAR(20) NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'returned')),
  returned_at TIMESTAMPTZ,
  returned_by VARCHAR(64) REFERENCES public.users(id) ON DELETE RESTRICT,
  CONSTRAINT library_loans_book_school_fk FOREIGN KEY (book_id, school_id)
    REFERENCES public.library_books(id, school_id) ON DELETE RESTRICT,
  CONSTRAINT library_loans_student_school_fk FOREIGN KEY (student_id, school_id)
    REFERENCES public.students(id, school_id) ON DELETE RESTRICT,
  CONSTRAINT library_loans_return_state_check CHECK (
    (status = 'issued' AND returned_at IS NULL AND returned_by IS NULL) OR
    (status = 'returned' AND returned_at IS NOT NULL AND returned_by IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_library_loans_school_status_due ON public.library_loans(school_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_library_loans_book_status ON public.library_loans(book_id, school_id, status);
CREATE INDEX IF NOT EXISTS idx_library_loans_student ON public.library_loans(student_id, school_id);

ALTER TABLE public.library_loans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS library_loans_tenant_scope ON public.library_loans;
CREATE POLICY library_loans_tenant_scope ON public.library_loans FOR ALL TO authenticated
  USING (private.auth_user_role() = 'super_admin' OR school_id = private.auth_school_id())
  WITH CHECK (private.auth_user_role() = 'super_admin' OR school_id = private.auth_school_id());
DROP POLICY IF EXISTS library_loans_admin_select ON public.library_loans;
CREATE POLICY library_loans_admin_select ON public.library_loans AS RESTRICTIVE FOR SELECT TO authenticated
  USING (private.auth_user_role() IN ('school_admin', 'super_admin'));
DROP POLICY IF EXISTS library_loans_admin_insert ON public.library_loans;
CREATE POLICY library_loans_admin_insert ON public.library_loans AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (private.auth_user_role() IN ('school_admin', 'super_admin') AND issued_by = private.auth_user_id());
DROP POLICY IF EXISTS library_loans_admin_update ON public.library_loans;
CREATE POLICY library_loans_admin_update ON public.library_loans AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (private.auth_user_role() IN ('school_admin', 'super_admin'))
  WITH CHECK (private.auth_user_role() IN ('school_admin', 'super_admin') AND returned_by = private.auth_user_id());
DROP POLICY IF EXISTS library_loans_admin_delete ON public.library_loans;
CREATE POLICY library_loans_admin_delete ON public.library_loans AS RESTRICTIVE FOR DELETE TO authenticated
  USING (private.auth_user_role() IN ('school_admin', 'super_admin'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_loans TO authenticated, service_role;

-- Keep lending copies consistent even when two issue requests race.
CREATE OR REPLACE FUNCTION private.enforce_library_loan_integrity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  available_total integer;
  active_count integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'issued' OR NEW.returned_at IS NOT NULL OR NEW.returned_by IS NOT NULL THEN
      RAISE EXCEPTION 'New library loans must start as issued.';
    END IF;
    SELECT quantity INTO available_total
      FROM public.library_books
      WHERE id = NEW.book_id AND school_id = NEW.school_id
      FOR UPDATE;
    IF available_total IS NULL THEN
      RAISE EXCEPTION 'Library book does not belong to this school.';
    END IF;
    SELECT count(*) INTO active_count
      FROM public.library_loans
      WHERE book_id = NEW.book_id AND school_id = NEW.school_id AND status = 'issued';
    IF active_count >= available_total THEN
      RAISE EXCEPTION 'No available copies of this book.';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status <> 'issued' OR NEW.status <> 'returned' OR
     NEW.school_id <> OLD.school_id OR NEW.book_id <> OLD.book_id OR
     NEW.student_id <> OLD.student_id OR NEW.due_date <> OLD.due_date OR
     NEW.issued_at <> OLD.issued_at OR NEW.issued_by <> OLD.issued_by OR
     NEW.returned_at IS NULL OR NEW.returned_by IS NULL THEN
    RAISE EXCEPTION 'A library loan can only transition once from issued to returned.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS library_loans_integrity_trigger ON library_loans;
CREATE TRIGGER library_loans_integrity_trigger
BEFORE INSERT OR UPDATE ON library_loans
FOR EACH ROW EXECUTE FUNCTION private.enforce_library_loan_integrity();

CREATE OR REPLACE FUNCTION private.prevent_library_quantity_below_loans()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  active_count integer;
BEGIN
  IF NEW.quantity < OLD.quantity THEN
    SELECT count(*) INTO active_count
      FROM public.library_loans
      WHERE book_id = OLD.id AND school_id = OLD.school_id AND status = 'issued';
    IF NEW.quantity < active_count THEN
      RAISE EXCEPTION 'Book quantity cannot be lower than the number of active loans.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS library_books_quantity_guard ON library_books;
CREATE TRIGGER library_books_quantity_guard
BEFORE UPDATE OF quantity ON library_books
FOR EACH ROW EXECUTE FUNCTION private.prevent_library_quantity_below_loans();


NOTIFY pgrst, 'reload schema';
COMMIT;
