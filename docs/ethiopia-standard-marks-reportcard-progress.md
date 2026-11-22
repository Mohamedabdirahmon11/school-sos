# Ethiopia Standard Curriculum and Results Work — Progress

Branch: `ethiopia-standard-marks-reportcard`
Base: `main` at `cefa7a1b57c4d78e0ccff86de69514d20993ef2a` (branch includes this latest main commit)

## Safe scope and known concurrent work

The following open pull requests overlap with the requested work and are intentionally not edited by this branch:

- PR #242 (`step-10a-term-marks`): `ExamsResultsView.tsx`, `api.ts`, term marks models, report-card portals and migration.
- PR #220 (`feature/exam-system`): `ExamsResultsView.tsx`, `ReportCardsView.tsx`, `TeacherPortalView.tsx`, `api.ts`, `storage.ts`, calculations, translations and tests.
- PR #284 (`design-assignment-timetable-marks`): academic design tokens/styles and exam schedule test changes. Its latest main commit was incorporated without editing its files.

PR #242 and #220 both touch the same critical exam/reporting server and UI files and have stale, non-mergeable base SHAs. They must be reconciled before safe integration. This branch does not overwrite, cherry-pick, or merge their in-flight implementation files.

## Implemented on this branch

- PARTIAL: Replaced the default Grade 1–4, 5–6 and 7–8 subject lists with the requested Ethiopia Primary starter templates in `src/server/subject-validation.ts`.
- PARTIAL: Exposes Arabic and Islamic Studies/Quraan as optional additions; Conduct is explicitly excluded from the subject catalogue.
- PARTIAL: Preserved the legacy generic "add default subjects" list unchanged to avoid changing that existing manual workflow.
- PARTIAL: Added focused tests in `tests/ethiopia-curriculum.test.ts` and updated the non-conflicting subject validation test to assert the new template.
- Existing server code already stores editable grade-band templates in each school's `setupData.subjectTemplates`, applies them when a class is created, and backfills only missing class-subject links. The server API file is not modified here because it is part of PR #220.
- DONE (database schema): Added `schools.include_conduct_in_average BOOLEAN NOT NULL DEFAULT FALSE` in `supabase/migrations/20261122130000_ethiopia_conduct_average_setting.sql`. Applied it to Supabase project `school management 3` (`rhpazlnjqsmzngxatnwd`) and verified all 3 existing schools have the safe default `false`; schools RLS remains enabled. UI/API/calculation consumption is still blocked by the overlapping exam/report-card work.

## 20 requested work items

| # | Area | Status | Notes |
|---:|---|---|---|
| 1 | Ethiopia primary subject templates | PARTIAL | Defaults changed and tests added. Confirm the list with the Federal Ministry of Education and Somali Regional Education Bureau before production adoption. |
| 2 | Semester 100-point scheme and score limits | BLOCKED | Existing scheme/version work is in PR #242/#220; do not edit their overlapping API/storage files. |
| 3 | Annual subject averages | BLOCKED | Requires integration with the in-flight term marks model. |
| 4 | Semester and annual totals | BLOCKED | Requires one canonical calculation path in the in-flight marks implementation. |
| 5 | Averages excluding empty subjects | BLOCKED | Same calculation-path dependency. |
| 6 | Conduct inclusion setting | PARTIAL | Additive school-level DB setting is applied and defaults OFF. UI/API/calculation/report-card wiring is blocked by PR #242/#220 file overlap. |
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
| 17 | School profile defaults and student portal | PARTIAL | Existing school settings and live DB defaults cover much of the profile; verify missing field and UI defaults. |
| 18 | Academic year, calendar, grading and attendance settings | PARTIAL | Existing settings and date-overlap validation cover most of this. |
| 19 | Assessment components, final 50/60, locks and conduct | PARTIAL | Existing exam configuration supports components, final 50/60, pass mark and semester locks; Conduct schema setting is now present but not wired into app logic. |
| 20 | ETB defaults and remove USD assumptions | PARTIAL | Live school currency defaults are ETB; subscription pricing/FX assumptions require a separate audit. |

## Verification

- GitHub Actions run `44992612610`: TypeScript passed; tests failed 2 existing subject-template assertions because the defaults changed. The generic default list was restored unchanged and the subject-template test was updated to the new requested curriculum. This failed run is not claimed as passing.
- A follow-up CI run was triggered after the fixes; see PR #285 for its live status. The latest branch update after this run also includes the Conduct migration and must pass CI before merge.
- Local clone/build unavailable because outbound DNS/network access to github.com failed; no local npm command is claimed as passed.
- Supabase migration `ethiopia_conduct_average_setting` was applied successfully to the active project. A follow-up SQL query confirmed the column is NOT NULL, DEFAULT false, RLS remains enabled, and all 3 existing schools are false.
- No existing school data or marks were rewritten; no class-subject rows were backfilled by this branch.

## Assumptions and open questions

- "Standard" is treated as the editable Ethiopia Primary template for grades 1–8; KG and grades 9–12 are not given invented subjects.
- Arabic and Islamic Studies/Quraan are optional school additions, not automatic compulsory subjects.
- Conduct is a separate report-card item, never a normal subject.
- The subject list is a proposed template only and requires official curriculum confirmation from the Federal Ministry of Education and Somali Regional Education Bureau.
- The remaining 19 items cannot be completed safely until the overlapping PR #242 and #220 changes are reconciled and the authoritative marks/report-card implementation is selected.
