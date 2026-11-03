# Supabase setup for SchoolOS

## Database schema and migrations

The canonical base schema is the repository-root file `schema.sql` (there is no `supabase/schema.sql`).

1. Create a Supabase project and open **SQL Editor**.
2. Run `schema.sql` from the repository root once.
3. Apply the incremental migrations in this order:
   - `supabase/migrations/001_*.sql` through `013_*.sql`, in numeric order.
   - `014_assignment_submission_content.sql`, `015_enable_platform_rls.sql`, and `016_request_performance.sql` from the repository root, in numeric order.
   - `supabase/migrations/017_restrict_public_api_access.sql`.
   - `supabase/migrations/018_allow_kg_grade_level.sql`.
4. Check the migration history in Supabase before applying anything to an existing database. Do not re-run a migration merely because its filename is in this list; apply only migrations not already recorded.
6. Run `scripts/check-rls.sql` in SQL Editor and review its output.

The app uses a server-only Supabase service-role client. Never put the service-role key in browser code or commit it to Git.

## Configure the server

Copy `.env.example` to `.env` and fill in these values from Supabase **Project Settings → API** and your own secret manager:

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SESSION_SECRET=
SUPER_ADMIN_EMAIL=
SUPER_ADMIN_PASSWORD=
```

Do not commit `.env`, share the service-role key, or place server secrets in browser code. Startup stops with the missing variable names if required settings are absent.

## Import existing data

After installing dependencies, run `npx tsx scripts/migrate-dbjson-to-supabase.ts`. The script requires the real Supabase URL and service-role key in `.env`. It repairs the legacy Super Admin role and invalid 2FA record during import. Keep `data/db.json.bak` until the owner verifies the imported rows.

## Start SchoolOS

From the project root, run `npm install --legacy-peer-deps`, then `npm run dev`.

## Verification status

Run `npm run lint`, `npm test`, `npm run audit:routes`, `npm run audit:rls`, and `npm run audit:translations` before release. A successful local build does not replace verification against the target Supabase project.
