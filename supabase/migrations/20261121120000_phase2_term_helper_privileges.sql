-- Restrict the term-assignment helper to authenticated API/RLS callers.
-- Policies invoke it for authenticated users; no anon or public execution is required.
REVOKE ALL ON FUNCTION private.auth_has_term_assignment(text, text, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.auth_has_term_assignment(text, text, text, uuid, text) TO authenticated;
NOTIFY pgrst, 'reload schema';
