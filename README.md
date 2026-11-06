# Supabase setup for SchoolOS

## Run the schema and migrations

Re-running the schema and migrations is intended to be safe, but take a database backup before applying changes to a live project.

1. Create a Supabase project.
2. In the project dashboard, open **SQL Editor** and click **New query**.
3. Open the repository-root file `schema.sql` (not `supabase/schema.sql`), copy its entire contents into the SQL Editor, and run it.
4. Apply every migration file present in `supabase/migrations/` in numeric order. The current branch includes migrations through `060`; do not assume the numbering is contiguous or stop at an older migration number.
5. Run `scripts/check-rls.sql` and `scripts/check-database-readiness.sql` in separate SQL Editor tabs. Every check should pass before using the corresponding feature. Migrations `052` and `053` add atomic admission approval and safe school backup restore RPCs.

Do not skip migrations or run them out of numeric order. The schema and migration files are the source of truth for a fresh database; the migration history in an existing project should match these files.

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

## Import existing data

After installing dependencies, run `npx tsx scripts/migrate-dbjson-to-supabase.ts`. The script requires the real Supabase URL and service role key in `.env`. It repairs the legacy Super Admin role and invalid 2FA records during migration.

## Verify

Run the repository checks before deployment:

```bash
npm run lint
npm test
npm run audit:rls
npm run audit:routes
npm run build
```

For local development after the required migrations and environment variables are ready, run:

```bash
npm run dev
```
