# Ethiopia Standard Curriculum and Results Work — Progress

Branch: `ethiopia-standard-marks-reportcard`
Base: `main` at `cefa7a1b57c4d78e0ccff86de69514d20993ef2a` (latest main incorporated)

## Safe scope and known concurrent work

The following open pull requests overlap with the requested work and are intentionally not edited by this branch:

- PR #242 (`step-10a-term-marks`): `ExamsResultsView.tsx`, `api.ts`, term marks models, report-card portals and migration.
- PR #220 (`feature/exam-system`): `ExamsResultsView.tsx`, `ReportCardsView.tsx`, `TeacherPortalView.tsx`, `api.ts`, `storage.ts`, calculations, translations and tests.
- PR #284 (`design-assignment-timetable-marks`) was merged into main during this work; its latest main commit was incorporated without editing its files.

PR #242 and #220 both touch the same critical exam/reporting server and UI files. They are the explicit integration blocker: do not overwrite, cherry-pick, or merge their in-flight implementation files until those two PRs are reconciled.

## Implemented on this branch

- DONE: Replaced default Grade 1–4, 5–6 and 7–8 subject lists with the requested Ethiopia Primary starter templates in `src/server/subject-validation.ts`.
- DONE: Arabic and Islamic Studies/Quraan are exposed as optional additions; Conduct is excluded from the subject catalogue.
- DONE: Preserved the legacy manual generic-default subject list unchanged.
- DONE: Added tests for all grade bands and updated the non-conflicting subject-validation tests.
- Existing server code already persists editable grade-band templates in each school's `setupData.subjectTemplates`, applies them when a class is created, and backfills only missing class-subject links. The server API file was not edited because it is part of PR #220.
- DONE: School profile UI now persists official telephone and email in addition to the other school profile fields. The backend sanitizer already validates both.
- DONE: Existing school settings provide academic year, current semester, all four semester dates, grading scale, KG–12 class levels and attendance rules. Date ordering/overlap and grade-band constraints are validated in the existing settings code.
- DONE: Existing grade scale defaults to A≥90, B≥80, C≥70, D≥60, F≥0; school-specific scale is validated and used by report-card rendering.
- DONE: Existing school/platform currency defaults to ETB; the money formatter falls back to ETB and does not apply an ETB/USD exchange conversion. USD remains an explicitly selectable alternate currency, not the default.
- DONE (database schema only): Added `schools.include_conduct_in_average BOOLEAN NOT NULL DEFAULT FALSE` in `supabase/migrations/20261122130000_ethiopia_conduct_average_setting.sql`. Applied to active Supabase project `school management 3` (`rhpazlnjqsmzngxatnwd`) and verified all 3 existing schools default false; RLS remains enabled. The app UI/API/calculation use is blocked by the overlapping exam/report-card implementation.

## 20 requested work items

