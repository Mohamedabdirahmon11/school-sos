-- Reconcile legacy student rows against the school's current academic year.
-- This is deliberately additive and idempotent: no student, payment, invoice,
-- guardian, or historical enrollment row is deleted or overwritten.
BEGIN;

ALTER TABLE public.students
  ALTER COLUMN status SET DEFAULT 'active';

UPDATE public.students
   SET status = 'active'
 WHERE status IS NULL OR btrim(status) = '';

-- Restore missing parent contact columns only from explicitly related guardians.
-- Existing student phone values always win.
WITH father_contacts AS (
  SELECT DISTINCT ON (sg.school_id, sg.student_id)
         sg.school_id, sg.student_id, g.phone
    FROM public.student_guardians sg
    JOIN public.guardians g
      ON g.id = sg.guardian_id AND g.school_id = sg.school_id
   WHERE lower(sg.relation) = 'aabo'
   ORDER BY sg.school_id, sg.student_id, sg.is_primary DESC, sg.created_at, sg.guardian_id
)
UPDATE public.students s
   SET father_phone = fc.phone
  FROM father_contacts fc
 WHERE s.school_id = fc.school_id
   AND s.id = fc.student_id
   AND (s.father_phone IS NULL OR btrim(s.father_phone) = '');

WITH mother_contacts AS (
  SELECT DISTINCT ON (sg.school_id, sg.student_id)
         sg.school_id, sg.student_id, g.phone
    FROM public.student_guardians sg
    JOIN public.guardians g
      ON g.id = sg.guardian_id AND g.school_id = sg.school_id
   WHERE lower(sg.relation) = 'hooyo'
   ORDER BY sg.school_id, sg.student_id, sg.is_primary DESC, sg.created_at, sg.guardian_id
)
UPDATE public.students s
   SET mother_phone = mc.phone
  FROM mother_contacts mc
 WHERE s.school_id = mc.school_id
   AND s.id = mc.student_id
   AND (s.mother_phone IS NULL OR btrim(s.mother_phone) = '');

-- The original Step 8 backfill depended on a matching classes.academic_year.
-- Current-year assignment is authoritative; use the current school year even
-- when the legacy class's academic_year is stale. Never resurrect a student
-- who already has any enrollment record for that year.
WITH current_year AS (
  SELECT DISTINCT ON (school_id) school_id, id AS academic_year_id
    FROM public.academic_years
   WHERE is_current = true
   ORDER BY school_id, start_date DESC, created_at DESC, id DESC
)
INSERT INTO public.enrollments (
  school_id, student_id, academic_year_id, class_id, section_id,
  roll_number, status, enrolled_at
)
SELECT s.school_id,
       s.id,
       cy.academic_year_id,
       c.id,
       (
         SELECT cs.id
           FROM public.class_sections cs
          WHERE cs.school_id = s.school_id
            AND cs.legacy_class_id = c.id
            AND cs.name = COALESCE(NULLIF(btrim(s.section), ''), c.section)
          ORDER BY cs.sort_order, cs.id
          LIMIT 1
       ),
       s.roll_number,
       'active',
       COALESCE(s.admission_date::timestamptz, s.created_at, now())
  FROM public.students s
  JOIN current_year cy ON cy.school_id = s.school_id
  JOIN public.classes c ON c.id = s.class_id AND c.school_id = s.school_id
 WHERE lower(COALESCE(NULLIF(btrim(s.status), ''), 'active')) = 'active'
   AND NOT COALESCE(c.is_archived, false)
   AND NOT EXISTS (
     SELECT 1
       FROM public.enrollments e
      WHERE e.school_id = s.school_id
        AND e.student_id = s.id
        AND e.academic_year_id = cy.academic_year_id
   )
ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS fee_structures_school_active_class_grade_idx
  ON public.fee_structures (school_id, is_active, class_id, min_grade, max_grade);

NOTIFY pgrst, 'reload schema';
COMMIT;
