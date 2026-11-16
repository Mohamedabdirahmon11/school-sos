# SchoolOS Project State

Updated: 2026-11-11

## Next
- Complete the Teacher workspace and faculty-management review in PR #82. Work only on gaps not already completed: audit and polish all teacher workflows (overview, timetable, attendance, class-wide exam marks and Form Teacher approval, homework/submissions, notices, direct messages, and teacher payslips/navigation); verify school-scoped data and role permissions; add only necessary additive Supabase migrations; and run CI plus desktop/mobile browser journeys. Do not repeat the completed Accountant work or the Teacher UI changes already present in PR #82.

## Teacher workspace — in progress
- PR #82 (`codex/teacher-workspace-redesign`) is open as Draft and is based on current `main`. It redesigns all six Teacher Portal areas (overview, timetable, attendance, exam marks, homework/submissions, and notices), adds a teacher-only responsive direct-messages shell, refreshes personal payslips with load-error/retry states, and redesigns the School Admin teacher directory. It also adds optional multi-class/subject profile tags and preserves the one-time Teacher ID/PIN flow.
- Live Supabase review of `school management 3` found that `private.auth_can_access_student` and `private.auth_can_access_class` currently authorize teachers through active `class_subjects` assignments but omit the `classes.class_teacher_id` Form Teacher relationship. One active Form Teacher class currently exists and has zero enrolled students.
- PR #82 contains additive migration `20261111070000_form_teacher_rls_scope.sql` and regression coverage to include a Form Teacher's own school-scoped class and students while retaining subject-teacher and parent/student rules. The migration is NOT applied to production; no live data was modified.
- Teacher messages and payslips remain connected through the existing role-specific sidebar routes; the payslip API filters by the signed-in user's ID. Shared parent/School Admin message presentation is unchanged.
- Live data audit: ten teacher-related relationship checks returned zero mismatches; RLS is enabled on the inspected teacher tables. Current live data has no marks, assignments/submissions, school notices, or payroll records, so those real-data workflows still need controlled test data.
- Auth linkage blocker: 0/3 teacher users currently have `users.auth_user_id` set, and none match an existing `auth.users` email. School Admin, Accountant, Parent, and Student accounts are also unlinked; only 1/2 Super Admin users is linked. Do not create Auth users or reset credentials until a safe staff migration/forced-reset flow is agreed and tested.
- Remaining: run CI after the latest all-section UI updates, verify the migration under authenticated/non-assigned teacher identities, audit Somali/Amharic teacher strings, and perform real desktop/mobile teacher sign-in journeys. Do not mark this section DONE until those checks pass.

## Accountant — merged and verified
- PR #59 finance ledger and payment-channel support merged; fee payments, receipts, cashbook, expenses, and reconciliation are school-scoped.
- PR #60 FK indexes and canonical schema synchronization merged.
- PR #62 Accountant workspace redesign merged; Accountant navigation, desktop/mobile shell, forms, tables, and dialogs use an isolated visual theme.
- PR #63 permission visibility fixes merged as `7a82ea95f8c2fa77369596f297d646d177c8aff0`. CI passed TypeScript, full configured tests, route parity, RLS source audit, and production build. Accountant users without `fees_manage` no longer see fee/expense mobile shortcuts, payment-record action, or receipt-void action.
- Controlled finance DB tests were run in rollback-only transactions for Cash, Bank Transfer, Mobile Money, partial installments, and bank reconciliation. Test records were rolled back; live financial records were not changed.
- Applied migrations 060, 061, and 062 to the intended Supabase project `school management 3` (`rhpazlnjqsmzngxatnwd`); expense and bank-statement tables have RLS and school-scoped policies.

