-- STEP 10A: term-based assessment components, mark entry, term closure and yearly report cards.
-- Additive migration: legacy exam_configs/student_marks and their data are untouched.

BEGIN;

-- Link the existing exam configuration and marks records to the new academic terms.
-- Legacy columns and values are retained; no existing mark rows are deleted or rewritten.
ALTER TABLE public.exam_configs
  ADD COLUMN IF NOT EXISTS term_id uuid,
  ADD COLUMN IF NOT EXISTS class_id varchar(64);
ALTER TABLE public.student_marks
  ADD COLUMN IF NOT EXISTS term_id uuid;

DO $legacy_fks$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='exam_configs_term_school_fk') THEN
    ALTER TABLE public.exam_configs ADD CONSTRAINT exam_configs_term_school_fk
      FOREIGN KEY (term_id,school_id) REFERENCES public.terms(id,school_id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='exam_configs_class_school_fk') THEN
    ALTER TABLE public.exam_configs ADD CONSTRAINT exam_configs_class_school_fk
      FOREIGN KEY (class_id,school_id) REFERENCES public.classes(id,school_id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='student_marks_term_school_fk') THEN
    ALTER TABLE public.student_marks ADD CONSTRAINT student_marks_term_school_fk
      FOREIGN KEY (term_id,school_id) REFERENCES public.terms(id,school_id) ON DELETE RESTRICT;
  END IF;
END;
$legacy_fks$;

UPDATE public.student_marks sm
SET term_id=t.id
FROM public.academic_years ay
JOIN public.terms t ON t.academic_year_id=ay.id AND t.school_id=ay.school_id
WHERE sm.term_id IS NULL
  AND sm.school_id=ay.school_id
  AND sm.academic_year=ay.name
  AND regexp_replace(lower(t.name),'[^0-9]','','g')
      = regexp_replace(lower(sm.semester),'[^0-9]','','g')
  AND regexp_replace(lower(sm.semester),'[^0-9]','','g') IN ('1','2');
CREATE INDEX IF NOT EXISTS exam_configs_school_term_idx ON public.exam_configs(school_id,term_id);
CREATE INDEX IF NOT EXISTS student_marks_school_term_class_idx ON public.student_marks(school_id,term_id,class_id);

CREATE TABLE IF NOT EXISTS public.mark_structures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id varchar(64) NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  term_id uuid NOT NULL,
  class_id varchar(64),
  exam_max smallint NOT NULL CHECK (exam_max IN (50,60)),
  rest_mode text NOT NULL CHECK (rest_mode IN ('single','quizzes')),
  quiz_count smallint NOT NULL DEFAULT 1 CHECK (quiz_count BETWEEN 1 AND 20),
  created_by varchar(64),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mark_structures_term_school_fk FOREIGN KEY (term_id,school_id)
    REFERENCES public.terms(id,school_id) ON DELETE CASCADE,
  CONSTRAINT mark_structures_class_school_fk FOREIGN KEY (class_id,school_id)
    REFERENCES public.classes(id,school_id) ON DELETE CASCADE,
  CONSTRAINT mark_structures_rest_count_check CHECK (
    (rest_mode='single' AND quiz_count=1) OR rest_mode='quizzes'
  ),
  UNIQUE (id,school_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS mark_structures_scope_uidx
  ON public.mark_structures(school_id,term_id,COALESCE(class_id,'__SCHOOL__'));
CREATE INDEX IF NOT EXISTS mark_structures_term_idx ON public.mark_structures(school_id,term_id,class_id);

CREATE TABLE IF NOT EXISTS public.mark_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id varchar(64) NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  structure_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('exam','single','quiz')),
  seq smallint NOT NULL CHECK (seq > 0),
  name varchar(120) NOT NULL,
  max_marks numeric(6,2) NOT NULL CHECK (max_marks > 0 AND max_marks <= 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mark_components_structure_school_fk FOREIGN KEY (structure_id,school_id)
    REFERENCES public.mark_structures(id,school_id) ON DELETE CASCADE,
  UNIQUE (id,school_id),
  UNIQUE (structure_id,seq)
);
CREATE INDEX IF NOT EXISTS mark_components_structure_idx ON public.mark_components(school_id,structure_id,seq);

CREATE TABLE IF NOT EXISTS public.term_status (
  school_id varchar(64) NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  term_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  closed_by varchar(64),
  closed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (school_id,term_id),
  FOREIGN KEY (term_id,school_id) REFERENCES public.terms(id,school_id) ON DELETE CASCADE
);
INSERT INTO public.term_status(school_id,term_id,status)
SELECT school_id,id,'open' FROM public.terms
ON CONFLICT (school_id,term_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.component_marks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id varchar(64) NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  component_id uuid NOT NULL,
  class_id varchar(64) NOT NULL,
  subject_id varchar(64) NOT NULL,
  student_id varchar(64) NOT NULL,
  marks numeric(6,2),
  status text NOT NULL DEFAULT 'present' CHECK (status IN ('present','absent','excused')),
  entered_by varchar(64) NOT NULL,
  entered_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT component_marks_component_school_fk FOREIGN KEY (component_id,school_id)
    REFERENCES public.mark_components(id,school_id) ON DELETE CASCADE,
  CONSTRAINT component_marks_class_school_fk FOREIGN KEY (class_id,school_id)
    REFERENCES public.classes(id,school_id) ON DELETE CASCADE,
  CONSTRAINT component_marks_subject_school_fk FOREIGN KEY (subject_id,school_id)
    REFERENCES public.subjects(id,school_id) ON DELETE RESTRICT,
  CONSTRAINT component_marks_student_school_fk FOREIGN KEY (student_id,school_id)
    REFERENCES public.students(id,school_id) ON DELETE CASCADE,
  CONSTRAINT component_marks_score_check CHECK (marks IS NULL OR marks >= 0),
  UNIQUE (component_id,subject_id,student_id)
);
CREATE INDEX IF NOT EXISTS component_marks_class_subject_idx
  ON public.component_marks(school_id,class_id,subject_id,component_id);
