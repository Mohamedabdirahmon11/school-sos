-- Documents module Phase 3: immutable history/audit, sharing grants, final locking and student attachments.
-- Additive only. Apply to a reviewed non-production environment before production.
ALTER TABLE public.school_documents
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS locked_by VARCHAR(64) REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lock_reason VARCHAR(300);

CREATE TABLE IF NOT EXISTS public.school_document_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id VARCHAR(64) NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.school_documents(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  title VARCHAR(180) NOT NULL,
  document_type VARCHAR(40) NOT NULL,
  status VARCHAR(12) NOT NULL CHECK (status IN ('draft','final')),
  content_html TEXT NOT NULL DEFAULT '' CHECK (octet_length(content_html) <= 1500000),
  page_size VARCHAR(10) NOT NULL CHECK (page_size IN ('A4','A5','Letter')),
  direction VARCHAR(3) NOT NULL CHECK (direction IN ('ltr','rtl')),
  page_margins INTEGER NOT NULL CHECK (page_margins BETWEEN 5 AND 40),
  changed_by VARCHAR(64) REFERENCES public.users(id) ON DELETE SET NULL,
  change_reason VARCHAR(300),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, document_id, version_number)
);

CREATE TABLE IF NOT EXISTS public.school_document_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id VARCHAR(64) NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.school_documents(id) ON DELETE CASCADE,
  user_id VARCHAR(64) REFERENCES public.users(id) ON DELETE CASCADE,
  role VARCHAR(32) CHECK (role IN ('school_admin','teacher','accountant','parent','student')),
  can_view BOOLEAN NOT NULL DEFAULT TRUE,
  can_edit BOOLEAN NOT NULL DEFAULT FALSE,
  can_download BOOLEAN NOT NULL DEFAULT FALSE,
  created_by VARCHAR(64) REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (user_id IS NOT NULL OR role IS NOT NULL),
  CHECK (NOT can_edit OR can_view)
);

CREATE TABLE IF NOT EXISTS public.school_document_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id VARCHAR(64) NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  document_id UUID REFERENCES public.school_documents(id) ON DELETE SET NULL,
  actor_user_id VARCHAR(64) REFERENCES public.users(id) ON DELETE SET NULL,
  action VARCHAR(40) NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.student_document_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id VARCHAR(64) NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id VARCHAR(64) NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  file_name VARCHAR(180) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  file_size BIGINT NOT NULL CHECK (file_size BETWEEN 1 AND 10485760),
  storage_path TEXT NOT NULL UNIQUE,
  uploaded_by VARCHAR(64) REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  deleted_by VARCHAR(64) REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_school_document_versions_school_document
  ON public.school_document_versions(school_id, document_id, version_number DESC);
CREATE INDEX IF NOT EXISTS idx_school_document_permissions_document
  ON public.school_document_permissions(school_id, document_id);