## Accountant — in progress
- PR #64 is DONE and merged as `4eaea446e4ef0344ac72fc72d4351cbb5a1936e8`. It adds validated CSV statement import (preview, template, duplicate skipping, 500-row cap, tenant-scoped atomic bulk insert), plus school-timezone defaults and summaries across Accountant dashboard, expenses, and payroll. Parser and HTTP regression tests pass. GitHub Actions run `42783208889` (#1869) passed TypeScript, tests, route parity, RLS audit, and production build.
- PR #66 merged split-settlement allocation ledger and atomic RPC; migration 063 is applied to the intended Supabase project. It permits one statement line to allocate across multiple receipts/expenses and one receipt/expense across multiple statement lines, with school scoping and amount caps. Reconciled receipts/expenses are protected from voiding, and allocations are included in school backups.
- PR #67 and migration 064 are complete; Supabase Performance Advisor reports zero unindexed foreign keys for the allocation table.
- Rollback-only production DB tests passed multi-receipt/multi-statement allocations, expense allocation, over-allocation rejection, and void protection. No test records remain.
- A live browser review of the redesigned Accountant screens on desktop and mobile remains blocked until a browser session or preview URL is available; automated CI/build checks are not a substitute.
- Automatic bank-feed integration remains blocked pending the selected bank/provider and its authorized API credentials. CSV statement import is available; no credentials should be sent in chat.

## Supabase review
- Latest Security Advisor: one actionable warning remains — leaked-password protection is disabled. The owner must enable it in Supabase Auth password security settings.
- INFO findings for `password_reset_codes` and `subscription_reminders` report RLS enabled without policies; prior privilege review found no anon/authenticated table access. Do not add permissive policies without a specific access requirement.
- Performance Advisor currently reports unused-index INFO findings. Do not drop indexes solely from this snapshot; verify workload/query plans first.

## Safety and release
- Preserve existing school and financial data. No production finance records were deleted or modified during these changes.
- GitHub merge does not itself deploy the hosting environment. Production deployment and live sign-in/user-journey verification remain separate checks.
- The intended Supabase project is Frankfurt/EU Central project `rhpazlnjqsmzngxatnwd`; do not use the alternate Paris project.


## Teacher portal follow-up — class data safety (2026-11-11)
- Added to PR #82: clear prior class roster and grade/attendance state before loading a newly selected class, so stale students cannot appear during class switching.
- Attendance data and marks data are now fetched only in their respective tabs. Other Teacher Portal sections avoid those unnecessary requests.
- Save Attendance, all bulk marks actions, and Form Teacher forwarding are disabled during class-data loading; attendance shows an explicit loading row.
- Added a source regression test for the loading and stale-data safeguards.
- Verification: GitHub Actions run 42981856160 passed TypeScript, the test suite, route parity audit, RLS source audit, and production build for the class-loading safeguards. No live database or production records were modified.


## Teacher portal follow-up — homework safety (2026-11-11)
- Assignment-submission review is race-safe: stale responses from a previous assignment cannot overwrite the newly selected assignment; switching/unmounting invalidates in-flight requests and clears old grading drafts.
- Homework creation now trims text, validates school-local due dates (today or later), and enforces whole-number max points 1–1000 before calling the API.
- Grade saves are serialized; read-only and concurrent grade attempts are rejected by the handler.
- Added source regression tests for these cases. GitHub Actions run 42982394200 passed TypeScript, the full test suite, route parity audit, RLS source audit, and production build. No production data or schema was changed.


