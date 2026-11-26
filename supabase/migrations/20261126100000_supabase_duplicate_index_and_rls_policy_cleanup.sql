-- Reduce avoidable write overhead and duplicate SELECT policy evaluation.
-- Preserve every existing authorization predicate and tenant guard.

BEGIN;

-- Remove exact duplicate, non-constraint-backed indexes only.
-- The retained indexes below are the ones referenced by constraints.
DROP INDEX IF EXISTS public.academic_years_id_school_uidx;
DROP INDEX IF EXISTS public.idx_attendance_student;
DROP INDEX IF EXISTS public.class_sections_id_school_uidx;
DROP INDEX IF EXISTS public.classes_id_school_id_uidx;
DROP INDEX IF EXISTS public.classes_id_school_uidx;
DROP INDEX IF EXISTS public.students_id_school_uidx;
DROP INDEX IF EXISTS public.subjects_id_school_id_uidx;
DROP INDEX IF EXISTS public.subjects_id_school_uidx;
DROP INDEX IF EXISTS public.terms_id_school_uidx;

-- Cache role helper evaluation per statement and keep the admin SELECT
-- predicate in the existing read policy so SELECT is evaluated only once.
DROP POLICY IF EXISTS mark_components_read ON public.mark_components;
CREATE POLICY mark_components_read ON public.mark_components FOR SELECT TO authenticated
USING (((SELECT private.auth_user_role())::text = 'super_admin') OR ((SELECT private.auth_user_role())::text = 'school_admin' AND school_id = (SELECT private.auth_school_id())) OR EXISTS (
  SELECT 1 FROM public.mark_structures ms
  WHERE ms.id=mark_components.structure_id AND ms.school_id=mark_components.school_id
    AND EXISTS (
      SELECT 1 FROM public.teacher_class_subject_assignments a
      WHERE a.school_id=ms.school_id
        AND (ms.class_id IS NULL OR a.class_id=ms.class_id)
        AND (a.term_id IS NULL OR a.term_id=ms.term_id)
        AND private.auth_has_term_assignment(a.school_id,a.class_id,a.subject_id,ms.term_id,NULL)
    )
));
DROP POLICY IF EXISTS mark_components_admin_write ON public.mark_components;
DROP POLICY IF EXISTS mark_components_admin_insert ON public.mark_components;
CREATE POLICY mark_components_admin_insert
  ON public.mark_components FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.auth_user_role())::text = 'super_admin' OR ((SELECT private.auth_user_role())::text = 'school_admin' AND school_id = (SELECT private.auth_school_id())));
DROP POLICY IF EXISTS mark_components_admin_update ON public.mark_components;
CREATE POLICY mark_components_admin_update
  ON public.mark_components FOR UPDATE TO authenticated
  USING ((SELECT private.auth_user_role())::text = 'super_admin' OR ((SELECT private.auth_user_role())::text = 'school_admin' AND school_id = (SELECT private.auth_school_id())))
  WITH CHECK ((SELECT private.auth_user_role())::text = 'super_admin' OR ((SELECT private.auth_user_role())::text = 'school_admin' AND school_id = (SELECT private.auth_school_id())));
DROP POLICY IF EXISTS mark_components_admin_delete ON public.mark_components;
CREATE POLICY mark_components_admin_delete
  ON public.mark_components FOR DELETE TO authenticated
  USING ((SELECT private.auth_user_role())::text = 'super_admin' OR ((SELECT private.auth_user_role())::text = 'school_admin' AND school_id = (SELECT private.auth_school_id())));

-- Keep the exact teacher-assignment scope and fold admin SELECT into one
-- scalarized read policy.
DROP POLICY IF EXISTS mark_structures_read ON public.mark_structures;
CREATE POLICY mark_structures_read ON public.mark_structures FOR SELECT TO authenticated
USING (
  (SELECT private.auth_user_role())::text = 'super_admin'
  OR ((SELECT private.auth_user_role())::text = 'school_admin' AND school_id = (SELECT private.auth_school_id()))
  OR EXISTS (
    SELECT 1 FROM public.teacher_class_subject_assignments a
    WHERE a.school_id=mark_structures.school_id
      AND (mark_structures.class_id IS NULL OR a.class_id=mark_structures.class_id)
      AND (a.term_id IS NULL OR a.term_id=mark_structures.term_id)
      AND private.auth_has_term_assignment(a.school_id,a.class_id,a.subject_id,mark_structures.term_id,NULL)
  )
);
DROP POLICY IF EXISTS mark_structures_admin_write ON public.mark_structures;
DROP POLICY IF EXISTS mark_structures_admin_insert ON public.mark_structures;
CREATE POLICY mark_structures_admin_insert
  ON public.mark_structures FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.auth_user_role())::text = 'super_admin' OR ((SELECT private.auth_user_role())::text = 'school_admin' AND school_id = (SELECT private.auth_school_id())));
