-- Timetables are class information sheets; a class may schedule a subject
-- before a teacher is assigned. Keep the teacher foreign key when present,
-- but permit NULL so auto-generation does not invent or require a teacher.
ALTER TABLE public.timetable_slots
  ALTER COLUMN teacher_id DROP NOT NULL;
