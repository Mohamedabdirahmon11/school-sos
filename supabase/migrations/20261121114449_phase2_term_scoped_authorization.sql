-- Phase 2: bind legacy marks to the academic term and enforce server-side role/tenant boundaries.
-- All changes are additive or policy/function replacements; no student/marks/payment rows are deleted.

CREATE OR REPLACE FUNCTION private.auth_has_term_assignment(
  p_school_id text,
  p_class_id text,
  p_subject_id text,
  p_term_id uuid,
  p_student_id text DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    JOIN public.teachers t
      ON t.user_id = u.id
     AND t.school_id = u.school_id
     AND lower(t.status) = 'active'
    JOIN public.teacher_class_subject_assignments a
      ON a.teacher_id = t.id
     AND a.school_id = t.school_id
    JOIN public.terms tr
      ON tr.id = p_term_id
     AND tr.school_id = p_school_id
     AND tr.academic_year_id = a.academic_year_id
    LEFT JOIN public.enrollments e
      ON e.school_id = p_school_id
     AND e.student_id = p_student_id
     AND e.class_id = p_class_id
     AND e.academic_year_id = tr.academic_year_id
     AND e.status = 'active'
    WHERE u.id = private.auth_user_id()
      AND u.role = 'teacher'
      AND u.school_id = p_school_id
      AND a.class_id = p_class_id
      AND a.subject_id = p_subject_id
      AND (a.term_id IS NULL OR a.term_id = p_term_id)
      AND (p_student_id IS NULL OR a.section_id IS NULL OR a.section_id = e.section_id)
  );
$function$;

CREATE OR REPLACE FUNCTION private.schoolos_sync_student_mark_term()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_term_id uuid;
BEGIN
  SELECT t.id
    INTO v_term_id
    FROM public.academic_years ay
    JOIN public.terms t
      ON t.academic_year_id = ay.id
     AND t.school_id = ay.school_id
   WHERE ay.school_id = NEW.school_id
     AND ay.name = NEW.academic_year
     AND t.name = NEW.semester
   LIMIT 1;

  IF v_term_id IS NULL THEN
    RAISE EXCEPTION 'The selected academic year and semester are not configured for this school.';
  END IF;

  NEW.term_id := v_term_id;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.schoolos_sync_student_mark_term() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS student_marks_sync_term ON public.student_marks;
CREATE TRIGGER student_marks_sync_term
  BEFORE INSERT OR UPDATE OF school_id, academic_year, semester
  ON public.student_marks
  FOR EACH ROW
  EXECUTE FUNCTION private.schoolos_sync_student_mark_term();

UPDATE public.student_marks sm
   SET term_id = t.id
  FROM public.academic_years ay
  JOIN public.terms t
    ON t.academic_year_id = ay.id
   AND t.school_id = ay.school_id
 WHERE sm.term_id IS NULL
   AND sm.school_id = ay.school_id
   AND sm.academic_year = ay.name
   AND sm.semester = t.name;

CREATE INDEX IF NOT EXISTS student_marks_school_term_class_subject_student_idx
  ON public.student_marks (school_id, term_id, class_id, subject_id, student_id);

ALTER POLICY marks_role_read ON public.student_marks
USING (
  (private.auth_user_role())::text IN ('school_admin', 'accountant', 'super_admin')
  OR (
    (private.auth_user_role())::text = 'teacher'
    AND (
      EXISTS (
        SELECT 1 FROM public.classes c
         WHERE c.id = student_marks.class_id
           AND c.school_id = student_marks.school_id
           AND c.class_teacher_id = private.auth_user_id()
      )
      OR private.auth_has_term_assignment(
        student_marks.school_id::text,
        student_marks.class_id::text,
        student_marks.subject_id::text,
        student_marks.term_id,
        student_marks.student_id::text
      )
    )
  )
  OR (
    (private.auth_user_role())::text IN ('parent', 'student')
    AND private.auth_can_access_student(student_id)
    AND status = 'approved'::public.mark_status_enum
    AND published_at IS NOT NULL
  )
);

DROP POLICY IF EXISTS student_marks_teacher_insert ON public.student_marks;
CREATE POLICY student_marks_teacher_insert
  ON public.student_marks AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (
    (private.auth_user_role())::text = 'teacher'
    AND submitted_by = private.auth_user_id()
    AND status IN ('draft'::public.mark_status_enum, 'submitted'::public.mark_status_enum)
    AND term_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.term_status ts
       WHERE ts.school_id = student_marks.school_id
         AND ts.term_id = student_marks.term_id
         AND ts.status = 'open'
    )
    AND private.auth_has_term_assignment(
      school_id::text, class_id::text, subject_id::text, term_id, student_id::text
    )
  );

