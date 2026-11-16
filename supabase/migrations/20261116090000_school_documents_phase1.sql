-- Phase 1: school-scoped document editor, templates and private image storage.
-- This migration is additive and is intentionally NOT applied by this change.
CREATE TABLE IF NOT EXISTS public.school_document_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id VARCHAR(64) NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  title VARCHAR(160) NOT NULL,
  document_type VARCHAR(40) NOT NULL DEFAULT 'other'
    CHECK (document_type IN ('transfer_letter','certificate','parent_letter','teacher_letter','student_clearance','report_summary','other')),
  content_html TEXT NOT NULL DEFAULT '' CHECK (octet_length(content_html) <= 1500000),
  created_by VARCHAR(64) REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by VARCHAR(64) REFERENCES public.users(id) ON DELETE SET NULL,
  deleted_by VARCHAR(64) REFERENCES public.users(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.school_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id VARCHAR(64) NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  title VARCHAR(180) NOT NULL,
  document_type VARCHAR(40) NOT NULL DEFAULT 'other'
    CHECK (document_type IN ('transfer_letter','certificate','parent_letter','teacher_letter','student_clearance','report_summary','other')),
  status VARCHAR(12) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','final')),
  content_html TEXT NOT NULL DEFAULT '' CHECK (octet_length(content_html) <= 1500000),
  page_size VARCHAR(10) NOT NULL DEFAULT 'A4' CHECK (page_size IN ('A4','A5','Letter')),
  direction VARCHAR(3) NOT NULL DEFAULT 'ltr' CHECK (direction IN ('ltr','rtl')),
  page_margins INTEGER NOT NULL DEFAULT 20 CHECK (page_margins BETWEEN 5 AND 40),
  template_id UUID REFERENCES public.school_document_templates(id) ON DELETE SET NULL,
  student_id VARCHAR(64) REFERENCES public.students(id) ON DELETE SET NULL,
  class_id VARCHAR(64) REFERENCES public.classes(id) ON DELETE SET NULL,
  created_by VARCHAR(64) REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by VARCHAR(64) REFERENCES public.users(id) ON DELETE SET NULL,
  deleted_by VARCHAR(64) REFERENCES public.users(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_school_document_templates_school_updated
  ON public.school_document_templates(school_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_school_document_templates_created_by
  ON public.school_document_templates(created_by);
CREATE INDEX IF NOT EXISTS idx_school_document_templates_updated_by
  ON public.school_document_templates(updated_by);
CREATE INDEX IF NOT EXISTS idx_school_document_templates_deleted_by
  ON public.school_document_templates(deleted_by);
CREATE UNIQUE INDEX IF NOT EXISTS uq_school_document_templates_school_title
  ON public.school_document_templates(school_id, lower(title)) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_school_documents_school_updated
  ON public.school_documents(school_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_school_documents_template_id
  ON public.school_documents(template_id);
CREATE INDEX IF NOT EXISTS idx_school_documents_student_id
  ON public.school_documents(student_id);
CREATE INDEX IF NOT EXISTS idx_school_documents_class_id
  ON public.school_documents(class_id);
CREATE INDEX IF NOT EXISTS idx_school_documents_created_by
  ON public.school_documents(created_by);
CREATE INDEX IF NOT EXISTS idx_school_documents_updated_by
  ON public.school_documents(updated_by);
CREATE INDEX IF NOT EXISTS idx_school_documents_deleted_by
  ON public.school_documents(deleted_by);
CREATE INDEX IF NOT EXISTS idx_school_documents_school_type_status
  ON public.school_documents(school_id, document_type, status, updated_at DESC);

ALTER TABLE public.school_document_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS school_document_templates_school_admin_all ON public.school_document_templates;
CREATE POLICY school_document_templates_school_admin_all
  ON public.school_document_templates
  FOR ALL TO authenticated
  USING (
    private.auth_user_role() = 'super_admin'
    OR (school_id = private.auth_school_id() AND private.auth_user_role() = 'school_admin')
  )
  WITH CHECK (
    private.auth_user_role() = 'super_admin'
    OR (school_id = private.auth_school_id() AND private.auth_user_role() = 'school_admin')
  );

DROP POLICY IF EXISTS school_documents_school_admin_all ON public.school_documents;
CREATE POLICY school_documents_school_admin_all
  ON public.school_documents
  FOR ALL TO authenticated
  USING (
    private.auth_user_role() = 'super_admin'
    OR (school_id = private.auth_school_id() AND private.auth_user_role() = 'school_admin')
  )
  WITH CHECK (
    private.auth_user_role() = 'super_admin'
    OR (school_id = private.auth_school_id() AND private.auth_user_role() = 'school_admin')
  );

-- Images are private; authenticated app users never access the bucket directly.
-- The server validates the signed-in school and streams images through its API.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'school-document-images',
  'school-document-images',
  false,
  1572864,
  ARRAY['image/png','image/jpeg','image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

NOTIFY pgrst, 'reload schema';
