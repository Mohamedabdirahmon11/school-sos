-- Step 6 follow-up: remove redundant indexes and cover composite foreign keys.
DROP INDEX IF EXISTS public.academic_years_id_school_id_uidx;
DROP INDEX IF EXISTS public.terms_id_school_id_uidx;
CREATE INDEX IF NOT EXISTS teacher_assignments_class_school_idx ON public.teacher_class_subject_assignments (class_id, school_id);
CREATE INDEX IF NOT EXISTS teacher_assignments_section_school_idx ON public.teacher_class_subject_assignments (section_id, school_id) WHERE section_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS teacher_assignments_subject_school_idx ON public.teacher_class_subject_assignments (subject_id, school_id);
CREATE INDEX IF NOT EXISTS teacher_assignments_term_year_school_idx ON public.teacher_class_subject_assignments (term_id, academic_year_id, school_id) WHERE term_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS teacher_assignments_year_school_idx ON public.teacher_class_subject_assignments (academic_year_id, school_id);