## Documents module — Phase 1 implementation (2026-11-16)
- PR #174 (feature/documents-phase1) adds the first school-scoped Documents workspace: Somali document list/editor, metadata-only list queries, on-open content fetch, 1.5-second changed-field autosave, close-tab protection, six built-in templates, school-owned template create/edit/duplicate/delete, variable picker, student/class generation, preview, missing-data warnings, soft delete/restore, duplicate, rename, A4/A5/Letter settings, RTL/LTR controls, print/PDF, and private per-school image upload.
- Added school_documents and school_document_templates with RLS enabled, school-admin/super-admin policies, school and foreign-key indexes, content-size limits, and a private school-document-images bucket. Migration 20261116090000_school_documents_phase1.sql is additive and NOT applied. schema.sql was synchronized; no production database or existing records were changed.
- HTML is allow-list sanitized in the editor and server routes. Student variables are escaped as plain text. The document list does not fetch full bodies. Image upload validates PNG/JPEG/WebP and a 1.5 MB limit; object names are generated server-side and the bucket remains private.
- CI run 43808726741 passed: TypeScript checks PASS; 357 tests PASS / 0 failed; route parity PASS (174 frontend pairs, 0 missing); RLS source audit PASS; production build PASS.
- Separate npm run lint was attempted and fails on pre-existing TypeScript implicit-any errors in unchanged tests/support/in-memory-supabase.ts (TS7023, TS7006, TS7022). The CI typecheck:ci check passes. That unrelated test helper was not changed, and the original CI workflow was restored.
- Not complete / known gaps: the Arabic font is referenced through local font-family fallbacks but a self-hosted embedded Arabic font asset has not yet been added; advanced table border controls and full two-axis cell merging need more work; print headers are not guaranteed to repeat on every printed page, and browser print-dialog headers/footers remain browser-controlled.
- Not verified: migration execution against Supabase, real authenticated cross-school RLS isolation, image upload/download against the live private bucket, Arabic font embedding/rendering in generated PDFs, and manual desktop/mobile browser journeys. CI/build success is not a substitute for those runtime checks.
- Phase 1 follow-up hardening on 2026-11-16: autosave now serializes in-flight writes, compares the latest editor draft after a save, and prevents switching documents while unsaved changes remain after a failed save. This closes a race where edits made during a slow request could be marked saved without being persisted.
- Class-wide document generation now pages through the complete school-scoped class roster instead of silently stopping at the first 100 students.
- Latest GitHub Actions run 43814470765 passed TypeScript checks, the full test suite, route parity, RLS source audit, and production build after these changes. Earlier autosave type errors were corrected before this successful run.
- Table border color/width/style controls and horizontal/vertical cell merge controls are now present in the editor; repeating header/footer CSS is present but still requires real Chromium/Edge print verification.
- Remaining Phase 1 release gates: add a self-hosted Arabic font asset and verify it is embedded/rendered in PDF; run desktop/mobile browser journeys; verify real print pagination/header/footer behavior; test private image upload/download against the bucket; and perform authenticated cross-school RLS isolation tests in a non-production Supabase environment.
- Phase 1 migration was applied to the selected Supabase project `school management 3` on 2026-11-16; the six document-related tables are present with RLS enabled.
- Phase 2 was merged through PR #177; CI passed. DOCX import/export and CSV/XLS/XLSX import/export are implemented, but real browser file round-trip verification remains outstanding.
- Phase 3 was merged through PR #178 and its migration was applied to `school management 3`. Follow-up hardening was merged through PR #179 and applied: delete audit events now retain the document UUID in JSON details, locked edits are rejected, and the new foreign-key indexes are present.
- Database smoke verification passed for document creation, version snapshots, lock rejection, separate unlock, subsequent edit, audit retention after hard delete, and cleanup of test records.
- The `school-document-images` and `student-document-attachments` buckets are confirmed private. Attachment size/type limits are configured. The app's document API scopes reads/writes by the authenticated school; direct `anon`/`authenticated` table SELECT grants remain disabled, with service-role access kept server-side.
- All six Documents tables have RLS enabled. Policies bind access to `private.auth_school_id()` and the intended school-admin/super-admin roles. Static source audit and GitHub CI passed.
- Remaining live end-to-end release checks: browser round-trip with real DOCX/XLSX/CSV files, actual private Storage upload/download through the authenticated app, and two-school API isolation using authenticated school-admin sessions. These have not been claimed as complete because no authenticated browser session was available in this run.


## Documents module — Phase 2 implementation (2026-11-16)
- Added browser-side DOCX import/export and CSV/XLS/XLSX import/export. Spreadsheet files import into editable HTML tables; XLSX export creates one worksheet per table, and CSV export includes a UTF-8 BOM.
- Spreadsheet import escapes cell HTML and CSV export protects against formula injection. Existing SheetJS dependency is reused; no new package dependency or database migration is added.
- Imported content remains in the editor until the user saves. Real-file browser round-trip fixtures and desktop/mobile verification remain release checks.


