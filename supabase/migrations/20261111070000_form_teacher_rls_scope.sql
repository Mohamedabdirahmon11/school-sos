-- Extend the existing private RLS helpers so Form Teachers can read
-- the students and class-scoped records for their own homeroom class.
-- Subject-teacher and parent/student access rules remain unchanged.
BEGIN;

CREATE OR REPLACE FUNCTION private.auth_can_access_student(target_student_id VARCHAR)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.students AS s
    JOIN public.users AS u ON u.id = private.auth_user_id()
    WHERE s.id = target_student_id
      AND (
        u.role = 'super_admin'
        OR (u.school_id = s.school_id AND u.role IN ('school_admin', 'accountant'))
        OR (
          u.school_id = s.school_id AND u.role = 'teacher'
          AND EXISTS (
            SELECT 1 FROM public.teachers AS t
            JOIN public.class_subjects AS cs
              ON cs.teacher_id = t.id AND cs.school_id = t.school_id
             AND cs.class_id = s.class_id AND cs.is_active = TRUE
            WHERE t.user_id = u.id AND t.school_id = s.school_id
          )
        )
        OR (
          u.school_id = s.school_id AND u.role = 'teacher'
          AND EXISTS (
            SELECT 1 FROM public.classes AS c
            WHERE c.id = s.class_id
              AND c.school_id = s.school_id
              AND c.class_teacher_id = u.id
          )
        )
        OR (
          u.school_id = s.school_id AND u.role = 'parent'
          AND (
            s.id = ANY(u.linked_student_ids)
            OR s.father_phone = u.phone OR s.mother_phone = u.phone
            OR s.father_phone = u.parent_phone OR s.mother_phone = u.parent_phone
          )
        )
        OR (
          u.school_id = s.school_id AND u.role = 'student'
          AND (u.student_id = s.student_id OR u.id = 'usr-student-' || s.id)
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION private.auth_can_access_class(target_class_id VARCHAR)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.classes AS c
    JOIN public.users AS u ON u.id = private.auth_user_id()
    WHERE c.id = target_class_id
      AND (
        u.role = 'super_admin'
        OR (u.school_id = c.school_id AND u.role IN ('school_admin', 'accountant'))
        OR (
          u.school_id = c.school_id AND u.role = 'teacher'
          AND c.class_teacher_id = u.id
        )
        OR (
          u.school_id = c.school_id AND u.role = 'teacher'
          AND EXISTS (
            SELECT 1 FROM public.teachers AS t
            JOIN public.class_subjects AS cs
              ON cs.teacher_id = t.id AND cs.school_id = t.school_id
             AND cs.class_id = c.id AND cs.is_active = TRUE
            WHERE t.user_id = u.id AND t.school_id = c.school_id
          )
        )
        OR (
          u.school_id = c.school_id AND u.role IN ('parent', 'student')
          AND EXISTS (
            SELECT 1 FROM public.students AS s
            WHERE s.class_id = c.id AND private.auth_can_access_student(s.id)
          )
        )
      )
  );
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
