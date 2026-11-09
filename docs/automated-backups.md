# Automated Supabase backups and restore

The SchoolOS Supabase project is on the Free organization tier, which does not include Supabase's managed daily database backups. This workflow creates an off-site logical database export in a **private Amazon S3 bucket**.

The workflow reads `super_admin_settings.backup_schedule`:

- `daily`: every day at 02:00 UTC
- `weekly`: Monday at 02:00 UTC
- `manual`: scheduled runs are skipped; a Super Admin can run the workflow manually with `force=true`

## One-time setup

1. Create a **private** S3 bucket. Keep S3 Block Public Access enabled, enable default SSE-S3 encryption, and add a lifecycle rule to expire objects after your chosen retention period (30 days is the initial recommendation).
2. Create a dedicated IAM user/access key with only `s3:PutObject` permission to the `schoolos/*` prefix in that bucket. Do not use an administrator/root AWS key.
3. In the GitHub repository, open **Settings → Secrets and variables → Actions** and add these repository secrets:
   - `SUPABASE_DB_URL`: Supabase **Session Pooler** connection string (GitHub-hosted runners use IPv4; the direct database hostname may require an IPv4 add-on).
   - `BACKUP_S3_ACCESS_KEY_ID`
   - `BACKUP_S3_SECRET_ACCESS_KEY`
   - `BACKUP_S3_REGION`
   - `BACKUP_S3_BUCKET`
4. Optionally add the Actions variable `BACKUP_S3_PREFIX`; it defaults to `schoolos`.
5. Run **Actions → Supabase Database Backup → Run workflow** once with `force=true`. Confirm the object appears in the private S3 bucket and verify its checksum after download.

The database dump uses the documented Supabase CLI `--db-url` option, is sent over TLS, and is uploaded with SSE-S3 encryption. The workflow does not store database exports in Git, GitHub releases, or GitHub Actions artifacts. This matters because the SchoolOS source repository is currently public. Keep the S3 bucket private and do not add public-read ACLs or public bucket policies.

## Restore procedure

Restore only into a **new/empty recovery project**, never over the live production database:

1. Create a separate Supabase recovery project.
2. Download the desired `schoolos-db-backup-*.tar.gz` object from the private S3 bucket and extract it.
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
- The S3 lifecycle rule controls retention. Verify it in AWS; the workflow does not delete older backups itself.
- Never restore over the live project without a reviewed disaster-recovery plan and an independently verified backup.
