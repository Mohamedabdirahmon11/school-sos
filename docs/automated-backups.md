# Automated Supabase backups and restore

SchoolOS uses the `super_admin_settings.backup_schedule` preference to decide when the scheduled GitHub Actions backup runs:

- `daily`: every day at 02:00 UTC
- `weekly`: Monday at 02:00 UTC
- `manual`: scheduled runs are skipped; a Super Admin can run the workflow manually with `force=true`

## One-time setup

1. Open the private GitHub repository **Settings → Secrets and variables → Actions**.
2. Add a repository secret named `SUPABASE_DB_URL`.
3. Use the **Session Pooler** connection string from Supabase → Connect. GitHub-hosted runners use IPv4; Supabase documents that the direct database hostname may require an IPv4 add-on.
4. Do not put the connection string or database password in source code, issues, or chat.
5. Run **Actions → Supabase Database Backup → Run workflow** once with `force=true` to verify the connection and artifact upload.

The workflow reads the saved frequency from `public.super_admin_settings`, exports roles, schema, and data with the Supabase CLI, creates SHA-256 checksums, and stores the compressed export as a private GitHub Actions artifact for 30 days. It does not commit database data to Git.

## Restore procedure

Restore only into a **new/empty recovery project**, not over the live production database:

1. Create a separate Supabase recovery project (or use an isolated recovery environment).
2. Download the desired `schoolos-supabase-backup-<run-id>` artifact from the GitHub Actions run and extract it.
3. Verify the files with `sha256sum -c SHA256SUMS`.
4. Obtain the recovery project's Session Pooler connection string and set it in a local environment variable named `SUPABASE_RESTORE_DB_URL`.
5. Install PostgreSQL client tools and run the SQL files in order:

```bash
psql "$SUPABASE_RESTORE_DB_URL" -v ON_ERROR_STOP=1 --single-transaction -f roles.sql -f schema.sql -f data.sql
```

6. Validate migrations, RLS policies, application health, and representative school records before switching any application traffic.

## Important scope and limits

- Supabase CLI database dumps exclude Supabase-managed schemas such as `auth` and `storage`, and extension-managed schemas. They do not back up Storage object bytes. Auth users and uploaded files therefore need their own recovery plan.
- The in-app JSON platform export is a separate portable data export. It excludes credentials and active sessions and is **not** a full-platform restore file. The application currently supports a school-scoped merge restore, not a full-platform restore.
- The GitHub artifact retention is 30 days. This is an off-site recovery copy, not a replacement for a longer retention policy or Supabase's managed backups.
- Never restore over the live project without a reviewed disaster-recovery plan and an independently verified backup.