| # | Area | Status | Notes |
|---:|---|---|---|
| 1 | Ethiopia primary subject templates | DONE | Grade-band defaults, per-school customization foundation, automatic class-creation application and tests are present. The proposed list still needs official curriculum confirmation before production adoption. |
| 2 | Semester 100-point scheme and score limits | BLOCKED | Settings support components and final 50/60, but the full per-student bounds enforcement must be reconciled with PR #242/#220 mark-entry APIs. |
| 3 | Annual subject averages | BLOCKED | Requires integration with the in-flight term marks model. |
| 4 | Semester and annual totals | BLOCKED | Requires one canonical calculation path in the in-flight marks implementation. |
| 5 | Averages excluding empty subjects | BLOCKED | Same calculation-path dependency. |
| 6 | Conduct inclusion setting | BLOCKED | DB column applied and default OFF; app UI/API/calculation/report-card wiring is in the conflicting PR #242/#220 files. |
| 7 | Semester absences | BLOCKED | Attendance source exists; semester-specific aggregation and report-card wiring are not completed. |
| 8 | Tie-aware class ranks | BLOCKED | A tie-aware helper exists, but semester and annual ranking integration against the canonical average is pending. |
| 9 | Promotion decision and override audit | BLOCKED | Existing year-end promotion history exists; configurable annual pass decision and auditable manual override are not fully integrated. |
| 10 | Configurable grading bands | DONE | Default A/B/C/D/F scale, descending/0% validation, school-level settings and report-card scale consumption already exist. |
| 11 | One server-side calculation function | BLOCKED | PR #242/#220 contain overlapping calculations and server/API files; no parallel calculation source was added. |
| 12 | Teacher scope and semester lock | BLOCKED | Existing assignment/lock foundations exist; final enforcement must be verified and integrated in the reconciled mark-entry workflow. |
| 13 | Compact mark-entry UI and keyboard flow | BLOCKED | Mark-entry UI is part of the open design/logic PRs. |
| 14 | Bilingual Ethiopian/Somali report-card layout | BLOCKED | Report-card UI/server PDF files overlap PR #220 and #242. |
| 15 | Two-semester completion and approval/publish gate | BLOCKED | Existing publication foundation exists; annual card gating and end-to-end approval flow remain in the overlapping implementation. |
| 16 | Filter-matched CSV/PDF exports and school branding | BLOCKED | Existing exports and branding exist; filter parity for the new report-card data is not verified. |
| 17 | School profile defaults and student portal | DONE | School code/name/Arabic name, brand/logo, city/address, telephone/email/WhatsApp, currency/language/timezone, class capacity and student portal toggle exist; missing telephone/email persistence was fixed here. Live defaults include ETB, Africa/Addis_Ababa, capacity 40 and portal OFF. |
| 18 | Academic year, calendar, grading and attendance settings | DONE | Academic year/current semester, four term dates, KG–12, grading scale and attendance rules exist with validation. |
| 19 | Assessment components, final 50/60, locks and conduct | BLOCKED | Existing component editor, 100-point total validation, final 50/60, pass mark and semester locks exist; Conduct inclusion is not yet wired into app behavior. |
| 20 | ETB defaults and remove USD assumptions | DONE | School and platform defaults are ETB, the formatter has no fixed 160 ETB/USD conversion, and USD is optional rather than default. Existing plan prices were not rewritten. |

## Verification

- GitHub Actions run `44992824510` passed TypeScript, all tests, route parity, navigation audit, RLS source audit and production build for the curriculum + Conduct migration changes.
- GitHub Actions run `44992966254` failed one newly added profile-payload assertion because the first automated edit did not match CRLF line endings. The file was re-edited with a line-ending-safe replacement; the current source includes both `phone` and `email` in the save payload.
- A new CI run for the corrected profile payload is required before merge; no pass is claimed for that later commit until its run completes.
- Local clone/build unavailable because outbound DNS/network access to github.com failed; no local npm command is claimed as passed.
- Supabase migration `ethiopia_conduct_average_setting` applied successfully. SQL verification confirmed the column is NOT NULL, DEFAULT false, RLS remains enabled, and all 3 existing schools are false.
- No existing school records, marks, or class-subject rows were rewritten by this branch.

## Assumptions and open questions

- "Standard" is treated as the editable Ethiopia Primary template for grades 1–8; KG and grades 9–12 are not given invented subjects.
- Arabic and Islamic Studies/Quraan are optional school additions, not automatic compulsory subjects.
- Conduct is a separate report-card item, never a normal subject.
- The subject list is a proposed template only and requires official curriculum confirmation from the Federal Ministry of Education and Somali Regional Education Bureau.
- The remaining 15 BLOCKED items must be resumed after PR #242 and PR #220 are reconciled; this branch deliberately does not overwrite those files.


---

## Updated main-branch audit — 2026-11-21

The original status table above is a historical checkpoint from PR #285 and is superseded by this audit. The current `main` head inspected for this update is `9c981d4d42fa0f630006887679fff1c5b871901c`.

PR #220 (`feature/exam-system`) and PR #242 (`step-10a-term-marks`) are still open and both are substantially divergent from current `main` (respectively 102/88 and 64/42 commits ahead/behind in GitHub compare). Their branch-only files are not assumed to be deployed. The current `main` source already contains a separate school-configured assessment/marks/report-card workflow. Do not merge either stale branch wholesale: reconcile behavior against current `main` first.

### Exact location and verification map

