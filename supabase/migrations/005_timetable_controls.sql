CREATE TABLE IF NOT EXISTS public.timetable_settings (
  school_id VARCHAR(64) PRIMARY KEY REFERENCES public.schools(id) ON DELETE CASCADE,
  first_period_start VARCHAR(5) NOT NULL DEFAULT '08:00',
  period_minutes INTEGER NOT NULL DEFAULT 40 CHECK (period_minutes BETWEEN 20 AND 120),
  break_after_period INTEGER NOT NULL DEFAULT 3 CHECK (break_after_period BETWEEN 1 AND 5),
  break_minutes INTEGER NOT NULL DEFAULT 20 CHECK (break_minutes BETWEEN 0 AND 120),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.teacher_unavailability (
  id VARCHAR(64) PRIMARY KEY,
  school_id VARCHAR(64) NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  teacher_id VARCHAR(64) NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  day_of_week VARCHAR(20) NOT NULL CHECK (day_of_week IN ('Monday','Tuesday','Wednesday','Thursday','Friday')),
  period_number INTEGER NOT NULL CHECK (period_number BETWEEN 1 AND 6),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, teacher_id, day_of_week, period_number)
);
CREATE INDEX IF NOT EXISTS idx_teacher_unavailability_scope ON public.teacher_unavailability(school_id, teacher_id, day_of_week);
ALTER TABLE public.timetable_slots ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
CREATE INDEX IF NOT EXISTS idx_timetable_active ON public.timetable_slots(school_id, class_id, is_active);
ALTER TABLE public.timetable_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_unavailability ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS timetable_settings_tenant ON public.timetable_settings;
CREATE POLICY timetable_settings_tenant ON public.timetable_settings FOR ALL TO authenticated
  USING (auth_user_role() = 'super_admin' OR school_id = auth_school_id())
  WITH CHECK (auth_user_role() = 'super_admin' OR school_id = auth_school_id());
DROP POLICY IF EXISTS teacher_unavailability_tenant ON public.teacher_unavailability;
CREATE POLICY teacher_unavailability_tenant ON public.teacher_unavailability FOR ALL TO authenticated
  USING (auth_user_role() = 'super_admin' OR school_id = auth_school_id())
  WITH CHECK (auth_user_role() = 'super_admin' OR school_id = auth_school_id());
DROP POLICY IF EXISTS timetable_settings_admin_insert ON public.timetable_settings;
CREATE POLICY timetable_settings_admin_insert ON public.timetable_settings AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (auth_user_role() IN ('school_admin','super_admin'));
DROP POLICY IF EXISTS timetable_settings_admin_update ON public.timetable_settings;
CREATE POLICY timetable_settings_admin_update ON public.timetable_settings AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (auth_user_role() IN ('school_admin','super_admin')) WITH CHECK (auth_user_role() IN ('school_admin','super_admin'));
DROP POLICY IF EXISTS timetable_settings_admin_delete ON public.timetable_settings;
CREATE POLICY timetable_settings_admin_delete ON public.timetable_settings AS RESTRICTIVE FOR DELETE TO authenticated
  USING (auth_user_role() IN ('school_admin','super_admin'));
DROP POLICY IF EXISTS teacher_unavailability_admin_insert ON public.teacher_unavailability;
CREATE POLICY teacher_unavailability_admin_insert ON public.teacher_unavailability AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (auth_user_role() IN ('school_admin','super_admin'));
DROP POLICY IF EXISTS teacher_unavailability_admin_update ON public.teacher_unavailability;
CREATE POLICY teacher_unavailability_admin_update ON public.teacher_unavailability AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (auth_user_role() IN ('school_admin','super_admin')) WITH CHECK (auth_user_role() IN ('school_admin','super_admin'));
DROP POLICY IF EXISTS teacher_unavailability_admin_delete ON public.teacher_unavailability;
CREATE POLICY teacher_unavailability_admin_delete ON public.teacher_unavailability AS RESTRICTIVE FOR DELETE TO authenticated
  USING (auth_user_role() IN ('school_admin','super_admin'));

