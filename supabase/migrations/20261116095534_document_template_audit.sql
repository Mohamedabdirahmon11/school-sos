-- Keep template lifecycle changes in the existing school document audit stream.
-- The API writes through the service role; this trigger intentionally remains invoker-security.
CREATE OR REPLACE FUNCTION public.schoolos_document_template_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  school_key VARCHAR(64);
  template_key UUID;
  actor_key VARCHAR(64);
  template_title TEXT;
  event_action VARCHAR(40);
BEGIN
  IF TG_OP = 'DELETE' THEN
    school_key := OLD.school_id;
    template_key := OLD.id;
    actor_key := COALESCE(OLD.updated_by, OLD.created_by);
    template_title := OLD.title;
    event_action := 'template_deleted';
  ELSE
    school_key := NEW.school_id;
    template_key := NEW.id;
    actor_key := COALESCE(NEW.updated_by, NEW.created_by, OLD.updated_by, OLD.created_by);
    template_title := NEW.title;
    IF TG_OP = 'INSERT' THEN
      event_action := 'template_created';
    ELSIF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      event_action := 'template_archived';
    ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
      event_action := 'template_restored';
    ELSE
      event_action := 'template_updated';
    END IF;
  END IF;

  INSERT INTO public.school_document_audit_events
    (school_id, document_id, actor_user_id, action, details)
  VALUES
    (school_key, NULL, actor_key, event_action,
     jsonb_build_object('templateId', template_key, 'title', template_title));

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS schoolos_document_template_audit ON public.school_document_templates;
CREATE TRIGGER schoolos_document_template_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.school_document_templates
  FOR EACH ROW EXECUTE FUNCTION public.schoolos_document_template_audit();
