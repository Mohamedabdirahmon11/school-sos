-- Shared subject catalog with school-owned selections. Existing school subjects
-- and all historical subject references remain unchanged.
BEGIN;

CREATE TABLE IF NOT EXISTS public.subject_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(150) NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 150),
  code varchar(6) NOT NULL CHECK (code = upper(btrim(code)) AND char_length(code) BETWEEN 1 AND 6),
  description text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS subject_catalog_name_ci_uidx
  ON public.subject_catalog (lower(btrim(name)));
CREATE UNIQUE INDEX IF NOT EXISTS subject_catalog_code_ci_uidx
  ON public.subject_catalog (upper(btrim(code)));
CREATE INDEX IF NOT EXISTS subject_catalog_active_order_idx
  ON public.subject_catalog (is_active, sort_order, name);

ALTER TABLE public.subjects
  ADD COLUMN IF NOT EXISTS catalog_subject_id uuid;
ALTER TABLE public.subjects
  DROP CONSTRAINT IF EXISTS subjects_catalog_subject_id_fkey;
ALTER TABLE public.subjects
  ADD CONSTRAINT subjects_catalog_subject_id_fkey
  FOREIGN KEY (catalog_subject_id) REFERENCES public.subject_catalog(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS subjects_school_catalog_subject_uidx
  ON public.subjects (school_id, catalog_subject_id)
  WHERE catalog_subject_id IS NOT NULL;

INSERT INTO public.subject_catalog (name, code, description, sort_order)
VALUES
  ('Mathematics','MATH','Mathematics and numeracy',10),
  ('English','ENG','English language',20),
  ('Amharic','AMH','Amharic language',30),
  ('Afaan Oromo','ORO','Afaan Oromo language',40),
  ('Somali','SOM','Somali language',50),
  ('Biology','BIO','Biology and life sciences',60),
  ('Chemistry','CHEM','Chemistry',70),
  ('Physics','PHYS','Physics',80),
  ('Geography','GEO','Geography',90),
  ('History','HIST','History',100),
  ('Civics','CIV','Civics and citizenship education',110),
  ('ICT','ICT','Information and communication technology',120),
  ('Economics','ECON','Economics',130),
  ('Agriculture','AGRI','Agricultural education',140),
  ('Environmental Science','ENV','Environmental science',150),
  ('Physical Education','PE','Physical and health education',160),
  ('Art','ART','Visual and creative arts',170),
  ('Business','BUS','Business education',180)
ON CONFLICT DO NOTHING;

ALTER TABLE public.subject_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subject_catalog FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS subject_catalog_authenticated_read ON public.subject_catalog;
CREATE POLICY subject_catalog_authenticated_read
  ON public.subject_catalog FOR SELECT TO authenticated
  USING (is_active OR private.auth_user_role() = 'super_admin');
GRANT SELECT ON public.subject_catalog TO authenticated;
GRANT ALL ON public.subject_catalog TO service_role;

CREATE OR REPLACE FUNCTION public.schoolos_select_subject_catalog(
  p_school_id text, p_catalog_ids uuid[]
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_item record;
  v_existing_id varchar(64);
  v_existing_catalog_id uuid;
  v_code varchar(6);
  v_created integer := 0;
  v_linked integer := 0;
  v_skipped integer := 0;
  v_rows integer;
BEGIN
  IF p_school_id IS NULL OR btrim(p_school_id) = '' OR p_catalog_ids IS NULL
     OR cardinality(p_catalog_ids) = 0 OR cardinality(p_catalog_ids) > 100 THEN
    RAISE EXCEPTION 'Select between 1 and 100 catalog subjects.';
  END IF;
  PERFORM 1 FROM public.schools WHERE id = p_school_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'School not found.'; END IF;

  FOR v_item IN
    SELECT id, name, code, description
      FROM public.subject_catalog
     WHERE id = ANY(p_catalog_ids) AND is_active = true
     ORDER BY sort_order, name
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.subjects
       WHERE school_id = p_school_id AND catalog_subject_id = v_item.id
    ) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    SELECT id, catalog_subject_id INTO v_existing_id, v_existing_catalog_id
      FROM public.subjects
     WHERE school_id = p_school_id AND lower(btrim(name)) = lower(btrim(v_item.name))
     LIMIT 1 FOR UPDATE;

    IF FOUND THEN
      IF v_existing_catalog_id IS NULL THEN
        v_code := v_item.code;
        IF EXISTS (SELECT 1 FROM public.subjects
                    WHERE school_id=p_school_id AND lower(btrim(code))=lower(btrim(v_code))
                      AND id <> v_existing_id) THEN
          v_code := '';
        END IF;
        UPDATE public.subjects
           SET catalog_subject_id = v_item.id,
               code = CASE WHEN NULLIF(btrim(code), '') IS NULL THEN v_code ELSE code END,
               description = COALESCE(NULLIF(description, ''), v_item.description)
         WHERE id = v_existing_id AND school_id = p_school_id;
        v_linked := v_linked + 1;
      ELSE
        v_skipped := v_skipped + 1;
      END IF;
      CONTINUE;
    END IF;

    v_code := v_item.code;
    IF EXISTS (SELECT 1 FROM public.subjects
                WHERE school_id=p_school_id AND lower(btrim(code))=lower(btrim(v_code))) THEN
      v_code := '';
    END IF;
    INSERT INTO public.subjects (
      id, school_id, name, code, credit_units, department,
      assigned_teacher_ids, description, catalog_subject_id
    ) VALUES (
      'sub-' || gen_random_uuid()::text, p_school_id, v_item.name, v_code, 0, NULL,
      ARRAY[]::text[], v_item.description, v_item.id
    );
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 1 THEN v_created := v_created + 1; END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'createdCount', v_created,
    'linkedCount', v_linked,
    'skippedCount', v_skipped
  );
END;
$$;
REVOKE ALL ON FUNCTION public.schoolos_select_subject_catalog(text, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schoolos_select_subject_catalog(text, uuid[]) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
