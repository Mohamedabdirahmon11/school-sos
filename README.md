# Supabase setup for SchoolOS

## Run the schema

Re-running schema.sql is safe.

1. Create a Supabase project.
2. In the project dashboard, open **SQL Editor** and click **New query**.
3. Open `schema.sql` in the repository root, copy the entire file into the query editor, and click **Run**.
4. Apply the SQL migrations after the schema in this order: `supabase/migrations/001` through `013` (numeric order), then the root-level `014_assignment_submission_content.sql`, `015_enable_platform_rls.sql`, and `016_request_performance.sql`, then `supabase/migrations/017_restrict_public_api_access.sql` and `018_allow_kg_grade_level.sql`, then `019_index_uncovered_foreign_keys.sql` and `020_dashboard_metrics_timezone_and_voids.sql`. Do not skip the root-level migration files.
5. Review the result and run the RLS verification query in `scripts/check-rls.sql` in a new SQL Editor tab.

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

The schema and migrations are evolving. Before deploying, compare the applied migration history in your Supabase project with the SQL files in this repository, then run the verification scripts. See `PROGRESS.md` for remaining work.
