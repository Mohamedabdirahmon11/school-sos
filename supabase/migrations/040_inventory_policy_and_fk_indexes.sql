-- Part 3: remove overlapping inventory SELECT policies and cover all inventory foreign keys.
BEGIN;

CREATE INDEX IF NOT EXISTS inventory_items_created_by_idx
  ON public.inventory_items (created_by);
CREATE INDEX IF NOT EXISTS inventory_transactions_item_school_idx
  ON public.inventory_transactions (item_id, school_id);
CREATE INDEX IF NOT EXISTS inventory_transactions_performed_by_idx
  ON public.inventory_transactions (performed_by);

-- Keep accountants read-only and give school admins explicit write actions.
-- A FOR ALL policy also grants SELECT, overlapping the dedicated read policy.
DROP POLICY IF EXISTS inventory_items_school_write ON public.inventory_items;
DROP POLICY IF EXISTS inventory_items_school_insert ON public.inventory_items;
DROP POLICY IF EXISTS inventory_items_school_update ON public.inventory_items;
DROP POLICY IF EXISTS inventory_items_school_delete ON public.inventory_items;

DROP POLICY IF EXISTS inventory_items_school_insert ON public.inventory_items;
CREATE POLICY inventory_items_school_insert ON public.inventory_items
  FOR INSERT TO authenticated
  WITH CHECK (
    school_id = private.auth_school_id()
    AND private.auth_user_role() = 'school_admin'
  );

DROP POLICY IF EXISTS inventory_items_school_update ON public.inventory_items;
CREATE POLICY inventory_items_school_update ON public.inventory_items
  FOR UPDATE TO authenticated
  USING (
    school_id = private.auth_school_id()
    AND private.auth_user_role() = 'school_admin'
  )
  WITH CHECK (
    school_id = private.auth_school_id()
    AND private.auth_user_role() = 'school_admin'
  );

DROP POLICY IF EXISTS inventory_items_school_delete ON public.inventory_items;
CREATE POLICY inventory_items_school_delete ON public.inventory_items
  FOR DELETE TO authenticated
  USING (
    school_id = private.auth_school_id()
    AND private.auth_user_role() = 'school_admin'
  );

NOTIFY pgrst, 'reload schema';
COMMIT;
