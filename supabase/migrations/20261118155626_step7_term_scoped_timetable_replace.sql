-- STEP 7: replace only one class timetable within one term; preserve locked lessons and other terms.
CREATE OR REPLACE FUNCTION public.schoolos_replace_class_timetable_for_term(
 p_school_id varchar,p_class_id varchar,p_term_id uuid,p_slots jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.classes c WHERE c.id=p_class_id AND c.school_id=p_school_id AND c.is_archived=false) THEN
  RAISE EXCEPTION 'Fasalka lagama helin dugsigan.';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM public.terms t WHERE t.id=p_term_id AND t.school_id=p_school_id) THEN
  RAISE EXCEPTION 'Term-kan dugsigan kama tirsana.';
 END IF;
 IF EXISTS (
  SELECT 1 FROM jsonb_to_recordset(COALESCE(p_slots,'[]'::jsonb)) AS n(day_of_week varchar,start_time varchar,end_time varchar,teacher_id varchar)
  JOIN public.timetable_slots e ON e.school_id=p_school_id AND e.term_id=p_term_id AND e.class_id<>p_class_id
   AND e.is_active=true AND e.day_of_week=n.day_of_week AND n.teacher_id IS NOT NULL AND n.teacher_id<>''
   AND e.teacher_id=n.teacher_id AND n.start_time<e.end_time AND n.end_time>e.start_time
 ) THEN RAISE EXCEPTION 'Macallinkan wuxuu leeyahay cashar kale isla waqtigan.'; END IF;
 IF EXISTS (
  SELECT 1 FROM jsonb_to_recordset(COALESCE(p_slots,'[]'::jsonb)) AS n(day_of_week varchar,start_time varchar,end_time varchar,room_number varchar,room_id uuid)
  JOIN public.timetable_slots e ON e.school_id=p_school_id AND e.term_id=p_term_id AND e.class_id<>p_class_id
   AND e.is_active=true AND e.day_of_week=n.day_of_week
   AND ((n.room_id IS NOT NULL AND e.room_id=n.room_id)
    OR (NULLIF(BTRIM(n.room_number),'') IS NOT NULL AND LOWER(BTRIM(e.room_number))=LOWER(BTRIM(n.room_number))))
   AND n.start_time<e.end_time AND n.end_time>e.start_time
 ) THEN RAISE EXCEPTION 'Qolkan waxaa isticmaalaya fasal kale isla waqtigan.'; END IF;
 IF EXISTS (
  SELECT 1 FROM jsonb_to_recordset(COALESCE(p_slots,'[]'::jsonb)) AS n(assignment_id uuid,section_id uuid,subject_id varchar,teacher_id varchar)
  WHERE n.assignment_id IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM public.teacher_class_subject_assignments a
   WHERE a.id=n.assignment_id AND a.school_id=p_school_id AND a.class_id=p_class_id
    AND a.subject_id=n.subject_id AND a.teacher_id=n.teacher_id
    AND (a.term_id IS NULL OR a.term_id=p_term_id) AND a.section_id IS NOT DISTINCT FROM n.section_id
  )
 ) THEN RAISE EXCEPTION 'Qoondeynta macallinka, maaddada, fasalka ama term-ku isma waafaqaan.'; END IF;
 UPDATE public.timetable_slots SET is_active=false,updated_at=now()
 WHERE school_id=p_school_id AND class_id=p_class_id AND term_id=p_term_id AND is_active=true AND is_locked=false;
 INSERT INTO public.timetable_slots(
  id,school_id,class_id,day_of_week,period_number,start_time,end_time,subject_id,teacher_id,room_number,
  is_active,term_id,section_id,assignment_id,room_id,updated_at
 )
 SELECT n.id,p_school_id,p_class_id,n.day_of_week,n.period_number,n.start_time,n.end_time,n.subject_id,
  NULLIF(n.teacher_id,''),n.room_number,true,p_term_id,n.section_id,n.assignment_id,n.room_id,now()
 FROM jsonb_to_recordset(COALESCE(p_slots,'[]'::jsonb)) AS n(
  id varchar,day_of_week varchar,period_number integer,start_time varchar,end_time varchar,subject_id varchar,
  teacher_id varchar,room_number varchar,section_id uuid,assignment_id uuid,room_id uuid
 )
 ON CONFLICT(id) DO UPDATE SET
  day_of_week=EXCLUDED.day_of_week,period_number=EXCLUDED.period_number,start_time=EXCLUDED.start_time,
  end_time=EXCLUDED.end_time,subject_id=EXCLUDED.subject_id,teacher_id=EXCLUDED.teacher_id,
  room_number=EXCLUDED.room_number,term_id=EXCLUDED.term_id,section_id=EXCLUDED.section_id,
  assignment_id=EXCLUDED.assignment_id,room_id=EXCLUDED.room_id,is_active=true,updated_at=now()
 WHERE public.timetable_slots.is_locked=false;
END; $$;
REVOKE ALL ON FUNCTION public.schoolos_replace_class_timetable_for_term(varchar,varchar,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.schoolos_replace_class_timetable_for_term(varchar,varchar,uuid,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';