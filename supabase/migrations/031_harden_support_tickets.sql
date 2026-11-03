-- Support ticket reads remain owner/admin scoped; all mutations go through validated server routes.
BEGIN;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON public.support_tickets FROM PUBLIC, anon, authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