CREATE INDEX IF NOT EXISTS component_marks_student_idx
  ON public.component_marks(school_id,student_id,component_id);


CREATE OR REPLACE FUNCTION public.schoolos_guard_component_mark()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $guard$
DECLARE v_max numeric; v_term uuid; v_year uuid;
BEGIN
  SELECT mc.max_marks,ms.term_id,t.academic_year_id INTO v_max,v_term,v_year
  FROM public.mark_components mc
  JOIN public.mark_structures ms ON ms.id=mc.structure_id AND ms.school_id=mc.school_id
  JOIN public.terms t ON t.id=ms.term_id AND t.school_id=ms.school_id
  WHERE mc.id=NEW.component_id AND mc.school_id=NEW.school_id;
  IF v_max IS NULL THEN RAISE EXCEPTION 'Qaybta dhibcaha lama helin.'; END IF;
  IF NEW.marks IS NOT NULL AND (NEW.marks<0 OR NEW.marks>v_max) THEN
    RAISE EXCEPTION 'Dhibcuhu waa inay u dhexeeyaan 0 iyo %.',v_max;
  END IF;
  IF NEW.status IN ('absent','excused') AND NEW.marks IS NOT NULL THEN
    RAISE EXCEPTION 'Xaaladda ardayga iyo dhibcihiisu isma waafaqaan.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.term_status ts WHERE ts.school_id=NEW.school_id
    AND ts.term_id=v_term AND ts.status='open') THEN
    RAISE EXCEPTION 'Term-kan waa xiran yahay; dhibco lama beddeli karo.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.enrollments e WHERE e.school_id=NEW.school_id
    AND e.student_id=NEW.student_id AND e.class_id=NEW.class_id
    AND e.academic_year_id=v_year AND e.status='active') THEN
    RAISE EXCEPTION 'Ardaygu fasalkan kuma jiro diiwaanka term-kan.';
  END IF;
  RETURN NEW;
END;
$guard$;
DROP TRIGGER IF EXISTS component_marks_guard ON public.component_marks;
CREATE TRIGGER component_marks_guard BEFORE INSERT OR UPDATE ON public.component_marks
FOR EACH ROW EXECUTE FUNCTION public.schoolos_guard_component_mark();

CREATE TABLE IF NOT EXISTS public.marks_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id varchar(64) NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  entity_type text NOT NULL DEFAULT 'component_mark',
  entity_id uuid,
  component_id uuid,
  class_id varchar(64),
  subject_id varchar(64),
  student_id varchar(64),
  old_value jsonb,
  new_value jsonb,
  changed_by varchar(64) NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS marks_audit_school_time_idx ON public.marks_audit(school_id,changed_at DESC);
CREATE INDEX IF NOT EXISTS marks_audit_student_idx ON public.marks_audit(school_id,student_id,changed_at DESC);

CREATE TABLE IF NOT EXISTS public.report_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id varchar(64) NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id varchar(64) NOT NULL,
  academic_year_id uuid NOT NULL,
  class_id varchar(64) NOT NULL,
  yearly_average numeric(6,2) NOT NULL CHECK (yearly_average BETWEEN 0 AND 100),
  overall_grade text,
  rank_in_class integer NOT NULL CHECK (rank_in_class > 0),
  subject_results jsonb NOT NULL DEFAULT '[]'::jsonb,
  teacher_comment text,
  head_comment text,
  published_at timestamptz,
  published_by varchar(64),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (student_id,school_id) REFERENCES public.students(id,school_id) ON DELETE CASCADE,
  FOREIGN KEY (academic_year_id,school_id) REFERENCES public.academic_years(id,school_id) ON DELETE CASCADE,
  FOREIGN KEY (class_id,school_id) REFERENCES public.classes(id,school_id) ON DELETE CASCADE,
  UNIQUE (school_id,student_id,academic_year_id)
);
CREATE INDEX IF NOT EXISTS report_cards_class_year_idx ON public.report_cards(school_id,class_id,academic_year_id,rank_in_class);
CREATE INDEX IF NOT EXISTS report_cards_parent_published_idx ON public.report_cards(school_id,student_id,academic_year_id) WHERE published_at IS NOT NULL;

-- Deferred validation permits the server RPC to replace all component rows atomically.
CREATE OR REPLACE FUNCTION public.schoolos_check_mark_structure_total()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_structure_id uuid; v_school_id text; v_total numeric;
BEGIN
  IF TG_OP='DELETE' THEN
    v_structure_id := OLD.structure_id;
    v_school_id := OLD.school_id;
  ELSE
    v_structure_id := NEW.structure_id;
    v_school_id := NEW.school_id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mark_structures ms WHERE ms.id=v_structure_id AND ms.school_id=v_school_id) THEN
    RETURN NULL;
  END IF;
  SELECT COALESCE(sum(mc.max_marks),0) INTO v_total
  FROM public.mark_components mc WHERE mc.structure_id=v_structure_id AND mc.school_id=v_school_id;
  IF v_total <> 100 THEN
    RAISE EXCEPTION 'Wadarta qaybaha dhibcuhu waa inay noqotaa 100; hadda waa %.',v_total;
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS mark_components_total_check ON public.mark_components;
CREATE CONSTRAINT TRIGGER mark_components_total_check
AFTER INSERT OR UPDATE OR DELETE ON public.mark_components
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION public.schoolos_check_mark_structure_total();

