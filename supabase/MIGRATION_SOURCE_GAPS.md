# Supabase migration source audit

Audited against the live Supabase project **school management 3** on 2026-11-10.
This document records source/history mismatches; it does not authorize applying,
replaying, deleting, or rewriting production migrations.

## Applied migration-history entries without a matching source file

The live `supabase_migrations.schema_migrations` history contains these entries,
but the original SQL source is not present in this repository:

| Applied version | Applied name | Notes |
| --- | --- | --- |
| `20261104072421` | `bulk_import_accept_legacy_parent_phone` | Preserve live behavior; recover the exact original SQL before attempting reconstruction. |
| `20261104073439` | `harden_support_tickets` | Security-sensitive; do not approximate or replay. |
| `20261104073643` | `communication_default_channel` | Related to legacy communication settings; provider-based delivery is disabled in the current app. |
| `20261106144438` | `school_calendar_preference` | Recover exact source and compare with the live `schools.calendar_type` field before future migration work. |

## Restored applied migration sources

The following source files now match already-applied migration-history versions.
Adding these files to source control does **not** apply them again:

- `20261108072315_link_schoolos_users_to_supabase_auth.sql`
- `20261108072809_backfill_email_for_linked_auth_accounts.sql`
- `035_attendance_rate_include_late_exclude_excused.sql` (restored earlier)
- `20261107092357_shift_aware_timetables.sql` (source is present; this is not a current source gap)

## Bootstrap SQL files

The repository contains numbered bootstrap files `001`–`016` that are not
listed as individual applied versions in the live migration history. Treat
these as bootstrap/schema history, not as instructions to replay them against
the existing production project.

## Pending branch migrations

These migrations were present on the Supabase Auth working branch and were
**not** applied to production during this audit:

- `20261108090000_fix_auth_user_update_rls_and_fk_indexes.sql`
- `20261108100000_school_backup_include_health_visits.sql`

They must be reconciled with the current `main` code, renamed to versions
newer than the latest applied migration if they are still needed, tested, and
reviewed before deployment. The setup wizard migration
`20261110052158_school_setup_wizard_progress.sql` has since been applied and
is recorded in the live history.

## Safe reconciliation procedure

1. Obtain original SQL from the commit or deployment artifact that applied
   each remaining missing entry. Do not infer SQL from a migration name.
2. Compare recovered SQL with live object definitions and `schema.sql`;
   record later migrations that supersede it.
3. Restore historical source only with its original version/name and document
   whether it is already applied. Never create a new migration that replays an
   already-applied change.
4. Keep production data and migration history intact. Use a separate new,
   additive migration for genuinely new schema changes.
