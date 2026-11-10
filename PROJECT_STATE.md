# SchoolOS Project State

Updated: 2026-11-10

## Done
- Accountant finance workspace PR #59 is merged into main (merge commit `f426a4b4e0e32957f299cdd8d2e89cd1832aa654`).
- Fee collection supports Cash, Bank Transfer, and Mobile Money; receipts and cashbook preserve the selected method.
- Added school-scoped Expenses & Cashbook, payroll/report integration where authorized, bank reconciliation, audit history, and backup/restore support.
- Applied migrations 060 and 061 to the intended Supabase project `school management 3` (`rhpazlnjqsmzngxatnwd`); existing records were preserved.
- Verified both new tables exist with RLS enabled and 8 tenant-scoped policies; verified the installment RPC signature and payment-method constraint.
- Applied migration 062 with indexes for all five new Accountant foreign keys.
- CI for PR #59 passed TypeScript, 196/196 tests, route parity, RLS source audit, and production build.

## Done
- Unified staff login: Super Admin, School Admin, and Accountant use one sign-in form; the authenticated account role determines the dashboard. Email or phone identifiers are accepted where the account has that identifier. Role-based authorization and school scoping remain server-enforced.

## In progress
- Accountant foreign-key indexes and canonical schema synchronization are merged in PR #60.
- Controlled live transaction tests (Cash, Bank Transfer, Mobile Money, partial installments, receipts, and reconciliation) remain pending; no financial test transactions were inserted.
- Accountant payroll/report access remains a School Admin permission decision. The live Accountant record currently has `fees_manage`, not `payroll_manage` or `reports_export`.

## Next
- Merge the FK-index/schema follow-up PR.
- Run controlled end-to-end finance tests with approved test records.
- Review the remaining Supabase advisors and fix only confirmed issues without weakening tenant isolation.

## Known scope limits
- Bank statement rows are entered manually; CSV statement import and bank-provider integration are not included.
- Reconciliation matches one full receipt or expense to one statement row (±0.01); splitting a bank settlement across multiple partial receipts is not implemented.
- No production financial transactions or staff permission grants were changed.
