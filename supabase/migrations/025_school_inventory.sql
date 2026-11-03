-- School-scoped inventory register.
BEGIN;
CREATE TABLE IF NOT EXISTS public.inventory_items (
  id VARCHAR(64) PRIMARY KEY,
  school_id VARCHAR(64) NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  asset_tag VARCHAR(80) NOT NULL,
  item_name VARCHAR(255) NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 0 AND 1000000),
  room_location VARCHAR(150) NOT NULL DEFAULT '',
  condition VARCHAR(20) NOT NULL DEFAULT 'good' CHECK (condition IN ('good','fair','poor','damaged')),
  value NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (value BETWEEN 0 AND 1000000000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_items_school_asset_tag
  ON public.inventory_items (school_id, lower(btrim(asset_tag)));
CREATE INDEX IF NOT EXISTS idx_inventory_items_school_created
  ON public.inventory_items (school_id, created_at DESC);
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inventory_items_tenant_scope ON public.inventory_items;
CREATE POLICY inventory_items_tenant_scope ON public.inventory_items
  FOR ALL TO authenticated
  USING (public.auth_user_role() = 'super_admin' OR school_id::text = public.auth_school_id()::text)
  WITH CHECK (public.auth_user_role() = 'super_admin' OR school_id::text = public.auth_school_id()::text);
REVOKE ALL ON public.inventory_items FROM anon;
NOTIFY pgrst, 'reload schema';
COMMIT;