DROP POLICY IF EXISTS student_marks_teacher_update ON public.student_marks;
CREATE POLICY student_marks_teacher_update
  ON public.student_marks AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (
    (private.auth_user_role())::text = 'teacher'
    AND submitted_by = private.auth_user_id()
    AND status = 'draft'::public.mark_status_enum
    AND term_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.term_status ts
       WHERE ts.school_id = student_marks.school_id
         AND ts.term_id = student_marks.term_id
         AND ts.status = 'open'
    )
    AND private.auth_has_term_assignment(
      school_id::text, class_id::text, subject_id::text, term_id, student_id::text
    )
  )
  WITH CHECK (
    (private.auth_user_role())::text = 'teacher'
    AND submitted_by = private.auth_user_id()
    AND status IN ('draft'::public.mark_status_enum, 'submitted'::public.mark_status_enum)
    AND term_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.term_status ts
       WHERE ts.school_id = student_marks.school_id
         AND ts.term_id = student_marks.term_id
         AND ts.status = 'open'
    )
    AND private.auth_has_term_assignment(
      school_id::text, class_id::text, subject_id::text, term_id, student_id::text
    )
  );

DROP POLICY IF EXISTS student_marks_no_direct_delete ON public.student_marks;
CREATE POLICY student_marks_no_direct_delete
  ON public.student_marks AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING (false);

ALTER POLICY attendance_role_read ON public.attendance_records
USING (
  (private.auth_user_role())::text IN ('school_admin', 'super_admin')
  OR (
    (private.auth_user_role())::text = 'teacher'
    AND EXISTS (
      SELECT 1 FROM public.classes c
       WHERE c.id = attendance_records.class_id
         AND c.school_id = attendance_records.school_id
         AND c.class_teacher_id = private.auth_user_id()
    )
  )
  OR (
    (private.auth_user_role())::text IN ('parent', 'student')
    AND private.auth_can_access_student(student_id)
  )
);

DROP POLICY IF EXISTS attendance_form_teacher_insert ON public.attendance_records;
CREATE POLICY attendance_form_teacher_insert
  ON public.attendance_records AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (
    (private.auth_user_role())::text = 'teacher'
    AND recorded_by = private.auth_user_id()
    AND EXISTS (
      SELECT 1 FROM public.classes c
       WHERE c.id = attendance_records.class_id
         AND c.school_id = attendance_records.school_id
         AND c.class_teacher_id = private.auth_user_id()
    )
    AND EXISTS (
      SELECT 1 FROM public.students s
       WHERE s.id = attendance_records.student_id
         AND s.school_id = attendance_records.school_id
         AND s.class_id = attendance_records.class_id
    )
  );

DROP POLICY IF EXISTS attendance_form_teacher_update ON public.attendance_records;
CREATE POLICY attendance_form_teacher_update
  ON public.attendance_records AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (
    (private.auth_user_role())::text = 'teacher'
    AND EXISTS (
      SELECT 1 FROM public.classes c
       WHERE c.id = attendance_records.class_id
         AND c.school_id = attendance_records.school_id
         AND c.class_teacher_id = private.auth_user_id()
    )
  )
  WITH CHECK (
    (private.auth_user_role())::text = 'teacher'
    AND recorded_by = private.auth_user_id()
    AND EXISTS (
      SELECT 1 FROM public.classes c
       WHERE c.id = attendance_records.class_id
         AND c.school_id = attendance_records.school_id
         AND c.class_teacher_id = private.auth_user_id()
    )
    AND EXISTS (
      SELECT 1 FROM public.students s
       WHERE s.id = attendance_records.student_id
         AND s.school_id = attendance_records.school_id
         AND s.class_id = attendance_records.class_id
    )
  );

DROP POLICY IF EXISTS attendance_no_direct_delete ON public.attendance_records;
CREATE POLICY attendance_no_direct_delete
  ON public.attendance_records AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING (false);

ALTER POLICY timetable_role_read ON public.timetable_slots
USING (
  (private.auth_user_role())::text IN ('school_admin', 'super_admin')
  OR (
    (private.auth_user_role())::text = 'teacher'
    AND (
      EXISTS (
        SELECT 1 FROM public.teachers t
         WHERE t.id = timetable_slots.teacher_id
           AND t.school_id = timetable_slots.school_id
           AND t.user_id = private.auth_user_id()
           AND lower(t.status) = 'active'
      )
      OR EXISTS (
        SELECT 1 FROM public.classes c
         WHERE c.id = timetable_slots.class_id
           AND c.school_id = timetable_slots.school_id
           AND c.class_teacher_id = private.auth_user_id()
      )
    )
  )
  OR (
    (private.auth_user_role())::text IN ('parent', 'student')
    AND private.auth_can_access_class(class_id)
  )
);

DROP POLICY IF EXISTS timetable_admin_insert_guard ON public.timetable_slots;
CREATE POLICY timetable_admin_insert_guard
  ON public.timetable_slots AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK ((private.auth_user_role())::text IN ('school_admin', 'super_admin'));

DROP POLICY IF EXISTS timetable_admin_update_guard ON public.timetable_slots;
CREATE POLICY timetable_admin_update_guard
  ON public.timetable_slots AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING ((private.auth_user_role())::text IN ('school_admin', 'super_admin'))
  WITH CHECK ((private.auth_user_role())::text IN ('school_admin', 'super_admin'));