CREATE OR REPLACE FUNCTION public.schoolos_audit_component_mark()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $audit$
BEGIN
  INSERT INTO public.marks_audit(
    school_id,entity_type,entity_id,component_id,class_id,subject_id,student_id,
    old_value,new_value,changed_by
  ) VALUES (
    COALESCE(NEW.school_id,OLD.school_id),'component_mark',COALESCE(NEW.id,OLD.id),
    COALESCE(NEW.component_id,OLD.component_id),COALESCE(NEW.class_id,OLD.class_id),
    COALESCE(NEW.subject_id,OLD.subject_id),COALESCE(NEW.student_id,OLD.student_id),
    CASE WHEN TG_OP='INSERT' THEN NULL ELSE jsonb_build_object('marks',OLD.marks,'status',OLD.status) END,
    CASE WHEN TG_OP='DELETE' THEN NULL ELSE jsonb_build_object('marks',NEW.marks,'status',NEW.status) END,
    COALESCE(NEW.entered_by,OLD.entered_by,'system')
  );
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$audit$;
DROP TRIGGER IF EXISTS component_marks_audit ON public.component_marks;
CREATE TRIGGER component_marks_audit
AFTER INSERT OR UPDATE OR DELETE ON public.component_marks
FOR EACH ROW EXECUTE FUNCTION public.schoolos_audit_component_mark();

-- RLS helper: the signed-in SchoolOS teacher must own the Step 6 assignment.
CREATE OR REPLACE FUNCTION private.auth_has_term_assignment(
  p_school_id text,p_class_id text,p_subject_id text,p_term_id uuid,p_student_id text DEFAULT NULL
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    JOIN public.teachers t ON t.user_id=u.id AND t.school_id=u.school_id
    JOIN public.teacher_class_subject_assignments a
      ON a.teacher_id=t.id AND a.school_id=t.school_id
    JOIN public.terms tr ON tr.id=p_term_id AND tr.school_id=p_school_id
      AND tr.academic_year_id=a.academic_year_id
    LEFT JOIN public.enrollments e ON e.school_id=p_school_id
      AND e.student_id=p_student_id AND e.class_id=p_class_id
      AND e.academic_year_id=tr.academic_year_id AND e.status='active'
    WHERE u.id=private.auth_user_id()
      AND u.role='teacher' AND u.school_id=p_school_id
      AND a.class_id=p_class_id AND a.subject_id=p_subject_id
      AND (a.term_id IS NULL OR a.term_id=p_term_id)
      AND (p_student_id IS NULL OR a.section_id IS NULL OR a.section_id=e.section_id)
  );
$$;
REVOKE ALL ON FUNCTION private.auth_has_term_assignment(text,text,text,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.auth_has_term_assignment(text,text,text,uuid,text) TO authenticated,service_role;

-- Admin-only, atomic structure generation. Quiz marks divide the remainder equally.
CREATE OR REPLACE FUNCTION public.schoolos_save_mark_structure(
  p_school_id text,p_term_id uuid,p_class_id text,p_exam_max integer,
  p_rest_mode text,p_quiz_count integer,p_actor_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_structure public.mark_structures%ROWTYPE; v_rest integer; v_count integer; v_component_count integer;
BEGIN
  IF p_exam_max NOT IN (50,60) OR p_rest_mode NOT IN ('single','quizzes')
     OR p_quiz_count NOT BETWEEN 1 AND 20
     OR (p_rest_mode='single' AND p_quiz_count<>1) THEN
    RAISE EXCEPTION 'Dooro imtixaan 50 ama 60; qaybta hartayna si sax ah u qaybi.';
  END IF;
  v_rest := 100-p_exam_max;
  v_count := CASE WHEN p_rest_mode='single' THEN 1 ELSE p_quiz_count END;
  IF v_rest % v_count <> 0 THEN
    RAISE EXCEPTION 'Dhibcaha quizzes-ka si isle''eg looma qaybin karo. Dooro tiro qaybisa %.',v_rest;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id=p_actor_id
    AND (u.role='super_admin' OR (u.role='school_admin' AND u.school_id=p_school_id))) THEN
    RAISE EXCEPTION 'Ma lihid oggolaansho aad ku maamusho qaabka dhibcaha.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.terms t WHERE t.id=p_term_id AND t.school_id=p_school_id) THEN
    RAISE EXCEPTION 'Term-kan dugsigan kama tirsana.';
  END IF;
  IF p_class_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.classes c WHERE c.id=p_class_id AND c.school_id=p_school_id) THEN
    RAISE EXCEPTION 'Fasalka la doortay dugsigan kama tirsana.';
  END IF;
  SELECT * INTO v_structure FROM public.mark_structures
   WHERE school_id=p_school_id AND term_id=p_term_id
     AND COALESCE(class_id,'__SCHOOL__')=COALESCE(p_class_id,'__SCHOOL__')
   FOR UPDATE;
  IF FOUND THEN
    IF EXISTS (SELECT 1 FROM public.component_marks cm JOIN public.mark_components mc
      ON mc.id=cm.component_id AND mc.school_id=cm.school_id
      WHERE mc.structure_id=v_structure.id AND cm.school_id=p_school_id) THEN
      RAISE EXCEPTION 'Qaabkan dhibcaha hore ayaa lagu geliyey natiijooyin; lama beddeli karo si xogtu u badbaaddo.';
    END IF;
    DELETE FROM public.mark_components WHERE school_id=p_school_id AND structure_id=v_structure.id;
    UPDATE public.mark_structures SET exam_max=p_exam_max,rest_mode=p_rest_mode,
      quiz_count=v_count,created_by=p_actor_id,updated_at=now()
      WHERE id=v_structure.id AND school_id=p_school_id;
  ELSE
    INSERT INTO public.mark_structures(school_id,term_id,class_id,exam_max,rest_mode,quiz_count,created_by)
    VALUES(p_school_id,p_term_id,p_class_id,p_exam_max,p_rest_mode,v_count,p_actor_id)
    RETURNING * INTO v_structure;
  END IF;
  INSERT INTO public.mark_components(school_id,structure_id,kind,seq,name,max_marks)
  VALUES(p_school_id,v_structure.id,'exam',1,'Imtixaanka Term-ka',p_exam_max);
  IF p_rest_mode='single' THEN
    INSERT INTO public.mark_components(school_id,structure_id,kind,seq,name,max_marks)
    VALUES(p_school_id,v_structure.id,'single',2,'Qiimayn joogto ah',v_rest);
  ELSE
    FOR i IN 1..v_count LOOP
      INSERT INTO public.mark_components(school_id,structure_id,kind,seq,name,max_marks)
      VALUES(p_school_id,v_structure.id,'quiz',i+1,'Quiz '||i,v_rest/v_count);
    END LOOP;
  END IF;
  INSERT INTO public.marks_audit(school_id,entity_type,entity_id,old_value,new_value,changed_by)
  VALUES(p_school_id,'mark_structure',v_structure.id,NULL,
    jsonb_build_object('exam_max',p_exam_max,'rest_mode',p_rest_mode,'quiz_count',v_count),p_actor_id);
  RETURN jsonb_build_object('structure_id',v_structure.id,'exam_max',p_exam_max,
    'rest_mode',p_rest_mode,'quiz_count',v_count,'total',100);
