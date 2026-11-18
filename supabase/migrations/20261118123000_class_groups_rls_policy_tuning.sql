-- Avoid duplicate permissive SELECT policy evaluation while retaining tenant isolation.
drop policy if exists class_groups_admin_write on public.class_groups;
drop policy if exists class_sections_admin_write on public.class_sections;

create policy class_groups_admin_insert on public.class_groups
for insert to authenticated
with check (private.auth_user_role() in ('school_admin','super_admin')
  and ((private.auth_user_role() = 'super_admin') or school_id = private.auth_school_id()));
create policy class_groups_admin_update on public.class_groups
for update to authenticated
using (private.auth_user_role() in ('school_admin','super_admin')
  and ((private.auth_user_role() = 'super_admin') or school_id = private.auth_school_id()))
with check (private.auth_user_role() in ('school_admin','super_admin')
  and ((private.auth_user_role() = 'super_admin') or school_id = private.auth_school_id()));
create policy class_groups_admin_delete on public.class_groups
for delete to authenticated
using (private.auth_user_role() in ('school_admin','super_admin')
  and ((private.auth_user_role() = 'super_admin') or school_id = private.auth_school_id()));

create policy class_sections_admin_insert on public.class_sections
for insert to authenticated
with check (private.auth_user_role() in ('school_admin','super_admin')
  and ((private.auth_user_role() = 'super_admin') or school_id = private.auth_school_id()));
create policy class_sections_admin_update on public.class_sections
for update to authenticated
using (private.auth_user_role() in ('school_admin','super_admin')
  and ((private.auth_user_role() = 'super_admin') or school_id = private.auth_school_id()))
with check (private.auth_user_role() in ('school_admin','super_admin')
  and ((private.auth_user_role() = 'super_admin') or school_id = private.auth_school_id()));
create policy class_sections_admin_delete on public.class_sections
for delete to authenticated
using (private.auth_user_role() in ('school_admin','super_admin')
  and ((private.auth_user_role() = 'super_admin') or school_id = private.auth_school_id()));
