# SchoolOS

## Supabase schema and migrations

**Do not run the bootstrap schema or replay migrations against an existing production project.** The root-level `schema.sql` is the canonical fresh-install schema; there is no `supabase/schema.sql` file.

For a new, isolated Supabase project:

1. Create the project and keep its credentials in a private `.env` file.
2. Review the root-level `schema.sql` and the migration directory before applying database changes.
3. Use the Supabase migration history to apply migrations in the intended chronological order. Do not infer ordering from the numeric prefixes alone: this repository contains both legacy numbered migrations and timestamped migrations.
4. Review `supabase/MIGRATION_SOURCE_GAPS.md` first. Some historical production migration entries do not have their original SQL source in this repository. Never fabricate those files or replay a migration just to make the history appear complete.
5. Run `scripts/check-rls.sql` and `scripts/check-database-readiness.sql`; investigate every FAIL result. Service-role-only tables may intentionally have RLS enabled and no client policies when anon/authenticated have no table grants.

For an existing project, first compare `supabase migration list` with the repository and the live migration history. Apply only reviewed, source-backed migrations that are genuinely missing. Back up the database before any approved DDL change. Never use the full bootstrap schema as an update script for a live project.

## Configure the server

Copy `.env.example` to `.env` and fill in these values from Supabase **Project Settings → API** and your own secret manager:

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SESSION_SECRET=
SUPER_ADMIN_EMAIL=
SUPER_ADMIN_PASSWORD=
```

Do not commit `.env`, share the service role key, or place server secrets in browser code. Startup stops with the missing variable names if required settings are absent.

## Import existing legacy JSON data

Only use this one-time import utility when intentionally migrating a backed-up legacy `data/db.json` dataset. It requires `data/db.json.bak`, a private `.env`, and a deliberate operator-run command. Start with a dry run:

```bash
npx tsx scripts/migrate-dbjson-to-supabase.ts --dry-run
```

After reviewing the dry-run output and verifying the destination schema and backup, an operator may run the import without `--dry-run`. The script uses the root-level `schema.sql` to validate target columns. It upserts records; it does not replace a production database. Do not run it against live data as a routine deployment step.

## Verify

Run the repository checks before deployment:

```bash
npm ci
npm run lint
npm test
npm run audit:rls
npm run audit:routes
npm run audit:translations
npm run build
```

For local development after the required migrations and environment variables are ready:

```bash
npm run dev
```
