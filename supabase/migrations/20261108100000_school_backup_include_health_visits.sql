-- Extend safe school backup restore with all current academic modules and safe school profile settings.
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
  ) - ARRAY[
    'pin_hash', 'password_hash', 'two_factor_secret', 'pending_two_factor_secret',
    'recovery_codes', 'failed_login_attempts', 'locked_until',
    'api_key', 'api_secret', 'webhook_url'
  ]
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
  v_fk RECORD;
  v_fk_join TEXT;
  v_fk_nonnull TEXT;
  v_fk_scope TEXT;
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
  v_school_row public.schools%ROWTYPE;
  v_school_profile JSONB;
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

  -- Restore school profile/settings without changing the immutable school ID/code
  -- or platform billing/subscription records.
  v_school_profile := public.schoolos_backup_json_snake(v_backup->'school');
  SELECT * INTO v_school_row
    FROM jsonb_populate_record(NULL::public.schools, v_school_profile);

  UPDATE public.schools AS current_school
     SET          name = CASE WHEN v_school_profile ? 'name' THEN v_school_row.name ELSE current_school.name END,
         address = CASE WHEN v_school_profile ? 'address' THEN v_school_row.address ELSE current_school.address END,
         city = CASE WHEN v_school_profile ? 'city' THEN v_school_row.city ELSE current_school.city END,
         phone = CASE WHEN v_school_profile ? 'phone' THEN v_school_row.phone ELSE current_school.phone END,
         email = CASE WHEN v_school_profile ? 'email' THEN v_school_row.email ELSE current_school.email END,
         logo_url = CASE WHEN v_school_profile ? 'logo_url' THEN v_school_row.logo_url ELSE current_school.logo_url END,
         brand_color = CASE WHEN v_school_profile ? 'brand_color' THEN v_school_row.brand_color ELSE current_school.brand_color END,
         currency = CASE WHEN v_school_profile ? 'currency' THEN v_school_row.currency ELSE current_school.currency END,
         language = CASE WHEN v_school_profile ? 'language' THEN v_school_row.language ELSE current_school.language END,
         timezone = CASE WHEN v_school_profile ? 'timezone' THEN v_school_row.timezone ELSE current_school.timezone END,
         academic_year = CASE WHEN v_school_profile ? 'academic_year' THEN v_school_row.academic_year ELSE current_school.academic_year END,
         current_semester = CASE WHEN v_school_profile ? 'current_semester' THEN v_school_row.current_semester ELSE current_school.current_semester END,
         terms = CASE WHEN v_school_profile ? 'terms' THEN v_school_row.terms ELSE current_school.terms END,
         grading_scale = CASE WHEN v_school_profile ? 'grading_scale' THEN v_school_row.grading_scale ELSE current_school.grading_scale END,
         attendance_rules = CASE WHEN v_school_profile ? 'attendance_rules' THEN v_school_row.attendance_rules ELSE current_school.attendance_rules END,
         class_levels = CASE WHEN v_school_profile ? 'class_levels' THEN v_school_row.class_levels ELSE current_school.class_levels END,
         report_card_header = CASE WHEN v_school_profile ? 'report_card_header' THEN v_school_row.report_card_header ELSE current_school.report_card_header END,
         report_card_footer = CASE WHEN v_school_profile ? 'report_card_footer' THEN v_school_row.report_card_footer ELSE current_school.report_card_footer END,
         receipt_header = CASE WHEN v_school_profile ? 'receipt_header' THEN v_school_row.receipt_header ELSE current_school.receipt_header END,
         receipt_footer = CASE WHEN v_school_profile ? 'receipt_footer' THEN v_school_row.receipt_footer ELSE current_school.receipt_footer END,
         notification_preferences = CASE WHEN v_school_profile ? 'notification_preferences' THEN v_school_row.notification_preferences ELSE current_school.notification_preferences END,
         default_class_capacity = CASE WHEN v_school_profile ? 'default_class_capacity' THEN v_school_row.default_class_capacity ELSE current_school.default_class_capacity END,
         student_access_enabled = CASE WHEN v_school_profile ? 'student_access_enabled' THEN v_school_row.student_access_enabled ELSE current_school.student_access_enabled END,
         calendar_type = CASE WHEN v_school_profile ? 'calendar_type' THEN v_school_row.calendar_type ELSE current_school.calendar_type END,
         updated_at = now()
   WHERE current_school.id = v_school_id;

  v_counts := v_counts || jsonb_build_object('school_profile', 1);

  v_user_id := p_payload->>'approved_by';
  v_user_name := COALESCE(NULLIF(p_payload->>'approved_by_name', ''), 'School Administrator');
  v_user_role := COALESCE(NULLIF(p_payload->>'approved_by_role', ''), 'school_admin')::public.user_role_enum;

  FOREACH v_table IN ARRAY ARRAY['school_branches', 'classes', 'subjects', 'teachers', 'students', 'staff_members', 'admission_applications', 'assignments', 'fee_structures', 'fee_ranges', 'fee_receipt_sequences', 'inventory_items', 'library_books', 'transport_routes', 'school_notices', 'exam_configs', 'exam_schedules', 'exam_seat_assignments', 'report_card_templates', 'school_events', 'school_health_visits', 'support_tickets', 'timetable_settings', 'teacher_unavailability', 'timetable_slots', 'class_subjects', 'fee_payments', 'attendance_records', 'student_marks', 'assignment_submissions', 'promotions', 'promotion_history', 'inventory_transactions', 'library_loans', 'bus_assignments', 'notice_reads', 'direct_messages', 'discipline_incidents', 'payroll_records', 'notification_templates'] LOOP
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

    -- A school-scoped row must not reference another school's record
    -- through a legacy single-column FK. Composite (id, school_id) FKs
    -- already enforce this and are intentionally skipped here.
    FOR v_fk IN
      SELECT target.relname AS target_table,
             array_agg(source_column.attname ORDER BY key_pair.ordinality) AS source_columns,
             array_agg(target_column.attname ORDER BY key_pair.ordinality) AS target_columns
        FROM pg_constraint fk
        JOIN pg_class source ON source.oid = fk.conrelid
        JOIN pg_namespace source_ns ON source_ns.oid = source.relnamespace
        JOIN pg_class target ON target.oid = fk.confrelid
        JOIN pg_namespace target_ns ON target_ns.oid = target.relnamespace
        JOIN LATERAL unnest(fk.conkey, fk.confkey) WITH ORDINALITY
          AS key_pair(source_attnum, target_attnum, ordinality) ON TRUE
        JOIN pg_attribute source_column
          ON source_column.attrelid = source.oid AND source_column.attnum = key_pair.source_attnum
        JOIN pg_attribute target_column
          ON target_column.attrelid = target.oid AND target_column.attnum = key_pair.target_attnum
       WHERE fk.contype = 'f'
         AND source_ns.nspname = 'public'
         AND source.relname = v_table
         AND target_ns.nspname = 'public'
         AND EXISTS (
           SELECT 1 FROM information_schema.columns target_scope
            WHERE target_scope.table_schema = 'public'
              AND target_scope.table_name = target.relname
              AND target_scope.column_name = 'school_id'
         )
         AND NOT EXISTS (
           SELECT 1
             FROM unnest(fk.conkey, fk.confkey) AS scope_pair(source_attnum, target_attnum)
             JOIN pg_attribute scope_source
               ON scope_source.attrelid = source.oid AND scope_source.attnum = scope_pair.source_attnum
             JOIN pg_attribute scope_target
               ON scope_target.attrelid = target.oid AND scope_target.attnum = scope_pair.target_attnum
            WHERE scope_source.attname = 'school_id'
              AND scope_target.attname = 'school_id'
         )
       GROUP BY target.relname, fk.oid
    LOOP
      SELECT string_agg(format('incoming.%I = target_row.%I', source_column, target_column), ' AND '),
             string_agg(format('incoming.%I IS NOT NULL', source_column), ' AND ')
        INTO v_fk_join, v_fk_nonnull
        FROM unnest(v_fk.source_columns, v_fk.target_columns)
          AS fk_columns(source_column, target_column);

      -- A global super-admin user may legitimately be the actor on a
      -- school-owned message or support record; all other references must
      -- resolve to a row owned by this school.
      v_fk_scope := CASE
        WHEN v_fk.target_table = 'users'
          THEN '(target_row.school_id = $2 OR (target_row.school_id IS NULL AND target_row.role::text = ''super_admin''))'
        ELSE 'target_row.school_id = $2'
      END;

      EXECUTE format(
        'SELECT EXISTS (SELECT 1 FROM jsonb_populate_recordset(NULL::public.%I, $1) AS incoming WHERE %s AND NOT EXISTS (SELECT 1 FROM public.%I AS target_row WHERE %s AND %s))',
        v_table, v_fk_nonnull, v_fk.target_table, v_fk_join, v_fk_scope
      ) INTO v_conflict USING v_snake_rows, v_school_id;

      IF v_conflict THEN
        RAISE EXCEPTION 'Backup table % references a record outside this school through %.',
          v_table, v_fk.target_table;
      END IF;
    END LOOP;

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
       AND column_name NOT IN ('pin_hash', 'password_hash', 'two_factor_secret', 'pending_two_factor_secret', 'recovery_codes', 'api_key', 'api_secret', 'webhook_url')
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