## Documents module — Phase 3 implementation (2026-11-16)
- Added additive migration `20261116100000_school_documents_phase3.sql` for document version snapshots, sharing grants, audit events, final/manual locking metadata, and private student attachment metadata/storage.
- Added history restore, explicit school-role and user-specific sharing, audit log, final/manual lock and unlock, and private student attachment upload/download/soft-delete flows.
- School-wide grants are limited to Teacher and Accountant; Parent/Student grants require a specific same-school user. Version history/audit are read-only to authenticated users; lock enforcement is in API and database trigger.
- Phase 3 and its follow-up hardening migrations are applied to `school management 3`; see the Phase 1 status above for database and runtime verification.


## Documents & Designer — specification audit (2026-11-15)

Branch: `feature/documents-designer-finish` (based on current `main`). This audit is based on the existing Documents implementation, the Phase 1–3 migrations, and the current Documents tests. It does not claim browser or live authenticated tenant tests.

### Initial checklist

| Spec item | Initial status | Evidence / gap |
|---|---|---|
| A. Somali template library (all requested letters, certificates, ID cards, report cards, receipts, admit cards, class/attendance lists, timetable) | PARTIAL | Existing UI has six built-in templates (transfer, certificate, parent, teacher, clearance, report summary) and school-owned editable templates. The requested complete catalogue, certificate variants, front/back ID cards, full report cards, receipts/admit cards/class/attendance sheets are not present as built-ins. |
| B. Five certificate / four ID / four letter / four report designs; school-brand styling; custom PNG/JPG/PDF backgrounds, page picker, DPI/file validation, metadata stripping, private storage | MISSING | Existing image upload supports PNG/JPEG/WebP only with a 1.5 MB cap. No evidence of the requested design catalogue, PDF.js page picker, DPI warning, metadata stripping, or full custom-background workflow. |
| C. Visual drag-and-drop designer and all field/layer/editing controls | PARTIAL | Existing editor is contentEditable with text formatting, tables, image insertion, page breaks, RTL/LTR, A4/A5/Letter, and margins. It is not a positioned canvas designer and lacks field objects, drag/resize/rotate/align/snap/guides, nudge, zoom, lock/layers, duplicate/copy/paste, undo/redo, QR/barcode/signature/stamp/marks fields, CR80/custom mm, bleed/safe area, and sample-data preview. |
| D. Complete variables, school-timezone date, ETB amounts, escaped text, missing-data warnings | PARTIAL | Existing variable replacement escapes text and reports missing/unknown variables; current set is limited to student, parent, class, school, teacher, term, year and date. Marks, grade, rank, attendance, staff, serial and ETB variables are not implemented. |
| E. Single/selected/class batch PDF, ID-card A4 sheets/crop marks, ZIP, DOCX letters, embedded Somali/Arabic fonts, progress/cancel, serial + verification QR/public verify, duplicate linkage, issue log | PARTIAL | Existing generation supports one student or a whole class and class roster pagination; DOCX import/export exists. No complete PDF-per-student/ZIP/ID-sheet pipeline, serial/QR verification flow, public verify endpoint, issue log, or cancellable batch progress was found. Arabic font embedding is explicitly a remaining release gap. |
| F. Template thumbnails, duplicate/edit/archive/restore; immutable issued snapshots; Draft/Final reopen flow | PARTIAL | Existing template list supports create/edit/duplicate/delete; document soft-delete/restore, version history and locking are implemented. Template thumbnail/archive-restore lifecycle and immutable issued-document/template-version binding need completion/verification. |
| G. Required permission keys, teacher own-class scope, RLS/indexes/buckets, sanitization, PDF validation/limits, complete audit actions | PARTIAL | Existing RLS, school scoping, indexes, private image/attachment buckets, HTML allow-list sanitization, escaped variable text, version/audit triggers and lock enforcement exist. Named permission keys `templates_manage`, `documents_generate`, `documents_issue`, teacher own-class generation coverage, custom PDF/image validation, and upload/edit/generate/download/void/reopen audit completeness are not established. |
| H. Query performance, on-open body fetch, 1.5s serialized autosave, font/asset cache, render stability | PARTIAL | Existing list queries are metadata-oriented, body is fetched on open, and autosave is debounced/serialized at about 1.5 seconds. Font/asset caching and full render/request profiling remain unverified. |

