-- Run after supabase/schema.sql in Supabase SQL Editor.
-- Returns one row per public table. Any row with RLS disabled or zero policies needs review.
SELECT
  t.tablename AS table_name,
  t.rowsecurity AS rls_enabled,
  COUNT(p.policyname) AS policy_count,
  CASE WHEN t.rowsecurity AND COUNT(p.policyname) > 0 THEN 'PASS' ELSE 'FAIL' END AS status
FROM pg_tables t
LEFT JOIN pg_policies p
  ON p.schemaname = t.schemaname
 AND p.tablename = t.tablename
WHERE t.schemaname = 'public'
GROUP BY t.tablename, t.rowsecurity
ORDER BY t.tablename;
