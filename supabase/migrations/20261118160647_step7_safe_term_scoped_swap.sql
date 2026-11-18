-- Harden the existing timetable swap RPC for term scope, locked lessons and uniqueness.
DO $$
DECLARE d text; occurrences integer;
BEGIN
 SELECT pg_get_functiondef(p.oid) INTO d
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='schoolos_swap_timetable_slots' AND p.pronargs=3 LIMIT 1;
 IF d IS NULL THEN RAISE EXCEPTION 'Existing timetable swap function was not found.'; END IF;
 d:=replace(d,
  'IF first_slot.id IS NULL OR second_slot.id IS NULL OR first_slot.id = second_slot.id THEN',
  'IF first_slot.id IS NULL OR second_slot.id IS NULL OR first_slot.id = second_slot.id OR first_slot.is_locked OR second_slot.is_locked OR first_slot.class_id IS DISTINCT FROM second_slot.class_id OR first_slot.term_id IS DISTINCT FROM second_slot.term_id THEN');
 IF position('first_slot.is_locked OR second_slot.is_locked' IN d)=0 THEN RAISE EXCEPTION 'Could not add locked/same-term swap guard.'; END IF;
 occurrences := (length(d)-length(replace(d,'WHERE other.school_id = p_school_id AND other.is_active = TRUE','')))/length('WHERE other.school_id = p_school_id AND other.is_active = TRUE');
 IF occurrences <> 4 THEN RAISE EXCEPTION 'Unexpected swap conflict check count: %', occurrences; END IF;
 d:=replace(d,'WHERE other.school_id = p_school_id AND other.is_active = TRUE','WHERE other.school_id = p_school_id AND other.term_id = first_slot.term_id AND other.is_active = TRUE');
 d:=replace(d,
  '  UPDATE public.timetable_slots SET
    day_of_week = second_slot.day_of_week,',
  '  IF EXISTS (SELECT 1 FROM public.teacher_unavailability u WHERE u.school_id=p_school_id AND u.teacher_id=first_slot.teacher_id AND u.day_of_week=second_slot.day_of_week AND u.shift=COALESCE((SELECT c.shift FROM public.classes c WHERE c.id=first_slot.class_id AND c.school_id=p_school_id),1) AND (u.period_number IS NULL OR u.period_number=second_slot.period_number))
   OR EXISTS (SELECT 1 FROM public.teacher_unavailability u WHERE u.school_id=p_school_id AND u.teacher_id=second_slot.teacher_id AND u.day_of_week=first_slot.day_of_week AND u.shift=COALESCE((SELECT c.shift FROM public.classes c WHERE c.id=second_slot.class_id AND c.school_id=p_school_id),1) AND (u.period_number IS NULL OR u.period_number=first_slot.period_number)) THEN
    RAISE EXCEPTION ''Macallinka lama heli karo waqtiga la isku beddelayo.'';
  END IF;
  UPDATE public.timetable_slots SET day_of_week=''__SWAP__'', period_number=CASE WHEN id=p_first_id THEN -2147483647 ELSE -2147483646 END, updated_at=now()
  WHERE id IN (p_first_id,p_second_id) AND school_id=p_school_id;
  UPDATE public.timetable_slots SET
    day_of_week = second_slot.day_of_week,');
 IF position('__SWAP__' IN d)=0 THEN RAISE EXCEPTION 'Could not insert safe swap staging updates.'; END IF;
 d:=replace(d,'    end_time = first_end_text
  WHERE id = p_first_id','    end_time = first_end_text, updated_at=now()
  WHERE id = p_first_id');
 d:=replace(d,'    end_time = second_end_text
  WHERE id = p_second_id','    end_time = second_end_text, updated_at=now()
  WHERE id = p_second_id');
 EXECUTE d;
END $$;
NOTIFY pgrst,'reload schema';