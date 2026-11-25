-- Resolve legacy Term 1/2 rows that duplicate the same dated Semester 1/2 periods.
-- Preserve all term rows, timetable slots and teacher assignments; only use one canonical
-- period in the marks workspace and allow same-date legacy assignments to remain valid.
BEGIN;

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
      AND (a.term_id IS NULL OR a.term_id=p_term_id OR EXISTS (SELECT 1 FROM public.terms assigned_term JOIN public.terms selected_term ON selected_term.id=p_term_id AND selected_term.school_id=p_school_id AND assigned_term.school_id=selected_term.school_id AND assigned_term.academic_year_id=selected_term.academic_year_id AND assigned_term.start_date=selected_term.start_date AND assigned_term.end_date=selected_term.end_date WHERE assigned_term.id=a.term_id))
      AND (p_student_id IS NULL OR a.section_id IS NULL OR a.section_id=e.section_id)
  );
$$;
REVOKE ALL ON FUNCTION private.auth_has_term_assignment(text,text,text,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.auth_has_term_assignment(text,text,text,uuid,text) TO authenticated,service_role;

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
        AND (a.term_id IS NULL OR a.term_id=v_term_id OR EXISTS (SELECT 1 FROM public.terms assigned_term JOIN public.terms selected_term ON selected_term.id=v_term_id AND selected_term.school_id=p_school_id AND assigned_term.school_id=selected_term.school_id AND assigned_term.academic_year_id=selected_term.academic_year_id AND assigned_term.start_date=selected_term.start_date AND assigned_term.end_date=selected_term.end_date WHERE assigned_term.id=a.term_id)) AND a.class_id=p_class_id
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
  SELECT array_agg(logical_terms.id ORDER BY logical_terms.start_date,logical_terms.id) INTO v_terms
  FROM (
    SELECT DISTINCT ON (start_date,end_date) id,start_date
    FROM public.terms
    WHERE school_id=p_school_id AND academic_year_id=p_academic_year_id
    ORDER BY start_date,end_date,
      CASE WHEN lower(name) ~ '^semester[[:space:]]*[12]
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
    rank_in_class,subject_results,is_stale,updated_at
  )
  SELECT p_school_id,g.student_id,p_academic_year_id,p_class_id,g.yearly_average,
    g.grade,g.class_rank,g.subject_results,false,now()
  FROM grades g
  ON CONFLICT(school_id,student_id,academic_year_id) DO UPDATE SET
    class_id=EXCLUDED.class_id,yearly_average=EXCLUDED.yearly_average,
    overall_grade=EXCLUDED.overall_grade,rank_in_class=EXCLUDED.rank_in_class,
    subject_results=EXCLUDED.subject_results,is_stale=false,updated_at=now()
  WHERE public.report_cards.published_at IS NULL;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  RETURN jsonb_build_object('generated_count',v_count,'academic_year_id',p_academic_year_id,
    'class_id',p_class_id,'terms',to_jsonb(v_terms));
END;
$$; THEN 0
           WHEN lower(name) ~ '^term[[:space:]]*[12]
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
    rank_in_class,subject_results,is_stale,updated_at
  )
  SELECT p_school_id,g.student_id,p_academic_year_id,p_class_id,g.yearly_average,
    g.grade,g.class_rank,g.subject_results,false,now()
  FROM grades g
  ON CONFLICT(school_id,student_id,academic_year_id) DO UPDATE SET
    class_id=EXCLUDED.class_id,yearly_average=EXCLUDED.yearly_average,
    overall_grade=EXCLUDED.overall_grade,rank_in_class=EXCLUDED.rank_in_class,
    subject_results=EXCLUDED.subject_results,is_stale=false,updated_at=now()
  WHERE public.report_cards.published_at IS NULL;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  RETURN jsonb_build_object('generated_count',v_count,'academic_year_id',p_academic_year_id,
    'class_id',p_class_id,'terms',to_jsonb(v_terms));
END;
$$; THEN 1 ELSE 2 END,
      id
  ) logical_terms;
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
    rank_in_class,subject_results,is_stale,updated_at
  )
  SELECT p_school_id,g.student_id,p_academic_year_id,p_class_id,g.yearly_average,
    g.grade,g.class_rank,g.subject_results,false,now()
  FROM grades g
  ON CONFLICT(school_id,student_id,academic_year_id) DO UPDATE SET
    class_id=EXCLUDED.class_id,yearly_average=EXCLUDED.yearly_average,
    overall_grade=EXCLUDED.overall_grade,rank_in_class=EXCLUDED.rank_in_class,
    subject_results=EXCLUDED.subject_results,is_stale=false,updated_at=now()
  WHERE public.report_cards.published_at IS NULL;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  RETURN jsonb_build_object('generated_count',v_count,'academic_year_id',p_academic_year_id,
    'class_id',p_class_id,'terms',to_jsonb(v_terms));
END;
$$;
REVOKE ALL ON FUNCTION public.schoolos_generate_term_report_cards(text,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.schoolos_generate_term_report_cards(text,uuid,text,text) TO service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
 THEN 0
           WHEN lower(name) ~ '^term[[:space:]]*[12]
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
    rank_in_class,subject_results,is_stale,updated_at
  )
  SELECT p_school_id,g.student_id,p_academic_year_id,p_class_id,g.yearly_average,
    g.grade,g.class_rank,g.subject_results,false,now()
  FROM grades g
  ON CONFLICT(school_id,student_id,academic_year_id) DO UPDATE SET
    class_id=EXCLUDED.class_id,yearly_average=EXCLUDED.yearly_average,
    overall_grade=EXCLUDED.overall_grade,rank_in_class=EXCLUDED.rank_in_class,
    subject_results=EXCLUDED.subject_results,is_stale=false,updated_at=now()
  WHERE public.report_cards.published_at IS NULL;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  RETURN jsonb_build_object('generated_count',v_count,'academic_year_id',p_academic_year_id,
    'class_id',p_class_id,'terms',to_jsonb(v_terms));
