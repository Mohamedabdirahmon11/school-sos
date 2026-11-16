-- Hardening follow-up for Documents Phase 3.
-- Preserve delete audit events without violating the document FK, and index all new FK columns.
CREATE OR REPLACE FUNCTION public.schoolos_document_snapshot_and_audit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  next_version INTEGER;
  actor_id VARCHAR(64);
  event_action VARCHAR(40);
  event_school_id VARCHAR(64);
  event_document_id UUID;
  event_title VARCHAR(180);
  event_status VARCHAR(12);
BEGIN
  IF TG_OP = 'INSERT' THEN
    actor_id := COALESCE(NEW.updated_by, NEW.created_by);
    event_school_id := NEW.school_id; event_document_id := NEW.id;
    event_title := NEW.title; event_status := NEW.status;
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.school_id || ':' || NEW.id::text, 0));
    SELECT COALESCE(MAX(version_number),0)+1 INTO next_version
      FROM public.school_document_versions WHERE school_id=NEW.school_id AND document_id=NEW.id;
    INSERT INTO public.school_document_versions
      (school_id,document_id,version_number,title,document_type,status,content_html,page_size,direction,page_margins,changed_by)
    VALUES (NEW.school_id,NEW.id,next_version,NEW.title,NEW.document_type,NEW.status,NEW.content_html,NEW.page_size,NEW.direction,NEW.page_margins,actor_id);
    INSERT INTO public.school_document_audit_events (school_id,document_id,actor_user_id,action,details)
      VALUES (event_school_id,event_document_id,actor_id,'created',jsonb_build_object('title',event_title,'status',event_status));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    actor_id := COALESCE(OLD.updated_by, OLD.created_by);
    INSERT INTO public.school_document_audit_events (school_id,document_id,actor_user_id,action,details)
      VALUES (OLD.school_id,NULL,actor_id,'deleted',jsonb_build_object('deletedDocumentId',OLD.id,'title',OLD.title,'status',OLD.status));
    RETURN OLD;
  END IF;

  actor_id := COALESCE(NEW.updated_by,NEW.created_by,OLD.updated_by,OLD.created_by);
  event_school_id := NEW.school_id; event_document_id := NEW.id;
  event_title := NEW.title; event_status := NEW.status;

  IF OLD.locked_at IS NOT NULL OR OLD.status='final' THEN
    IF NEW.locked_at IS NOT NULL AND (
      NEW.title IS DISTINCT FROM OLD.title OR NEW.document_type IS DISTINCT FROM OLD.document_type OR
      NEW.status IS DISTINCT FROM OLD.status OR NEW.content_html IS DISTINCT FROM OLD.content_html OR
      NEW.page_size IS DISTINCT FROM OLD.page_size OR NEW.direction IS DISTINCT FROM OLD.direction OR
      NEW.page_margins IS DISTINCT FROM OLD.page_margins OR NEW.template_id IS DISTINCT FROM OLD.template_id OR
      NEW.student_id IS DISTINCT FROM OLD.student_id OR NEW.class_id IS DISTINCT FROM OLD.class_id
    ) THEN RAISE EXCEPTION 'Document is locked; unlock it before editing.' USING ERRCODE='55000'; END IF;
    IF NEW.locked_at IS NULL AND (
      NEW.title IS DISTINCT FROM OLD.title OR NEW.document_type IS DISTINCT FROM OLD.document_type OR
      NEW.content_html IS DISTINCT FROM OLD.content_html OR NEW.page_size IS DISTINCT FROM OLD.page_size OR
      NEW.direction IS DISTINCT FROM OLD.direction OR NEW.page_margins IS DISTINCT FROM OLD.page_margins OR
      NEW.template_id IS DISTINCT FROM OLD.template_id OR NEW.student_id IS DISTINCT FROM OLD.student_id OR
      NEW.class_id IS DISTINCT FROM OLD.class_id
    ) THEN RAISE EXCEPTION 'Unlocking and editing must be separate operations.' USING ERRCODE='55000'; END IF;
  END IF;

  IF NEW.title IS DISTINCT FROM OLD.title OR NEW.document_type IS DISTINCT FROM OLD.document_type OR
     NEW.status IS DISTINCT FROM OLD.status OR NEW.content_html IS DISTINCT FROM OLD.content_html OR
     NEW.page_size IS DISTINCT FROM OLD.page_size OR NEW.direction IS DISTINCT FROM OLD.direction OR
     NEW.page_margins IS DISTINCT FROM OLD.page_margins OR NEW.template_id IS DISTINCT FROM OLD.template_id OR
     NEW.student_id IS DISTINCT FROM OLD.student_id OR NEW.class_id IS DISTINCT FROM OLD.class_id THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.school_id || ':' || NEW.id::text,0));
    SELECT COALESCE(MAX(version_number),0)+1 INTO next_version FROM public.school_document_versions
      WHERE school_id=NEW.school_id AND document_id=NEW.id;
    INSERT INTO public.school_document_versions
      (school_id,document_id,version_number,title,document_type,status,content_html,page_size,direction,page_margins,changed_by)
    VALUES (NEW.school_id,NEW.id,next_version,NEW.title,NEW.document_type,NEW.status,NEW.content_html,NEW.page_size,NEW.direction,NEW.page_margins,actor_id);
  END IF;

  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN event_action:='soft_deleted';
  ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN event_action:='restored';
  ELSIF OLD.locked_at IS NULL AND NEW.locked_at IS NOT NULL THEN event_action:='locked';
  ELSIF OLD.locked_at IS NOT NULL AND NEW.locked_at IS NULL THEN event_action:='unlocked';
  ELSIF OLD.status IS DISTINCT FROM NEW.status THEN event_action:='status_changed';
  ELSE event_action:='updated'; END IF;
  INSERT INTO public.school_document_audit_events (school_id,document_id,actor_user_id,action,details)
    VALUES (event_school_id,event_document_id,actor_id,event_action,jsonb_build_object('title',event_title,'status',event_status));
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.schoolos_document_snapshot_and_audit() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.schoolos_document_snapshot_and_audit() TO service_role;
CREATE INDEX IF NOT EXISTS idx_school_document_versions_document_id ON public.school_document_versions(document_id);
CREATE INDEX IF NOT EXISTS idx_school_document_versions_changed_by ON public.school_document_versions(changed_by);
CREATE INDEX IF NOT EXISTS idx_school_document_permissions_document_id ON public.school_document_permissions(document_id);
CREATE INDEX IF NOT EXISTS idx_school_document_permissions_user_id ON public.school_document_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_school_document_permissions_created_by ON public.school_document_permissions(created_by);
CREATE INDEX IF NOT EXISTS idx_school_document_audit_document_id ON public.school_document_audit_events(document_id);
CREATE INDEX IF NOT EXISTS idx_school_document_audit_actor_user_id ON public.school_document_audit_events(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_school_documents_locked_by ON public.school_documents(locked_by);
CREATE INDEX IF NOT EXISTS idx_student_document_attachments_student_id ON public.student_document_attachments(student_id);
CREATE INDEX IF NOT EXISTS idx_student_document_attachments_uploaded_by ON public.student_document_attachments(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_student_document_attachments_deleted_by ON public.student_document_attachments(deleted_by);
