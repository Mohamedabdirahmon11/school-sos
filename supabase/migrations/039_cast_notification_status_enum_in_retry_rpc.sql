-- CASE expressions resolve to text unless explicitly cast back to the queue enum.
BEGIN;
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
  SET status = (CASE WHEN p_success THEN 'sent'
                     WHEN q.attempt_count >= q.max_attempts THEN 'failed'
                     ELSE 'queued' END)::public.comm_status_enum,
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
REVOKE ALL ON FUNCTION public.schoolos_complete_communication_queue(varchar,boolean,text,varchar) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schoolos_complete_communication_queue(varchar,boolean,text,varchar) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;