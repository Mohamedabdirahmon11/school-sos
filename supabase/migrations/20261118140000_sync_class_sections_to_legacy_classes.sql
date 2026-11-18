-- Keep new class groups and sections compatible with all legacy class consumers.
-- Student enrollment, attendance, exams, fees and timetable still reference public.classes.

create or replace function public.sync_class_section_legacy_class()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_name text;
  v_academic_year varchar;
  v_capacity integer;
  v_grade_level integer;
  v_class_id varchar;
  v_suffix text;
begin
  if new.legacy_class_id is not null then
    return new;
  end if;

  select g.name, s.academic_year, coalesce(s.default_class_capacity, 40)
    into v_group_name, v_academic_year, v_capacity
  from public.class_groups g
  join public.schools s on s.id = g.school_id
  where g.id = new.class_id and g.school_id = new.school_id;

  if not found then
    raise exception 'Class group not found for section';
  end if;

  if lower(v_group_name) like 'kg%' then
    v_grade_level := 0;
  else
    v_grade_level := coalesce(nullif(substring(v_group_name from '([0-9]{1,2})'), '')::integer, 0);
  end if;
  if v_grade_level < 0 or v_grade_level > 12 then
    v_grade_level := 0;
  end if;

  v_suffix := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  v_class_id := 'cls-' || lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 20));

  insert into public.classes (
    id, school_id, branch_id, name, grade_level, section, capacity,
    monthly_fee, shift, class_code, academic_year
  ) values (
    v_class_id, new.school_id, null, v_group_name, v_grade_level, new.name, v_capacity,
    0, 1,
    'CLS-' || case when v_grade_level = 0 then 'KG' else 'G' || v_grade_level::text end || '-' || v_suffix,
    v_academic_year
  );

  new.legacy_class_id := v_class_id;
  return new;
end;
$$;

drop trigger if exists class_sections_sync_legacy_class on public.class_sections;
create trigger class_sections_sync_legacy_class
before insert on public.class_sections
for each row execute function public.sync_class_section_legacy_class();

create or replace function public.sync_class_group_legacy_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_grade_level integer;
begin
  if new.name is not distinct from old.name then
    return new;
  end if;

  if lower(new.name) like 'kg%' then
    v_grade_level := 0;
  else
    v_grade_level := coalesce(nullif(substring(new.name from '([0-9]{1,2})'), '')::integer, 0);
  end if;
  if v_grade_level < 0 or v_grade_level > 12 then
    v_grade_level := 0;
  end if;

  update public.classes c
  set name = new.name, grade_level = v_grade_level
  where c.id in (
    select s.legacy_class_id
    from public.class_sections s
    where s.class_id = new.id and s.school_id = new.school_id
      and s.legacy_class_id is not null
  )
  and c.school_id = new.school_id;

  return new;
end;
$$;

drop trigger if exists class_groups_sync_legacy_name on public.class_groups;
create trigger class_groups_sync_legacy_name
after update of name on public.class_groups
for each row execute function public.sync_class_group_legacy_name();
