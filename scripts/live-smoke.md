# SchoolOS live smoke test

Status: not executed by the agent. Run this only against a non-production Supabase project first. Never paste `.env` values, service-role keys, passwords, or PINs into screenshots, tickets, or chat.

## Preconditions

1. Keep `.env` private and out of git. It must contain `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`, `SUPER_ADMIN_EMAIL`, and `SUPER_ADMIN_PASSWORD`.
2. Use only an isolated test project. The canonical bootstrap schema is the repository-root `schema.sql` (not `supabase/schema.sql`). Before applying migrations, compare the project's migration history with `supabase/MIGRATION_SOURCE_GAPS.md` and review every source-backed migration in chronological order. Never replay an already-applied migration or run the bootstrap schema against an existing production database.
3. In Supabase SQL Editor, run `scripts/check-rls.sql`. Every public table must have RLS enabled; tables with no policies are acceptable only when anon/authenticated have no table grants (service-role-only access).
4. Install with `npm ci`, then run the local checks: `npm run lint`, `npm test`, `npm run build`, `npm run audit:routes`, `npm run audit:rls`, and `npm run audit:translations`.
5. Start with `npm run dev`. Use a desktop browser and a mobile-width browser, not just one viewport.

## Browser workflow

1. Sign in as Super Admin. Confirm the session survives refresh and logout returns to login.
2. Create a school with currency `ETB`; confirm student access starts OFF. Add a School Admin and copy the one-time temporary password.
3. Open the school and create/edit a branch. Confirm the main-campus transfer and branch delete guards behave correctly.
4. Sign in as the School Admin and complete the forced password change. Confirm direct navigation to money or payroll screens is denied.
5. Open School Settings and save identity fields: language, timezone, currency, class capacity, logo, and brand color. Confirm the brand color changes without breaking the layout.
6. Save academic year, term dates, grading bands, class levels, attendance rules, exam maximum/pass mark, and timetable settings. Confirm invalid dates, duplicate grades, empty class levels, and invalid times show errors.
7. Save report-card and receipt headers/footers and notification preferences. Confirm the Documents & Alerts tab reloads persisted values after refresh.
8. Create a class, subject, teacher, and student. Confirm the teacher can sign in and sees only assigned classes/subjects.
9. Record attendance, including an excused student with a reason. Confirm a blank reason is rejected when required.
10. Enter small/big exam marks within the configured maxima. Confirm a mark above the maximum is rejected, then generate yearly rankings and a report-card PDF.
11. Create a cash fee payment and download the receipt PDF. Confirm the configured receipt header/footer appear and the school currency is used.
12. Create a payroll draft as Accountant, approve and pay it, then sign in as that staff member and download only their own payslip.
13. Post a class notice as School Admin; sign in as parent/student/teacher and confirm audience visibility and unread counts. Send a direct message and confirm the recipient sees it.
14. As School Admin, download the school backup JSON. Confirm it contains only this school and no password/PIN hashes. Confirm teacher and parent accounts receive 403.
15. As Super Admin, download the platform backup JSON and audit CSV. Confirm teacher/parent accounts cannot access them and the browser does not cache the downloads.
16. Switch language to Somali, then Amharic. Confirm English fallback works and no page becomes blank. Recheck mobile bottom navigation and key screens at 390 px width.
17. Trigger a read-only or suspended school state, confirm write actions are blocked, and confirm support tickets remain available where required.

## One-line browser smoke

`Super Admin login -> create School Admin -> School Admin login -> save School Settings -> create class/student -> attendance -> marks -> report PDF -> cash receipt -> school backup -> mobile Somali layout`

## Record results

Record each failed step with the role, school code, route, visible error, browser width, and timestamp. Do not claim a live step passed unless it was actually run. Automated tests in this repository use in-memory adapters only.
