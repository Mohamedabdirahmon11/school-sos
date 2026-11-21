-- Track the already-applied Phase 2 database hardening migration so
-- repository migration history matches the connected Supabase project.
REVOKE ALL ON FUNCTION public.schoolos_audit_component_mark() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.schoolos_audit_component_mark() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.schoolos_create_initial_student_enrollment() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.schoolos_create_initial_student_enrollment() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.schoolos_guard_component_mark() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.schoolos_guard_component_mark() FROM anon, authenticated;

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
