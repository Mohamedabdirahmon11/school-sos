-- Create teacher account, profile, subject links and optional Form Teacher link in one transaction.
BEGIN;
CREATE OR REPLACE FUNCTION public.schoolos_create_teacher(
  p_school_id VARCHAR,
  p_user JSONB,
  p_teacher JSONB,
  p_subject_ids TEXT[] DEFAULT ARRAY[]::TEXT[],
  p_form_teacher_class_id VARCHAR DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id VARCHAR(64);
  v_teacher_id VARCHAR(64);
BEGIN
  v_user_id := p_user->>'id';
  v_teacher_id := p_teacher->>'id';
  IF v_user_id IS NULL OR v_teacher_id IS NULL
     OR p_user->>'school_id' IS DISTINCT FROM p_school_id
     OR p_teacher->>'school_id' IS DISTINCT FROM p_school_id
     OR p_user->>'role' IS DISTINCT FROM 'teacher'
     OR p_teacher->>'user_id' IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'Invalid teacher account payload' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.users (
    id, school_id, role, full_name, email, phone, staff_id, password_hash, pin_hash,
    must_change_password, is_blocked, failed_login_attempts, assigned_class_ids, assigned_subject_ids
  ) VALUES (
    v_user_id, p_school_id, 'teacher', p_user->>'full_name', NULLIF(p_user->>'email', ''),
    NULLIF(p_user->>'phone', ''), p_user->>'staff_id', p_user->>'password_hash', p_user->>'pin_hash',
    COALESCE((p_user->>'must_change_password')::BOOLEAN, FALSE),
    COALESCE((p_user->>'is_blocked')::BOOLEAN, FALSE),
    COALESCE((p_user->>'failed_login_attempts')::INTEGER, 0),
    ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_user->'assigned_class_ids', '[]'::JSONB))),
    ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_user->'assigned_subject_ids', '[]'::JSONB)))
  );

  INSERT INTO public.teachers (
    id, school_id, branch_id, user_id, full_name, email, phone, address, staff_id,
    gender, qualification, department, assigned_classes, assigned_subjects, status, joined_date, monthly_salary
  ) VALUES (
    v_teacher_id, p_school_id, NULLIF(p_teacher->>'branch_id', ''), v_user_id,
    p_teacher->>'full_name', COALESCE(p_teacher->>'email', ''), NULLIF(p_teacher->>'phone', ''),
    COALESCE(p_teacher->>'address', ''), p_teacher->>'staff_id', p_teacher->>'gender',
    NULLIF(p_teacher->>'qualification', ''), NULLIF(p_teacher->>'department', ''),
    ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_teacher->'assigned_classes', '[]'::JSONB))),
    ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_teacher->'assigned_subjects', '[]'::JSONB))),
    COALESCE(p_teacher->>'status', 'active'), (p_teacher->>'joined_date')::DATE,
    COALESCE((p_teacher->>'monthly_salary')::NUMERIC, 0)
  );

  INSERT INTO public.teacher_subjects (school_id, teacher_id, subject_id, is_active)
  SELECT p_school_id, v_teacher_id, subject_id, TRUE
  FROM unnest(COALESCE(p_subject_ids, ARRAY[]::TEXT[])) AS subjects(subject_id)
  ON CONFLICT (teacher_id, subject_id) DO UPDATE SET is_active = TRUE;

  IF p_form_teacher_class_id IS NOT NULL THEN
    UPDATE public.classes
    SET class_teacher_id = v_user_id
    WHERE id = p_form_teacher_class_id AND school_id = p_school_id AND is_archived = FALSE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Form Teacher class must belong to this school and be active' USING ERRCODE = '23503';
    END IF;
  END IF;

  RETURN jsonb_build_object('user_id', v_user_id, 'teacher_id', v_teacher_id);
END;
$$;
REVOKE ALL ON FUNCTION public.schoolos_create_teacher(VARCHAR, JSONB, JSONB, TEXT[], VARCHAR) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schoolos_create_teacher(VARCHAR, JSONB, JSONB, TEXT[], VARCHAR) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