### Work performed in this branch
- Created the requested feature branch from the current `main`; no commits have been made to `main`.
- No migrations were added or applied. No production database or existing records were changed.
- The initial audit is recorded above; the post-change checklist remains the same until implementation commits are added.

### Verification constraints and attempts
- The execution container did not contain a Git checkout. `git remote -v` was attempted from the initial working directory and returned “not a git repository”.
- A shallow clone of the exact canonical URL `https://github.com/Mohamedabdirahmon11/school-sos.git` was attempted; it failed before checkout because the container could not resolve `github.com` (DNS/network unavailable). Thus there is no local working tree in which to install dependencies, start the app, or run Playwright/PDF rendering.
- GitHub connector access was used to inspect `PROJECT_STATE.md`, recent commits, Documents source files, migrations, and tests, and to create the isolated feature branch. Remote CI can still be triggered by the draft PR, but it cannot replace the requested local desktop/mobile and PDF-image visual checks.
- No screenshot, generated PDF, Playwright result, authenticated cross-school test, or real upload round-trip is claimed by this audit.

### Post-change checklist
- A: PARTIAL — unchanged; complete catalogue and specialized templates remain.
- B: MISSING — unchanged; multi-design library and custom background pipeline remain.
- C: PARTIAL — unchanged; positioned visual designer remains.
- D: PARTIAL — unchanged; academic, staff, serial and ETB variables remain.
- E: PARTIAL — unchanged; complete PDF/ZIP/QR/verification/issue pipeline remains.
- F: PARTIAL — unchanged; template archive/restore and issued-version immutability need completion.
- G: PARTIAL — unchanged; named permissions, teacher own-class policy proof, PDF validation and complete audit coverage remain.
- H: PARTIAL — unchanged; font/asset caching and performance profiling remain.


## Documents Designer continuation — 2026-11-16

### Changes made on `feature/documents-designer-finish`
- Expanded the local built-in Somali template catalogue from six entries to 44 entries covering transfer/replacement/admission/withdrawal letters, parent notices, discipline and absence notices, fee reminders, teacher appointment/experience/leave/recommendation, exam results, certificate types and visual variants, student/teacher/staff ID examples, term/annual report layouts, payment receipts, exam admit cards, class lists, attendance sheets and exam timetable layouts. Built-ins can be duplicated into a school-owned editable template using the existing flow.
- Corrected a malformed paragraph in one sports certificate template.
- Fixed a real class-generation truncation defect: the API previously fetched only the first 100 students. It now collects the complete school-scoped class roster in bounded pages and returns HTTP 413 instead of silently truncating classes above 5,000 students.
- Added `src/lib/documents/paged-query.ts`, a bounded generic pagination helper, and `tests/documents-paged-query.test.ts` with cases for 40 students, 245 students across three pages, over-limit rejection, and an incomplete-page failure.
- No schema changes or migrations were needed for these changes because the new built-in templates intentionally reuse the existing allowed document-type values. No database was modified.

