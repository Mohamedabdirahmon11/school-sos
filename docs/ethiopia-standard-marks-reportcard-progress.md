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
