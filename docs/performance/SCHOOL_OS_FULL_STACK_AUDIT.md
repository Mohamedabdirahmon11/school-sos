# SchoolOS full-stack performance audit

**Audit date:** 2026-11-23  
**Repository baseline:** `main` at `8e796f7a4f129c9d8482a13617ce92e0fdb8c7e0`  
**Audit branch:** `perf/schoolos-full-audit-2026-11-23`  
**Supabase inspection:** read-only against the existing project `school management 3` (Postgres 17.11); no schema or data was changed.

## Measurement boundary

The Supabase project is active and healthy. The database and Supabase logs were inspected read-only. The available log aggregation is the latest 24-hour window. These are **Supabase PostgREST/edge origin times**, not the complete SchoolOS Express API response time. The app currently emits `[api-perf]` only in development, so historical production route p95 and route-level query counts cannot be reconstructed from the current logs. The linked GitHub connector provides source-control/CI access, not a runnable local checkout or browser session; therefore Lighthouse, React Profiler, per-page network request counts, the seeded 1,500-student API benchmark and bundle output need CI/staging execution.

## Baseline facts observed

| Area | Measured baseline | Evidence / meaning |
| --- | ---: | --- |
| Supabase schema | 99 public tables; 99 with RLS enabled | Read-only catalog query |
| RLS | 364 public policies | Read-only `pg_policies` count |
| Indexes | 505 public indexes | Read-only `pg_indexes` count |
| Connections | 9 active / 60 max | Snapshot only; not a pool saturation test |
| Query stats | `pg_stat_statements` installed in `extensions` | Statistics include admin/maintenance calls; filter before treating as app-only |
| Advisor | 55 unindexed foreign keys | Supabase Performance Advisor |
| Advisor | 106 indexes reported unused | Not dropped: low/unknown workload coverage makes destructive cleanup unsafe |
| Advisor | 6 duplicate-index groups | Definitions inspected; no live index removed |
| Advisor | 4 multiple-permissive-policy findings | RLS policy changes deferred pending semantic/security review |

### Supabase request-origin timing (latest 24-hour log window)

Values below are p50/p95/max in milliseconds, grouped by PostgREST path, method and HTTP status. They are useful DB/API-origin evidence, **not** complete browser or Express route timings.

| Path | Requests | p50 | p95 | Max |
| --- | ---: | ---: | ---: | ---: |
| `/rest/v1/academic_years` GET | 40 | 255 | 2,054 | 2,305 |
| `/rest/v1/super_admin_settings` GET | 233 | 201 | 994 | 7,884 |
| `/rest/v1/students` GET | 39 | 218 | 1,013 | 3,875 |
| `/rest/v1/user_sessions` GET | 353 | 341 | 946 | 2,555 |
| `/rest/v1/plans` GET | 95 | 446 | 953 | 2,392 |
| `/rest/v1/rpc/schoolos_notice_unread_count` POST | 92 | 538 | 989 | 2,445 |
| `/rest/v1/terms` GET | 15 | 228 | 1,268 | 1,268 |
| `/rest/v1/teacher_class_subject_assignments` GET | 8 | 208 | 1,188 | 1,188 |

The logs contain several isolated multi-second origin outliers. The p95 values show that the requested <300ms target is not currently evidenced as met. They do not prove the cause is solely SQL; network, cold starts, connection acquisition and request concurrency can contribute.

### PostgreSQL statement statistics

`extensions.pg_stat_statements` is available. The function statements visible in the snapshot include:
- `schoolos_notice_unread_count`: 2,781 calls, 15.25ms mean execution time.
- `school_dashboard_summary`: 183 calls, 43.29ms mean execution time.

The pg_stat_statements snapshot also contains Supabase management introspection, migration, backup and advisor statements. Do not rank those as SchoolOS end-user query bottlenecks. No application-only p95 can be derived from these aggregate counters.

## Source audit: verified hotspots and existing optimizations

