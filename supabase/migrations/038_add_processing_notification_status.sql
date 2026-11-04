-- The delivery worker needs an explicit processing lease state while it sends.
ALTER TYPE public.comm_status_enum ADD VALUE IF NOT EXISTS 'processing';