END;
$$;
REVOKE ALL ON FUNCTION public.schoolos_save_mark_structure(text,uuid,text,integer,text,integer,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.schoolos_save_mark_structure(text,uuid,text,integer,text,integer,text) TO service_role;

-- Bulk mark entry. The authenticated teacher's Step 6 assignment and active enrollment are checked here.
CREATE OR REPLACE FUNCTION public.schoolos_save_component_marks(
  p_school_id text,p_actor_id text,p_component_id uuid,p_class_id text,p_subject_id text,p_marks jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_component public.mark_components%ROWTYPE; v_structure public.mark_structures%ROWTYPE;
  v_term_id uuid; v_year_id uuid; v_teacher_id text; v_item jsonb; v_student_id text;
  v_score numeric; v_status text; v_count integer:=0; v_enrollment public.enrollments%ROWTYPE;
BEGIN
  IF jsonb_typeof(p_marks)<>'array' OR jsonb_array_length(p_marks)<1 OR jsonb_array_length(p_marks)>2000 THEN
    RAISE EXCEPTION 'U dir 1 ilaa 2,000 arday hal mar.';
  END IF;
  SELECT id INTO v_teacher_id FROM public.teachers
   WHERE user_id=p_actor_id AND school_id=p_school_id;
  IF v_teacher_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.users
    WHERE id=p_actor_id AND school_id=p_school_id AND role='teacher') THEN
    RAISE EXCEPTION 'Akoonka macallinka lama xaqiijin.';
  END IF;
  SELECT mc.* INTO v_component FROM public.mark_components mc
   WHERE mc.id=p_component_id AND mc.school_id=p_school_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Qaybtan dhibcaha lama helin.'; END IF;
  SELECT ms.* INTO v_structure FROM public.mark_structures ms
   WHERE ms.id=v_component.structure_id AND ms.school_id=p_school_id;
  v_term_id:=v_structure.term_id;
  SELECT academic_year_id INTO v_year_id FROM public.terms WHERE id=v_term_id AND school_id=p_school_id;
  IF v_structure.class_id IS NOT NULL AND v_structure.class_id<>p_class_id THEN
    RAISE EXCEPTION 'Qaabka dhibcaha fasalkan looma dejin.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.term_status ts WHERE ts.school_id=p_school_id
    AND ts.term_id=v_term_id AND ts.status='open') THEN
    RAISE EXCEPTION 'Term-kan waa xiran yahay; macallimiintu dhibco ma gelin karaan.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.subjects s WHERE s.id=p_subject_id AND s.school_id=p_school_id)
     OR NOT EXISTS (SELECT 1 FROM public.class_subjects cs WHERE cs.school_id=p_school_id
       AND cs.class_id=p_class_id AND cs.subject_id=p_subject_id AND cs.is_active=true) THEN
    RAISE EXCEPTION 'Maaddadani fasalkan kama diiwaangashana.';
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_marks) LOOP
    v_student_id:=v_item->>'studentId';
    v_status:=COALESCE(v_item->>'status','present');
    v_score:=NULLIF(v_item->>'marks','')::numeric;
    IF v_student_id IS NULL OR v_status NOT IN ('present','absent','excused')
      OR (v_score IS NOT NULL AND (v_score<0 OR v_score>v_component.max_marks)) THEN
      RAISE EXCEPTION 'Dhibcuhu waa inay u dhexeeyaan 0 iyo %; xaaladdana si sax ah u dooro.',v_component.max_marks;
    END IF;
    SELECT * INTO v_enrollment FROM public.enrollments e
      WHERE e.school_id=p_school_id AND e.student_id=v_student_id AND e.class_id=p_class_id
        AND e.academic_year_id=v_year_id AND e.status='active' LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'Ardaygu fasalkan kuma jiro diiwaanka term-kan.'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.teacher_class_subject_assignments a
      WHERE a.school_id=p_school_id AND a.teacher_id=v_teacher_id AND a.academic_year_id=v_year_id
        AND (a.term_id IS NULL OR a.term_id=v_term_id) AND a.class_id=p_class_id
        AND a.subject_id=p_subject_id AND (a.section_id IS NULL OR a.section_id=v_enrollment.section_id)) THEN
      RAISE EXCEPTION 'Macallinku fasalkan iyo maaddadan looma qoondeyn.';
    END IF;
    INSERT INTO public.component_marks(school_id,component_id,class_id,subject_id,student_id,marks,status,entered_by)
    VALUES(p_school_id,p_component_id,p_class_id,p_subject_id,v_student_id,v_score,v_status,p_actor_id)
    ON CONFLICT(component_id,subject_id,student_id) DO UPDATE SET
      marks=EXCLUDED.marks,status=EXCLUDED.status,entered_by=EXCLUDED.entered_by,entered_at=now();
    IF v_status IN ('absent','excused') OR v_score IS NOT NULL THEN v_count:=v_count+1; END IF;
  END LOOP;
  RETURN jsonb_build_object('saved_count',v_count,'term_id',v_term_id,'component_id',p_component_id);
