-- Read-only pre-deployment checks for the live Supabase schema.
-- Run this in the Supabase SQL Editor. It does not modify database objects or data.
WITH checks AS (
  SELECT
    'Public tables have RLS enabled'::text AS check_name,
    NOT EXISTS (
      SELECT 1 FROM pg_tables
      WHERE schemaname = 'public' AND NOT rowsecurity
    ) AS passed,
    'Every public table must have row-level security enabled.'::text AS details
  UNION ALL
  SELECT
    'Every public table has at least one RLS policy',
    NOT EXISTS (
      SELECT 1
      FROM pg_tables t
      WHERE t.schemaname = 'public'
        AND NOT EXISTS (
          SELECT 1 FROM pg_policies p
          WHERE p.schemaname = t.schemaname AND p.tablename = t.tablename
        )
    ),
    'A table with RLS but no policy is inaccessible to API roles; review intentional deny-only tables.'
  UNION ALL
  SELECT
    'No direct table grants to anon/authenticated',
    NOT EXISTS (
      SELECT 1 FROM information_schema.role_table_grants
      WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated')
    ),
    'This app accesses Supabase through its server-side service-role client.'
  UNION ALL
  SELECT
    'SECURITY DEFINER functions use a hardened search_path',
    NOT EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.prosecdef
        AND NOT (
          COALESCE(p.proconfig, ARRAY[]::text[]) @> ARRAY['search_path=""']::text[]
          OR COALESCE(p.proconfig, ARRAY[]::text[]) @> ARRAY['search_path=pg_catalog']::text[]
        )
    ),
    'Apply migration 025_harden_security_definer_search_paths.sql before deployment.'
  UNION ALL
  SELECT
    'Fee receipt sequence table exists',
    to_regclass('public.fee_receipt_sequences') IS NOT NULL,
    'Apply migration 026_fee_receipt_sequences.sql before starting the current application.'
  UNION ALL
  SELECT
    'Fee receipt sequence RPC exists',
    to_regprocedure('public.schoolos_next_fee_receipt(character varying,character varying)') IS NOT NULL,
    'The fee payment flow requires public.schoolos_next_fee_receipt(VARCHAR, VARCHAR).'
  UNION ALL
  SELECT
    'SECURITY DEFINER functions are not executable by anon/authenticated/PUBLIC',
    NOT EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
      WHERE n.nspname = 'public'
        AND p.prosecdef
        AND acl.privilege_type = 'EXECUTE'
        AND acl.grantee IN (0, 'anon'::regrole::oid, 'authenticated'::regrole::oid)
    ),
    'Only the intended trusted server role should execute privileged database functions.'
  UNION ALL
  SELECT 'Private RLS helper schema exists',
    to_regprocedure('private.auth_school_id()') IS NOT NULL,
    'Apply the private-schema RLS helper migration.'
  UNION ALL
  SELECT 'Inventory tables and stock adjustment RPC exist',
    to_regclass('public.inventory_items') IS NOT NULL
      AND to_regclass('public.inventory_transactions') IS NOT NULL
      AND to_regprocedure('public.schoolos_adjust_inventory(character varying,character varying,character varying,numeric,numeric,character varying,text,character varying)') IS NOT NULL,
    'Apply migration 033 before using the inventory module.'
  UNION ALL
  SELECT 'Notification retry worker RPCs and attempt columns exist',
    to_regprocedure('public.schoolos_claim_communication_queue()') IS NOT NULL
      AND to_regprocedure('public.schoolos_complete_communication_queue(character varying,boolean,text,character varying)') IS NOT NULL
      AND to_regprocedure('public.schoolos_retry_communication_queue(character varying,character varying)') IS NOT NULL
      AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='communication_queue' AND column_name='attempt_count')
      AND EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='comm_status_enum' AND e.enumlabel='processing'),
    'Apply migrations 034, 036, and 038 before enabling the production notification worker.'
  UNION ALL
  SELECT 'Dashboard attendance and fee metrics RPC exists',
    to_regprocedure('public.school_dashboard_summary(character varying)') IS NOT NULL,
    'Apply the current report calculation migrations.'
)
SELECT check_name, CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS status, details
FROM checks
ORDER BY passed, check_name;
