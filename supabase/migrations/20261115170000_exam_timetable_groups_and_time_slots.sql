-- Exam timetable groups, class visibility, editable time slots and reusable entries.
-- Additive only: legacy exam_schedules, marks, seats and results are not modified.
-- This file is prepared for review only. DO NOT apply to production without approval.

CREATE TABLE IF NOT EXISTS public.exam_timetables (
  id VARCHAR(64) PRIMARY KEY,
  school_id VARCHAR(64) NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  title_line_1 VARCHAR(180) NOT NULL DEFAULT '',
  title_line_2 VARCHAR(180) NOT NULL DEFAULT '',
  title_line_3 VARCHAR(180) NOT NULL DEFAULT '',
  academic_year VARCHAR(24) NOT NULL,
  semester VARCHAR(16) NOT NULL CHECK (semester IN ('Semester 1', 'Semester 2')),
  note TEXT NOT NULL DEFAULT '',
  status VARCHAR(16) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'cancelled')),
  created_by VARCHAR(64) NOT NULL,
  published_by VARCHAR(64),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT exam_timetables_id_school_unique UNIQUE (id, school_id)
);

CREATE TABLE IF NOT EXISTS public.exam_timetable_classes (
  id VARCHAR(64) PRIMARY KEY,
  school_id VARCHAR(64) NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  timetable_id VARCHAR(64) NOT NULL,
  class_id VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT exam_timetable_classes_unique UNIQUE (timetable_id, class_id),
  CONSTRAINT exam_timetable_classes_timetable_school_fk
    FOREIGN KEY (timetable_id, school_id)
    REFERENCES public.exam_timetables(id, school_id) ON DELETE CASCADE,
  CONSTRAINT exam_timetable_classes_class_school_fk
    FOREIGN KEY (class_id, school_id)
    REFERENCES public.classes(id, school_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.exam_time_slots (
  id VARCHAR(64) PRIMARY KEY,
  school_id VARCHAR(64) NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  label VARCHAR(80) NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT exam_time_slots_valid_time CHECK (start_time < end_time),
  CONSTRAINT exam_time_slots_label_unique UNIQUE (school_id, label),
  CONSTRAINT exam_time_slots_id_school_unique UNIQUE (id, school_id)
);

CREATE TABLE IF NOT EXISTS public.exam_timetable_entries (
  id VARCHAR(64) PRIMARY KEY,
  school_id VARCHAR(64) NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  timetable_id VARCHAR(64) NOT NULL,
  subject_id VARCHAR(64) NOT NULL,
  exam_date DATE,
  time_slot_id VARCHAR(64),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT exam_timetable_entries_valid_time CHECK (start_time < end_time),
  CONSTRAINT exam_timetable_entries_id_school_unique UNIQUE (id, school_id),
  CONSTRAINT exam_timetable_entries_timetable_school_fk
    FOREIGN KEY (timetable_id, school_id)
    REFERENCES public.exam_timetables(id, school_id) ON DELETE CASCADE,
  CONSTRAINT exam_timetable_entries_subject_school_fk
    FOREIGN KEY (subject_id, school_id)
    REFERENCES public.subjects(id, school_id) ON DELETE RESTRICT,
  CONSTRAINT exam_timetable_entries_slot_school_fk
    FOREIGN KEY (time_slot_id, school_id)
    REFERENCES public.exam_time_slots(id, school_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_exam_timetables_school_status
  ON public.exam_timetables (school_id, status, academic_year, semester);
CREATE INDEX IF NOT EXISTS idx_exam_timetable_classes_school_class
  ON public.exam_timetable_classes (school_id, class_id, timetable_id);
CREATE INDEX IF NOT EXISTS idx_exam_time_slots_school_active
  ON public.exam_time_slots (school_id, is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_exam_timetable_entries_timetable_date
  ON public.exam_timetable_entries (school_id, timetable_id, exam_date, start_time);

-- Prevent overlapping exams for any class shared by two timetables.
-- NULL dates are permitted only for copied templates and are not clash-checked.
CREATE OR REPLACE FUNCTION public.schoolos_check_exam_timetable_entry_clash()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW.exam_date IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.exam_timetable_entries AS other_entry
      JOIN public.exam_timetables AS other_timetable
        ON other_timetable.id = other_entry.timetable_id
       AND other_timetable.school_id = other_entry.school_id
      JOIN public.exam_timetable_classes AS other_class
        ON other_class.timetable_id = other_timetable.id
       AND other_class.school_id = other_timetable.school_id
      JOIN public.exam_timetable_classes AS new_class
        ON new_class.class_id = other_class.class_id
       AND new_class.school_id = other_class.school_id
     WHERE other_entry.school_id = NEW.school_id
       AND other_entry.exam_date = NEW.exam_date
       AND other_entry.id <> NEW.id
       AND other_timetable.status <> 'cancelled'
       AND other_entry.start_time < NEW.end_time
       AND NEW.start_time < other_entry.end_time
       AND new_class.timetable_id = NEW.timetable_id
  ) THEN
    RAISE EXCEPTION 'Fasalkan imtixaan kale ayuu leeyahay isla taariikhda iyo waqtigaas.';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.exam_timetable_entries AS other_entry
      JOIN public.exam_timetables AS other_timetable
        ON other_timetable.id = other_entry.timetable_id
       AND other_timetable.school_id = other_entry.school_id
      JOIN public.exam_timetable_classes AS other_class
        ON other_class.timetable_id = other_timetable.id
       AND other_class.school_id = other_timetable.school_id
      JOIN public.exam_timetable_classes AS new_class
        ON new_class.class_id = other_class.class_id
       AND new_class.school_id = other_class.school_id
     WHERE other_entry.school_id = NEW.school_id
       AND other_entry.exam_date = NEW.exam_date
       AND other_entry.id <> NEW.id
       AND other_timetable.status <> 'cancelled'
       AND other_entry.start_time < NEW.end_time
       AND NEW.start_time < other_entry.end_time
       AND new_class.timetable_id = NEW.timetable_id
  ) THEN
    RAISE EXCEPTION 'Fasalkan imtixaan kale ayuu leeyahay isla taariikhda iyo waqtigaas.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS exam_timetable_entry_clash_guard ON public.exam_timetable_entries;
CREATE TRIGGER exam_timetable_entry_clash_guard
  BEFORE INSERT OR UPDATE OF timetable_id, exam_date, start_time, end_time
  ON public.exam_timetable_entries
  FOR EACH ROW EXECUTE FUNCTION public.schoolos_check_exam_timetable_entry_clash();

-- Protect against adding a class to a timetable when its existing dated rows
-- overlap with another active timetable already assigned to that class.
CREATE OR REPLACE FUNCTION public.schoolos_check_exam_timetable_class_clash()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM public.exam_timetable_entries AS new_entry
      JOIN public.exam_timetables AS new_timetable
        ON new_timetable.id = new_entry.timetable_id
       AND new_timetable.school_id = new_entry.school_id
      JOIN public.exam_timetable_entries AS other_entry
        ON other_entry.school_id = new_entry.school_id
       AND other_entry.exam_date = new_entry.exam_date
       AND other_entry.start_time < new_entry.end_time
       AND new_entry.start_time < other_entry.end_time
       AND other_entry.timetable_id <> new_entry.timetable_id
      JOIN public.exam_timetables AS other_timetable
        ON other_timetable.id = other_entry.timetable_id
       AND other_timetable.school_id = other_entry.school_id
      JOIN public.exam_timetable_classes AS other_class
        ON other_class.timetable_id = other_timetable.id
       AND other_class.school_id = other_timetable.school_id
     WHERE new_entry.timetable_id = NEW.timetable_id
       AND new_entry.school_id = NEW.school_id
       AND new_entry.exam_date IS NOT NULL
       AND new_timetable.status <> 'cancelled'
       AND other_timetable.status <> 'cancelled'
       AND other_class.class_id = NEW.class_id
  ) THEN
    RAISE EXCEPTION 'Fasalkan jadwal kale ayuu leeyahay oo isku dhacaya. Fadlan beddel taariikhda ama waqtiga.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS exam_timetable_class_clash_guard ON public.exam_timetable_classes;
CREATE TRIGGER exam_timetable_class_clash_guard
  BEFORE INSERT OR UPDATE OF timetable_id, class_id
  ON public.exam_timetable_classes
  FOR EACH ROW EXECUTE FUNCTION public.schoolos_check_exam_timetable_class_clash();

ALTER TABLE public.exam_timetables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_timetable_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_time_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_timetable_entries ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.exam_timetables, public.exam_timetable_classes, public.exam_time_slots, public.exam_timetable_entries FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.exam_timetables, public.exam_timetable_classes, public.exam_time_slots, public.exam_timetable_entries TO service_role;

DROP POLICY IF EXISTS exam_timetables_service_role_all ON public.exam_timetables;
CREATE POLICY exam_timetables_service_role_all ON public.exam_timetables FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS exam_timetable_classes_service_role_all ON public.exam_timetable_classes;
CREATE POLICY exam_timetable_classes_service_role_all ON public.exam_timetable_classes FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS exam_time_slots_service_role_all ON public.exam_time_slots;
CREATE POLICY exam_time_slots_service_role_all ON public.exam_time_slots FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS exam_timetable_entries_service_role_all ON public.exam_timetable_entries;
CREATE POLICY exam_timetable_entries_service_role_all ON public.exam_timetable_entries FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Two editable school defaults: 07:30-09:00 and 09:30-11:00.
INSERT INTO public.exam_time_slots (id, school_id, label, start_time, end_time, is_default, sort_order)
SELECT 'exam-slot-1-' || school.id, school.id, 'Waqtiga 1', TIME '07:30', TIME '09:00', TRUE, 1
FROM public.schools AS school
WHERE NOT EXISTS (
  SELECT 1 FROM public.exam_time_slots AS slot
  WHERE slot.school_id = school.id AND slot.is_default IS TRUE AND slot.sort_order = 1
);

INSERT INTO public.exam_time_slots (id, school_id, label, start_time, end_time, is_default, sort_order)
SELECT 'exam-slot-2-' || school.id, school.id, 'Waqtiga 2', TIME '09:30', TIME '11:00', TRUE, 2
FROM public.schools AS school
WHERE NOT EXISTS (
  SELECT 1 FROM public.exam_time_slots AS slot
  WHERE slot.school_id = school.id AND slot.is_default IS TRUE AND slot.sort_order = 2
);

CREATE OR REPLACE FUNCTION public.schoolos_seed_exam_time_slots()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.exam_time_slots (id, school_id, label, start_time, end_time, is_default, sort_order)
  VALUES
    ('exam-slot-1-' || NEW.id, NEW.id, 'Waqtiga 1', TIME '07:30', TIME '09:00', TRUE, 1),
    ('exam-slot-2-' || NEW.id, NEW.id, 'Waqtiga 2', TIME '09:30', TIME '11:00', TRUE, 2)
  ON CONFLICT (school_id, label) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS schools_seed_exam_time_slots ON public.schools;
CREATE TRIGGER schools_seed_exam_time_slots
  AFTER INSERT ON public.schools
  FOR EACH ROW EXECUTE FUNCTION public.schoolos_seed_exam_time_slots();

REVOKE ALL ON FUNCTION public.schoolos_seed_exam_time_slots() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.schoolos_check_exam_timetable_entry_clash() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.schoolos_check_exam_timetable_class_clash() FROM PUBLIC, anon, authenticated;
