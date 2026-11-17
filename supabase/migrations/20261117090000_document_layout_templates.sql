-- Editable layout templates (result list, attendance sheet). Additive only; NOT applied to production.
-- One saved layout per school and template type. The API validates config before writing; the CHECK is a backstop.
CREATE TABLE IF NOT EXISTS public.document_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id VARCHAR(64) NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  type VARCHAR(40) NOT NULL CHECK (type IN ('result_list','attendance_sheet')),
  name VARCHAR(160) NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(config) = 'object' AND octet_length(config::text) <= 60000),
  is_builtin BOOLEAN NOT NULL DEFAULT FALSE,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by VARCHAR(64) REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by VARCHAR(64) REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, type)
);
CREATE INDEX IF NOT EXISTS idx_document_templates_school ON public.document_templates(school_id);
CREATE INDEX IF NOT EXISTS idx_document_templates_created_by ON public.document_templates(created_by);
CREATE INDEX IF NOT EXISTS idx_document_templates_updated_by ON public.document_templates(updated_by);

ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS document_templates_school_admin_all ON public.document_templates;
CREATE POLICY document_templates_school_admin_all ON public.document_templates FOR ALL TO authenticated
  USING (private.auth_user_role() = 'super_admin' OR (school_id = private.auth_school_id() AND private.auth_user_role() = 'school_admin'))
  WITH CHECK (private.auth_user_role() = 'super_admin' OR (school_id = private.auth_school_id() AND private.auth_user_role() = 'school_admin'));

-- Audit: who changed which layout, with old and new values, in the existing document audit stream.
CREATE OR REPLACE FUNCTION public.schoolos_document_layout_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.school_document_audit_events (school_id, document_id, actor_user_id, action, details)
    VALUES (OLD.school_id, NULL, COALESCE(OLD.updated_by, OLD.created_by), 'layout_reset',
      jsonb_build_object('type', OLD.type, 'old', OLD.config));
    RETURN OLD;
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO public.school_document_audit_events (school_id, document_id, actor_user_id, action, details)
    VALUES (NEW.school_id, NULL, COALESCE(NEW.updated_by, NEW.created_by), 'layout_created',
      jsonb_build_object('type', NEW.type, 'new', NEW.config));
    RETURN NEW;
  END IF;
  INSERT INTO public.school_document_audit_events (school_id, document_id, actor_user_id, action, details)
  VALUES (NEW.school_id, NULL, COALESCE(NEW.updated_by, OLD.updated_by), 'layout_updated',
    jsonb_build_object('type', NEW.type, 'old', OLD.config, 'new', NEW.config));
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS schoolos_document_layout_audit ON public.document_templates;
CREATE TRIGGER schoolos_document_layout_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.document_templates
  FOR EACH ROW EXECUTE FUNCTION public.schoolos_document_layout_audit();
