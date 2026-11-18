-- Logical class groups and sections. Existing classes remain untouched because students,
-- exams, attendance and timetable rows reference their current class IDs.
create table if not exists public.class_groups (
  id uuid primary key default gen_random_uuid(),
  school_id varchar not null references public.schools(id) on delete cascade,
  name varchar(120) not null check (char_length(btrim(name)) between 1 and 120),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists class_groups_school_name_ci_uidx
  on public.class_groups (school_id, lower(btrim(name)));
create index if not exists class_groups_school_order_idx
  on public.class_groups (school_id, sort_order, name);

create table if not exists public.class_sections (
  id uuid primary key default gen_random_uuid(),
  school_id varchar not null references public.schools(id) on delete cascade,
  class_id uuid not null references public.class_groups(id) on delete cascade,
  name varchar(80) not null check (char_length(btrim(name)) between 1 and 80),
  legacy_class_id varchar references public.classes(id) on delete set null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
);
create unique index if not exists class_sections_class_name_ci_uidx on public.class_sections (class_id, lower(btrim(name)));
create unique index if not exists class_sections_legacy_class_uidx
  on public.class_sections (legacy_class_id) where legacy_class_id is not null;
create index if not exists class_sections_school_class_order_idx
  on public.class_sections (school_id, class_id, sort_order, name);

alter table public.class_groups enable row level security;
alter table public.class_sections enable row level security;
drop policy if exists class_groups_tenant_read on public.class_groups;
create policy class_groups_tenant_read on public.class_groups
  for select to authenticated
  using ((private.auth_user_role() = 'super_admin') or school_id = private.auth_school_id());
drop policy if exists class_groups_admin_write on public.class_groups;
create policy class_groups_admin_write on public.class_groups
  for all to authenticated
  using (private.auth_user_role() in ('school_admin','super_admin') and ((private.auth_user_role() = 'super_admin') or school_id = private.auth_school_id()))
  with check (private.auth_user_role() in ('school_admin','super_admin') and ((private.auth_user_role() = 'super_admin') or school_id = private.auth_school_id()));
drop policy if exists class_sections_tenant_read on public.class_sections;
create policy class_sections_tenant_read on public.class_sections
  for select to authenticated
  using ((private.auth_user_role() = 'super_admin') or school_id = private.auth_school_id());
drop policy if exists class_sections_admin_write on public.class_sections;
create policy class_sections_admin_write on public.class_sections
  for all to authenticated
  using (private.auth_user_role() in ('school_admin','super_admin') and ((private.auth_user_role() = 'super_admin') or school_id = private.auth_school_id()))
  with check (private.auth_user_role() in ('school_admin','super_admin') and ((private.auth_user_role() = 'super_admin') or school_id = private.auth_school_id()));
grant select, insert, update, delete on public.class_groups, public.class_sections to authenticated;
grant all on public.class_groups, public.class_sections to service_role;

-- Preserve every existing class ID and all of its dependent records. The logical
-- class group is unique per school/name; each old class record becomes a section.
insert into public.class_groups (school_id, name, sort_order)
select c.school_id, min(btrim(c.name)), min(coalesce(c.grade_level, 0)) * 100
from public.classes c
where nullif(btrim(c.name), '') is not null
group by c.school_id, lower(btrim(c.name))
on conflict (school_id, (lower(btrim(name)))) do nothing;

insert into public.class_sections (school_id, class_id, name, legacy_class_id, sort_order)
select c.school_id, g.id,
       coalesce(nullif(btrim(c.section), ''), 'Main'),
       c.id,
       row_number() over (partition by c.school_id, lower(btrim(c.name)) order by coalesce(c.grade_level,0), c.section, c.id)
from public.classes c
join public.class_groups g
  on g.school_id = c.school_id and lower(btrim(g.name)) = lower(btrim(c.name))
where nullif(btrim(c.name), '') is not null
on conflict do nothing;