### Checklist update
- A. Template catalogue: **DONE for catalogue coverage**; every named template family now has a built-in entry. Specialized dynamic table rendering and per-template real-data validation remain tracked under C/D/E.
- B. Built-in design choices: **PARTIAL**; the catalogue now contains at least five certificate layouts, four ID examples, four letter layouts and four report layouts. Custom PNG/JPG/PDF background upload, PDF.js page selection, DPI validation, metadata stripping and full per-card front/back composition remain missing.
- C. Visual designer: **PARTIAL**; existing rich-text editor remains, but the positioned canvas and field/layer operations are still absent.
- D. Variables: **PARTIAL**; escaped text and missing-variable warnings remain. New template examples include academic/financial tokens that are not yet populated by the API, so they intentionally appear in the missing-data warning until their data sources are implemented.
- E. Generation/export/verification: **PARTIAL**; whole-class generation now paginates past 100 and has a tested 5,000-student safety ceiling. Serial/QR verification, public verify endpoint, per-student PDF/ZIP export, batch progress/cancel and embedded Arabic font are still missing.
- F. Management: **PARTIAL**; existing template duplicate/edit and document version/lock flows remain. Template archive/restore and immutable issued-template snapshots still need completion.
- G. Security: **PARTIAL**; existing school scoping and sanitizer remain. Explicit permission keys, teacher-owned-class generation, strict custom background PDF validation, and complete audit event coverage still need work.
- H. Performance: **PARTIAL**; on-open content fetch and debounced autosave remain. Font/asset caching and profiling are not verified.

### Verification status for this continuation
- GitHub file writes succeeded on the feature branch; each source file was re-fetched before update and updated by its current blob SHA.
- Added pagination tests are committed but **not executed**. Local `git remote -v` was attempted from `/` and failed with `fatal: not a git repository`; a fresh shallow clone of the exact repository URL again failed with `Could not resolve host: github.com`.
- No local TypeScript check, full test suite, Playwright desktop/mobile run, PDF generation/render inspection, authenticated two-school RLS test, or real Storage round-trip has been run in this environment. No passing result is claimed.
- No migrations were added or applied; production Supabase and existing records remain untouched.


### Follow-up hardening and CI verification — 2026-11-16
- Extracted school-brand styling into `src/lib/documents/brand-color.ts`. Built-in templates now use the school's saved six-digit hex brand color for accents when documents are created, previewed and generated. If the brand color is too light for readable text on white, the helper keeps the brand color for accents and uses dark slate for text.
- Added `tests/documents-brand-color.test.ts` for valid colors, low-contrast colors and invalid-color fallback.
- GitHub Actions run **43828702045** completed successfully for the feature branch: `npm run typecheck:ci` PASS; full test suite **371 tests / 371 pass / 0 fail**; route parity audit PASS; RLS source audit PASS (static source audit covering 66 declared tables); production Vite build PASS.
- The CI RLS audit is static source inspection, not an authenticated live Supabase cross-school read/write test. CI does not perform the requested Playwright desktop/mobile run or PDF-to-PNG visual inspection.
- New source files in this continuation: `src/lib/documents/paged-query.ts`, `src/lib/documents/brand-color.ts`; new tests: `tests/documents-paged-query.test.ts`, `tests/documents-brand-color.test.ts`.
- Local desktop/mobile browser journeys, visual inspection of every generated template/design, real upload/download, live authenticated tenant isolation, PDF embedded Arabic font verification, and batch cancellation remain unverified due the local checkout/network limitation.


### Document variable resolution follow-up — 2026-11-16
- Added `src/lib/documents/academic-variables.ts` to summarize only approved student marks, compute total marks/average/grade, calculate deterministic class rank and choose the latest non-empty teacher remark.
- Document preview/generation now resolves `total_marks`, `average`, `grade`, `rank`, `teacher_comment`, `staff_name`, `staff_id`, `fee_balance` and `attendance`. Fee balance sums non-voided remaining fee amounts and uses the school's configured currency (ETB fallback). Attendance counts present/late records in the selected semester when school term dates exist; annual report templates use both semesters. If term dates are not configured, attendance falls back to the student's available attendance history.
- Updated the editor variable picker and template help text to expose the newly supported variables.
- Added three unit tests for approved-mark aggregation, ignoring draft marks and deterministic class ranking.
- Latest GitHub Actions run **43829647841** completed successfully after the variable and term-scope changes: TypeScript checks PASS, full test suite PASS (**374 tests, 0 failures**), route parity PASS, static RLS source audit PASS, and production build PASS.
- Still unresolved variable/data fields include payment transaction amount, persistent document serial number, and QR verification; these need the issuing/verification data model and are not replaced with invented values.

