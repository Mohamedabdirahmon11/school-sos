-- Add opaque verification identity to each school document.
-- Additive only; no existing document content is rewritten.
ALTER TABLE public.school_documents
  ADD COLUMN IF NOT EXISTS serial_number VARCHAR(40),
  ADD COLUMN IF NOT EXISTS verification_token UUID NOT NULL DEFAULT gen_random_uuid();
UPDATE public.school_documents
SET serial_number='DOC-'||to_char(created_at AT TIME ZONE 'UTC','YYYY')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10))
WHERE serial_number IS NULL;
ALTER TABLE public.school_documents ALTER COLUMN serial_number SET NOT NULL;
ALTER TABLE public.school_documents ALTER COLUMN serial_number SET DEFAULT ('DOC-'||to_char(now() AT TIME ZONE 'UTC','YYYY')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)));
CREATE UNIQUE INDEX IF NOT EXISTS uq_school_documents_serial_number ON public.school_documents(serial_number);
CREATE UNIQUE INDEX IF NOT EXISTS uq_school_documents_verification_token ON public.school_documents(verification_token);
CREATE INDEX IF NOT EXISTS idx_school_documents_verification_status ON public.school_documents(verification_token,status,deleted_at);
NOTIFY pgrst,'reload schema';
