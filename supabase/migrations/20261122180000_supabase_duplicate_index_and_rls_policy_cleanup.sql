-- Reduce avoidable write overhead and duplicate SELECT policy evaluation.
-- Preserve every existing authorization predicate and tenant guard.

BEGIN;

-- Remove exact duplicate, non-constraint-backed unique indexes only.
-- The retained indexes below are the ones referenced by constraints.
DROP INDEX IF EXISTS public.academic_years_id_school_uidx;
DROP INDEX IF EXISTS public.class_sections_id_school_uidx;
DROP INDEX IF EXISTS public.classes_id_school_id_uidx;
DROP INDEX IF EXISTS public.classes_id_school_uidx;
DROP INDEX IF EXISTS public.students_id_school_uidx;
DROP INDEX IF EXISTS public.subjects_id_school_id_uidx;
DROP INDEX IF EXISTS public.subjects_id_school_uidx;
DROP INDEX IF EXISTS public.terms_id_school_uidx;

-- mark_components: SELECT is already covered by mark_components_read,
-- including school_admin and super_admin. Keep the same admin write access.
DROP POLICY IF EXISTS mark_components_admin_write ON public.mark_components;
CREATE POLICY mark_components_admin_insert
  ON public.mark_components FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.auth_user_role())::text IN ('school_admin', 'super_admin'));
CREATE POLICY mark_components_admin_update
  ON public.mark_components FOR UPDATE TO authenticated
  USING ((SELECT private.auth_user_role())::text IN ('school_admin', 'super_admin'))
  WITH CHECK ((SELECT private.auth_user_role())::text IN ('school_admin', 'super_admin'));
CREATE POLICY mark_components_admin_delete
  ON public.mark_components FOR DELETE TO authenticated
  USING ((SELECT private.auth_user_role())::text IN ('school_admin', 'super_admin'));

-- mark_structures: same policy split; mark_structures_read retains admin SELECT.
DROP POLICY IF EXISTS mark_structures_admin_write ON public.mark_structures;
CREATE POLICY mark_structures_admin_insert
  ON public.mark_structures FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.auth_user_role())::text IN ('school_admin', 'super_admin'));
CREATE POLICY mark_structures_admin_update
  ON public.mark_structures FOR UPDATE TO authenticated
  USING ((SELECT private.auth_user_role())::text IN ('school_admin', 'super_admin'))
  WITH CHECK ((SELECT private.auth_user_role())::text IN ('school_admin', 'super_admin'));
CREATE POLICY mark_structures_admin_delete
  ON public.mark_structures FOR DELETE TO authenticated
  USING ((SELECT private.auth_user_role())::text IN ('school_admin', 'super_admin'));

-- report_cards: keep parent/student published-read policy and add an
-- explicit admin read policy before narrowing the former ALL policy to writes.
DROP POLICY IF EXISTS report_cards_admin_all ON public.report_cards;
CREATE POLICY report_cards_admin_read
  ON public.report_cards FOR SELECT TO authenticated
  USING ((SELECT private.auth_user_role())::text IN ('school_admin', 'super_admin'));
CREATE POLICY report_cards_admin_insert
  ON public.report_cards FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.auth_user_role())::text IN ('school_admin', 'super_admin'));
CREATE POLICY report_cards_admin_update
  ON public.report_cards FOR UPDATE TO authenticated
  USING ((SELECT private.auth_user_role())::text IN ('school_admin', 'super_admin'))
  WITH CHECK ((SELECT private.auth_user_role())::text IN ('school_admin', 'super_admin'));
CREATE POLICY report_cards_admin_delete
  ON public.report_cards FOR DELETE TO authenticated
  USING ((SELECT private.auth_user_role())::text IN ('school_admin', 'super_admin'));

-- term_status: SELECT already includes admins in term_status_read.
DROP POLICY IF EXISTS term_status_admin_write ON public.term_status;
CREATE POLICY term_status_admin_insert
  ON public.term_status FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.auth_user_role())::text IN ('school_admin', 'super_admin'));
CREATE POLICY term_status_admin_update
  ON public.term_status FOR UPDATE TO authenticated
  USING ((SELECT private.auth_user_role())::text IN ('school_admin', 'super_admin'))
  WITH CHECK ((SELECT private.auth_user_role())::text IN ('school_admin', 'super_admin'));
CREATE POLICY term_status_admin_delete
  ON public.term_status FOR DELETE TO authenticated
  USING ((SELECT private.auth_user_role())::text IN ('school_admin', 'super_admin'));

COMMIT;
