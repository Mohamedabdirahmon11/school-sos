-- Atomic student promotion: enrollment changes, promotion records and history commit together.
-- The existing schoolos_promote_enrollments RPC remains the single source of truth
-- for enrollment capacity checks and student/class updates; this wrapper adds the
-- promotion ledger in the same PostgreSQL transaction.
BEGIN;

CREATE OR REPLACE FUNCTION public.schoolos_confirm_promotions_with_enrollments(
  p_school_id text,
  p_source_year uuid,
  p_target_year uuid,
  p_class_id text,
  p_actor_id text,
  p_promotions jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_source_year_name text;
  v_source_year_status text;
  v_source_year_end date;
  v_target_year_name text;
  v_target_year_status text;
  v_target_year_start date;
  v_class_academic_year text;
  v_expected_count integer;
  v_received_count integer;
  v_distinct_count integer;
  v_decisions jsonb;
  v_enrollment_count integer;
  v_created jsonb;
  v_now timestamptz := now();
BEGIN
  IF jsonb_typeof(p_promotions) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Promotion decisions must be a JSON array.';
  END IF;
  v_received_count := jsonb_array_length(p_promotions);
  IF v_received_count < 1 OR v_received_count > 2000 THEN
    RAISE EXCEPTION 'Promotion decisions must contain between 1 and 2,000 students.';
  END IF;

  SELECT name, status, end_date
    INTO v_source_year_name, v_source_year_status, v_source_year_end
  FROM public.academic_years
  WHERE id = p_source_year AND school_id = p_school_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source academic year does not belong to this school.';
  END IF;
  IF v_source_year_status <> 'active' THEN
    RAISE EXCEPTION 'Only the active academic year can be used as a promotion source.';
  END IF;

  SELECT name, status, start_date
    INTO v_target_year_name, v_target_year_status, v_target_year_start
  FROM public.academic_years
  WHERE id = p_target_year AND school_id = p_school_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target academic year does not belong to this school.';
  END IF;
  IF v_target_year_status <> 'draft' OR v_target_year_start <= v_source_year_end THEN
    RAISE EXCEPTION 'Choose a future draft academic year as the promotion target.';
  END IF;

  SELECT academic_year
    INTO v_class_academic_year
  FROM public.classes
  WHERE id = p_class_id AND school_id = p_school_id AND is_archived = false
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Promotion source class was not found or is archived.';
  END IF;
  IF v_class_academic_year IS NOT NULL AND v_class_academic_year <> v_source_year_name THEN
    RAISE EXCEPTION 'The source class does not belong to the selected academic year.';
  END IF;

  SELECT count(*) INTO v_expected_count
  FROM public.enrollments
  WHERE school_id = p_school_id AND academic_year_id = p_source_year
    AND class_id = p_class_id AND status = 'active';
  SELECT count(DISTINCT x."studentId") INTO v_distinct_count
  FROM jsonb_to_recordset(p_promotions) AS x("studentId" text);
  IF v_expected_count <> v_received_count OR v_distinct_count <> v_received_count THEN
    RAISE EXCEPTION 'Promotion confirmation must include every active source-class enrollment exactly once.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.promotions
    WHERE school_id = p_school_id AND class_from_id = p_class_id
      AND academic_year_from = v_source_year_name
  ) THEN
    RAISE EXCEPTION 'This class has already been processed for the selected academic year.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_promotions) AS x(
      "studentId" text, "targetClassId" text, decision text,
      "yearlyPercentage" numeric, "yearlyRank" integer, notes text,
      "adminOverride" boolean
    )
    LEFT JOIN public.enrollments e
      ON e.school_id = p_school_id AND e.student_id = x."studentId"
     AND e.academic_year_id = p_source_year AND e.class_id = p_class_id
     AND e.status = 'active'
    LEFT JOIN public.classes target
      ON target.id = x."targetClassId" AND target.school_id = p_school_id
     AND target.is_archived = false
    WHERE e.id IS NULL
       OR x.decision NOT IN ('promoted', 'repeated')
       OR x."yearlyPercentage" IS NULL OR x."yearlyPercentage" < 0 OR x."yearlyPercentage" > 100
       OR x."yearlyRank" IS NULL OR x."yearlyRank" < 1
       OR (x.decision = 'promoted' AND (x."targetClassId" IS NULL OR btrim(x."targetClassId") = '' OR target.id IS NULL))
       OR (x.decision = 'repeated' AND coalesce(x."targetClassId", p_class_id) <> p_class_id)
       OR (coalesce(x."adminOverride", false) AND coalesce(btrim(x.notes), '') = '')
  ) THEN
    RAISE EXCEPTION 'Promotion decisions contain an invalid student, target class, result, rank or override reason.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_promotions) AS x("studentId" text)
    JOIN public.enrollments e
      ON e.school_id = p_school_id AND e.student_id = x."studentId"
     AND e.academic_year_id = p_target_year AND e.status = 'active'
  ) THEN
    RAISE EXCEPTION 'A student already has an active enrollment in the target academic year.';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'studentId', x."studentId",
    'decision', x.decision,
    'targetClassId', CASE WHEN x.decision = 'promoted' THEN x."targetClassId" ELSE p_class_id END
  ) ORDER BY x."studentId"), '[]'::jsonb)
  INTO v_decisions
  FROM jsonb_to_recordset(p_promotions) AS x(
    "studentId" text, "targetClassId" text, decision text
  );

  -- This RPC locks source/target classes, validates capacity, closes source
  -- enrollments, creates target enrollments, updates students and logs the batch.
  v_enrollment_count := public.schoolos_promote_enrollments(
    p_school_id, p_source_year, p_target_year, p_class_id, v_decisions, p_actor_id
  );
  IF v_enrollment_count <> v_received_count THEN
    RAISE EXCEPTION 'Enrollment promotion returned an incomplete student count.';
  END IF;

  WITH input_rows AS (
    SELECT * FROM jsonb_to_recordset(p_promotions) AS x(
      "studentId" text, "targetClassId" text, decision text,
      "yearlyPercentage" numeric, "yearlyRank" integer, notes text,
      "adminOverride" boolean
    )
  ),
  inserted AS (
    INSERT INTO public.promotions (
      id, school_id, academic_year_from, academic_year_to,
      class_from_id, class_to_id, student_id, yearly_percentage,
      yearly_rank, decision, notes, processed_by, processed_at
    )
    SELECT
      'prm-' || pg_catalog.gen_random_uuid()::text,
      p_school_id, v_source_year_name, v_target_year_name,
      p_class_id,
      CASE WHEN x.decision = 'promoted' THEN x."targetClassId" ELSE p_class_id END,
      x."studentId", x."yearlyPercentage", x."yearlyRank", x.decision,
      CASE WHEN coalesce(x."adminOverride", false) THEN 'ADMIN OVERRIDE: ' || btrim(x.notes) ELSE x.notes END,
      p_actor_id, v_now
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
      'prh-' || pg_catalog.gen_random_uuid()::text,
      p_school_id, v_source_year_name, v_target_year_name,
      p_class_id, x."studentId", x."yearlyPercentage", x."yearlyRank",
      x.decision, p_actor_id, v_now
    FROM input_rows x
    RETURNING id
  )
  SELECT coalesce(jsonb_agg(to_jsonb(inserted)), '[]'::jsonb)
    INTO v_created
  FROM inserted;

  RETURN jsonb_build_object(
    'enrollmentCount', v_enrollment_count,
    'promotions', coalesce(v_created, '[]'::jsonb)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.schoolos_confirm_promotions_with_enrollments(text, uuid, uuid, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.schoolos_confirm_promotions_with_enrollments(text, uuid, uuid, text, text, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schoolos_confirm_promotions_with_enrollments(text, uuid, uuid, text, text, jsonb) TO service_role;

COMMIT;
