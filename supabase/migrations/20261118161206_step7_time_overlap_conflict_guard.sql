-- Use interval overlap rather than equal period numbers for teacher and room conflicts.
-- This correctly allows different school shifts whose clock times do not overlap.
DROP INDEX IF EXISTS public.timetable_teacher_slot_term_uidx;
DROP INDEX IF EXISTS public.timetable_room_slot_term_uidx;

CREATE OR REPLACE FUNCTION public.schoolos_guard_timetable_booking_conflicts()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.is_active IS DISTINCT FROM true OR NEW.term_id IS NULL THEN RETURN NEW; END IF;
 IF NEW.teacher_id IS NOT NULL AND EXISTS (
  SELECT 1 FROM public.timetable_slots e
  WHERE e.school_id=NEW.school_id AND e.term_id=NEW.term_id AND e.is_active=true
   AND e.id<>NEW.id AND e.day_of_week=NEW.day_of_week AND e.teacher_id=NEW.teacher_id
   AND NEW.start_time::time<e.end_time::time AND NEW.end_time::time>e.start_time::time
 ) THEN RAISE EXCEPTION 'Macallinkan wuxuu leeyahay cashar kale oo waqtigiisu is dul saaran yahay.'; END IF;
 IF (NEW.room_id IS NOT NULL OR NULLIF(BTRIM(NEW.room_number),'') IS NOT NULL) AND EXISTS (
  SELECT 1 FROM public.timetable_slots e
  WHERE e.school_id=NEW.school_id AND e.term_id=NEW.term_id AND e.is_active=true
   AND e.id<>NEW.id AND e.day_of_week=NEW.day_of_week
   AND ((NEW.room_id IS NOT NULL AND e.room_id=NEW.room_id)
    OR (NULLIF(BTRIM(NEW.room_number),'') IS NOT NULL AND LOWER(BTRIM(e.room_number))=LOWER(BTRIM(NEW.room_number))))
   AND NEW.start_time::time<e.end_time::time AND NEW.end_time::time>e.start_time::time
 ) THEN RAISE EXCEPTION 'Qolkan waxaa isticmaalaya cashar kale oo waqtigiisu is dul saaran yahay.'; END IF;
 RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS timetable_slots_booking_conflicts ON public.timetable_slots;
CREATE TRIGGER timetable_slots_booking_conflicts BEFORE INSERT OR UPDATE OF school_id,term_id,day_of_week,start_time,end_time,teacher_id,room_id,room_number,is_active
 ON public.timetable_slots FOR EACH ROW EXECUTE FUNCTION public.schoolos_guard_timetable_booking_conflicts();
REVOKE ALL ON FUNCTION public.schoolos_guard_timetable_booking_conflicts() FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';