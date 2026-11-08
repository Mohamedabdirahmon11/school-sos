# Supabase live-schema reconciliation notes

Checked against the configured Supabase project `school management 3` on 2026-11-08 and the repository `main` schema/migration tree.

## Live migration history entries without matching checked-in source files

The live migration history contains these entries that do not have a matching file under `supabase/migrations/`:

- `20261104072421 bulk_import_accept_legacy_parent_phone`
- `20261104073439 harden_support_tickets`
- `20261104073643 communication_default_channel`
- `20261106144438 school_calendar_preference`
- `20261107092357 shift_aware_timetables`
- `20261107101812 password_reset_codes`
- `20261108072315 link_schoolos_users_to_supabase_auth`
- `20261108072809 backfill_email_for_linked_auth_accounts`
- `20261108102228 subscription_reminders`
- `20261108144304 default_currency_etb`
- `20261108144533 align_grade_and_period_checks`
- `20261108145334 cleanup_uniques_indexes_periods`
- `20261108145704 relax_period_limits`

The current database schema is the source of truth for the reconciliation migration. Historical SQL was not fabricated or assigned false original versions. Where exact original migration bodies are unavailable, this document records the source gap and the forward reconciliation migration captures the current required shape.

## Schema differences corrected in the forward migration and bootstrap snapshot

The live database had columns/tables/constraints not fully represented in the checked-in `schema.sql`, including:

- `schools.calendar_type`
- `users.password_changed_at` and `users.auth_user_id` (with the Supabase Auth FK and unique partial index)
- `teacher_unavailability.shift`, shift-aware uniqueness, and the 1–8 period range
- `fee_structures.class_id` and KG-compatible grade bounds 0–12
- `report_card_templates.own_design_image_url`
- `communication_settings.default_channel`
- `assignment_submissions.school_id`
- `password_reset_codes`
- `subscription_reminders`

The forward migrations also make platform, school, invoice and fee-range currency defaults ETB; synchronize the default plan prices with the live ETB price book; add KG (grade 0) to new schools and the existing school's allowed grade list; make the Super Admin revenue RPC currency-aware; and add atomic fan-out when publishing a platform broadcast into school notice feeds. The two service-only tables remain RLS-enabled and inaccessible to `anon` and `authenticated`; they intentionally have no end-user policies.

## Auth migration caveat

The current Express login route still validates SchoolOS password/PIN hashes and issues the `schoolos_session` cookie. The live database has 12 application users but only one row linked through `users.auth_user_id`, and only one Supabase Auth account. This is not a completed all-user migration to Supabase Auth. The existing custom-session flow was not silently replaced because doing so requires a coordinated account-linking, password-reset, session, and rollout plan that preserves existing logins.

The Supabase Security Advisor also reports leaked-password protection disabled. This is an Auth dashboard configuration rather than a SQL setting; enable it in Supabase Authentication password security before production launch.

## Safety

No school, student, teacher, fee, invoice, or user records were deleted or rewritten as part of this source reconciliation. The migration uses idempotent DDL and function replacements; it does not backfill or reset credentials.
