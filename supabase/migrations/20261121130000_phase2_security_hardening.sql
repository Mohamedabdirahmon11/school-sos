-- Phase 2 security hardening: close direct RPC execution on trigger-only functions.
-- These functions remain attached to their existing triggers; no rows or trigger definitions change.
REVOKE ALL ON FUNCTION public.schoolos_audit_component_mark() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.schoolos_audit_component_mark() FROM anon, authenticated;

REVOKE ALL ON FUNCTION public.schoolos_create_initial_student_enrollment() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.schoolos_create_initial_student_enrollment() FROM anon, authenticated;

REVOKE ALL ON FUNCTION public.schoolos_guard_component_mark() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.schoolos_guard_component_mark() FROM anon, authenticated;

-- Keep the helper used by timetable exclusion constraints executable by API roles,
-- but pin its search_path so an attacker cannot influence name resolution.
CREATE OR REPLACE FUNCTION public.timetable_time_seconds(value text)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
STRICT
SET search_path = ''
AS $function$
  SELECT floor(extract(epoch FROM (value::time - time '00:00')))::bigint
$function$;

NOTIFY pgrst, 'reload schema';