CREATE OR REPLACE FUNCTION public.schoolos_replace_class_timetable(p_school_id VARCHAR, p_class_id VARCHAR, p_slots JSONB) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(COALESCE(p_slots, '[]'::jsonb)) AS n(day_of_week VARCHAR, period_number INTEGER, teacher_id VARCHAR)
    JOIN public.timetable_slots old ON old.school_id = p_school_id AND old.day_of_week = n.day_of_week
      AND old.period_number = n.period_number AND old.teacher_id = n.teacher_id AND old.class_id <> p_class_id AND old.is_active = TRUE
  ) THEN RAISE EXCEPTION 'A teacher is already assigned to another class in that period.'; END IF;
  UPDATE public.timetable_slots SET is_active = FALSE WHERE school_id = p_school_id AND class_id = p_class_id AND is_active = TRUE;
  INSERT INTO public.timetable_slots (id, school_id, class_id, day_of_week, period_number, start_time, end_time, subject_id, teacher_id, room_number, is_active)
  SELECT id, p_school_id, p_class_id, day_of_week, period_number, start_time, end_time, subject_id, teacher_id, room_number, TRUE
  FROM jsonb_to_recordset(COALESCE(p_slots, '[]'::jsonb)) AS n(
    id VARCHAR, day_of_week VARCHAR, period_number INTEGER, start_time VARCHAR, end_time VARCHAR,
    subject_id VARCHAR, teacher_id VARCHAR, room_number VARCHAR
  ) ON CONFLICT (id) DO UPDATE SET day_of_week = EXCLUDED.day_of_week, period_number = EXCLUDED.period_number,
    start_time = EXCLUDED.start_time, end_time = EXCLUDED.end_time, subject_id = EXCLUDED.subject_id,
    teacher_id = EXCLUDED.teacher_id, room_number = EXCLUDED.room_number, is_active = TRUE;
END;
$$;
REVOKE ALL ON FUNCTION public.schoolos_replace_class_timetable(VARCHAR, VARCHAR, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schoolos_replace_class_timetable(VARCHAR, VARCHAR, JSONB) TO service_role;

CREATE OR REPLACE FUNCTION public.schoolos_swap_timetable_slots(p_school_id VARCHAR, p_first_id VARCHAR, p_second_id VARCHAR) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE first_slot public.timetable_slots%ROWTYPE; second_slot public.timetable_slots%ROWTYPE;
BEGIN
  SELECT * INTO first_slot FROM public.timetable_slots WHERE id = p_first_id AND school_id = p_school_id AND is_active = TRUE FOR UPDATE;
  SELECT * INTO second_slot FROM public.timetable_slots WHERE id = p_second_id AND school_id = p_school_id AND is_active = TRUE FOR UPDATE;
  IF first_slot.id IS NULL OR second_slot.id IS NULL OR first_slot.id = second_slot.id THEN RAISE EXCEPTION 'Choose two different active timetable slots in this school.'; END IF;
  IF EXISTS (SELECT 1 FROM public.timetable_slots other WHERE other.school_id = p_school_id AND other.is_active = TRUE AND other.id NOT IN (p_first_id, p_second_id)
    AND ((other.teacher_id = first_slot.teacher_id AND other.day_of_week = second_slot.day_of_week AND other.period_number = second_slot.period_number)
      OR (other.teacher_id = second_slot.teacher_id AND other.day_of_week = first_slot.day_of_week AND other.period_number = first_slot.period_number)))
    THEN RAISE EXCEPTION 'The swap would create a teacher schedule conflict.'; END IF;
  UPDATE public.timetable_slots SET day_of_week = second_slot.day_of_week, period_number = second_slot.period_number,
    start_time = second_slot.start_time, end_time = second_slot.end_time WHERE id = p_first_id;
  UPDATE public.timetable_slots SET day_of_week = first_slot.day_of_week, period_number = first_slot.period_number,
    start_time = first_slot.start_time, end_time = first_slot.end_time WHERE id = p_second_id;
END;
$$;
REVOKE ALL ON FUNCTION public.schoolos_swap_timetable_slots(VARCHAR, VARCHAR, VARCHAR) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schoolos_swap_timetable_slots(VARCHAR, VARCHAR, VARCHAR) TO service_role;
NOTIFY pgrst, 'reload schema';
