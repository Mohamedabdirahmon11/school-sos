-- Enforce that a section can only reference a class group from the same school.
create unique index if not exists class_groups_id_school_uidx on public.class_groups(id, school_id);
alter table public.class_sections
  add constraint class_sections_class_school_fkey
  foreign key (class_id, school_id)
  references public.class_groups(id, school_id)
  on delete cascade;
