-- P2: durable notification attempts, delayed retries, and safe worker claims.
BEGIN;
ALTER TABLE public.communication_queue
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 10),
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_message_id varchar(200);
CREATE INDEX IF NOT EXISTS communication_queue_due_idx
  ON public.communication_queue (next_attempt_at, created_at)
  WHERE status = 'queued';
CREATE OR REPLACE FUNCTION public.schoolos_claim_communication_queue()
RETURNS SETOF public.communication_queue
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  WITH candidate AS (
    SELECT id FROM public.communication_queue
    WHERE status = 'queued' AND attempt_count < max_attempts AND next_attempt_at <= now()
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
CREATE OR REPLACE FUNCTION public.schoolos_complete_communication_queue(
  p_id varchar, p_success boolean, p_error_message text DEFAULT NULL,
  p_provider_message_id varchar DEFAULT NULL
) RETURNS public.communication_queue
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  result_row public.communication_queue%ROWTYPE;
BEGIN
  UPDATE public.communication_queue AS q
  SET status = CASE WHEN p_success THEN 'sent'
                    WHEN q.attempt_count >= q.max_attempts THEN 'failed'
                    ELSE 'queued' END,
      sent_at = CASE WHEN p_success THEN now() ELSE q.sent_at END,
      provider_message_id = CASE WHEN p_success THEN p_provider_message_id ELSE q.provider_message_id END,
      error_message = CASE WHEN p_success THEN NULL ELSE left(COALESCE(p_error_message, 'Provider delivery failed.'), 1000) END,
      next_attempt_at = CASE WHEN p_success OR q.attempt_count >= q.max_attempts THEN q.next_attempt_at
        ELSE now() + CASE q.attempt_count
          WHEN 1 THEN interval '1 minute'
          WHEN 2 THEN interval '5 minutes'
          WHEN 3 THEN interval '15 minutes'
          ELSE interval '1 hour' END END
  WHERE q.id = p_id AND q.status = 'processing'
  RETURNING q.* INTO result_row;
  RETURN result_row;
END;
$$;
CREATE OR REPLACE FUNCTION public.schoolos_retry_communication_queue(p_id varchar, p_school_id varchar)
RETURNS public.communication_queue
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  result_row public.communication_queue%ROWTYPE;
BEGIN
  UPDATE public.communication_queue
  SET status = 'queued', attempt_count = 0, next_attempt_at = now(),
      last_attempt_at = NULL, error_message = NULL
  WHERE id = p_id AND school_id = p_school_id AND status = 'failed'
  RETURNING * INTO result_row;
  RETURN result_row;
END;
$$;
REVOKE ALL ON FUNCTION public.schoolos_claim_communication_queue() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.schoolos_complete_communication_queue(varchar,boolean,text,varchar) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.schoolos_retry_communication_queue(varchar,varchar) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schoolos_claim_communication_queue() TO service_role;
GRANT EXECUTE ON FUNCTION public.schoolos_complete_communication_queue(varchar,boolean,text,varchar) TO service_role;
GRANT EXECUTE ON FUNCTION public.schoolos_retry_communication_queue(varchar,varchar) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;