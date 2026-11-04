-- Safe, school-scoped merge restore. It never deletes live rows or restores credentials/billing.
BEGIN;

CREATE OR REPLACE FUNCTION public.schoolos_backup_json_snake(p_row JSONB)
RETURNS JSONB
LANGUAGE SQL
IMMUTABLE
SET search_path = ''
AS $$
  SELECT COALESCE(
    jsonb_object_agg(lower(regexp_replace(key, '([A-Z])', E'_\\1', 'g')), value),
    '{}'::jsonb
  )
  FROM jsonb_each(COALESCE(p_row, '{}'::jsonb));
$$;

REVOKE ALL ON FUNCTION public.schoolos_backup_json_snake(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schoolos_backup_json_snake(JSONB) TO service_role;

CREATE OR REPLACE FUNCTION public.schoolos_restore_school_backup(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_backup JSONB;
  v_tables JSONB;
  v_rows JSONB;
  v_snake_rows JSONB;
  v_row JSONB;
  v_table TEXT;
  v_school_id VARCHAR(64);
  v_user_id VARCHAR(64);
  v_user_name TEXT;
  v_user_role public.user_role_enum;
  v_primary_keys TEXT[];
  v_pk_columns TEXT;
  v_pk_join TEXT;
  v_update_set TEXT;
  v_conflict BOOLEAN;
  v_counts JSONB := '{}'::jsonb;
  v_count INTEGER;
BEGIN
  IF jsonb_typeof(p_payload) <> 'object'
     OR COALESCE((p_payload->>'confirm')::BOOLEAN, FALSE) IS NOT TRUE
     OR NULLIF(p_payload->>'school_id', '') IS NULL
     OR jsonb_typeof(p_payload->'backup') <> 'object' THEN
    RAISE EXCEPTION 'A confirmed school backup restore payload is required.';
  END IF;

  v_school_id := p_payload->>'school_id';
  v_backup := p_payload->'backup';
  v_tables := v_backup->'tables';
  IF v_backup->'school'->>'id' IS DISTINCT FROM v_school_id THEN
    RAISE EXCEPTION 'The backup belongs to a different school.';
  END IF;
  IF jsonb_typeof(v_tables) <> 'object' THEN
    RAISE EXCEPTION 'The backup does not contain a valid tables object.';
  END IF;

  v_user_id := p_payload->>'approved_by';
  v_user_name := COALESCE(NULLIF(p_payload->>'approved_by_name', ''), 'School Administrator');
  v_user_role := COALESCE(NULLIF(p_payload->>'approved_by_role', ''), 'school_admin')::public.user_role_enum;

  FOREACH v_table IN ARRAY ARRAY['school_branches', 'classes', 'subjects', 'teachers', 'students', 'staff_members', 'admission_applications', 'assignments', 'fee_structures', 'fee_ranges', 'fee_receipt_sequences', 'inventory_items', 'library_books', 'transport_routes', 'school_notices', 'exam_configs', 'report_card_templates', 'communication_settings', 'school_events', 'subscription_invoices', 'support_tickets', 'audit_logs', 'timetable_settings', 'teacher_unavailability', 'timetable_slots', 'class_subjects', 'fee_payments', 'attendance_records', 'student_marks', 'assignment_submissions', 'promotions', 'promotion_history', 'inventory_transactions', 'library_loans', 'bus_assignments', 'notice_reads', 'communication_queue', 'direct_messages', 'discipline_incidents', 'payroll_records', 'notification_templates'] LOOP
    v_rows := v_tables->v_table;
    IF v_rows IS NULL OR v_rows = 'null'::jsonb THEN
      CONTINUE;
    END IF;
    IF jsonb_typeof(v_rows) <> 'array' THEN
      RAISE EXCEPTION 'Backup table % must be an array.', v_table;
    END IF;
    v_count := jsonb_array_length(v_rows);
    IF v_count = 0 THEN
      CONTINUE;
    END IF;

    FOR v_row IN SELECT value FROM jsonb_array_elements(v_rows) LOOP
      IF COALESCE(v_row->>'schoolId', v_row->>'school_id') IS DISTINCT FROM v_school_id THEN
        RAISE EXCEPTION 'Backup table % contains a row outside the selected school.', v_table;
      END IF;
    END LOOP;

    SELECT jsonb_agg(public.schoolos_backup_json_snake(value))
      INTO v_snake_rows
      FROM jsonb_array_elements(v_rows);

    SELECT array_agg(kcu.column_name ORDER BY kcu.ordinal_position)
      INTO v_primary_keys
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
       AND tc.table_name = kcu.table_name
     WHERE tc.table_schema = 'public'
       AND tc.table_name = v_table
       AND tc.constraint_type = 'PRIMARY KEY';

    IF COALESCE(array_length(v_primary_keys, 1), 0) = 0 THEN
      RAISE EXCEPTION 'Backup table % has no primary key.', v_table;
    END IF;

    SELECT string_agg(format('%I', key_name), ', '),
           string_agg(format('current_row.%I = incoming.%I', key_name, key_name), ' AND ')
      INTO v_pk_columns, v_pk_join
      FROM unnest(v_primary_keys) AS pk(key_name);

    EXECUTE format(
      'SELECT EXISTS (SELECT 1 FROM public.%I current_row JOIN jsonb_populate_recordset(NULL::public.%I, $1) incoming ON %s WHERE current_row.school_id IS DISTINCT FROM $2)',
      v_table, v_table, v_pk_join
    ) INTO v_conflict USING v_snake_rows, v_school_id;

    IF v_conflict THEN
      RAISE EXCEPTION 'Backup table % conflicts with a record owned by another school.', v_table;
    END IF;

    SELECT string_agg(format('%I = EXCLUDED.%I', column_name, column_name), ', ' ORDER BY ordinal_position)
      INTO v_update_set
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = v_table
       AND column_name <> ALL(v_primary_keys)
       AND column_name <> 'school_id'
       AND is_generated = 'NEVER';

    IF v_update_set IS NULL THEN
      EXECUTE format(
        'INSERT INTO public.%I SELECT (jsonb_populate_recordset(NULL::public.%I, $1)).* ON CONFLICT (%s) DO NOTHING',
        v_table, v_table, v_pk_columns
      ) USING v_snake_rows;
    ELSE
      EXECUTE format(
        'INSERT INTO public.%I SELECT (jsonb_populate_recordset(NULL::public.%I, $1)).* ON CONFLICT (%s) DO UPDATE SET %s',
        v_table, v_table, v_pk_columns, v_update_set
      ) USING v_snake_rows;
    END IF;

    v_counts := v_counts || jsonb_build_object(v_table, v_count);
  END LOOP;

  INSERT INTO public.audit_logs (
    id, action, category, school_id, school_name, user_id, user_name,
    user_role, details, severity
  )
  SELECT 'audit-' || gen_random_uuid()::text, 'SCHOOL_BACKUP_RESTORED',
    'security', v_school_id, s.name, v_user_id, v_user_name, v_user_role,
    'School backup merge restore completed. Existing rows not present in the backup were preserved.',
    'warning'
  FROM public.schools s WHERE s.id = v_school_id;

  RETURN jsonb_build_object('school_id', v_school_id, 'mode', 'merge', 'restored', v_counts);
END;
$$;

REVOKE ALL ON FUNCTION public.schoolos_restore_school_backup(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schoolos_restore_school_backup(JSONB) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