DROP POLICY IF EXISTS timetable_admin_delete_guard ON public.timetable_slots;
CREATE POLICY timetable_admin_delete_guard
  ON public.timetable_slots AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING ((private.auth_user_role())::text IN ('school_admin', 'super_admin'));

DROP POLICY IF EXISTS enrollments_admin_insert_guard ON public.enrollments;
CREATE POLICY enrollments_admin_insert_guard
  ON public.enrollments AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK ((private.auth_user_role())::text IN ('school_admin', 'super_admin'));

DROP POLICY IF EXISTS enrollments_admin_update_guard ON public.enrollments;
CREATE POLICY enrollments_admin_update_guard
  ON public.enrollments AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING ((private.auth_user_role())::text IN ('school_admin', 'super_admin'))
  WITH CHECK ((private.auth_user_role())::text IN ('school_admin', 'super_admin'));

DROP POLICY IF EXISTS enrollments_no_direct_delete ON public.enrollments;
CREATE POLICY enrollments_no_direct_delete
  ON public.enrollments AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING (false);

CREATE OR REPLACE FUNCTION private.auth_has_staff_permission(p_permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.users u
      JOIN public.staff_members s
        ON s.user_id = u.id
       AND s.school_id = u.school_id
     WHERE u.id = private.auth_user_id()
       AND u.role = 'accountant'
       AND u.school_id = private.auth_school_id()
       AND s.status = 'active'
       AND p_permission = ANY(COALESCE(s.permissions, ARRAY[]::text[]))
  );
$function$;
REVOKE ALL ON FUNCTION private.auth_has_staff_permission(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.auth_has_staff_permission(text) TO authenticated;

ALTER POLICY fees_role_read ON public.fee_payments
USING (
  (private.auth_user_role())::text IN ('school_admin', 'super_admin')
  OR (
    (private.auth_user_role())::text = 'accountant'
    AND private.auth_has_staff_permission('fees_manage')
  )
  OR (
    (private.auth_user_role())::text IN ('parent', 'student')
    AND private.auth_can_access_student(student_id)
  )
);

DROP POLICY IF EXISTS fee_payments_staff_insert_guard ON public.fee_payments;
CREATE POLICY fee_payments_staff_insert_guard
  ON public.fee_payments AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (
    (private.auth_user_role())::text IN ('school_admin', 'super_admin')
    OR ((private.auth_user_role())::text = 'accountant' AND private.auth_has_staff_permission('fees_manage'))
  );

DROP POLICY IF EXISTS fee_payments_staff_update_guard ON public.fee_payments;
CREATE POLICY fee_payments_staff_update_guard
  ON public.fee_payments AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (
    (private.auth_user_role())::text IN ('school_admin', 'super_admin')
    OR ((private.auth_user_role())::text = 'accountant' AND private.auth_has_staff_permission('fees_manage'))
  )
  WITH CHECK (
    (private.auth_user_role())::text IN ('school_admin', 'super_admin')
    OR ((private.auth_user_role())::text = 'accountant' AND private.auth_has_staff_permission('fees_manage'))
  );

DROP POLICY IF EXISTS fee_payments_no_direct_delete ON public.fee_payments;
CREATE POLICY fee_payments_no_direct_delete
  ON public.fee_payments AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING (false);

DROP POLICY IF EXISTS student_invoices_role_read_guard ON public.student_invoices;
CREATE POLICY student_invoices_role_read_guard
  ON public.student_invoices AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (
    (private.auth_user_role())::text IN ('school_admin', 'super_admin')
    OR ((private.auth_user_role())::text = 'accountant' AND private.auth_has_staff_permission('fees_manage'))
    OR ((private.auth_user_role())::text IN ('parent', 'student') AND private.auth_can_access_student(student_id))
  );

DROP POLICY IF EXISTS student_invoices_staff_insert_guard ON public.student_invoices;
CREATE POLICY student_invoices_staff_insert_guard
  ON public.student_invoices AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (
    (private.auth_user_role())::text IN ('school_admin', 'super_admin')
    OR ((private.auth_user_role())::text = 'accountant' AND private.auth_has_staff_permission('fees_manage'))
  );

DROP POLICY IF EXISTS student_invoices_staff_update_guard ON public.student_invoices;
CREATE POLICY student_invoices_staff_update_guard
  ON public.student_invoices AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (
    (private.auth_user_role())::text IN ('school_admin', 'super_admin')
    OR ((private.auth_user_role())::text = 'accountant' AND private.auth_has_staff_permission('fees_manage'))
  )
  WITH CHECK (
    (private.auth_user_role())::text IN ('school_admin', 'super_admin')
    OR ((private.auth_user_role())::text = 'accountant' AND private.auth_has_staff_permission('fees_manage'))
  );

DROP POLICY IF EXISTS student_invoices_no_direct_delete ON public.student_invoices;
CREATE POLICY student_invoices_no_direct_delete
  ON public.student_invoices AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING (false);

NOTIFY pgrst, 'reload schema';
