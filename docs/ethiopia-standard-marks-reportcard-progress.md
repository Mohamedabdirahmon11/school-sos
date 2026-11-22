# Ethiopia Standard Curriculum and Results Work — Progress

Branch: `ethiopia-standard-marks-reportcard`
Base: `main` at `591caf1f973bab32e10c5d11e2bd39d18784b755`

## Safe scope and known concurrent work

The following open pull requests overlap with the requested work and are intentionally not edited by this branch:

- PR #242 (`step-10a-term-marks`): `ExamsResultsView.tsx`, `api.ts`, term marks models, report-card portals and migration.
- PR #220 (`feature/exam-system`): `ExamsResultsView.tsx`, `ReportCardsView.tsx`, `TeacherPortalView.tsx`, `api.ts`, `storage.ts`, calculations, translations and tests.
- PR #284 (`design-assignment-timetable-marks`): academic global styles and exam schedule test coverage.

PR #242 and #220 both touch the same exam/reporting server and UI files and have stale, non-mergeable base SHAs. They must be reconciled before safe integration. PR #284 is presentation-only and also reports two failing baseline tests. This branch does not merge, rewrite, or cherry-pick any of those PRs.

## Implemented on this branch

- PARTIAL: Replaced the default Grade 1–4, 5–6 and 7–8 subject lists with the requested Ethiopia Primary starter templates in `src/server/subject-validation.ts`.
- PARTIAL: Added optional school-specific subjects (Arabic and Islamic Studies/Quraan) as opt-in values, not mandatory defaults.
- PARTIAL: Kept Conduct out of the subject catalog.
- PARTIAL: Added isolated unit coverage in `tests/ethiopia-curriculum.test.ts`.
- Existing server code already stores editable grade-band templates in each school's `setupData.subjectTemplates`, applies them when a class is created, and backfills only missing class-subject links. The relevant server file is not modified here because it is part of PR #220.

## 20 requested work items

| # | Area | Status | Notes |
|---:|---|---|---|
| 1 | Ethiopia primary subject templates | PARTIAL | Defaults changed and tests added. Confirm the list with the Federal Ministry of Education and Somali Regional Education Bureau before production adoption. |
| 2 | Semester 100-point scheme and score limits | BLOCKED | Existing scheme/version work is in PR #242/#220; do not edit their overlapping API/storage files. |
| 3 | Annual subject averages | BLOCKED | Requires integration with the in-flight term marks model. |
| 4 | Semester and annual totals | BLOCKED | Requires one canonical calculation path in the in-flight marks implementation. |
| 5 | Averages excluding empty subjects | BLOCKED | Same calculation-path dependency. |
| 6 | Conduct inclusion setting | BLOCKED | Requires coordinated model, API, calculation and report-card changes. |
| 7 | Semester absences | PARTIAL | Existing attendance data exists; semester-specific aggregation and report-card wiring need integration. |
| 8 | Tie-aware class ranks | PARTIAL | Existing competition-ranking helper exists; annual/semester canonical calculation integration is pending. |
| 9 | Promotion decision and override audit | PARTIAL | Existing year-end promotion history exists; configurable pass rule and override audit need integration. |
| 10 | Configurable grading bands | PARTIAL | School grading scale validation already enforces descending bands ending at 0%; confirm report-card/result consumers use the same scale. |
| 11 | One server-side calculation function | BLOCKED | PR #242/#220 contain overlapping calculations and server/API files. |
| 12 | Teacher scope and semester lock | PARTIAL | Existing assignment and lock foundations exist; verify against the reconciled term marks workflow. |
| 13 | Compact mark-entry UI and keyboard flow | BLOCKED | Mark-entry UI is part of the open design/logic PRs. |
| 14 | Bilingual Ethiopian/Somali report-card layout | BLOCKED | Report-card UI/server PDF files overlap PR #220 and #242. |
| 15 | Two-semester completion and approval/publish gate | PARTIAL | Existing publication gate exists; annual card gating is in PR #242/#220. |
| 16 | Filter-matched CSV/PDF exports and school branding | PARTIAL | Existing CSV/PDF and school branding foundations exist; parity with current filters needs verification. |
| 17 | School profile defaults and student portal | PARTIAL | Existing school settings support much of the profile; verify default values and missing city/address/telephone fields. |
| 18 | Academic year, calendar, grading and attendance settings | PARTIAL | Existing settings and date-overlap validation cover most of this. |
| 19 | Assessment components, final 50/60, locks and conduct | PARTIAL | Existing exam configuration supports components, final 50/60, pass mark and semester locks; conduct toggle remains missing. |
| 20 | ETB defaults and remove USD assumptions | PARTIAL | School currency already supports ETB; subscription pricing/FX assumptions require a separate audit. |

## Verification

- Repository clone/build could not run in this environment because outbound DNS/network access to github.com is unavailable.
- No local `npm run build`, TypeScript, or test command is claimed as passed.
- CI will be checked after the pull request is opened.
- No Supabase project credentials or authorized database connection were available; any new database migration must be marked MIGRATION PENDING until applied and verified.
- No production rows or schema were modified.

## Assumptions and open questions

- "Standard" is treated as the editable Ethiopia Primary template for grades 1–8; KG and grades 9–12 are not given invented subjects.
- Arabic and Islamic Studies/Quraan are optional school additions, not automatic compulsory subjects.
- Conduct is a separate report-card item, never a normal subject.
- The subject list is a proposed template only and requires official curriculum confirmation from the Federal Ministry of Education and Somali Regional Education Bureau.
