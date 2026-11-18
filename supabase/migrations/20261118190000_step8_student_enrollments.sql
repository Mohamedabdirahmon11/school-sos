-- STEP 8: additive student enrollment history and guardian links.
-- Existing student IDs, parent accounts, attendance, marks and finance rows are preserved.
BEGIN;

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS student_code TEXT GENERATED ALWAYS AS (student_id) STORED;
CREATE UNIQUE INDEX IF NOT EXISTS students_school_student_code_uidx
  ON public.students (school_id, student_code);
CREATE UNIQUE INDEX IF NOT EXISTS students_id_school_uidx ON public.students (id, school_id);
CREATE UNIQUE INDEX IF NOT EXISTS classes_id_school_uidx ON public.classes (id, school_id);
CREATE UNIQUE INDEX IF NOT EXISTS academic_years_id_school_uidx ON public.academic_years (id, school_id);
CREATE UNIQUE INDEX IF NOT EXISTS class_sections_id_school_uidx ON public.class_sections (id, school_id);
ALTER TABLE public.class_sections ADD COLUMN IF NOT EXISTS max_students INTEGER
  CHECK (max_students IS NULL OR max_students > 0);

CREATE TABLE IF NOT EXISTS public.guardians (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id VARCHAR(64) NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  full_name VARCHAR(160) NOT NULL CHECK (btrim(full_name) <> ''),
  phone VARCHAR(30) NOT NULL CHECK (btrim(phone) <> ''),
  phone_normalized TEXT GENERATED ALWAYS AS (regexp_replace(phone, '[^0-9]', '', 'g')) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, school_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS guardians_school_phone_uidx
  ON public.guardians (school_id, phone_normalized) WHERE phone_normalized <> '';

CREATE TABLE IF NOT EXISTS public.student_guardians (
  school_id VARCHAR(64) NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id VARCHAR(64) NOT NULL,
  guardian_id UUID NOT NULL,
  relation TEXT NOT NULL DEFAULT 'kale' CHECK (relation IN ('aabo','hooyo','walaal','kale')),
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, guardian_id),
  FOREIGN KEY (student_id, school_id) REFERENCES public.students(id, school_id) ON DELETE CASCADE,
  FOREIGN KEY (guardian_id, school_id) REFERENCES public.guardians(id, school_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id VARCHAR(64) NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id VARCHAR(64) NOT NULL,
  academic_year_id UUID NOT NULL,
  class_id VARCHAR(64) NOT NULL,
  section_id UUID,
  roll_number TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','promoted','repeated','transferred','withdrawn')),
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (student_id, school_id) REFERENCES public.students(id, school_id) ON DELETE RESTRICT,
  FOREIGN KEY (class_id, school_id) REFERENCES public.classes(id, school_id) ON DELETE RESTRICT,
  FOREIGN KEY (academic_year_id, school_id) REFERENCES public.academic_years(id, school_id) ON DELETE RESTRICT,
  FOREIGN KEY (section_id, school_id) REFERENCES public.class_sections(id, school_id) ON DELETE RESTRICT,
  CHECK ((status = 'active' AND left_at IS NULL) OR status <> 'active')
);
CREATE UNIQUE INDEX IF NOT EXISTS enrollments_one_active_per_student_year_uidx
  ON public.enrollments (school_id, student_id, academic_year_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS enrollments_school_class_year_idx
  ON public.enrollments (school_id, class_id, academic_year_id, status);
CREATE INDEX IF NOT EXISTS student_guardians_school_guardian_idx
  ON public.student_guardians (school_id, guardian_id);
CREATE UNIQUE INDEX IF NOT EXISTS student_guardians_one_primary_uidx
  ON public.student_guardians (school_id, student_id) WHERE is_primary = true;

-- Backfill existing parent information without changing users, linked_student_ids or student IDs.
INSERT INTO public.guardians (school_id, full_name, phone)
SELECT DISTINCT ON (s.school_id, regexp_replace(s.father_phone, '[^0-9]', '', 'g'))
       s.school_id, COALESCE(NULLIF(btrim(s.father_name), ''), 'Waalid / Masuul'),
       s.father_phone
  FROM public.students s
 WHERE NULLIF(regexp_replace(s.father_phone, '[^0-9]', '', 'g'), '') IS NOT NULL
 ORDER BY s.school_id, regexp_replace(s.father_phone, '[^0-9]', '', 'g'), s.created_at
ON CONFLICT (school_id, phone_normalized) WHERE phone_normalized <> '' DO NOTHING;

INSERT INTO public.student_guardians (school_id, student_id, guardian_id, relation, is_primary)
SELECT s.school_id, s.id, g.id, 'aabo', true
  FROM public.students s
  JOIN public.guardians g ON g.school_id = s.school_id
   AND g.phone_normalized = regexp_replace(s.father_phone, '[^0-9]', '', 'g')
ON CONFLICT DO NOTHING;

-- Create a current-year enrollment snapshot for legacy students. Historical rows are never overwritten.
INSERT INTO public.enrollments (school_id, student_id, academic_year_id, class_id, section_id, roll_number, status, enrolled_at)
SELECT s.school_id, s.id, ay.id, c.id,
       (SELECT cs.id FROM public.class_sections cs
         WHERE cs.school_id = s.school_id AND cs.legacy_class_id = c.id
           AND cs.name = s.section ORDER BY cs.sort_order LIMIT 1),
       s.roll_number, 'active', s.admission_date::timestamptz
  FROM public.students s
  JOIN public.classes c ON c.id = s.class_id AND c.school_id = s.school_id
  JOIN public.academic_years ay ON ay.school_id = s.school_id
   AND (ay.name = c.academic_year OR (ay.is_current AND c.academic_year = ay.name))
 WHERE lower(COALESCE(s.status,'')) = 'active'
ON CONFLICT DO NOTHING;

-- Keep the legacy students.class_id column in sync with a current-year enrollment on admission.
CREATE OR REPLACE FUNCTION public.schoolos_create_initial_student_enrollment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $
DECLARE v_year UUID;
BEGIN
  SELECT id INTO v_year FROM public.academic_years
   WHERE school_id=NEW.school_id AND is_current=true ORDER BY start_date DESC LIMIT 1;
  IF v_year IS NULL THEN
    SELECT id INTO v_year FROM public.academic_years
     WHERE school_id=NEW.school_id
       AND name=(SELECT academic_year FROM public.classes WHERE id=NEW.class_id AND school_id=NEW.school_id)
     ORDER BY start_date DESC LIMIT 1;
  END IF;
  IF v_year IS NOT NULL AND lower(COALESCE(NEW.status,''))='active' THEN
    INSERT INTO public.enrollments(school_id,student_id,academic_year_id,class_id,section_id,roll_number,status,enrolled_at)
    VALUES(NEW.school_id,NEW.id,v_year,NEW.class_id,
      (SELECT cs.id FROM public.class_sections cs WHERE cs.school_id=NEW.school_id
        AND cs.legacy_class_id=NEW.class_id AND cs.name=NEW.section ORDER BY cs.sort_order LIMIT 1),
      NEW.roll_number,'active',NEW.admission_date::timestamptz)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END; $;
DROP TRIGGER IF EXISTS students_create_initial_enrollment ON public.students;
CREATE TRIGGER students_create_initial_enrollment
  AFTER INSERT ON public.students FOR EACH ROW
  EXECUTE FUNCTION public.schoolos_create_initial_student_enrollment();

ALTER TABLE public.guardians ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_guardians ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guardians FORCE ROW LEVEL SECURITY;
ALTER TABLE public.student_guardians FORCE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS guardians_tenant_scope ON public.guardians;
CREATE POLICY guardians_tenant_scope ON public.guardians AS RESTRICTIVE FOR ALL
  USING ((private.auth_user_role() = 'super_admin') OR school_id = private.auth_school_id())
  WITH CHECK ((private.auth_user_role() = 'super_admin') OR school_id = private.auth_school_id());
DROP POLICY IF EXISTS guardians_tenant_read ON public.guardians;
CREATE POLICY guardians_tenant_read ON public.guardians FOR SELECT
  USING ((private.auth_user_role() = 'super_admin') OR school_id = private.auth_school_id());
DROP POLICY IF EXISTS student_guardians_tenant_scope ON public.student_guardians;
CREATE POLICY student_guardians_tenant_scope ON public.student_guardians AS RESTRICTIVE FOR ALL
  USING ((private.auth_user_role() = 'super_admin') OR school_id = private.auth_school_id())
  WITH CHECK ((private.auth_user_role() = 'super_admin') OR school_id = private.auth_school_id());
DROP POLICY IF EXISTS student_guardians_tenant_read ON public.student_guardians;
CREATE POLICY student_guardians_tenant_read ON public.student_guardians FOR SELECT
  USING ((private.auth_user_role() = 'super_admin') OR school_id = private.auth_school_id());
DROP POLICY IF EXISTS enrollments_tenant_scope ON public.enrollments;
CREATE POLICY enrollments_tenant_scope ON public.enrollments AS RESTRICTIVE FOR ALL
  USING ((private.auth_user_role() = 'super_admin') OR school_id = private.auth_school_id())
  WITH CHECK ((private.auth_user_role() = 'super_admin') OR school_id = private.auth_school_id());
DROP POLICY IF EXISTS enrollments_tenant_read ON public.enrollments;
CREATE POLICY enrollments_tenant_read ON public.enrollments FOR SELECT
  USING ((private.auth_user_role() = 'super_admin') OR school_id = private.auth_school_id());

DROP POLICY IF EXISTS guardians_admin_insert ON public.guardians;
CREATE POLICY guardians_admin_insert ON public.guardians FOR INSERT
  WITH CHECK (private.auth_user_role() IN ('school_admin','super_admin')
    AND ((private.auth_user_role() = 'super_admin') OR school_id = private.auth_school_id()));
DROP POLICY IF EXISTS guardians_admin_update ON public.guardians;
CREATE POLICY guardians_admin_update ON public.guardians FOR UPDATE
  USING (private.auth_user_role() IN ('school_admin','super_admin')
    AND ((private.auth_user_role() = 'super_admin') OR school_id = private.auth_school_id()))
  WITH CHECK (private.auth_user_role() IN ('school_admin','super_admin')
    AND ((private.auth_user_role() = 'super_admin') OR school_id = private.auth_school_id()));
DROP POLICY IF EXISTS guardians_admin_delete ON public.guardians;
CREATE POLICY guardians_admin_delete ON public.guardians FOR DELETE
  USING (private.auth_user_role() IN ('school_admin','super_admin')
    AND ((private.auth_user_role() = 'super_admin') OR school_id = private.auth_school_id()));

DROP POLICY IF EXISTS student_guardians_admin_insert ON public.student_guardians;
CREATE POLICY student_guardians_admin_insert ON public.student_guardians FOR INSERT
  WITH CHECK (private.auth_user_role() IN ('school_admin','super_admin')
    AND ((private.auth_user_role() = 'super_admin') OR school_id = private.auth_school_id()));
DROP POLICY IF EXISTS student_guardians_admin_delete ON public.student_guardians;
CREATE POLICY student_guardians_admin_delete ON public.student_guardians FOR DELETE
  USING (private.auth_user_role() IN ('school_admin','super_admin')
    AND ((private.auth_user_role() = 'super_admin') OR school_id = private.auth_school_id()));

DROP POLICY IF EXISTS enrollments_admin_insert ON public.enrollments;
CREATE POLICY enrollments_admin_insert ON public.enrollments FOR INSERT
  WITH CHECK (private.auth_user_role() IN ('school_admin','super_admin')
    AND ((private.auth_user_role() = 'super_admin') OR school_id = private.auth_school_id()));
DROP POLICY IF EXISTS enrollments_admin_update ON public.enrollments;
CREATE POLICY enrollments_admin_update ON public.enrollments FOR UPDATE
  USING (private.auth_user_role() IN ('school_admin','super_admin')
    AND ((private.auth_user_role() = 'super_admin') OR school_id = private.auth_school_id()))
  WITH CHECK (private.auth_user_role() IN ('school_admin','super_admin')
    AND ((private.auth_user_role() = 'super_admin') OR school_id = private.auth_school_id()));
DROP POLICY IF EXISTS enrollments_admin_delete ON public.enrollments;
CREATE POLICY enrollments_admin_delete ON public.enrollments FOR DELETE
  USING (private.auth_user_role() IN ('school_admin','super_admin')
    AND ((private.auth_user_role() = 'super_admin') OR school_id = private.auth_school_id()));

-- Service-role-only transaction for transfer/withdraw; school scope is supplied only by the authenticated Express layer.
CREATE OR REPLACE FUNCTION public.schoolos_transfer_enrollment(
  p_school_id TEXT, p_student_id TEXT, p_academic_year_id UUID,
  p_class_id TEXT, p_section_id UUID DEFAULT NULL, p_roll_number TEXT DEFAULT NULL,
  p_actor_id TEXT DEFAULT NULL, p_withdraw BOOLEAN DEFAULT false
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_student public.students%ROWTYPE; v_class public.classes%ROWTYPE; v_enrollment UUID;
BEGIN
  SELECT * INTO v_student FROM public.students
   WHERE id = p_student_id AND school_id = p_school_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Student not found in this school.'; END IF;
  IF p_withdraw THEN
    UPDATE public.enrollments SET status='withdrawn', left_at=now()
     WHERE school_id=p_school_id AND student_id=p_student_id AND academic_year_id=p_academic_year_id AND status='active';
    IF NOT FOUND THEN RAISE EXCEPTION 'Student has no active enrollment in the selected academic year.'; END IF;
    UPDATE public.students SET status='withdrawn' WHERE id=p_student_id AND school_id=p_school_id;
    INSERT INTO public.audit_logs (id,action,category,school_id,school_name,user_id,user_name,user_role,details,severity)
    SELECT 'log-'||gen_random_uuid()::text,'STUDENT_WITHDRAWN','school',p_school_id,sc.name,
      COALESCE(p_actor_id,'system'),'School admin','school_admin',
      'Withdrawn student '||v_student.student_id||' from academic year '||p_academic_year_id::text,'warning'
    FROM public.schools sc WHERE sc.id=p_school_id;
    RETURN NULL;
  END IF;
  SELECT * INTO v_class FROM public.classes
   WHERE id=p_class_id AND school_id=p_school_id AND NOT is_archived FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Target class not found in this school.'; END IF;
  IF p_section_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.class_sections cs WHERE cs.id=p_section_id AND cs.school_id=p_school_id
      AND (cs.legacy_class_id IS NULL OR cs.legacy_class_id=p_class_id)
  ) THEN RAISE EXCEPTION 'Target section does not belong to this class.'; END IF;
  IF (SELECT count(*) FROM public.enrollments e
       WHERE e.school_id=p_school_id AND e.class_id=p_class_id AND e.academic_year_id=p_academic_year_id
         AND e.status='active' AND (p_section_id IS NULL OR e.section_id=p_section_id))
     >= COALESCE((SELECT max_students FROM public.class_sections WHERE id=p_section_id AND school_id=p_school_id), v_class.capacity)
  THEN RAISE EXCEPTION 'Class or section capacity has been reached.'; END IF;
  UPDATE public.enrollments SET status='transferred', left_at=now()
   WHERE school_id=p_school_id AND student_id=p_student_id AND academic_year_id=p_academic_year_id AND status='active';
  INSERT INTO public.enrollments (school_id,student_id,academic_year_id,class_id,section_id,roll_number,status)
  VALUES (p_school_id,p_student_id,p_academic_year_id,p_class_id,p_section_id,NULLIF(btrim(p_roll_number),''),'active')
  RETURNING id INTO v_enrollment;
  UPDATE public.students SET class_id=p_class_id,
    section=COALESCE((SELECT name FROM public.class_sections WHERE id=p_section_id AND school_id=p_school_id), v_class.section),
    roll_number=NULLIF(btrim(p_roll_number),'')
   WHERE id=p_student_id AND school_id=p_school_id;
  INSERT INTO public.audit_logs (id,action,category,school_id,school_name,user_id,user_name,user_role,details,severity)
  SELECT 'log-'||gen_random_uuid()::text,'STUDENT_TRANSFERRED','school',p_school_id,sc.name,
         COALESCE(p_actor_id,'system'),'School admin','school_admin',
         'Transferred student '||v_student.student_id||' to class '||v_class.name,'info'
    FROM public.schools sc WHERE sc.id=p_school_id;
  RETURN v_enrollment;
END; $$;
REVOKE ALL ON FUNCTION public.schoolos_transfer_enrollment(TEXT,TEXT,UUID,TEXT,UUID,TEXT,TEXT,BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schoolos_transfer_enrollment(TEXT,TEXT,UUID,TEXT,UUID,TEXT,TEXT,BOOLEAN) TO service_role;

-- Atomic next-year promotion/repeat batch. Existing enrollment rows are closed, never deleted.
CREATE OR REPLACE FUNCTION public.schoolos_promote_enrollments(
  p_school_id TEXT, p_source_year UUID, p_target_year UUID,
  p_class_id TEXT, p_decisions JSONB, p_actor_id TEXT DEFAULT NULL
) RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_item JSONB; v_student_id TEXT; v_decision TEXT; v_target_class TEXT; v_count INTEGER:=0; v_target_class_capacity INTEGER;
BEGIN
  IF jsonb_typeof(p_decisions)<>'array' OR jsonb_array_length(p_decisions)>2000 THEN
    RAISE EXCEPTION 'Promotion decisions must be an array of at most 2,000 students.';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.academic_years WHERE id=p_source_year AND school_id=p_school_id)
     OR NOT EXISTS(SELECT 1 FROM public.academic_years WHERE id=p_target_year AND school_id=p_school_id)
  THEN RAISE EXCEPTION 'Academic year does not belong to this school.'; END IF;
  PERFORM 1 FROM public.classes WHERE id=p_class_id AND school_id=p_school_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Source class not found.'; END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_decisions) LOOP
    v_student_id:=v_item->>'studentId'; v_decision:=v_item->>'decision';
    v_target_class:=CASE WHEN v_decision='promoted' THEN COALESCE(v_item->>'targetClassId',p_class_id) ELSE p_class_id END;
    IF v_decision NOT IN ('promoted','repeated') THEN RAISE EXCEPTION 'Invalid promotion decision.'; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.enrollments WHERE school_id=p_school_id AND student_id=v_student_id
       AND academic_year_id=p_source_year AND class_id=p_class_id AND status='active') THEN
      RAISE EXCEPTION 'A selected student is not actively enrolled in the source class.';
    END IF;
    SELECT capacity INTO v_target_class_capacity FROM public.classes WHERE id=v_target_class AND school_id=p_school_id AND NOT is_archived;
    IF NOT FOUND THEN RAISE EXCEPTION 'Target class not found in this school.'; END IF;
    IF (SELECT count(*) FROM public.enrollments e WHERE e.school_id=p_school_id AND e.academic_year_id=p_target_year AND e.class_id=v_target_class AND e.status='active') >= v_target_class_capacity THEN RAISE EXCEPTION 'Target class capacity has been reached.'; END IF;
    UPDATE public.enrollments SET status=v_decision,left_at=now()
     WHERE school_id=p_school_id AND student_id=v_student_id AND academic_year_id=p_source_year AND status='active';
    INSERT INTO public.enrollments(school_id,student_id,academic_year_id,class_id,section_id,roll_number,status)
    VALUES(p_school_id,v_student_id,p_target_year,v_target_class,NULL,NULL,'active');
    UPDATE public.students SET class_id=v_target_class,
      section=(SELECT section FROM public.classes WHERE id=v_target_class AND school_id=p_school_id)
     WHERE id=v_student_id AND school_id=p_school_id;
    v_count:=v_count+1;
  END LOOP;
  INSERT INTO public.audit_logs(id,action,category,school_id,school_name,user_id,user_name,user_role,details,severity)
  SELECT 'log-'||gen_random_uuid()::text,'STUDENT_PROMOTION_BATCH','school',p_school_id,sc.name,
    COALESCE(p_actor_id,'system'),'School admin','school_admin',
    'Promoted/repeated '||v_count||' students from academic year '||p_source_year::text||' to '||p_target_year::text,'info'
  FROM public.schools sc WHERE sc.id=p_school_id;
  RETURN v_count;
END; $$;
REVOKE ALL ON FUNCTION public.schoolos_promote_enrollments(TEXT,UUID,UUID,TEXT,JSONB,TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schoolos_promote_enrollments(TEXT,UUID,UUID,TEXT,JSONB,TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
