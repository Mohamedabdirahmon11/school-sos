# Supabase setup for SchoolOS

## Run the schema and migrations

Re-running the schema and migrations is intended to be safe, but take a database backup before applying changes to a live project.

1. Create a Supabase project.
2. In the project dashboard, open **SQL Editor** and click **New query**.
3. Open the repository-root file `schema.sql` (not `supabase/schema.sql`), copy its entire contents into the SQL Editor, and run it.
4. Apply the migration files in numeric order. The files are split across two locations:
   - `supabase/migrations/001_*.sql` through `supabase/migrations/013_*.sql`
   - Repository-root `014_*.sql`, `015_*.sql`, and `016_*.sql`
   - `supabase/migrations/017_*.sql`, `018_*.sql`, and `019_*.sql`
5. Run `scripts/check-rls.sql` in a new SQL Editor tab and review the results before opening the application.

Do not skip migrations or run them out of numeric order. The root-level migrations 014–016 are part of the setup even though they are not inside `supabase/migrations/`.

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
```