DROP POLICY IF EXISTS mark_structures_admin_update ON public.mark_structures;
CREATE POLICY mark_structures_admin_update
  ON public.mark_structures FOR UPDATE TO authenticated
  USING ((SELECT private.auth_user_role())::text = 'super_admin' OR ((SELECT private.auth_user_role())::text = 'school_admin' AND school_id = (SELECT private.auth_school_id())))
  WITH CHECK ((SELECT private.auth_user_role())::text = 'super_admin' OR ((SELECT private.auth_user_role())::text = 'school_admin' AND school_id = (SELECT private.auth_school_id())));
DROP POLICY IF EXISTS mark_structures_admin_delete ON public.mark_structures;
CREATE POLICY mark_structures_admin_delete
  ON public.mark_structures FOR DELETE TO authenticated
  USING ((SELECT private.auth_user_role())::text = 'super_admin' OR ((SELECT private.auth_user_role())::text = 'school_admin' AND school_id = (SELECT private.auth_school_id())));

-- Combine admin and parent/student visibility in one SELECT policy to avoid
-- multiple permissive SELECT policies without widening either role's access.
DROP POLICY IF EXISTS report_cards_admin_all ON public.report_cards;
DROP POLICY IF EXISTS report_cards_admin_read ON public.report_cards;
DROP POLICY IF EXISTS report_cards_parent_published_read ON public.report_cards;
DROP POLICY IF EXISTS report_cards_read ON public.report_cards;
CREATE POLICY report_cards_read ON public.report_cards FOR SELECT TO authenticated
USING (
  (SELECT private.auth_user_role())::text = 'super_admin'
  OR ((SELECT private.auth_user_role())::text = 'school_admin' AND school_id = (SELECT private.auth_school_id()))
  OR (
    published_at IS NOT NULL
    AND is_stale=false
    AND (SELECT private.auth_user_role())::text IN ('parent','student')
    AND private.auth_can_access_student(student_id)
  )
);
DROP POLICY IF EXISTS report_cards_admin_insert ON public.report_cards;
CREATE POLICY report_cards_admin_insert
  ON public.report_cards FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.auth_user_role())::text = 'super_admin' OR ((SELECT private.auth_user_role())::text = 'school_admin' AND school_id = (SELECT private.auth_school_id())));
DROP POLICY IF EXISTS report_cards_admin_update ON public.report_cards;
CREATE POLICY report_cards_admin_update
  ON public.report_cards FOR UPDATE TO authenticated
  USING ((SELECT private.auth_user_role())::text = 'super_admin' OR ((SELECT private.auth_user_role())::text = 'school_admin' AND school_id = (SELECT private.auth_school_id())))
  WITH CHECK ((SELECT private.auth_user_role())::text = 'super_admin' OR ((SELECT private.auth_user_role())::text = 'school_admin' AND school_id = (SELECT private.auth_school_id())));
DROP POLICY IF EXISTS report_cards_admin_delete ON public.report_cards;
CREATE POLICY report_cards_admin_delete
  ON public.report_cards FOR DELETE TO authenticated
  USING ((SELECT private.auth_user_role())::text = 'super_admin' OR ((SELECT private.auth_user_role())::text = 'school_admin' AND school_id = (SELECT private.auth_school_id())));

-- Cache role evaluation once per statement; retain teacher read access.
DROP POLICY IF EXISTS term_status_read ON public.term_status;
CREATE POLICY term_status_read ON public.term_status FOR SELECT TO authenticated
USING ((SELECT private.auth_user_role())::text = 'super_admin' OR ((SELECT private.auth_user_role())::text IN ('school_admin','teacher') AND school_id = (SELECT private.auth_school_id())));
DROP POLICY IF EXISTS term_status_admin_write ON public.term_status;
DROP POLICY IF EXISTS term_status_admin_insert ON public.term_status;
CREATE POLICY term_status_admin_insert
  ON public.term_status FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.auth_user_role())::text = 'super_admin' OR ((SELECT private.auth_user_role())::text = 'school_admin' AND school_id = (SELECT private.auth_school_id())));
DROP POLICY IF EXISTS term_status_admin_update ON public.term_status;
CREATE POLICY term_status_admin_update
  ON public.term_status FOR UPDATE TO authenticated
  USING ((SELECT private.auth_user_role())::text = 'super_admin' OR ((SELECT private.auth_user_role())::text = 'school_admin' AND school_id = (SELECT private.auth_school_id())))
  WITH CHECK ((SELECT private.auth_user_role())::text = 'super_admin' OR ((SELECT private.auth_user_role())::text = 'school_admin' AND school_id = (SELECT private.auth_school_id())));
DROP POLICY IF EXISTS term_status_admin_delete ON public.term_status;
CREATE POLICY term_status_admin_delete
  ON public.term_status FOR DELETE TO authenticated
  USING ((SELECT private.auth_user_role())::text = 'super_admin' OR ((SELECT private.auth_user_role())::text = 'school_admin' AND school_id = (SELECT private.auth_school_id())));

COMMIT;