| Location | Before measurement / source fact | Root cause | Safe direction |
| --- | --- | --- | --- |
| `src/server/api.ts:getSchoolSetupState` | 10 parallel reads plus a subsequent teacher-account read; `evaluateReadiness` first reads school + subscription separately (at least 13 DB requests before pagination expansion) | Repeated readiness evaluation has no school-level result cache; teacher-account lookup is a second phase | Add a short per-school in-flight/TTL cache and invalidate it after successful tenant mutations. Keep the same readiness calculation and 423/403 gates |
| `src/server/api.ts:/students` fee-status path | Reads all matching students and fee payments, then filters/sorts/pages in Node | Server-side pagination is bypassed when fee status is selected | Move fee-status filtering into a reviewed school-scoped DB query/RPC; preserve response shape and role restrictions |
| `src/server/storage.ts:queryPage` | Every page requests `count: 'exact'` and uses offset pagination | Exact count work is repeated for page navigation; large offsets grow with list depth | Keep compatibility headers while benchmarking a cursor/has-more path; don't silently change current response contract |
| `src/server/api.ts` request middleware | Query count and route duration are recorded only in development; no request ID/school ID in the metric | Production performance regressions cannot be attributed to route or tenant | Emit structured production request metrics, without tokens or user payloads |
| `server.ts` production static serving | `express.static(distPath)` uses default cache behavior | Hashed Vite assets do not receive explicit immutable long-cache headers | Cache only hashed `/assets/` files for one year; keep HTML revalidatable |
| `src/App.tsx` | Route-level `React.lazy` exists for Admin, Teacher, Student, Parent and heavy modules | Main route code splitting is already implemented | Preserve it; measure chunks before further splitting |
| `src/services/api.ts` and `sendDatabasePage` | List ETag/304 cache, page headers, selected columns, server-side page fetch already exist for several lists | Existing mechanism is partial: only branches/classes/subjects/teachers are cached; other paths still need profiling | Extend only where freshness and role scope are proven; keep cache keys school/user scoped |
| `src/server/storage.ts:getAttendance/recordDailyAttendance` | Attendance GET selects explicit register columns; bulk write is one upsert on the school/class/student/date conflict key | This path already avoids a read-before-write loop | Preserve and add regression/query-count coverage; do not rewrite it without a measured reason |
| `src/server/supabase.ts` | One module-level Supabase client is reused | No per-request client construction observed | Preserve singleton; measure HTTP connection behavior before pooler changes |

### Browser baseline (GitHub Actions Lighthouse, 2026-11-23)

The first committed mobile Lighthouse CI run on the app shell (three runs, production Vite preview) measured LCP values of **2,601.18 ms, 2,599.69 ms and 2,582.62 ms**; median **2,599.69 ms**, which failed the 2,500 ms budget by **99.69 ms**. This is the only browser Web Vital currently backed by a retrieved report log. The same run's TBT and CLS assertions passed (individual values need the saved report artifact to quote exactly).

Source inspection found two independent Google Fonts stylesheets requested from both `index.html` and `src/index.css`; the HTML loaded Plus Jakarta Sans + JetBrains Mono while CSS separately loaded Inter + Space Grotesk, although the body uses Inter and monospace UI uses JetBrains Mono. This duplicates font stylesheet discovery and requests unused font families. The branch now consolidates loading to one Inter + JetBrains Mono stylesheet, keeps the existing body font and weights, and removes the duplicate CSS import. The next Lighthouse run is required to establish the after value.

### Read-only EXPLAIN evidence

A read-only `EXPLAIN (ANALYZE, BUFFERS, VERBOSE)` of the currently deployed `school_dashboard_summary` RPC on one existing tenant completed in **28.996 ms**, with **2,763 shared-buffer hits** and **0 buffer reads** in the reported plan. Planning took 0.633 ms. This is one observed run, not p95 and not a measurement of the branch migration (the migration was intentionally not applied to live Supabase). The currently deployed `pg_stat_statements` snapshot reports 183 calls and 43.29 ms mean for this RPC; no app-only statement with measured mean above 50 ms was identified in the filtered snapshot, so no unrelated SQL was selected for EXPLAIN.

The live `fee_payments` index inventory was checked read-only before proposing the additive dashboard index. Existing school/date/voided indexes were left untouched; scan counters are workload-window dependent and no live index was dropped.

### Latest verified branch measurements (CI run #4231)

