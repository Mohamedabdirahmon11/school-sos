# SchoolOS Project State

Updated: 2026-11-09

## Done
- Accountant finance workspace base: fee structures, receipts, arrears, expenses, cashbook, monthly summary, payroll integration, permission-aware navigation, and backup/restore support are in PR #59.
- Fee collection now supports Cash, Bank Transfer, and Mobile Money in the application code.
- Added a tenant-scoped bank reconciliation screen and API for manually entered statement lines, exact-amount receipt/expense matching, duplicate-match protection, and audit events.
- Added migration 061 and synchronized the canonical `schema.sql`.
- Added regression coverage for supported payment methods and bank reconciliation.

## In progress
- PR #59 remains open as a draft PR; code and CI are complete for this scope, pending review/merge.
- Migrations 060 and 061 have not been applied to production Supabase.
- Accountant permission grants for `payroll_manage` and `reports_export` remain an explicit School Admin action; no production permission changes have been made.

## Next
- DONE: GitHub CI run 1838 passed TypeScript checks, all 196 tests, route parity audit, RLS source audit, and production build on commit `ebaa6e38cecbcbcd85478fea8cb4e6e4e7d6a34d`.
- Next: after review/merge and explicit production approval, apply migrations 060 then 061 to the intended Supabase project and verify schema/RLS.
- Test cash, bank transfer, mobile money, receipts, partial installments, and bank statement reconciliation with controlled test records.
- Complete finance reports/export and grant Payroll/Reports access only after the School Admin authorizes those permissions.

## Known issues
- Bank statement lines are entered manually; CSV bank statement import and direct bank-provider integrations are not included.
- Bank reconciliation matches one full fee receipt or expense to one statement line by exact amount (within 0.01); multi-installment bank settlement allocation is not implemented.
- No live production database migration, permission change, or transaction test has been performed.