END;
$$; THEN 0
           WHEN lower(name) ~ '^term[[:space:]]*[12]
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
    rank_in_class,subject_results,is_stale,updated_at
  )
  SELECT p_school_id,g.student_id,p_academic_year_id,p_class_id,g.yearly_average,
    g.grade,g.class_rank,g.subject_results,false,now()
  FROM grades g
  ON CONFLICT(school_id,student_id,academic_year_id) DO UPDATE SET
    class_id=EXCLUDED.class_id,yearly_average=EXCLUDED.yearly_average,
    overall_grade=EXCLUDED.overall_grade,rank_in_class=EXCLUDED.rank_in_class,
    subject_results=EXCLUDED.subject_results,is_stale=false,updated_at=now()
  WHERE public.report_cards.published_at IS NULL;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  RETURN jsonb_build_object('generated_count',v_count,'academic_year_id',p_academic_year_id,
    'class_id',p_class_id,'terms',to_jsonb(v_terms));
END;
$$; THEN 1 ELSE 2 END,
      id
  ) logical_terms;
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
    rank_in_class,subject_results,is_stale,updated_at
  )
  SELECT p_school_id,g.student_id,p_academic_year_id,p_class_id,g.yearly_average,
    g.grade,g.class_rank,g.subject_results,false,now()
  FROM grades g
  ON CONFLICT(school_id,student_id,academic_year_id) DO UPDATE SET
    class_id=EXCLUDED.class_id,yearly_average=EXCLUDED.yearly_average,
    overall_grade=EXCLUDED.overall_grade,rank_in_class=EXCLUDED.rank_in_class,
    subject_results=EXCLUDED.subject_results,is_stale=false,updated_at=now()
  WHERE public.report_cards.published_at IS NULL;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  RETURN jsonb_build_object('generated_count',v_count,'academic_year_id',p_academic_year_id,
    'class_id',p_class_id,'terms',to_jsonb(v_terms));
END;
$$;
REVOKE ALL ON FUNCTION public.schoolos_generate_term_report_cards(text,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.schoolos_generate_term_report_cards(text,uuid,text,text) TO service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
 THEN 1 ELSE 2 END,
      id
  ) logical_terms;
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
    rank_in_class,subject_results,is_stale,updated_at
  )
  SELECT p_school_id,g.student_id,p_academic_year_id,p_class_id,g.yearly_average,
    g.grade,g.class_rank,g.subject_results,false,now()
  FROM grades g
  ON CONFLICT(school_id,student_id,academic_year_id) DO UPDATE SET
    class_id=EXCLUDED.class_id,yearly_average=EXCLUDED.yearly_average,
    overall_grade=EXCLUDED.overall_grade,rank_in_class=EXCLUDED.rank_in_class,
    subject_results=EXCLUDED.subject_results,is_stale=false,updated_at=now()
  WHERE public.report_cards.published_at IS NULL;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  RETURN jsonb_build_object('generated_count',v_count,'academic_year_id',p_academic_year_id,
    'class_id',p_class_id,'terms',to_jsonb(v_terms));
END;
$$; THEN 0
           WHEN lower(name) ~ '^term[[:space:]]*[12]
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
    rank_in_class,subject_results,is_stale,updated_at
  )
  SELECT p_school_id,g.student_id,p_academic_year_id,p_class_id,g.yearly_average,
    g.grade,g.class_rank,g.subject_results,false,now()
  FROM grades g
  ON CONFLICT(school_id,student_id,academic_year_id) DO UPDATE SET
    class_id=EXCLUDED.class_id,yearly_average=EXCLUDED.yearly_average,
    overall_grade=EXCLUDED.overall_grade,rank_in_class=EXCLUDED.rank_in_class,
    subject_results=EXCLUDED.subject_results,is_stale=false,updated_at=now()
  WHERE public.report_cards.published_at IS NULL;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  RETURN jsonb_build_object('generated_count',v_count,'academic_year_id',p_academic_year_id,
    'class_id',p_class_id,'terms',to_jsonb(v_terms));
END;
$$; THEN 1 ELSE 2 END,
      id
  ) logical_terms;
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
    rank_in_class,subject_results,is_stale,updated_at
  )
  SELECT p_school_id,g.student_id,p_academic_year_id,p_class_id,g.yearly_average,
    g.grade,g.class_rank,g.subject_results,false,now()
  FROM grades g
  ON CONFLICT(school_id,student_id,academic_year_id) DO UPDATE SET
    class_id=EXCLUDED.class_id,yearly_average=EXCLUDED.yearly_average,
    overall_grade=EXCLUDED.overall_grade,rank_in_class=EXCLUDED.rank_in_class,
    subject_results=EXCLUDED.subject_results,is_stale=false,updated_at=now()
  WHERE public.report_cards.published_at IS NULL;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  RETURN jsonb_build_object('generated_count',v_count,'academic_year_id',p_academic_year_id,
    'class_id',p_class_id,'terms',to_jsonb(v_terms));
END;
$$;
REVOKE ALL ON FUNCTION public.schoolos_generate_term_report_cards(text,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.schoolos_generate_term_report_cards(text,uuid,text,text) TO service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