CREATE INDEX IF NOT EXISTS idx_school_document_permissions_user
  ON public.school_document_permissions(school_id, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_school_document_permissions_user
  ON public.school_document_permissions(school_id, document_id, user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_school_document_permissions_role
  ON public.school_document_permissions(school_id, document_id, role) WHERE role IS NOT NULL AND user_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_school_document_audit_school_created
  ON public.school_document_audit_events(school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_school_document_audit_document_created
  ON public.school_document_audit_events(school_id, document_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_student_document_attachments_student
  ON public.student_document_attachments(school_id, student_id, created_at DESC);

ALTER TABLE public.school_document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_document_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_document_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_document_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS school_document_versions_admin_all ON public.school_document_versions;
DROP POLICY IF EXISTS school_document_versions_admin_read ON public.school_document_versions;
CREATE POLICY school_document_versions_admin_read ON public.school_document_versions
  FOR SELECT TO authenticated
  USING (private.auth_user_role() = 'super_admin' OR (school_id = private.auth_school_id() AND private.auth_user_role() = 'school_admin'));

DROP POLICY IF EXISTS school_document_permissions_admin_all ON public.school_document_permissions;
CREATE POLICY school_document_permissions_admin_all ON public.school_document_permissions
  FOR ALL TO authenticated
  USING (private.auth_user_role() = 'super_admin' OR (school_id = private.auth_school_id() AND private.auth_user_role() = 'school_admin'))
  WITH CHECK (private.auth_user_role() = 'super_admin' OR (school_id = private.auth_school_id() AND private.auth_user_role() = 'school_admin'));

DROP POLICY IF EXISTS school_document_audit_admin_read ON public.school_document_audit_events;
CREATE POLICY school_document_audit_admin_read ON public.school_document_audit_events
  FOR SELECT TO authenticated
  USING (private.auth_user_role() = 'super_admin' OR (school_id = private.auth_school_id() AND private.auth_user_role() = 'school_admin'));

DROP POLICY IF EXISTS student_document_attachments_admin_all ON public.student_document_attachments;
CREATE POLICY student_document_attachments_admin_all ON public.student_document_attachments
  FOR ALL TO authenticated
  USING (private.auth_user_role() = 'super_admin' OR (school_id = private.auth_school_id() AND private.auth_user_role() = 'school_admin'))
  WITH CHECK (private.auth_user_role() = 'super_admin' OR (school_id = private.auth_school_id() AND private.auth_user_role() = 'school_admin'));

CREATE OR REPLACE FUNCTION public.schoolos_document_snapshot_and_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  next_version INTEGER;
  actor_id VARCHAR(64);
  event_action VARCHAR(40);
BEGIN
  actor_id := COALESCE(NEW.updated_by, NEW.created_by, OLD.updated_by, OLD.created_by);
  IF TG_OP = 'UPDATE' AND OLD.locked_at IS NOT NULL THEN
    IF NEW.locked_at IS NOT NULL AND (
      NEW.title IS DISTINCT FROM OLD.title OR
      NEW.document_type IS DISTINCT FROM OLD.document_type OR
      NEW.status IS DISTINCT FROM OLD.status OR
      NEW.content_html IS DISTINCT FROM OLD.content_html OR
      NEW.page_size IS DISTINCT FROM OLD.page_size OR
      NEW.direction IS DISTINCT FROM OLD.direction OR
      NEW.page_margins IS DISTINCT FROM OLD.page_margins OR
      NEW.template_id IS DISTINCT FROM OLD.template_id OR
      NEW.student_id IS DISTINCT FROM OLD.student_id OR
      NEW.class_id IS DISTINCT FROM OLD.class_id
    ) THEN
      RAISE EXCEPTION 'Document is locked; unlock it before editing.' USING ERRCODE = '55000';
    END IF;
    IF NEW.locked_at IS NULL AND (
      NEW.title IS DISTINCT FROM OLD.title OR
      NEW.document_type IS DISTINCT FROM OLD.document_type OR
      NEW.content_html IS DISTINCT FROM OLD.content_html OR
      NEW.page_size IS DISTINCT FROM OLD.page_size OR
      NEW.direction IS DISTINCT FROM OLD.direction OR
      NEW.page_margins IS DISTINCT FROM OLD.page_margins OR
      NEW.template_id IS DISTINCT FROM OLD.template_id OR
      NEW.student_id IS DISTINCT FROM OLD.student_id OR
      NEW.class_id IS DISTINCT FROM OLD.class_id
    ) THEN
      RAISE EXCEPTION 'Unlocking and editing must be separate operations.' USING ERRCODE = '55000';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT COALESCE(MAX(version_number), 0) + 1 INTO next_version
      FROM public.school_document_versions
      WHERE school_id = NEW.school_id AND document_id = NEW.id;
    INSERT INTO public.school_document_versions (
      school_id, document_id, version_number, title, document_type, status,
      content_html, page_size, direction, page_margins, changed_by
    ) VALUES (
      NEW.school_id, NEW.id, next_version, NEW.title, NEW.document_type, NEW.status,
      NEW.content_html, NEW.page_size, NEW.direction, NEW.page_margins, actor_id
    );
  ELSIF TG_OP = 'UPDATE' AND (
    NEW.title IS DISTINCT FROM OLD.title OR
    NEW.document_type IS DISTINCT FROM OLD.document_type OR
    NEW.status IS DISTINCT FROM OLD.status OR
    NEW.content_html IS DISTINCT FROM OLD.content_html OR
    NEW.page_size IS DISTINCT FROM OLD.page_size OR
    NEW.direction IS DISTINCT FROM OLD.direction OR
    NEW.page_margins IS DISTINCT FROM OLD.page_margins OR
    NEW.template_id IS DISTINCT FROM OLD.template_id OR
    NEW.student_id IS DISTINCT FROM OLD.student_id OR
    NEW.class_id IS DISTINCT FROM OLD.class_id
  ) THEN
    SELECT COALESCE(MAX(version_number), 0) + 1 INTO next_version
      FROM public.school_document_versions
      WHERE school_id = NEW.school_id AND document_id = NEW.id;
    INSERT INTO public.school_document_versions (
      school_id, document_id, version_number, title, document_type, status,
      content_html, page_size, direction, page_margins, changed_by
    ) VALUES (
      NEW.school_id, NEW.id, next_version, NEW.title, NEW.document_type, NEW.status,
      NEW.content_html, NEW.page_size, NEW.direction, NEW.page_margins, actor_id
    );
  END IF;

  IF TG_OP = 'INSERT' THEN
    event_action := 'created';
  ELSIF TG_OP = 'DELETE' THEN
    event_action := 'deleted';
  ELSIF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    event_action := 'soft_deleted';
  ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
    event_action := 'restored';
  ELSIF OLD.locked_at IS NULL AND NEW.locked_at IS NOT NULL THEN
    event_action := 'locked';
  ELSIF OLD.locked_at IS NOT NULL AND NEW.locked_at IS NULL THEN
    event_action := 'unlocked';
  ELSIF OLD.status IS DISTINCT FROM NEW.status THEN
    event_action := 'status_changed';
  ELSE
    event_action := 'updated';
  END IF;

  INSERT INTO public.school_document_audit_events (school_id, document_id, actor_user_id, action, details)
  VALUES (
    COALESCE(NEW.school_id, OLD.school_id),
    COALESCE(NEW.id, OLD.id),
    actor_id,
    event_action,
    jsonb_build_object('title', COALESCE(NEW.title, OLD.title), 'status', COALESCE(NEW.status, OLD.status))
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS schoolos_document_snapshot_audit ON public.school_documents;
CREATE TRIGGER schoolos_document_snapshot_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.school_documents
  FOR EACH ROW EXECUTE FUNCTION public.schoolos_document_snapshot_and_audit();

REVOKE ALL ON FUNCTION public.schoolos_document_snapshot_and_audit() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schoolos_document_snapshot_and_audit() TO service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('student-document-attachments','student-document-attachments',false,10485760,
  ARRAY['application/pdf','image/jpeg','image/png','image/webp']::text[])
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, public = false, file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

NOTIFY pgrst, 'reload schema';
