-- Trigger functions are invoked by their table triggers only.
-- They must not be callable directly through the exposed Supabase RPC endpoint.
revoke all on function public.sync_class_group_legacy_name() from public;
revoke all on function public.sync_class_group_legacy_name() from anon, authenticated;

revoke all on function public.sync_class_section_legacy_class() from public;
revoke all on function public.sync_class_section_legacy_class() from anon, authenticated;
