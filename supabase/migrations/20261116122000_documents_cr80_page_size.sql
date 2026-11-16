-- Extend document page presets with the standard CR80 ID card size (85.6 × 54 mm).
ALTER TABLE public.school_documents DROP CONSTRAINT IF EXISTS school_documents_page_size_check;
ALTER TABLE public.school_documents ADD CONSTRAINT school_documents_page_size_check CHECK (page_size IN ('A4','A5','Letter','CR80'));
ALTER TABLE public.school_document_versions DROP CONSTRAINT IF EXISTS school_document_versions_page_size_check;
ALTER TABLE public.school_document_versions ADD CONSTRAINT school_document_versions_page_size_check CHECK (page_size IN ('A4','A5','Letter','CR80'));
NOTIFY pgrst,'reload schema';
