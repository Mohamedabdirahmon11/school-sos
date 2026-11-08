# Supabase migration source audit

Audited against the live Supabase project **school management 3** on 2026-11-08.
This document records source/history mismatches; it does not authorize applying,
replaying, deleting, or rewriting production migrations.

## Applied migration-history entries without a matching source file

The live `supabase_migrations.schema_migrations` history contains these entries,
but no matching SQL file exists in this repository branch:

| Applied version | Applied name | Notes |
| --- | --- | --- |
| `20261104072421` | `bulk_import_accept_legacy_parent_phone` | Keep the live behavior; recover the exact original SQL before attempting any source reconstruction. |
| `20261104073439` | `harden_support_tickets` | Security-sensitive; do not approximate or replay. |
| `20261104073643` | `communication_default_channel` | Related to legacy communication settings; provider-based delivery is disabled in the current app. |
| `20261104074806` | `035_attendance_rate_include_late_exclude_excused` | The source was removed from the default branch by commit `9128b823ecd1cfcdd96b792c749754153dac473c`. Applied migration 037 contains the later dashboard aggregate used by production. |
| `20261106144438` | `school_calendar_preference` | Recover exact source and compare with the live `schools.calendar_type` field before any future migration work. |

## Bootstrap SQL files not represented as individual live history entries

The repository also contains numbered bootstrap files `001`–`016` that are not
listed as individual applied migration versions in the live migration history.
Treat them as repository bootstrap/schema history, not as instructions to run
against the existing production project.

## Pending branch migrations

These migrations are present on the working branch but were **not** applied to
production during this audit:

- `20261108090000_fix_auth_user_update_rls_and_fk_indexes.sql`
- `20261108100000_school_backup_include_health_visits.sql`

Apply them only after their PR changes are reconciled with the other open PRs,
the exact live schema is rechecked, and the rollout is explicitly approved.

## Safe reconciliation procedure

1. Obtain the original SQL from the commit or deployment artifact that actually
   applied each missing entry. Do not infer SQL from a migration name.
2. Compare the recovered SQL with the current live object definitions and
   `schema.sql`; record any later migrations that supersede it.
3. Restore historical source only with its original version/name and document
   whether it is already applied. Never create a new migration that replays an
   already-applied change.
4. Keep production data and migration history intact. Use a separate new,
   additive migration for any genuinely new schema change.
