-- People Admin completion: six-stage admissions pipeline and school-scoped custom staff roles.
-- Additive and re-runnable. Existing admissions status/student links and staff permissions remain intact.
ALTER TABLE public.admission_applications ADD COLUMN IF NOT EXISTS pipeline_stage VARCHAR(20) NOT NULL DEFAULT 'applied';
UPDATE public.admission_applications SET pipeline_stage = CASE WHEN status='approved' THEN 'enrolled' WHEN status='rejected' THEN 'rejected' ELSE COALESCE(NULLIF(pipeline_stage,''),'applied') END;
ALTER TABLE public.admission_applications DROP CONSTRAINT IF EXISTS admission_applications_pipeline_stage_check;
ALTER TABLE public.admission_applications ADD CONSTRAINT admission_applications_pipeline_stage_check CHECK (pipeline_stage IN ('applied','review','interview','accepted','enrolled','rejected'));
CREATE INDEX IF NOT EXISTS idx_admission_pipeline_school_stage ON public.admission_applications(school_id,pipeline_stage,applied_date DESC);
CREATE OR REPLACE FUNCTION public.schoolos_sync_admission_pipeline_stage() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status='approved' THEN NEW.pipeline_stage:='enrolled';
  ELSIF NEW.status='rejected' THEN NEW.pipeline_stage:='rejected'; END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_schoolos_sync_admission_pipeline_stage ON public.admission_applications;
CREATE TRIGGER trg_schoolos_sync_admission_pipeline_stage BEFORE UPDATE OF status ON public.admission_applications FOR EACH ROW EXECUTE FUNCTION public.schoolos_sync_admission_pipeline_stage();
CREATE TABLE IF NOT EXISTS public.staff_roles (
  id VARCHAR(64) PRIMARY KEY,
  school_id VARCHAR(64) NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(500) NOT NULL DEFAULT '',
  permissions TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  is_system BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT staff_roles_school_name_unique UNIQUE (school_id,name)
);
ALTER TABLE public.staff_members ADD COLUMN IF NOT EXISTS role_id VARCHAR(64);
DO $body$ BEGIN
  ALTER TABLE public.staff_members ADD CONSTRAINT staff_members_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.staff_roles(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $body$;
CREATE INDEX IF NOT EXISTS idx_staff_roles_school ON public.staff_roles(school_id,name);
CREATE INDEX IF NOT EXISTS idx_staff_members_role ON public.staff_members(school_id,role_id);
ALTER TABLE public.staff_roles ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_roles TO authenticated;

DROP POLICY IF EXISTS staff_roles_tenant_scope ON public.staff_roles;
CREATE POLICY staff_roles_tenant_scope ON public.staff_roles FOR ALL TO authenticated USING (auth_user_role()='super_admin' OR school_id=auth_school_id()) WITH CHECK (auth_user_role()='super_admin' OR school_id=auth_school_id());
DROP POLICY IF EXISTS staff_roles_block_parent_student_writes ON public.staff_roles;
CREATE POLICY staff_roles_block_parent_student_writes ON public.staff_roles AS RESTRICTIVE FOR ALL TO authenticated USING (auth_user_role() NOT IN ('parent','student')) WITH CHECK (auth_user_role() NOT IN ('parent','student'));
NOTIFY pgrst,'reload schema';
