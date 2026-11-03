# Supabase setup for SchoolOS

## Run the schema

Re-running schema.sql is safe.

1. Create a Supabase project.
2. In the project dashboard, open **SQL Editor** and click **New query**.
3. Open the repository-root `schema.sql`, copy the entire file into the query editor, and click **Run**.
4. Run `supabase/migrations/001_*.sql` through `013_*.sql` in numeric order.
5. Run the root-level migration files `014_assignment_submission_content.sql`, `015_enable_platform_rls.sql`, and `016_request_performance.sql` in that order.
6. Run `supabase/migrations/017_restrict_public_api_access.sql`, then `supabase/migrations/018_allow_kg_grade_level.sql`.
7. Review the result and run the RLS verification query in `scripts/check-rls.sql` in a new SQL Editor tab.

The SQL files are split between the repository root and `supabase/migrations/`; follow the numbered order above rather than running only the files in one folder.

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

After installing dependencies, run `npx tsx scripts/migrate-dbjson-to-supabase.ts`. The script requires the real Supabase URL and service role key in `.env`. It repairs the legacy Super Admin role and invalid 2FA record during import. Keep `data/db.json.bak` until the owner verifies the imported rows.

## Start SchoolOS

From the project root, run `npm install --legacy-peer-deps`, then `npm run dev`.

## Verification status

The committed schema is still under development. The application has not been verified against a real Supabase project. See `PROGRESS.md` for the precise status and remaining work.
