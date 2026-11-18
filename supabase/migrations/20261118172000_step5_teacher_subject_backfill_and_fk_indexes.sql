-- Step 5 follow-up: preserve legacy teacher subject links and cover composite foreign keys.
CREATE INDEX IF NOT EXISTS idx_teacher_subjects_teacher_school_fk
  ON public.teacher_subjects (teacher_id, school_id);
CREATE INDEX IF NOT EXISTS idx_teacher_subjects_subject_school_fk
  ON public.teacher_subjects (subject_id, school_id);

INSERT INTO public.teacher_subjects (school_id, teacher_id, subject_id)
SELECT DISTINCT t.school_id, t.id, s.id
FROM public.teachers t
CROSS JOIN LATERAL unnest(COALESCE(t.assigned_subjects, ARRAY[]::text[])) AS legacy(subject_ref)
JOIN public.subjects s
  ON s.school_id = t.school_id
 AND (s.id = legacy.subject_ref OR s.name = legacy.subject_ref)
ON CONFLICT (teacher_id, subject_id) DO UPDATE SET is_active = true;
