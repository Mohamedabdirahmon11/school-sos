-- Permanent school deletion: preview and transactional, tenant-scoped cleanup.
-- Only the server's service-role client may execute these SECURITY DEFINER functions.
create or replace function public.school_deletion_preview(p_school_id text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_school public.schools%rowtype;
  v_counts jsonb := '{}'::jsonb;
  r record;
  n bigint;
begin
  select * into v_school from public.schools where id = p_school_id;
  if not found then raise exception 'School not found'; end if;

  for r in
    select c.table_name, c.column_name
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.column_name in ('school_id', 'target_school_id')
      and c.table_name not in ('schools','users')
    order by c.table_name, c.column_name
  loop
    execute format('select count(*) from public.%I where %I = $1', r.table_name, r.column_name)
      into n using p_school_id;
    if n > 0 then
      v_counts := v_counts || jsonb_build_object(r.table_name, n);
    end if;
  end loop;

  select count(*) into n from public.users where school_id = p_school_id;
  v_counts := v_counts || jsonb_build_object('school_users', n);
  return jsonb_build_object('school_id', v_school.id, 'school_name', v_school.name,
    'counts', v_counts, 'total_rows', (select coalesce(sum(value::bigint),0) from jsonb_each_text(v_counts)));
end;
$$;

create or replace function public.delete_school_permanently(p_school_id text, p_confirm_name text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_school public.schools%rowtype;
  v_auth_ids uuid[];
  r record;
  v_deleted integer;
  v_progress integer;
  v_pass integer := 0;
  v_remaining bigint;
begin
  if p_school_id is null or length(trim(p_school_id)) = 0 then
    raise exception 'A valid school ID is required';
  end if;
  select * into v_school from public.schools where id = p_school_id for update;
  if not found then raise exception 'School not found'; end if;
  if p_confirm_name is null or p_confirm_name <> v_school.name then
    raise exception 'Confirmation name does not match the school name';
  end if;

  select coalesce(array_agg(auth_user_id) filter (where auth_user_id is not null), array[]::uuid[])
    into v_auth_ids from public.users where school_id = p_school_id;

  -- Delete all rows carrying this tenant ID. FK-restricted parent rows are
  -- retried after their dependent rows have been removed. Each statement is
  -- isolated so one FK dependency does not abort the overall transaction.
  loop
    v_progress := 0;
    for r in
      select distinct c.table_name, c.column_name
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.column_name in ('school_id', 'target_school_id')
        and c.table_name not in ('schools', 'users')
      order by c.table_name, c.column_name
    loop
      begin
        execute format('delete from public.%I where %I = $1', r.table_name, r.column_name)
          using p_school_id;
        get diagnostics v_deleted = row_count;
        v_progress := v_progress + v_deleted;
      exception when foreign_key_violation then
        -- A dependent tenant table will be removed in this or the next pass.
        null;
      end;
    end loop;
    exit when v_progress = 0;
    v_pass := v_pass + 1;
    if v_pass > 100 then raise exception 'School deletion stopped: dependency cycle detected'; end if;
  end loop;

  -- Tables whose rows are linked through the school's user IDs, not school_id.
  delete from public.password_reset_codes
    where user_id in (select id from public.users where school_id = p_school_id);
  delete from public.restore_test_records
    where created_by in (select id from public.users where school_id = p_school_id);

  -- Remove users only after tenant rows and restrictive user references are gone.
  delete from public.users where school_id = p_school_id;
  delete from public.schools where id = p_school_id;

  return jsonb_build_object('school_id', p_school_id, 'school_name', v_school.name,
    'auth_user_ids', to_jsonb(v_auth_ids), 'database_deleted', true);
end;
$$;

revoke all on function public.school_deletion_preview(text) from public, anon, authenticated;
revoke all on function public.delete_school_permanently(text, text) from public, anon, authenticated;
grant execute on function public.school_deletion_preview(text) to service_role;
grant execute on function public.delete_school_permanently(text, text) to service_role;
