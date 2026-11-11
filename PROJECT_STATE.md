# SchoolOS Project State

Updated: 2026-11-11

## Next
- Complete the Teacher workspace and faculty-management review in PR #82. Work only on gaps not already completed: audit and polish all teacher workflows (overview, timetable, attendance, class-wide exam marks and Form Teacher approval, homework/submissions, notices, direct messages, and teacher payslips/navigation); verify school-scoped data and role permissions; add only necessary additive Supabase migrations; and run CI plus desktop/mobile browser journeys. Do not repeat the completed Accountant work or the Teacher UI changes already present in PR #82.

## Teacher workspace — in progress
- PR #82 (`codex/teacher-workspace-redesign`) is open as Draft and is based on current `main`. It already redesigns the Teacher Portal header/navigation, attendance summary/table, class marksheet presentation, and School Admin teacher directory; it also adds multi-class/subject profile tags and preserves the one-time Teacher ID/PIN flow.
- Live Supabase review of `school management 3` found that `private.auth_can_access_student` and `private.auth_can_access_class` currently authorize teachers through active `class_subjects` assignments but omit the `classes.class_teacher_id` Form Teacher relationship. One active Form Teacher class currently exists and has zero enrolled students.
- PR #82 now contains additive migration `20261111070000_form_teacher_rls_scope.sql` and a source regression test to include a Form Teacher's own school-scoped class and students while retaining subject-teacher and parent/student rules. The migration is NOT applied to production; no live data was modified.
- Remaining: validate all teacher workflows and direct-message/payslip navigation, run the PR checks, and perform real desktop/mobile teacher sign-in journeys. Do not mark this section DONE until those checks pass.

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