- Final documentation-sync CI run **43829834131** also completed successfully on the latest branch head: **374/374 tests, 0 failures**, TypeScript checks, route parity, static RLS source audit (66 declared tables), and production build all PASS.


### Template archive/restore continuation — 2026-11-16
- Added an explicit archived-template view to the school-scoped Documents template manager. Existing soft-delete fields are reused: archiving sets `deleted_at/deleted_by`; the archived list is only returned when the authenticated school admin requests `includeArchived=true`.
- Added an authenticated, school-scoped restore endpoint that clears the archive markers and updates the actor/timestamp. The UI disables editing/selection for archived templates and offers a Restore action. The existing database unique active-title index remains authoritative; restoring a name that has since been reused returns a safe failure rather than creating duplicate active names.
- Updated the API client and template manager. No migration or production database change was needed.
- GitHub Actions run **43832180602** completed successfully on commit `1baf955a9cad27a98623a96e0a6e917672a16bff`: TypeScript checks PASS, test suite PASS, route parity PASS, static RLS source audit PASS, production build PASS.
- This is a completed part of template lifecycle management, not completion of the entire Designer specification. Immutable issued-template snapshots, visual canvas/layer tools, custom artwork/PDF backgrounds, PDF/ZIP/QR issuance, named permissions and live browser/tenant/storage checks remain open.
- Follow-up review caught and fixed the template response mapper so archived timestamps are returned to the UI; without this field, the archive view could not distinguish archived rows. The correction is committed as `1a3701ef30e4459bcc0f758d0ad0d90fda301b6b` and awaits its own CI result.
- After exposing `deletedAt` in the template API mapper, latest GitHub Actions run **43832651841** completed successfully on commit `e2f6fb6d944e243b49790c6c07bc222b8d420d0b`: TypeScript checks, test suite, route parity, static RLS source audit, and production build all PASS.


## Documents Designer continuation — missing-data generation gate (2026-11-16)
- Fixed a release-critical generation flow defect: previously, the API inserted all generated student documents and only then returned missing-variable warnings. The UI therefore warned after persistence, contrary to the requirement that missing data be shown before generation.
- Added `requiresDocumentGenerationConfirmation` in `src/lib/documents/variables.ts`; its unit coverage verifies that missing fields require confirmation, complete data does not, and an explicit confirmation permits the batch.
- The generation API now performs the full school-scoped batch resolution first and, when any student has missing values and `confirmMissing` is not true, returns `requiresConfirmation: true`, the affected-student warnings, and an empty documents list without inserting rows.
- The Documents UI now displays a Somali confirmation dialog describing affected students and missing fields. Cancel leaves the database unchanged; confirm retries the same request with `confirmMissing: true`. Unresolved variable tokens continue to be removed by the escaped plain-text substitution helper rather than being emitted literally.
- Changed files: `src/lib/documents/variables.ts`, `tests/documents-variables.test.ts`, `src/server/api.ts`, `src/components/documents/DocumentsView.tsx`. No migration or production database change.
- GitHub source re-fetch confirms the API guard, UI confirmation path and test import are present on the feature branch. The test suite and browser flow have **not yet been executed** in a local checkout. The commit-triggered workflow lookup returned no run; do not treat prior CI success as validation of this new change.
- Branch comparison at this point: feature branch is 35 commits ahead of main and 1 commit behind; the behind commit is the current main-line student-invoice work. Reconcile the branch with current main before PR merge, without force-pushing or modifying main directly.


### Missing-data confirmation gate — CI verification (2026-11-16)
- The generation safeguard is now covered by the feature-branch CI run **43833993320** on commit `dcc5ab71e5742ab9d9611b1ffa5f70b29f554255`.
- Actual GitHub Actions job `Typecheck, tests, and production build` completed with conclusion `success`. Log output: `npm run typecheck:ci` PASS; `npm test`: **380 tests, 380 pass, 0 fail**; `npm run audit:routes` PASS; `npm run audit:rls` PASS (static source audit); `npm run build` PASS.
- This run verifies the added missing-data helper test and TypeScript/build compatibility. It does not verify browser confirmation behavior, PDF rendering, real Supabase writes, or authenticated cross-school isolation.
- The PR remains Draft because the remaining visual designer, custom artwork/PDF background pipeline, serial/QR public verification, batch PDF/ZIP, named permission enforcement and visual/live-tenant checks are still not complete.


