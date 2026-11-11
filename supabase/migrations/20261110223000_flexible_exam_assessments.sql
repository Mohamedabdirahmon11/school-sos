-- Flexible school-defined assessment structure (e.g. four 10-mark tests + a 60-mark final).
-- Preserve legacy marks exactly; only untouched default configurations with no marks
-- are upgraded to the requested 40 + 60 template.
ALTER TABLE public.exam_configs
  ADD COLUMN IF NOT EXISTS assessment_components jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.student_marks
  ADD COLUMN IF NOT EXISTS assessment_scores jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Preserve every existing mark row under stable legacy component keys.
UPDATE public.student_marks
SET assessment_scores = jsonb_build_object(
  'legacy-small', COALESCE(small_exam_marks, 0),
  'legacy-big', COALESCE(big_exam_marks, 0)
)
WHERE assessment_scores = '{}'::jsonb;

-- Existing configurations with recorded marks retain their original two-part structure.
UPDATE public.exam_configs ec
SET assessment_components = jsonb_build_array(
  jsonb_build_object(
    'id', 'legacy-small', 'name', ec.small_exam_name,
    'maxMarks', ec.small_exam_max, 'category', 'continuous', 'order', 1
  ),
  jsonb_build_object(
    'id', 'legacy-big', 'name', ec.big_exam_name,
    'maxMarks', ec.big_exam_max, 'category', 'final', 'order', 2
  )
)
WHERE EXISTS (
  SELECT 1 FROM public.student_marks sm
  WHERE sm.school_id = ec.school_id AND sm.academic_year = ec.academic_year
);

-- Upgrade untouched default configurations with no recorded marks to the
-- four continuous tests (10 each) plus one final examination (60).
UPDATE public.exam_configs ec
SET small_exam_name = 'Continuous Assessment',
    small_exam_max = 40,
    big_exam_name = 'Final Examination',
    big_exam_max = 60,
    assessment_components = jsonb_build_array(
      jsonb_build_object('id', 'test-1', 'name', 'Test 1', 'maxMarks', 10, 'category', 'continuous', 'order', 1),
      jsonb_build_object('id', 'test-2', 'name', 'Test 2', 'maxMarks', 10, 'category', 'continuous', 'order', 2),
      jsonb_build_object('id', 'test-3', 'name', 'Test 3', 'maxMarks', 10, 'category', 'continuous', 'order', 3),
      jsonb_build_object('id', 'test-4', 'name', 'Test 4', 'maxMarks', 10, 'category', 'continuous', 'order', 4),
      jsonb_build_object('id', 'final-exam', 'name', 'Final Examination', 'maxMarks', 60, 'category', 'final', 'order', 5)
    )
WHERE ec.small_exam_name = 'Small Exam'
  AND ec.small_exam_max = 10
  AND ec.big_exam_name = 'Big Exam'
  AND ec.big_exam_max = 10
  AND NOT EXISTS (
    SELECT 1 FROM public.student_marks sm
    WHERE sm.school_id = ec.school_id AND sm.academic_year = ec.academic_year
  );

-- Any other configuration without marks is represented faithfully as two legacy components.
UPDATE public.exam_configs ec
SET assessment_components = jsonb_build_array(
  jsonb_build_object(
    'id', 'legacy-small', 'name', ec.small_exam_name,
    'maxMarks', ec.small_exam_max, 'category', 'continuous', 'order', 1
  ),
  jsonb_build_object(
    'id', 'legacy-big', 'name', ec.big_exam_name,
    'maxMarks', ec.big_exam_max, 'category', 'final', 'order', 2
  )
)
WHERE ec.assessment_components = '[]'::jsonb;
