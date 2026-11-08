# Supabase migration source gaps

This file records migration history entries observed in the production project
`school management 3` that do not have matching SQL files in the checked
`main` branch. These are source-control / reproducibility gaps, not evidence
that the deployed schema is missing the corresponding objects.

## Applied migration history entries without a matching source file

- `20261104072421_bulk_import_accept_legacy_parent_phone`
- `20261104073439_harden_support_tickets`
- `20261104073643_communication_default_channel`
- `20261104074806_035_attendance_rate_include_late_exclude_excused`
- `20261106144438_school_calendar_preference`

The attendance-rate migration was removed from the default branch in commit
`9128b823ecd1cfcdd96b792c749754153dac473c`; later dashboard aggregation work
may supersede parts of its behavior. Do not recreate it from its filename.

## Additional shift-aware SQL source gap

The production database contains shift-2 timetable settings columns and a
shift-aware `schoolos_swap_timetable_slots` function, but the previously
referenced source path
`supabase/migrations/20261107092357_shift_aware_timetables.sql` is not present
in `main`. This PR adds an idempotent schema-alignment migration for the
observed `classes.shift` and `timetable_settings.shift2_*` columns. It does
not claim to recover the original function migration.

## Recovery policy

- Recover exact original SQL from the original commit, deployment artifact, or
  trusted migration backup before restoring any historical migration file.
- Never fabricate historical migration contents from filenames or current
  schema state.
- Never edit the production migration history or replay bootstrap migrations
  to make source files appear synchronized.
- New forward-only migrations must remain idempotent where practical and be
  reviewed and tested before deployment.