### Document verification implementation (2026-11-16)
- Added additive migration `20261116120000_document_verification.sql` with unique per-document serial numbers and opaque UUID verification tokens; existing documents receive generated identifiers without changing their content.
- Newly generated student documents receive a serial number, verification URL, and QR image reference.
- Added a public verification HTML page and QR PNG endpoint. The page exposes only validity, school name, student name, document type, and issue date; deleted/missing documents return not found and draft documents are marked invalid.
- Extended the document HTML sanitizer to allow only the exact UUID-scoped QR image route; added regression tests for accepted and rejected verification URLs.
- Migration is additive and has not been applied to production. GitHub Actions CI must pass before this work is considered verified. Public URL generation uses `APP_BASE_URL` or `PUBLIC_APP_URL` when configured; otherwise it uses a relative same-origin path.

- Follow-up: the private document artwork image upload cap is now 10 MB in the API, editor validation, and a new additive bucket migration. PDF artwork/page picking, PDF.js rendering, DPI inspection, and metadata stripping remain outstanding.
- Serial/QR verification is now added to manually created, duplicated, and bulk-generated documents. Verification tokens are opaque UUIDs; the public page marks only Final documents valid and exposes the limited verification fields. The QR endpoint builds an absolute same-origin URL from configured APP_BASE_URL/PUBLIC_APP_URL or the request host.

- Added a CR80 (85.6 × 54 mm) document page preset in the editor and print stylesheet, with additive DB constraints for current documents and their version snapshots. This is a single-card page preset only; A4 multi-card imposition/front-back sheet export is still outstanding.

- Artwork follow-up: image uploads now warn when dimensions fall below an approximate 200 DPI target for A4/A5/Letter/CR80, reject images above 40 MP, and re-encode images in-browser before upload to strip EXIF/embedded metadata. This applies to PNG/JPEG/WebP; PDF backgrounds/page selection still need PDF.js work.

- Audit follow-up: finalizing a document now records a `document_issued` event; using Print/PDF records a `document_download_requested` event after server-side school/permission checks. The UI blocks printing if the audit request cannot be recorded.

- Latest GitHub Actions run for the current implementation set: `SchoolOS CI` run 43837423264 PASS — TypeScript checks, 383/383 tests, route parity audit, RLS source audit, and production build. This validates the current branch head before this documentation-only note; it does not replace browser/visual or live Supabase verification.


### Public verification abuse protection — 2026-11-16
- Added a bounded in-process rate limiter to both public document verification and QR image endpoints: 120 requests per client IP per 15-minute window, with HTTP 429 and Retry-After on excess requests.
- The limiter bounds its key map and prunes expired entries to prevent unbounded memory growth.
- Added deterministic unit tests for threshold behavior, expiry/reset, and key-map bounds.
- Files: `src/lib/documents/verification-rate-limit.ts`, `src/server/api.ts`, `tests/documents-verification-rate-limit.test.ts`.
- Limitation: this is per Node process; deployments with multiple app instances need a shared Redis/database limiter for a globally consistent quota. It is an additional abuse barrier, not a substitute for edge/WAF rate limiting.
- CI run **43839661548** was triggered for this commit and is currently in progress; do not mark this change verified until it completes.


### Verification endpoint hardening — 2026-11-16
- Public verification routes and the HTML sanitizer now accept only canonical versioned UUID token syntax, preventing malformed UUID-shaped input from reaching the database UUID comparison.
- Added a regression test for malformed 36-character tokens.
- The prior rate-limit implementation commit passed GitHub Actions run **43839661548**: TypeScript, **386/386 tests**, route parity, static RLS audit, and production build all succeeded.
- The canonical UUID hardening is newer than that CI run and is awaiting its own workflow result.
