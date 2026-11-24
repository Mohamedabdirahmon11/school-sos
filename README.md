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


## Performance rules

- New list endpoints must use server-side pagination, bounded page sizes, and server-side search/filtering. Do not load an entire tenant roster to populate a dropdown; add a narrow `/options` endpoint with only the required identifier and display fields.
- Keep reads tenant-scoped (`school_id`) and role-scoped. A cache key must include the school and any role/user dimension that changes the result; never share privileged results across roles.
- GET handlers must not write session, plan, or other application rows. Throttle last-seen/session maintenance and run it asynchronously outside the response path.
- Prefer one school-scoped join/RPC with SQL aggregation over N+1 reads or loading large row sets into JavaScript. Preserve the existing endpoint response shape unless a separately versioned endpoint is added.
- Use short TTL caches for stable school-scoped reads, coalesce concurrent cache misses, and invalidate affected keys on writes. Never cache authorization denials or setup-readiness failures.
- Check a valid cached ETag before issuing database queries. A matching `If-None-Match` should return 304 without touching the database.
- Parallelize independent reads with `Promise.all`; do not parallelize dependent reads or weaken permission/readiness checks to save queries.
- Keep request query budgets and per-table duplicate-read warnings in CI. Treat a request over 500ms or more than three database queries as requiring investigation; use staging measurements before claiming latency improvements.
- Add regression tests for query counts, pagination, GET side effects, cache invalidation, 304 database-free behavior, and cross-school isolation whenever an endpoint's read path changes.

### Performance PR checklist

- [ ] List endpoints are paginated and bounded; dropdowns use narrow options endpoints.
- [ ] Reads and cache keys preserve `school_id`, role, and user boundaries.
- [ ] GET handlers are read-only; background maintenance is throttled and asynchronous.
- [ ] Query count is bounded; no N+1 or repeated same-table reads.
- [ ] Cache invalidation covers every relevant write path; 403/423 are not cached.
- [ ] Matching ETags return 304 without a database query.
- [ ] Tests cover response compatibility, tenant isolation, and authorization status codes.
- [ ] Before/after p50/p95 and query counts come from a seeded staging environment, not estimates.

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
