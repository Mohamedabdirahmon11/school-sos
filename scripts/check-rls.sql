-- Run after schema.sql in Supabase SQL Editor.
-- Client-accessible tables need policies. Service-role-only tables may
-- intentionally have no policies, provided anon/authenticated have no grants.
SELECT
  t.tablename AS table_name,
  t.rowsecurity AS rls_enabled,
  COUNT(p.policyname) AS policy_count,
  (
    has_table_privilege('anon', format('%I.%I', t.schemaname, t.tablename), 'SELECT')
    OR has_table_privilege('anon', format('%I.%I', t.schemaname, t.tablename), 'INSERT')
    OR has_table_privilege('anon', format('%I.%I', t.schemaname, t.tablename), 'UPDATE')
    OR has_table_privilege('anon', format('%I.%I', t.schemaname, t.tablename), 'DELETE')
    OR has_table_privilege('authenticated', format('%I.%I', t.schemaname, t.tablename), 'SELECT')
    OR has_table_privilege('authenticated', format('%I.%I', t.schemaname, t.tablename), 'INSERT')
    OR has_table_privilege('authenticated', format('%I.%I', t.schemaname, t.tablename), 'UPDATE')
    OR has_table_privilege('authenticated', format('%I.%I', t.schemaname, t.tablename), 'DELETE')
  ) AS client_access,
  CASE
    WHEN NOT t.rowsecurity THEN 'FAIL'
    WHEN COUNT(p.policyname) > 0 THEN 'PASS'
    WHEN NOT (
      has_table_privilege('anon', format('%I.%I', t.schemaname, t.tablename), 'SELECT')
      OR has_table_privilege('anon', format('%I.%I', t.schemaname, t.tablename), 'INSERT')
      OR has_table_privilege('anon', format('%I.%I', t.schemaname, t.tablename), 'UPDATE')
      OR has_table_privilege('anon', format('%I.%I', t.schemaname, t.tablename), 'DELETE')
      OR has_table_privilege('authenticated', format('%I.%I', t.schemaname, t.tablename), 'SELECT')
      OR has_table_privilege('authenticated', format('%I.%I', t.schemaname, t.tablename), 'INSERT')
      OR has_table_privilege('authenticated', format('%I.%I', t.schemaname, t.tablename), 'UPDATE')
      OR has_table_privilege('authenticated', format('%I.%I', t.schemaname, t.tablename), 'DELETE')
    ) THEN 'PASS (service-role only)'
    ELSE 'FAIL'
  END AS status
FROM pg_tables t
LEFT JOIN pg_policies p
  ON p.schemaname = t.schemaname
 AND p.tablename = t.tablename
WHERE t.schemaname = 'public'
GROUP BY t.tablename, t.schemaname, t.rowsecurity
ORDER BY t.tablename;
