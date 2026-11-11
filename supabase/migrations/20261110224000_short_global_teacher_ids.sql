-- Shorten existing teacher login IDs to simple T001-style identifiers.
-- Teacher IDs are global login identifiers, so numbering is global (not per school).
-- The users.staff_id unique index remains in force throughout the reassignment.
UPDATE public.users
SET staff_id = NULL
WHERE role = 'teacher'
  AND id IN (SELECT user_id FROM public.teachers WHERE user_id IS NOT NULL);

UPDATE public.teachers
SET staff_id = NULL
WHERE user_id IN (SELECT id FROM public.users WHERE role = 'teacher');

DO $$
DECLARE
  teacher_account RECORD;
  candidate_id TEXT;
  next_number INTEGER := 1;
BEGIN
  FOR teacher_account IN
    SELECT u.id AS user_id
    FROM public.users u
    WHERE u.role = 'teacher'
      AND EXISTS (SELECT 1 FROM public.teachers t WHERE t.user_id = u.id)
    ORDER BY u.created_at NULLS FIRST, u.id
  LOOP
    LOOP
      candidate_id := 'T' || CASE
        WHEN next_number < 1000 THEN lpad(next_number::TEXT, 3, '0')
        ELSE next_number::TEXT
      END;
      next_number := next_number + 1;
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM public.users u
        WHERE lower(u.staff_id) = lower(candidate_id)
      );
    END LOOP;

    UPDATE public.users
    SET staff_id = candidate_id
    WHERE id = teacher_account.user_id
      AND role = 'teacher';

    UPDATE public.teachers
    SET staff_id = candidate_id
    WHERE user_id = teacher_account.user_id;
  END LOOP;
END
$$;