- GitHub Actions run: `45193980307`, head `eccf5533966952cf0ac36efc46f87935c8fc3331`; **all 11 jobs passed**, including typecheck/tests/build, dashboard SQL tenant-isolation, setup and portal migration checks, responsive screenshots and Lighthouse.
- Node test suite: **738 passed / 0 failed**. There are **21 new Node regression tests** across API observability, readiness cache, query budgets, production asset caching, font loading, storage performance and public-login session gating; all are included in the 738 passing tests.
- Bundle: initial JavaScript **412.0 KiB raw / 119.0 KiB gzip**; initial CSS **165.2 KiB raw / 27.6 KiB gzip**. Budget PASS (900/320 KiB JS raw/gzip; 250/60 KiB CSS raw/gzip). The separately emitted XLSX chunk is 484.42 KiB raw / 157.83 KiB gzip and remains lazy-loaded; it is not part of the initial entry budget.
- Latest mobile login Lighthouse LCP values: **910.37 ms, 907.18 ms, 904.75 ms**; median **907.18 ms** (PASS, budget 2,500 ms). TBT values **132.5 ms, 0 ms, 0 ms**; median **0 ms** (PASS, budget 200 ms). CLS values **0.000878, 0.000878, 0.000878**; median **0.000878** (PASS, budget 0.1).
- Lighthouse identified the LCP element as the login-card explanatory paragraph, selector `div.schoolos-login-page > div.mt-6 > div.schoolos-login-card > p.mb-4`. Root cause: `AuthProvider` set `isLoading=true` and awaited `GET /auth/me`; `AppContent` displayed a full-screen loading screen until that request returned, delaying the public login UI. The branch now paints the public login immediately while session verification continues in the background, disables submit until verification finishes, and still waits for a server-verified user before mounting protected dashboards/portals. Median LCP improved from the initial **2,599.69 ms** to **907.18 ms** (observed reduction **1,692.51 ms / 65.1%**).
- The external Inter + JetBrains stylesheet is consolidated and preloaded without blocking initial paint. Lighthouse CI is pinned to `@lhci/cli@0.16.1`; reports are retained as artifacts and CI logs now include LCP insight details.
- Read-only EXPLAIN of the currently deployed school dashboard RPC: **28.996 ms**, 2,763 shared buffer hits, 0 buffer reads. Read-only EXPLAIN of the currently deployed teacher dashboard RPC: **70.100 ms**, 2,609 shared buffer hits, 0 buffer reads. These are single observations, not p95; teacher dashboard remains a measured >50 ms follow-up target. Neither function migration was applied to live Supabase.
- One additive index is proposed in the branch migration: `idx_fee_payments_school_voided_date` on `fee_payments(school_id, voided_at, date DESC, created_at DESC)`. It is verified by the ephemeral PostgreSQL migration test; it has **not** been installed on live Supabase.

## Latest verification update (2026-11-23)

- GitHub Actions run **#4243** (run ID `45202698999`) completed successfully on commit `9b40e76b3228bf584c2045bdcca9e70c77321739`.
- All **11/11 jobs passed**, including typecheck/tests/build, Lighthouse login Web Vitals, Student and Parent responsive screenshots, parent relationship migration integration, dashboard SQL performance and tenant isolation, Student/Parent PIN PostgreSQL migration tests, School Setup migration integration, Setup Wizard screenshots, portal login/child-switcher screenshots, and Teacher Portal screenshots.
- The run retained build, screenshot, bundle-report and Lighthouse-report artifacts. This confirms CI coverage only; it does not substitute for seeded production-like API p95 or real-device network measurements listed below.

## Database safety findings

- All 99 public tables observed had RLS enabled.
- No production migration, policy, index, row or account was changed.
- Six identical index groups were identified by the Performance Advisor and their index definitions were inspected. No index was dropped: some participate in composite foreign keys and the project has recent schema activity.
- The advisor's 106 unused-index notices are not sufficient grounds for deletion; several indexes are new or have low sample coverage.
- Four multiple-permissive-policy warnings need policy-by-policy review. Do not replace policies with a generic `auth.uid()` rule or alter Form Teacher/subject-teacher/parent/student access.

## Not yet measured (must remain explicit)

- Full Express API p50/p95 by route, status, request ID, school ID and DB query count.
- Endpoint-by-endpoint login/me, students, teachers, classes, attendance GET/POST/bulk, marks, homework, notices, messages, timetable, role dashboards, readiness and Setup Wizard timings.
- `EXPLAIN (ANALYZE, BUFFERS)` for actual application statements over 50ms. The available statement snapshot is dominated by admin/migration diagnostics; do not EXPLAIN those as app hot paths.
- Frontend initial/route chunk KB, gzip/Brotli bytes, LCP/TBT/CLS, requests per page, React render counts, and 360px Slow-4G.
- Seeded school load test (40 classes, 1,500 students, 80 teachers, 60 days attendance) and endpoint p95/query-count budgets.
- Post-change timings and bundle-size deltas.

## Verification policy

No before/after number will be invented. CI must report the actual bundle artifact sizes and test results. Staging must provide the seeded tenant and authenticated role fixtures for end-to-end route timing, RLS isolation and Lighthouse. The PR stays Draft until the required CI and measurements pass. Live Supabase migrations are intentionally not applied; apply only reviewed additive migrations to staging first.
