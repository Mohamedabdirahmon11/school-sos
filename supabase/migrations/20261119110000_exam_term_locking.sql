-- Allow School Admins to lock semester mark entry per school/year exam configuration.
alter table public.exam_configs
  add column if not exists locked_semesters text[] not null default '{}'::text[];

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'exam_configs_locked_semesters_valid'
      and conrelid = 'public.exam_configs'::regclass
  ) then
    alter table public.exam_configs
      add constraint exam_configs_locked_semesters_valid
      check (locked_semesters <@ array['Semester 1', 'Semester 2']::text[]);
  end if;
end $$;

notify pgrst, 'reload schema';