| # | Item | Current location on `main` | Status on `main` | How to test |
|---:|---|---|---|---|
| 1 | Ethiopia primary subject templates | `src/server/subject-validation.ts`; class creation consumes school setup templates | DONE | `npx tsx --test tests/subject-validation.test.ts`; then create Grade 3, 5 and 7 classes and confirm the matching starter lists; edit one school's template and confirm another school is unchanged. |
| 2 | 100-point assessment scheme and score limits | `src/components/schooladmin/ExamsResultsView.tsx`; `src/server/storage.ts` (`getExamConfig`, `updateExamConfig`, `saveStudentMarks`); `src/types/index.ts` | DONE | `npm run test:academics`; try a 100-point scheme, a non-100 total, an out-of-range score, and an invalid pass mark. |
| 3 | Annual subject averages | `src/server/storage.ts` (`getClassYearlyRankings`) | DONE | `npm run test:academics`; approve both semester marks for one subject and verify annual subject percentage equals the two-semester mean; approve only one semester and verify annual subject percentage remains null. |
| 4 | Semester and annual totals | `src/server/storage.ts` (`getClassSemesterRankings`, `getClassYearlyRankings`); `src/lib/exam-results.ts` | DONE | `npm run test:academics`; use known marks and compare semester totals/averages and the annual mean against hand calculations. |
| 5 | Exclude empty subjects from averages | `src/server/storage.ts` (`getClassSemesterRankings`, `getClassYearlyRankings`) | PARTIAL / strict completion gate | `npm run test:academics`; test a class with an unmarked active subject. Current annual result is withheld until every assigned subject has approved marks in both semesters; it does not publish a partial annual average. Confirm whether this strict behavior matches the intended rule before changing it. |
| 6 | Conduct inclusion setting | Migration `supabase/migrations/20261122130000_ethiopia_conduct_average_setting.sql` adds `schools.include_conduct_in_average` | PARTIAL — database only | Verify column/default with Supabase SQL: `select include_conduct_in_average from public.schools;`. App settings, API/type mapping and report-card calculations still need wiring and a regression test. |
| 7 | Semester-specific absences | `src/server/storage.ts` (`getClassYearlyRankings` attendance summary); `src/components/schooladmin/ReportCardsView.tsx` | PARTIAL — annual summary only | `npm run test:report-cards`; verify annual attendance counts. A separate Semester 1/Semester 2 attendance summary test and implementation are still required; do not treat annual attendance as semester-specific. |
| 8 | Tie-aware class ranks | `src/lib/exam-results.ts` (`assignSemesterRanks`); `src/server/storage.ts` yearly rank assignment | DONE in calculation path | `npm run test:academics`; add/verify equal averages (e.g. 90, 90, 80) produce ranks 1, 1, 3; incomplete students must remain unranked. |
| 9 | Promotion decision and override audit | `src/server/storage.ts` (`confirmYearEndPromotions`, `getPromotionHistory`); promotion/history/audit tables | DONE in storage path | `npm run test:academics`; verify incomplete-year promotion is rejected, invalid target capacity is rejected, and override without a reason is rejected; valid override must appear in promotion history and audit logs. |
| 10 | Configurable grading bands | `src/components/schooladmin/SchoolSettingsView.tsx`; `src/server/school-settings.ts`; `src/lib/grading.ts` | DONE | `npm run lint`; in School Settings save A/B/C/D/F thresholds, try duplicate labels, wrong ordering and a last band not starting at 0; confirm validation rejects invalid values and report cards use saved labels. |
| 11 | One canonical server-side calculation function | `src/server/storage.ts` currently owns semester/year calculations; `src/lib/exam-results.ts` owns rank/maximum helpers | PARTIAL — shared server source, not one unified pure calculator | `npm run test:academics`; compare API results with the PDF/report-card output for the same fixture. A single reusable calculation contract and parity test are still needed before marking fully complete. |
| 12 | Teacher scope and semester lock | `src/server/api.ts` teacher assignment checks; `src/server/storage.ts` (`saveStudentMarks` lock check); `src/components/schooladmin/SchoolSettingsView.tsx` lock controls | DONE in source safeguards; end-to-end role test recommended | `npx tsx --test tests/teacher-workflow.test.ts` and `npm run test:academics`; assigned teacher can submit only assigned subject, unassigned teacher gets 403, locked semester rejects writes, unlocked semester accepts them. |
| 13 | Compact mark-entry UI and keyboard flow | `src/components/teacher/TeacherPortalView.tsx` | PARTIAL — assessment grid and Enter-to-next-row exist; full requested keyboard/autosave UX not verified | `npx tsx --test tests/teacher-workflow.test.ts`; manually log in as a Subject Teacher, enter marks across rows with Enter, validate max-score errors, submit and confirm Form Teacher review. |
| 14 | Bilingual Ethiopian/Somali report-card layout | `src/components/schooladmin/ReportCardsView.tsx`; `src/server/report-card.ts`; translations in `src/lib/translations.ts` | PARTIAL — branded PDF/layout exists; full bilingual Ethiopian/Somali report-card parity not verified | `npm run test:report-cards`; preview and export the same student report in Somali and English, check all labels, remarks, attendance, school logo, signature and stamp. |
| 15 | Two-semester completion and approval/publish gate | `src/server/storage.ts` marks approval/publication; `src/server/api.ts` report-card PDF routes; `src/components/schooladmin/ReportCardsView.tsx` | DONE in core workflow | `npm run test:academics` and `npm run test:report-cards`; one approved semester must not produce a yearly card; both semesters must be complete and published before Parent/Student PDF access. |
| 16 | Filter-matched CSV/PDF exports and branding | `src/components/schooladmin/ExamsResultsView.tsx`; `src/lib/results-csv.ts`; `src/components/schooladmin/ReportCardsView.tsx`; `src/server/report-card.ts` | PARTIAL — CSV and branded PDF exist; identical filter parity not verified | `npm run test:report-cards`; filter a class/semester, export CSV and PDF, compare student IDs/order/counts and confirm branding. Add an explicit parity regression test before marking DONE. |
| 17 | School profile defaults and student portal | `src/components/schooladmin/SchoolSettingsView.tsx`; `src/server/school-settings.ts`; `src/types/index.ts` | DONE | `npm run lint`; update school name, phone, email, address and portal toggle; save, reload, and confirm persisted values. Test two schools to confirm tenant isolation. |
| 18 | Academic year, calendar, grading and attendance settings | `src/components/schooladmin/SchoolSettingsView.tsx`; `src/server/school-settings.ts` | DONE | `npm run lint`; save valid semester dates and KG–12 levels; attempt reversed/overlapping dates and invalid grade bands; verify validation. |
| 19 | Assessment components, final 50/60, locks and Conduct | `src/components/schooladmin/ExamsResultsView.tsx`; `src/server/storage.ts`; `src/server/school-settings.ts`; Conduct migration above | PARTIAL — components, 100-point validation and lock exist; Conduct is DB-only | `npm run test:academics`; test a valid 50/50 and 40/60 split, invalid totals, locked writes and immutable saved scheme snapshots. Conduct remains untestable in UI until #6 is wired. |
| 20 | ETB defaults and remove fixed USD assumptions | `src/components/schooladmin/SchoolSettingsView.tsx`; `src/server/school-settings.ts`; currency defaults/formatters | DONE for defaults and conversion behavior | `npm run lint`; create a new school without selecting currency and confirm ETB; verify USD is opt-in and no fixed 160 ETB/USD conversion is applied to stored ETB values. |

### Commands to run from the repository root

```bash
npm run lint
npm run test:academics
npm run test:report-cards
npx tsx --test tests/subject-validation.test.ts
npx tsx --test tests/teacher-workflow.test.ts
npm test
npm run audit:routes
npm run audit:rls
npm run build
```

### Current verification limits

- The source paths and test cases above were inspected on current `main`; the commands are the reproducible test instructions, not a claim that they were executed in this audit.
- The previously recorded green CI run validates the PR #285 merge at that point in history. The current main head listed above has no workflow run returned by the commit-workflow lookup, so a fresh full CI result is still required.
- PR #220 and #242 each have substantial divergent commits and duplicate overlapping exam/report-card responsibilities. Their branch-only files (including `src/lib/exam-calculations.ts`, `src/lib/term-marks.ts`, `TermMarksWorkspace.tsx`, and `TermMarksTeacherWorkspace.tsx`) are not current-main locations until explicitly reconciled and merged.
