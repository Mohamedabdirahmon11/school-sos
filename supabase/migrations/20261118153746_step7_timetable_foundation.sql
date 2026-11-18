-- STEP 7 foundation. Additive; existing timetable rows are preserved.
ALTER TABLE public.timetable_slots
  ADD COLUMN IF NOT EXISTS term_id uuid,
  ADD COLUMN IF NOT EXISTS section_id uuid,
  ADD COLUMN IF NOT EXISTS assignment_id uuid,
  ADD COLUMN IF NOT EXISTS room_id uuid,
  ADD COLUMN IF NOT EXISTS is_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.teacher_unavailability
  ALTER COLUMN period_number DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS reason text;

CREATE UNIQUE INDEX IF NOT EXISTS timetable_slots_id_school_uidx ON public.timetable_slots(id,school_id);
CREATE UNIQUE INDEX IF NOT EXISTS terms_id_school_uidx ON public.terms(id,school_id);
CREATE UNIQUE INDEX IF NOT EXISTS class_sections_id_school_uidx ON public.class_sections(id,school_id);
CREATE UNIQUE INDEX IF NOT EXISTS teacher_assignments_id_school_uidx ON public.teacher_class_subject_assignments(id,school_id);

CREATE TABLE IF NOT EXISTS public.rooms (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id varchar(64) NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
 name varchar(120) NOT NULL,
 type varchar(16) NOT NULL DEFAULT 'class' CHECK(type IN ('class','lab','hall')),
 capacity integer CHECK(capacity IS NULL OR capacity>0),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT rooms_school_name_unique UNIQUE(school_id,name),
 CONSTRAINT rooms_id_school_unique UNIQUE(id,school_id)
);

ALTER TABLE public.timetable_slots
 ADD CONSTRAINT timetable_slots_term_school_fk FOREIGN KEY(term_id,school_id) REFERENCES public.terms(id,school_id) ON DELETE RESTRICT,
 ADD CONSTRAINT timetable_slots_section_school_fk FOREIGN KEY(section_id,school_id) REFERENCES public.class_sections(id,school_id) ON DELETE RESTRICT,
 ADD CONSTRAINT timetable_slots_assignment_school_fk FOREIGN KEY(assignment_id,school_id) REFERENCES public.teacher_class_subject_assignments(id,school_id) ON DELETE RESTRICT,
 ADD CONSTRAINT timetable_slots_room_school_fk FOREIGN KEY(room_id,school_id) REFERENCES public.rooms(id,school_id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS timetable_class_slot_term_uidx ON public.timetable_slots(
 school_id,term_id,class_id,COALESCE(section_id,'00000000-0000-0000-0000-000000000000'::uuid),day_of_week,period_number
) WHERE term_id IS NOT NULL AND is_active=true;
CREATE UNIQUE INDEX IF NOT EXISTS timetable_teacher_slot_term_uidx ON public.timetable_slots(school_id,term_id,teacher_id,day_of_week,period_number)
 WHERE term_id IS NOT NULL AND is_active=true AND teacher_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS timetable_room_slot_term_uidx ON public.timetable_slots(school_id,term_id,room_id,day_of_week,period_number)
 WHERE term_id IS NOT NULL AND is_active=true AND room_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_timetable_term_class ON public.timetable_slots(school_id,term_id,class_id,day_of_week,period_number);
CREATE INDEX IF NOT EXISTS idx_timetable_term_teacher ON public.timetable_slots(school_id,term_id,teacher_id,day_of_week,period_number);

CREATE UNIQUE INDEX IF NOT EXISTS teacher_unavailability_slot_unique ON public.teacher_unavailability(
 school_id,teacher_id,day_of_week,COALESCE(period_number,0),shift
);
CREATE INDEX IF NOT EXISTS idx_teacher_unavailability_day ON public.teacher_unavailability(school_id,teacher_id,day_of_week,period_number);

CREATE TABLE IF NOT EXISTS public.timetable_substitutions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id varchar(64) NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
 entry_id varchar(64) NOT NULL,
 substitute_teacher_id varchar(64) NOT NULL,
 substitute_date date NOT NULL,
 reason text,
 created_by varchar(64),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT timetable_substitution_entry_school_fk FOREIGN KEY(entry_id,school_id) REFERENCES public.timetable_slots(id,school_id) ON DELETE CASCADE,
 CONSTRAINT timetable_substitution_teacher_school_fk FOREIGN KEY(substitute_teacher_id,school_id) REFERENCES public.teachers(id,school_id) ON DELETE RESTRICT,
 CONSTRAINT timetable_substitution_once_per_date UNIQUE(school_id,entry_id,substitute_date)
);
CREATE TABLE IF NOT EXISTS public.timetable_audit(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id varchar(64) NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
 timetable_slot_id varchar(64),
 action varchar(32) NOT NULL,
 before_data jsonb,
 after_data jsonb,
 changed_by varchar(64),
 changed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timetable_substitutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timetable_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rooms_school_scope ON public.rooms;
CREATE POLICY rooms_school_scope ON public.rooms FOR ALL TO authenticated
 USING(private.auth_user_role()::text='super_admin' OR (private.auth_user_role()::text NOT IN('parent','student') AND school_id=private.auth_school_id()::text))
 WITH CHECK(private.auth_user_role()::text='super_admin' OR (private.auth_user_role()::text NOT IN('parent','student') AND school_id=private.auth_school_id()::text));
DROP POLICY IF EXISTS timetable_substitutions_school_scope ON public.timetable_substitutions;
CREATE POLICY timetable_substitutions_school_scope ON public.timetable_substitutions FOR ALL TO authenticated
 USING(private.auth_user_role()::text='super_admin' OR (private.auth_user_role()::text NOT IN('parent','student') AND school_id=private.auth_school_id()::text))
 WITH CHECK(private.auth_user_role()::text='super_admin' OR (private.auth_user_role()::text NOT IN('parent','student') AND school_id=private.auth_school_id()::text));
DROP POLICY IF EXISTS timetable_audit_school_scope ON public.timetable_audit;
CREATE POLICY timetable_audit_school_scope ON public.timetable_audit FOR ALL TO authenticated
 USING(private.auth_user_role()::text='super_admin' OR (private.auth_user_role()::text NOT IN('parent','student') AND school_id=private.auth_school_id()::text))
 WITH CHECK(private.auth_user_role()::text='super_admin' OR (private.auth_user_role()::text NOT IN('parent','student') AND school_id=private.auth_school_id()::text));

GRANT SELECT,INSERT,UPDATE,DELETE ON public.rooms,public.timetable_substitutions TO authenticated,service_role;
GRANT SELECT,INSERT ON public.timetable_audit TO authenticated,service_role;
NOTIFY pgrst,'reload schema';