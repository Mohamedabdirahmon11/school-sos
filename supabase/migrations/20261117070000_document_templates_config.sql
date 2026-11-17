-- Structured A4 template configurations. Existing school_documents and
-- school_document_templates remain unchanged; this table stores typed layouts.
CREATE TABLE IF NOT EXISTS public.document_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id VARCHAR(64) NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  type VARCHAR(40) NOT NULL CHECK (type IN (
    'exam_result_list',
    'individual_report_card',
    'attendance_sheet',
    'certificate',
    'student_id_cards',
    'official_letter',
    'fee_receipt',
    'class_timetable',
    'class_list'
  )),
  name VARCHAR(160) NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_builtin BOOLEAN NOT NULL DEFAULT FALSE,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by VARCHAR(64) REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by VARCHAR(64) REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT document_templates_config_object CHECK (
    jsonb_typeof(config) = 'object' AND octet_length(config::text) <= 100000
  )
);

CREATE INDEX IF NOT EXISTS idx_document_templates_school_updated
  ON public.document_templates (school_id, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_document_templates_school_type_name
  ON public.document_templates (school_id, type, lower(name));

ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;

-- This table is accessed only through the authenticated server API. The
-- service-role key never reaches the browser; direct client access is denied.
REVOKE ALL ON TABLE public.document_templates FROM anon, authenticated;
GRANT ALL ON TABLE public.document_templates TO service_role;

DROP POLICY IF EXISTS document_templates_school_admin_select ON public.document_templates;
CREATE POLICY document_templates_school_admin_select
  ON public.document_templates FOR SELECT TO authenticated
  USING (school_id = private.auth_school_id() AND private.auth_user_role() = 'school_admin');

DROP POLICY IF EXISTS document_templates_school_admin_insert ON public.document_templates;
CREATE POLICY document_templates_school_admin_insert
  ON public.document_templates FOR INSERT TO authenticated
  WITH CHECK (school_id = private.auth_school_id() AND private.auth_user_role() = 'school_admin');

DROP POLICY IF EXISTS document_templates_school_admin_update ON public.document_templates;
CREATE POLICY document_templates_school_admin_update
  ON public.document_templates FOR UPDATE TO authenticated
  USING (school_id = private.auth_school_id() AND private.auth_user_role() = 'school_admin')
  WITH CHECK (school_id = private.auth_school_id() AND private.auth_user_role() = 'school_admin');

DROP POLICY IF EXISTS document_templates_school_admin_delete ON public.document_templates;
CREATE POLICY document_templates_school_admin_delete
  ON public.document_templates FOR DELETE TO authenticated
  USING (school_id = private.auth_school_id() AND private.auth_user_role() = 'school_admin');

CREATE OR REPLACE FUNCTION public.schoolos_structured_template_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  school_key VARCHAR(64);
  template_key UUID;
  actor_key VARCHAR(64);
  template_name TEXT;
  template_type VARCHAR(40);
  old_name TEXT;
  old_type VARCHAR(40);
  old_config JSONB;
  new_config JSONB;
  event_action VARCHAR(50);
BEGIN
  IF TG_OP = 'DELETE' THEN
    school_key := OLD.school_id;
    template_key := OLD.id;
    actor_key := COALESCE(OLD.updated_by, OLD.created_by);
    template_name := OLD.name;
    template_type := OLD.type;
    old_name := OLD.name;
    old_type := OLD.type;
    old_config := OLD.config;
    event_action := 'structured_template_deleted';
  ELSIF TG_OP = 'INSERT' THEN
    school_key := NEW.school_id;
    template_key := NEW.id;
    actor_key := COALESCE(NEW.updated_by, NEW.created_by);
    template_name := NEW.name;
    template_type := NEW.type;
    new_config := NEW.config;
    event_action := 'structured_template_created';
  ELSE
    school_key := NEW.school_id;
    template_key := NEW.id;
    actor_key := COALESCE(NEW.updated_by, NEW.created_by, OLD.updated_by, OLD.created_by);
    template_name := NEW.name;
    template_type := NEW.type;
    old_name := OLD.name;
    old_type := OLD.type;
    old_config := OLD.config;
    new_config := NEW.config;
    event_action := 'structured_template_updated';
  END IF;

  INSERT INTO public.school_document_audit_events
    (school_id, document_id, actor_user_id, action, details)
  VALUES
    (school_key, NULL, actor_key, event_action,
     jsonb_build_object(
       'templateId', template_key,
       'type', template_type,
       'name', template_name,
       'oldType', old_type,
       'oldName', old_name,
       'newType', CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE template_type END,
       'newName', CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE template_name END,
       'oldConfig', old_config,
       'newConfig', new_config
     ));

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS schoolos_structured_template_audit ON public.document_templates;
CREATE TRIGGER schoolos_structured_template_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.document_templates
  FOR EACH ROW EXECUTE FUNCTION public.schoolos_structured_template_audit();

NOTIFY pgrst, 'reload schema';
