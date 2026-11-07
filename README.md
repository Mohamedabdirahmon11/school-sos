# Supabase setup for SchoolOS

## Run the schema and migrations

Re-running the schema and migrations is intended to be safe, but take a database backup before applying changes to a live project.

1. Create a Supabase project.
2. In the project dashboard, open **SQL Editor** and click **New query**.
3. Open the repository-root file `schema.sql` (not `supabase/schema.sql`), copy its entire contents into the SQL Editor, and run it.
4. Apply every migration file present in `supabase/migrations/` in numeric order. The current branch includes migrations through `053`; do not assume the numbering is contiguous or stop at an older migration number.
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


## Configure password-reset email (Resend)

The forgot-password endpoint sends reset codes through Resend. A successful HTTP response from `/auth/forgot-password` is intentionally neutral and does not prove that an email was delivered. If the server prints `[password-reset-development] code=...`, it is running without email delivery configuration and is showing a development-only code in the server terminal.

1. Create a Resend account and add a sending domain you control.
2. In Resend, publish the DNS records it provides and wait until the domain is verified. For real users, use an address on your verified domain rather than the Resend onboarding sender.
3. Create a Resend API key with permission to send email.
4. In the project root, copy `.env.example` to `.env` (if you have not already) and set these two server-only values:

   ```env
   MAIL_PROVIDER_API_KEY=re_your_actual_key
   MAIL_FROM=SchoolOS <no-reply@your-verified-domain.com>
   ```

   Replace both example values with your real Resend key and a sender address on the verified domain. The recipient's Gmail address is entered in the Forgot Password form; it does not belong in `MAIL_FROM`.
5. Save `.env`, stop the local server with `Ctrl+C`, then restart it with `npm run dev`. The server loads `.env` at startup.
6. Request a reset for an account email that exists in the SchoolOS database. Check the recipient inbox, Spam/Junk, and the Resend Emails/Logs page. Provider rejections are logged with a redacted diagnostic; the reset code and full recipient address are not included in that failure message.

Keep `.env` out of Git. Never paste the Resend API key into chat, source files, screenshots, or commits. For a hosted deployment, add the same two values in the hosting platform's server environment settings and redeploy/restart the server. Do not expose either value through Vite/client-side variables.

If either `MAIL_PROVIDER_API_KEY` or `MAIL_FROM` is empty, local development intentionally falls back to printing a one-time code in the server terminal instead of sending email. In production, no reset code is issued when mail delivery is not configured.

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
