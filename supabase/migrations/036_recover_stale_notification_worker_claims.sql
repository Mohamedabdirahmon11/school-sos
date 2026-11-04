-- Recover notification rows left in processing if a worker process dies mid-request.
BEGIN;
CREATE OR REPLACE FUNCTION public.schoolos_claim_communication_queue()
RETURNS SETOF public.communication_queue
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  UPDATE public.communication_queue
  SET status = 'failed',
      error_message = 'Delivery worker lease expired after the final attempt.'
  WHERE status = 'processing'
    AND attempt_count >= max_attempts
    AND last_attempt_at < now() - interval '5 minutes';

  RETURN QUERY
  WITH candidate AS (
    SELECT id FROM public.communication_queue
    WHERE (
      (status = 'queued' AND next_attempt_at <= now())
      OR (status = 'processing' AND last_attempt_at < now() - interval '5 minutes' AND attempt_count < max_attempts)
    )
    ORDER BY next_attempt_at, created_at
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  UPDATE public.communication_queue AS q
  SET status = 'processing', attempt_count = q.attempt_count + 1,
      last_attempt_at = now(), error_message = NULL
  WHERE q.id = (SELECT id FROM candidate)
  RETURNING q.*;
END;
$$;
REVOKE ALL ON FUNCTION public.schoolos_claim_communication_queue() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schoolos_claim_communication_queue() TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;