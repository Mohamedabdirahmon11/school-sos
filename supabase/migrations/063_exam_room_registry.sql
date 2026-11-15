-- Persistent, school-scoped exam room registry.
BEGIN;

CREATE TABLE IF NOT EXISTS public.exam_rooms (
  id VARCHAR(64) PRIMARY KEY,
  school_id VARCHAR(64) NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  room_code VARCHAR(40),
  capacity INTEGER NOT NULL CHECK (capacity BETWEEN 1 AND 500),
  location VARCHAR(160) NOT NULL DEFAULT '',
  shift_name VARCHAR(80) NOT NULL DEFAULT 'General',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT exam_rooms_id_school_unique UNIQUE (id, school_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_exam_rooms_school_name
  ON public.exam_rooms (school_id, lower(btrim(name)));
CREATE INDEX IF NOT EXISTS idx_exam_rooms_school_active
  ON public.exam_rooms (school_id, is_active, name);

ALTER TABLE public.exam_rooms ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.exam_rooms FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.exam_rooms TO service_role;
DROP POLICY IF EXISTS exam_rooms_service_role_all ON public.exam_rooms;
CREATE POLICY exam_rooms_service_role_all
  ON public.exam_rooms FOR ALL TO service_role
  USING (true) WITH CHECK (true);

ALTER TABLE public.exam_schedules ADD COLUMN IF NOT EXISTS room_id VARCHAR(64);
ALTER TABLE public.exam_schedules
  ADD CONSTRAINT exam_schedules_room_school_fk
  FOREIGN KEY (room_id, school_id)
  REFERENCES public.exam_rooms(id, school_id)
  ON DELETE RESTRICT;

-- Preserve existing room names and capacities by migrating them into the registry.
INSERT INTO public.exam_rooms (id, school_id, name, capacity, shift_name)
SELECT
  'room-' || md5(schedule.school_id || ':' || lower(btrim(schedule.room_name))),
  schedule.school_id,
  min(btrim(schedule.room_name)),
  greatest(1, least(500, max(schedule.seat_capacity))),
  COALESCE(NULLIF(min(schedule.shift_name), ''), 'General')
FROM public.exam_schedules AS schedule
WHERE NULLIF(btrim(schedule.room_name), '') IS NOT NULL
GROUP BY schedule.school_id, lower(btrim(schedule.room_name))
ON CONFLICT (school_id, lower(btrim(name))) DO NOTHING;

UPDATE public.exam_schedules AS schedule
   SET room_id = room.id
  FROM public.exam_rooms AS room
 WHERE room.school_id = schedule.school_id
   AND lower(btrim(room.name)) = lower(btrim(schedule.room_name))
   AND schedule.room_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_exam_schedules_school_room_date
  ON public.exam_schedules (school_id, room_id, exam_date, start_time)
  WHERE status <> 'cancelled';

-- Keep the database-side school backup restore allowlist in sync with exam room and seating data.
DO $exam_room_restore$
DECLARE
  v_definition TEXT;
BEGIN
  SELECT pg_get_functiondef('public.schoolos_restore_school_backup_legacy(jsonb)'::regprocedure)
    INTO v_definition;

  IF position('exam_rooms' IN v_definition) = 0 THEN
    v_definition := replace(
      v_definition,
      '''school_branches'', ''classes''',
      '''school_branches'', ''exam_rooms'', ''classes'''
    );
  END IF;
  IF position('exam_schedules' IN v_definition) = 0 THEN
    v_definition := replace(
      v_definition,
      '''school_notices'', ''exam_configs''',
      '''school_notices'', ''exam_configs'', ''exam_schedules'', ''exam_schedule_cohort_students'', ''exam_seat_assignments'''
    );
  END IF;
  IF position('exam_rooms' IN v_definition) = 0 OR position('exam_schedule_cohort_students' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not synchronize exam tables in the school backup restore allowlist.';
  END IF;
  EXECUTE v_definition;
END
$exam_room_restore$;

NOTIFY pgrst, 'reload schema';
COMMIT;
