-- Atomic, tenant-scoped year-end promotion and history write.
-- The source class row lock serializes retries and prevents duplicate processing.
CREATE OR REPLACE FUNCTION public.schoolos_confirm_year_end_promotions(
  p_school_id text,
  p_class_id text,
  p_academic_year_from text,
  p_academic_year_to text,
  p_processed_by text,
  p_promotions jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_source public.classes%ROWTYPE;
  v_expected_count integer;
  v_received_count integer;
  v_target record;
  v_created jsonb;
  v_now timestamptz := now();
BEGIN
  IF jsonb_typeof(p_promotions) <> 'array' OR jsonb_array_length(p_promotions) < 1 THEN
    RAISE EXCEPTION 'Promotion list must contain at least one student.';
  END IF;

  SELECT * INTO v_source
  FROM public.classes
  WHERE id = p_class_id AND school_id = p_school_id AND is_archived = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Promotion source class was not found or is archived.';
  END IF;

  SELECT count(*) INTO v_expected_count
  FROM public.students
  WHERE school_id = p_school_id AND class_id = p_class_id;

  SELECT count(*) INTO v_received_count
  FROM jsonb_to_recordset(p_promotions) AS x(
    student_id text, class_to_id text, decision text,
    yearly_percentage numeric, yearly_rank integer, notes text,
    admin_override boolean
  );

  IF v_expected_count <> v_received_count
     OR (SELECT count(DISTINCT x.student_id)
         FROM jsonb_to_recordset(p_promotions) AS x(student_id text)) <> v_received_count THEN
    RAISE EXCEPTION 'Promotion confirmation must include every student exactly once.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_promotions) AS x(
      student_id text, class_to_id text, decision text,
      yearly_percentage numeric, yearly_rank integer, notes text,
      admin_override boolean
    )
    LEFT JOIN public.students s
      ON s.id = x.student_id AND s.school_id = p_school_id AND s.class_id = p_class_id
    WHERE s.id IS NULL
       OR x.decision NOT IN ('promoted', 'repeated')
       OR x.yearly_percentage IS NULL OR x.yearly_percentage < 0 OR x.yearly_percentage > 100
       OR x.yearly_rank IS NULL OR x.yearly_rank < 1
       OR (x.decision = 'promoted' AND (x.class_to_id IS NULL OR btrim(x.class_to_id) = ''))
       OR (coalesce(x.admin_override, false) AND coalesce(btrim(x.notes), '') = '')
  ) THEN
    RAISE EXCEPTION 'Promotion data contains invalid students, decisions, marks, ranks, or override reasons.';
  END IF;

  PERFORM 1
  FROM public.classes c
  WHERE c.school_id = p_school_id
    AND c.id IN (
      SELECT p_class_id
      UNION
      SELECT x.class_to_id
      FROM jsonb_to_recordset(p_promotions) AS x(class_to_id text, decision text)
      WHERE x.decision = 'promoted' AND x.class_to_id IS NOT NULL
    )
  ORDER BY c.id
  FOR UPDATE;

  IF EXISTS (
    SELECT 1 FROM public.promotions
    WHERE school_id = p_school_id
      AND class_from_id = p_class_id
      AND academic_year_from = p_academic_year_from
  ) THEN
    RAISE EXCEPTION 'This class has already been processed for the selected academic year.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_promotions) AS x(class_to_id text, decision text)
    LEFT JOIN public.classes c
      ON c.id = x.class_to_id AND c.school_id = p_school_id AND c.is_archived = false
    WHERE x.decision = 'promoted' AND c.id IS NULL
  ) THEN
    RAISE EXCEPTION 'A promotion target class is unavailable or belongs to another school.';
  END IF;

  FOR v_target IN
    SELECT c.id, c.name, c.capacity,
      (SELECT count(*) FROM public.students s WHERE s.school_id = p_school_id AND s.class_id = c.id) AS current_count,
      (SELECT count(*) FROM jsonb_to_recordset(p_promotions) AS x(class_to_id text, decision text)
       WHERE x.decision = 'promoted' AND x.class_to_id = c.id AND x.class_to_id <> p_class_id) AS incoming_count,
      (SELECT count(*) FROM jsonb_to_recordset(p_promotions) AS x(class_to_id text, decision text)
       WHERE x.decision = 'promoted' AND p_class_id = c.id AND x.class_to_id <> p_class_id) AS outgoing_count
    FROM public.classes c
    WHERE c.school_id = p_school_id
      AND c.id IN (
        SELECT p_class_id
        UNION
        SELECT x.class_to_id
        FROM jsonb_to_recordset(p_promotions) AS x(class_to_id text, decision text)
        WHERE x.decision = 'promoted' AND x.class_to_id IS NOT NULL
      )
  LOOP
    IF v_target.current_count - v_target.outgoing_count + v_target.incoming_count > v_target.capacity THEN
      RAISE EXCEPTION 'Target class % does not have enough capacity.', v_target.name;
    END IF;
  END LOOP;

  WITH input_rows AS (
    SELECT * FROM jsonb_to_recordset(p_promotions) AS x(
      student_id text, class_to_id text, decision text,
      yearly_percentage numeric, yearly_rank integer, notes text,
      admin_override boolean
    )
  ),
  inserted AS (
    INSERT INTO public.promotions (
      id, school_id, academic_year_from, academic_year_to,
      class_from_id, class_to_id, student_id, yearly_percentage,
      yearly_rank, decision, notes, processed_by, processed_at
    )
    SELECT
      'prm-' || gen_random_uuid()::text,
      p_school_id, p_academic_year_from, p_academic_year_to,
      p_class_id,
      CASE WHEN x.decision = 'promoted' THEN x.class_to_id ELSE p_class_id END,
      x.student_id, x.yearly_percentage, x.yearly_rank, x.decision,
      CASE WHEN coalesce(x.admin_override, false) THEN 'ADMIN OVERRIDE: ' || btrim(x.notes) ELSE x.notes END,
      p_processed_by, v_now
    FROM input_rows x
    RETURNING *
  ),
  history_rows AS (
    INSERT INTO public.promotion_history (
      id, school_id, academic_year_from, academic_year_to,
      class_id, student_id, yearly_percentage, yearly_rank,
      decision, processed_by, processed_at
    )
    SELECT
      'prh-' || gen_random_uuid()::text,
      p_school_id, p_academic_year_from, p_academic_year_to,
      p_class_id, x.student_id, x.yearly_percentage, x.yearly_rank,
      x.decision, p_processed_by, v_now
    FROM input_rows x
    RETURNING id
  )
  SELECT coalesce(jsonb_agg(to_jsonb(inserted)), '[]'::jsonb)
  INTO v_created
  FROM inserted;

  UPDATE public.students s
  SET class_id = x.class_to_id,
      branch_id = target.branch_id
  FROM jsonb_to_recordset(p_promotions) AS x(
    student_id text, class_to_id text, decision text
  )
  JOIN public.classes target
    ON target.id = x.class_to_id AND target.school_id = p_school_id
  WHERE s.id = x.student_id
    AND s.school_id = p_school_id
    AND s.class_id = p_class_id
    AND x.decision = 'promoted'
    AND x.class_to_id <> p_class_id;

  RETURN v_created;
END;
$function$;

REVOKE ALL ON FUNCTION public.schoolos_confirm_year_end_promotions(text, text, text, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.schoolos_confirm_year_end_promotions(text, text, text, text, text, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schoolos_confirm_year_end_promotions(text, text, text, text, text, jsonb) TO service_role;
