-- Enforce non-negative catalogue quantity and school-local ISBN uniqueness.
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.library_books'::regclass
      AND conname = 'library_books_quantity_nonnegative'
  ) THEN
    ALTER TABLE public.library_books
      ADD CONSTRAINT library_books_quantity_nonnegative CHECK (quantity >= 0);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_library_books_school_isbn_unique
  ON public.library_books(school_id, lower(btrim(isbn)))
  WHERE isbn IS NOT NULL AND btrim(isbn) <> '';

NOTIFY pgrst, 'reload schema';
COMMIT;