END;
$$;
REVOKE ALL ON FUNCTION public.schoolos_save_component_marks(text,text,uuid,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.schoolos_save_component_marks(text,text,uuid,text,text,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.schoolos_set_term_status(
  p_school_id text,p_term_id uuid,p_status text,p_actor_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_old public.term_status%ROWTYPE; v_previous text;
BEGIN
  IF p_status NOT IN ('open','closed') THEN RAISE EXCEPTION 'Xaaladda term-ku waa inay noqotaa open ama closed.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id=p_actor_id
    AND (u.role='super_admin' OR (u.role='school_admin' AND u.school_id=p_school_id))) THEN
    RAISE EXCEPTION 'Ma lihid oggolaansho aad term-ka u xirto ama u furto.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.terms WHERE id=p_term_id AND school_id=p_school_id) THEN
    RAISE EXCEPTION 'Term-kan dugsigan kama tirsana.';
  END IF;
  SELECT status INTO v_previous FROM public.term_status WHERE school_id=p_school_id AND term_id=p_term_id;
  v_previous:=COALESCE(v_previous,'open');
  INSERT INTO public.term_status(school_id,term_id,status,closed_by,closed_at,updated_at)
  VALUES(p_school_id,p_term_id,p_status,CASE WHEN p_status='closed' THEN p_actor_id END,
    CASE WHEN p_status='closed' THEN now() END,now())
  ON CONFLICT(school_id,term_id) DO UPDATE SET status=EXCLUDED.status,
    closed_by=EXCLUDED.closed_by,closed_at=EXCLUDED.closed_at,updated_at=now()
  RETURNING * INTO v_old;
  INSERT INTO public.marks_audit(school_id,entity_type,entity_id,old_value,new_value,changed_by)
  VALUES(p_school_id,'term_status',p_term_id,
    jsonb_build_object('status',v_previous),
    jsonb_build_object('status',p_status),p_actor_id);
  RETURN jsonb_build_object('term_id',p_term_id,'status',p_status,'closed_at',v_old.closed_at);
END;
$$;
REVOKE ALL ON FUNCTION public.schoolos_set_term_status(text,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.schoolos_set_term_status(text,uuid,text,text) TO service_role;

-- Term results snapshot: component totals, per-subject percentages, grade, class rank and missing rows.
CREATE OR REPLACE FUNCTION public.schoolos_term_results(p_school_id text,p_term_id uuid,p_class_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_year uuid; v_results jsonb;
BEGIN
  SELECT academic_year_id INTO v_year FROM public.terms WHERE id=p_term_id AND school_id=p_school_id;
  IF v_year IS NULL THEN RAISE EXCEPTION 'Term-kan dugsigan kama tirsana.'; END IF;
  WITH students AS (
    SELECT e.student_id,s.first_name,s.middle_name,s.last_name,s.student_id AS code
    FROM public.enrollments e JOIN public.students s ON s.id=e.student_id AND s.school_id=e.school_id
    WHERE e.school_id=p_school_id AND e.class_id=p_class_id AND e.academic_year_id=v_year AND e.status='active'
  ), subjects AS (
    SELECT cs.subject_id,sub.name AS subject_name FROM public.class_subjects cs
    JOIN public.subjects sub ON sub.id=cs.subject_id AND sub.school_id=cs.school_id
    WHERE cs.school_id=p_school_id AND cs.class_id=p_class_id AND cs.is_active=true
  ), chosen AS (
    SELECT DISTINCT ON (ms.term_id) ms.id,ms.term_id FROM public.mark_structures ms
    WHERE ms.school_id=p_school_id AND ms.term_id=p_term_id AND (ms.class_id IS NULL OR ms.class_id=p_class_id)
    ORDER BY ms.term_id,(ms.class_id IS NOT NULL) DESC
  ), totals AS (
    SELECT st.student_id,su.subject_id,su.subject_name,
      COALESCE(sum(CASE WHEN cm.status='present' THEN cm.marks ELSE 0 END),0) AS total,
      count(cm.id) FILTER (WHERE cm.marks IS NOT NULL OR cm.status IN ('absent','excused')) AS entered_count,count(mc.id) AS component_count
    FROM students st CROSS JOIN subjects su CROSS JOIN chosen ch
    JOIN public.mark_components mc ON mc.structure_id=ch.id AND mc.school_id=p_school_id
    LEFT JOIN public.component_marks cm ON cm.school_id=p_school_id AND cm.component_id=mc.id
      AND cm.class_id=p_class_id AND cm.subject_id=su.subject_id AND cm.student_id=st.student_id
    GROUP BY st.student_id,su.subject_id,su.subject_name
  ), averages AS (
    SELECT student_id,avg(total)::numeric(6,2) AS average,
      bool_and(entered_count=component_count) AS complete,
      jsonb_agg(jsonb_build_object('subject_id',subject_id,'subject',subject_name,
        'total',total,'percentage',total,'entered',entered_count,'required',component_count)
        ORDER BY subject_name) AS subjects
    FROM totals GROUP BY student_id
  ), ranked AS (
    SELECT st.*,a.average,a.complete,a.subjects,
      rank() OVER(ORDER BY a.average DESC NULLS LAST) AS class_rank
    FROM students st LEFT JOIN averages a ON a.student_id=st.student_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('student_id',student_id,'student_code',code,
    'name',concat_ws(' ',first_name,middle_name,last_name),'average',average,
    'complete',COALESCE(complete,false),'rank',class_rank,'subjects',COALESCE(subjects,'[]'::jsonb))
    ORDER BY class_rank, name),'[]'::jsonb) INTO v_results FROM ranked;
  RETURN v_results;
END;
$$;
REVOKE ALL ON FUNCTION public.schoolos_term_results(text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.schoolos_term_results(text,uuid,text) TO service_role;

-- Generate annual cards only after the two terms in the academic year are both closed.
CREATE OR REPLACE FUNCTION public.schoolos_generate_term_report_cards(
  p_school_id text,p_academic_year_id uuid,p_class_id text,p_actor_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_terms uuid[]; v_term1 uuid; v_term2 uuid; v_missing bigint; v_count integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id=p_actor_id
    AND (u.role='super_admin' OR (u.role='school_admin' AND u.school_id=p_school_id))) THEN
    RAISE EXCEPTION 'Ma lihid oggolaansho aad u samayso report card.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.classes c WHERE c.id=p_class_id AND c.school_id=p_school_id) THEN
    RAISE EXCEPTION 'Fasalka la doortay dugsigan kama tirsana.';
  END IF;
  SELECT array_agg(id ORDER BY start_date,id) INTO v_terms FROM public.terms
    WHERE school_id=p_school_id AND academic_year_id=p_academic_year_id;
  IF COALESCE(array_length(v_terms,1),0)<>2 THEN
    RAISE EXCEPTION 'Sanad-dugsiyeedkan waa inuu leeyahay laba term oo keliya.';
  END IF;
  v_term1:=v_terms[1]; v_term2:=v_terms[2];
  IF NOT EXISTS (SELECT 1 FROM public.enrollments WHERE school_id=p_school_id
      AND class_id=p_class_id AND academic_year_id=p_academic_year_id AND status='active') THEN
    RAISE EXCEPTION 'Fasalkan ma laha arday firfircoon oo diiwaangashan.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.class_subjects WHERE school_id=p_school_id
      AND class_id=p_class_id AND is_active=true) THEN
    RAISE EXCEPTION 'Fasalkan ma laha maaddooyin firfircoon.';
  END IF;
  IF (SELECT count(*) FROM public.term_status WHERE school_id=p_school_id
      AND term_id=ANY(v_terms) AND status='closed')<>2 THEN
    RAISE EXCEPTION 'Report Card lama samayn karo ilaa labada term la xiro.';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_terms) tr(id)
    WHERE NOT EXISTS (SELECT 1 FROM public.mark_structures ms
      WHERE ms.school_id=p_school_id AND ms.term_id=tr.id
        AND (ms.class_id IS NULL OR ms.class_id=p_class_id))) THEN
    RAISE EXCEPTION 'Qaabka dhibcaha wali looma dejin labada term ee fasalkan.';
  END IF;
  WITH enrolled AS (
    SELECT e.student_id,e.section_id FROM public.enrollments e
    WHERE e.school_id=p_school_id AND e.class_id=p_class_id
      AND e.academic_year_id=p_academic_year_id AND e.status='active'
  ), subjects AS (
    SELECT cs.subject_id FROM public.class_subjects cs
    WHERE cs.school_id=p_school_id AND cs.class_id=p_class_id AND cs.is_active=true
  ), term_components AS (
    SELECT tr.id AS term_id,mc.id AS component_id,mc.max_marks
    FROM unnest(v_terms) tr(id)
    JOIN LATERAL (
      SELECT ms.id FROM public.mark_structures ms
      WHERE ms.school_id=p_school_id AND ms.term_id=tr.id
        AND (ms.class_id IS NULL OR ms.class_id=p_class_id)
      ORDER BY (ms.class_id IS NOT NULL) DESC LIMIT 1
    ) selected ON true
    JOIN public.mark_components mc ON mc.structure_id=selected.id AND mc.school_id=p_school_id
  )
  SELECT count(*) INTO v_missing
  FROM enrolled e CROSS JOIN subjects s CROSS JOIN term_components tc
  LEFT JOIN public.component_marks cm ON cm.school_id=p_school_id AND cm.component_id=tc.component_id
    AND cm.class_id=p_class_id AND cm.subject_id=s.subject_id AND cm.student_id=e.student_id
  WHERE cm.id IS NULL OR (cm.status='present' AND cm.marks IS NULL);
  IF v_missing>0 THEN RAISE EXCEPTION 'Report Card lama samayn karo: % dhibcood ayaa maqan.',v_missing; END IF;

  WITH enrolled AS (
    SELECT e.student_id FROM public.enrollments e
    WHERE e.school_id=p_school_id AND e.class_id=p_class_id
      AND e.academic_year_id=p_academic_year_id AND e.status='active'
  ), subjects AS (
    SELECT cs.subject_id,sub.name AS subject_name FROM public.class_subjects cs
    JOIN public.subjects sub ON sub.id=cs.subject_id AND sub.school_id=cs.school_id
    WHERE cs.school_id=p_school_id AND cs.class_id=p_class_id AND cs.is_active=true
  ), selected_structures AS (
    SELECT tr.id AS term_id,ms.id AS structure_id FROM unnest(v_terms) tr(id)
    CROSS JOIN LATERAL (
      SELECT id FROM public.mark_structures ms
      WHERE ms.school_id=p_school_id AND ms.term_id=tr.id
        AND (ms.class_id IS NULL OR ms.class_id=p_class_id)
      ORDER BY (ms.class_id IS NOT NULL) DESC LIMIT 1
    ) ms
  ), totals AS (
    SELECT e.student_id,s.subject_id,s.subject_name,ss.term_id,
      sum(CASE WHEN cm.status='present' THEN cm.marks ELSE 0 END)::numeric(6,2) AS total
    FROM enrolled e CROSS JOIN subjects s CROSS JOIN selected_structures ss
    JOIN public.mark_components mc ON mc.structure_id=ss.structure_id AND mc.school_id=p_school_id
    JOIN public.component_marks cm ON cm.school_id=p_school_id AND cm.component_id=mc.id
      AND cm.class_id=p_class_id AND cm.subject_id=s.subject_id AND cm.student_id=e.student_id
    GROUP BY e.student_id,s.subject_id,s.subject_name,ss.term_id
  ), per_subject AS (
    SELECT student_id,subject_id,subject_name,
      max(total) FILTER(WHERE term_id=v_term1) AS term1_total,
      max(total) FILTER(WHERE term_id=v_term2) AS term2_total,
      ((max(total) FILTER(WHERE term_id=v_term1)+max(total) FILTER(WHERE term_id=v_term2))/2)::numeric(6,2) AS yearly_total
    FROM totals GROUP BY student_id,subject_id,subject_name
  ), per_student AS (
    SELECT student_id,avg(yearly_total)::numeric(6,2) AS yearly_average,
      jsonb_agg(jsonb_build_object('subject_id',subject_id,'subject',subject_name,
        'term1',term1_total,'term2',term2_total,'yearly',yearly_total,
        'grade',(SELECT band->>'label' FROM public.schools sc,LATERAL jsonb_array_elements(sc.grading_scale) band
          WHERE sc.id=p_school_id AND (band->>'minPercentage')::numeric<=yearly_total
          ORDER BY (band->>'minPercentage')::numeric DESC LIMIT 1))
        ORDER BY subject_name) AS subject_results
    FROM per_subject GROUP BY student_id
  ), ranked AS (
    SELECT ps.*,rank() OVER(ORDER BY ps.yearly_average DESC) AS class_rank
    FROM per_student ps
  ), grades AS (
    SELECT r.*,(
      SELECT band->>'label' FROM public.schools sc,
        LATERAL jsonb_array_elements(sc.grading_scale) band
      WHERE sc.id=p_school_id AND (band->>'minPercentage')::numeric<=r.yearly_average
      ORDER BY (band->>'minPercentage')::numeric DESC LIMIT 1
    ) AS grade
    FROM ranked r
  )
  INSERT INTO public.report_cards(
    school_id,student_id,academic_year_id,class_id,yearly_average,overall_grade,
    rank_in_class,subject_results,updated_at
  )
  SELECT p_school_id,g.student_id,p_academic_year_id,p_class_id,g.yearly_average,
    g.grade,g.class_rank,g.subject_results,now()
  FROM grades g
  ON CONFLICT(school_id,student_id,academic_year_id) DO UPDATE SET
    class_id=EXCLUDED.class_id,yearly_average=EXCLUDED.yearly_average,
    overall_grade=EXCLUDED.overall_grade,rank_in_class=EXCLUDED.rank_in_class,
    subject_results=EXCLUDED.subject_results,updated_at=now()
  WHERE public.report_cards.published_at IS NULL;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  RETURN jsonb_build_object('generated_count',v_count,'academic_year_id',p_academic_year_id,
    'class_id',p_class_id,'terms',to_jsonb(v_terms));
END;
$$;
REVOKE ALL ON FUNCTION public.schoolos_generate_term_report_cards(text,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.schoolos_generate_term_report_cards(text,uuid,text,text) TO service_role;

-- Tenant isolation is restrictive; the following permissive policies define each role's access.
DO $policies$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['mark_structures','mark_components','component_marks','term_status','marks_audit','report_cards'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',t||'_tenant_guard',t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (private.auth_user_role()::text=''super_admin'' OR school_id=private.auth_school_id()::text) WITH CHECK (private.auth_user_role()::text=''super_admin'' OR school_id=private.auth_school_id()::text)',
      t||'_tenant_guard',t
    );
  END LOOP;
END;
$policies$;

DROP POLICY IF EXISTS mark_structures_read ON public.mark_structures;
CREATE POLICY mark_structures_read ON public.mark_structures FOR SELECT TO authenticated
USING (
  private.auth_user_role() IN ('school_admin','super_admin')
  OR EXISTS (
    SELECT 1 FROM public.teacher_class_subject_assignments a
    WHERE a.school_id=mark_structures.school_id
      AND (mark_structures.class_id IS NULL OR a.class_id=mark_structures.class_id)
      AND (a.term_id IS NULL OR a.term_id=mark_structures.term_id)
      AND private.auth_has_term_assignment(a.school_id,a.class_id,a.subject_id,mark_structures.term_id,NULL)
  )
);
DROP POLICY IF EXISTS mark_structures_admin_write ON public.mark_structures;
CREATE POLICY mark_structures_admin_write ON public.mark_structures FOR ALL TO authenticated
USING (private.auth_user_role() IN ('school_admin','super_admin'))
WITH CHECK (private.auth_user_role() IN ('school_admin','super_admin'));

DROP POLICY IF EXISTS mark_components_read ON public.mark_components;
CREATE POLICY mark_components_read ON public.mark_components FOR SELECT TO authenticated
USING (private.auth_user_role() IN ('school_admin','super_admin') OR EXISTS (
  SELECT 1 FROM public.mark_structures ms
  WHERE ms.id=mark_components.structure_id AND ms.school_id=mark_components.school_id
    AND EXISTS (
      SELECT 1 FROM public.teacher_class_subject_assignments a
      WHERE a.school_id=ms.school_id
        AND (ms.class_id IS NULL OR a.class_id=ms.class_id)
        AND (a.term_id IS NULL OR a.term_id=ms.term_id)
        AND private.auth_has_term_assignment(a.school_id,a.class_id,a.subject_id,ms.term_id,NULL)
    )
));
DROP POLICY IF EXISTS mark_components_admin_write ON public.mark_components;
CREATE POLICY mark_components_admin_write ON public.mark_components FOR ALL TO authenticated
USING (private.auth_user_role() IN ('school_admin','super_admin'))
WITH CHECK (private.auth_user_role() IN ('school_admin','super_admin'));

DROP POLICY IF EXISTS component_marks_read ON public.component_marks;
CREATE POLICY component_marks_read ON public.component_marks FOR SELECT TO authenticated
USING (
  private.auth_user_role() IN ('school_admin','super_admin')
  OR EXISTS (SELECT 1 FROM public.mark_components mc
    JOIN public.mark_structures ms ON ms.id=mc.structure_id AND ms.school_id=mc.school_id
    WHERE mc.id=component_marks.component_id AND mc.school_id=component_marks.school_id
      AND private.auth_has_term_assignment(component_marks.school_id,component_marks.class_id,
        component_marks.subject_id,ms.term_id,component_marks.student_id))
);
DROP POLICY IF EXISTS component_marks_teacher_insert ON public.component_marks;
CREATE POLICY component_marks_teacher_insert ON public.component_marks FOR INSERT TO authenticated
WITH CHECK (
  private.auth_user_role()='teacher'
  AND EXISTS (SELECT 1 FROM public.mark_components mc
    JOIN public.mark_structures ms ON ms.id=mc.structure_id AND ms.school_id=mc.school_id
    JOIN public.term_status ts ON ts.school_id=ms.school_id AND ts.term_id=ms.term_id AND ts.status='open'
    WHERE mc.id=component_marks.component_id AND mc.school_id=component_marks.school_id
      AND private.auth_has_term_assignment(component_marks.school_id,component_marks.class_id,
        component_marks.subject_id,ms.term_id,component_marks.student_id))
);
DROP POLICY IF EXISTS component_marks_teacher_update ON public.component_marks;
CREATE POLICY component_marks_teacher_update ON public.component_marks FOR UPDATE TO authenticated
USING (
  private.auth_user_role()='teacher'
  AND EXISTS (SELECT 1 FROM public.mark_components mc
    JOIN public.mark_structures ms ON ms.id=mc.structure_id AND ms.school_id=mc.school_id
    JOIN public.term_status ts ON ts.school_id=ms.school_id AND ts.term_id=ms.term_id AND ts.status='open'
    WHERE mc.id=component_marks.component_id AND mc.school_id=component_marks.school_id
      AND private.auth_has_term_assignment(component_marks.school_id,component_marks.class_id,
        component_marks.subject_id,ms.term_id,component_marks.student_id))
)
WITH CHECK (
  private.auth_user_role()='teacher'
  AND EXISTS (SELECT 1 FROM public.mark_components mc
    JOIN public.mark_structures ms ON ms.id=mc.structure_id AND ms.school_id=mc.school_id
    JOIN public.term_status ts ON ts.school_id=ms.school_id AND ts.term_id=ms.term_id AND ts.status='open'
    WHERE mc.id=component_marks.component_id AND mc.school_id=component_marks.school_id
      AND private.auth_has_term_assignment(component_marks.school_id,component_marks.class_id,
        component_marks.subject_id,ms.term_id,component_marks.student_id))
);

DROP POLICY IF EXISTS term_status_read ON public.term_status;
CREATE POLICY term_status_read ON public.term_status FOR SELECT TO authenticated
USING (private.auth_user_role() IN ('school_admin','super_admin','teacher'));
DROP POLICY IF EXISTS term_status_admin_write ON public.term_status;
CREATE POLICY term_status_admin_write ON public.term_status FOR ALL TO authenticated
USING (private.auth_user_role() IN ('school_admin','super_admin'))
WITH CHECK (private.auth_user_role() IN ('school_admin','super_admin'));

DROP POLICY IF EXISTS marks_audit_admin_read ON public.marks_audit;
CREATE POLICY marks_audit_admin_read ON public.marks_audit FOR SELECT TO authenticated
USING (private.auth_user_role() IN ('school_admin','super_admin'));

DROP POLICY IF EXISTS report_cards_admin_all ON public.report_cards;
CREATE POLICY report_cards_admin_all ON public.report_cards FOR ALL TO authenticated
USING (private.auth_user_role() IN ('school_admin','super_admin'))
WITH CHECK (private.auth_user_role() IN ('school_admin','super_admin'));
DROP POLICY IF EXISTS report_cards_parent_published_read ON public.report_cards;
CREATE POLICY report_cards_parent_published_read ON public.report_cards FOR SELECT TO authenticated
USING (
  published_at IS NOT NULL
  AND private.auth_user_role() IN ('parent','student')
  AND private.auth_can_access_student(student_id)
);

REVOKE ALL ON public.mark_structures,public.mark_components,public.component_marks,
  public.term_status,public.marks_audit,public.report_cards FROM anon;
GRANT SELECT ON public.mark_structures,public.mark_components,public.component_marks,public.term_status,public.report_cards TO authenticated;
GRANT INSERT,UPDATE ON public.mark_structures,public.mark_components TO authenticated;
GRANT INSERT,UPDATE ON public.component_marks TO authenticated;
GRANT SELECT ON public.marks_audit TO authenticated;
GRANT INSERT,UPDATE ON public.report_cards TO authenticated;
GRANT ALL ON public.mark_structures,public.mark_components,public.component_marks,
  public.term_status,public.marks_audit,public.report_cards TO service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
