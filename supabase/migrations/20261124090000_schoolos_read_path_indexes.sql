-- Read-path indexes for the real SchoolOS marks and attendance schema.
-- Additive and idempotent. Existing primary/unique/composite indexes are retained.
-- The production student_marks table is keyed by class/year/semester (not exam_id).

CREATE INDEX IF NOT EXISTS idx_student_marks_school_class_year_student_term
  ON public.student_marks (school_id, class_id, academic_year, student_id, semester);

CREATE INDEX IF NOT EXISTS idx_attendance_school_student_date
  ON public.attendance_records (school_id, student_id, date);
