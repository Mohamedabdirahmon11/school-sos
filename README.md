# SchoolOS

SchoolOS is a multi-school school management web application built with React, Vite, Express, and TypeScript.

## Local setup

1. Install Node.js and npm.
2. Install dependencies with `npm install --legacy-peer-deps`.
3. Copy `.env.example` to `.env` and fill in the five required variables. Keep `.env` private and out of git.
4. Create a Supabase project. In its dashboard, open **SQL Editor**, choose **New query**, paste the complete contents of `supabase/schema.sql`, and run the query.
5. After the schema and migration script are verified, import existing JSON data by running `npx tsx scripts/migrate-dbjson-to-supabase.ts` from the project root. Do not delete the backed-up JSON files until the import succeeds and has been checked.
6. Start the web app with `npm run dev`.

The five required variable names are listed without values in `.env.example`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`, `SUPER_ADMIN_EMAIL`, and `SUPER_ADMIN_PASSWORD`. The service role key and session secret must stay server-side. `npm run dev` starts the development server; `npm start` serves the production build and requires `npm run build` first.

## Current implementation status

Check `PROGRESS.md` before deployment. Supabase-only storage, complete schema/RLS coverage, and the JSON import script are still being completed. `npm run lint`, `npm run build`, and `npm run test:security` are available; no production-readiness claim is made until the remaining items and real-Supabase verification pass.
