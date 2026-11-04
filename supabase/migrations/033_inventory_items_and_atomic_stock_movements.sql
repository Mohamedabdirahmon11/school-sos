-- P2: introduce tenant-scoped inventory with atomic stock movement history.
BEGIN;
CREATE TABLE IF NOT EXISTS public.inventory_items (
  id varchar(80) PRIMARY KEY,
  school_id varchar(80) NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name varchar(160) NOT NULL,
  sku varchar(80),
  category varchar(100) NOT NULL DEFAULT 'General',
  unit varchar(40) NOT NULL DEFAULT 'unit',
  quantity_on_hand numeric(14,2) NOT NULL DEFAULT 0 CHECK (quantity_on_hand >= 0),
  reorder_level numeric(14,2) NOT NULL DEFAULT 0 CHECK (reorder_level >= 0),
  unit_cost numeric(14,2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  location varchar(160),
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_by varchar(80) REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_items_school_sku_unique UNIQUE (school_id, sku)
);
CREATE INDEX IF NOT EXISTS inventory_items_school_active_idx
  ON public.inventory_items (school_id, is_active, name);
CREATE TABLE IF NOT EXISTS public.inventory_transactions (
  id varchar(80) PRIMARY KEY,
  school_id varchar(80) NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  item_id varchar(80) NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
  transaction_type varchar(20) NOT NULL CHECK (transaction_type IN ('stock_in','stock_out','adjustment')),
  quantity_delta numeric(14,2) NOT NULL CHECK (quantity_delta <> 0),
  quantity_before numeric(14,2) NOT NULL CHECK (quantity_before >= 0),
  quantity_after numeric(14,2) NOT NULL CHECK (quantity_after >= 0),
  unit_cost numeric(14,2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  reference varchar(160),
  note text,
  performed_by varchar(80) REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_transaction_item_school_fk
    FOREIGN KEY (item_id, school_id) REFERENCES public.inventory_items(id, school_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS inventory_transactions_school_created_idx
  ON public.inventory_transactions (school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS inventory_transactions_item_created_idx
  ON public.inventory_transactions (item_id, created_at DESC);
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inventory_items_school_read ON public.inventory_items;
CREATE POLICY inventory_items_school_read ON public.inventory_items
  FOR SELECT TO authenticated
  USING (school_id = private.auth_school_id() AND private.auth_user_role() IN ('school_admin','accountant'));
DROP POLICY IF EXISTS inventory_items_school_write ON public.inventory_items;
CREATE POLICY inventory_items_school_write ON public.inventory_items
  FOR ALL TO authenticated
  USING (school_id = private.auth_school_id() AND private.auth_user_role() = 'school_admin')
  WITH CHECK (school_id = private.auth_school_id() AND private.auth_user_role() = 'school_admin');
DROP POLICY IF EXISTS inventory_transactions_school_read ON public.inventory_transactions;
CREATE POLICY inventory_transactions_school_read ON public.inventory_transactions
  FOR SELECT TO authenticated
  USING (school_id = private.auth_school_id() AND private.auth_user_role() IN ('school_admin','accountant'));
CREATE OR REPLACE FUNCTION public.schoolos_adjust_inventory(
  p_school_id varchar,
  p_item_id varchar,
  p_transaction_type varchar,
  p_quantity numeric,
  p_unit_cost numeric DEFAULT 0,
  p_reference varchar DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_performed_by varchar DEFAULT NULL
) RETURNS public.inventory_transactions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  item_row public.inventory_items%ROWTYPE;
  delta numeric(14,2);
  result_row public.inventory_transactions%ROWTYPE;
BEGIN
  IF p_transaction_type NOT IN ('stock_in','stock_out','adjustment') OR p_quantity IS NULL OR p_quantity = 0 THEN
    RAISE EXCEPTION 'Invalid inventory movement.';
  END IF;
  IF p_transaction_type IN ('stock_in','stock_out') AND p_quantity < 0 THEN
    RAISE EXCEPTION 'Stock-in and stock-out quantities must be positive.';
  END IF;
  IF p_unit_cost IS NULL OR p_unit_cost < 0 THEN RAISE EXCEPTION 'Unit cost cannot be negative.'; END IF;
  SELECT * INTO item_row FROM public.inventory_items
    WHERE id = p_item_id AND school_id = p_school_id AND is_active = true
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inventory item not found.'; END IF;
  delta := CASE WHEN p_transaction_type = 'stock_out' THEN -p_quantity ELSE p_quantity END;
  IF item_row.quantity_on_hand + delta < 0 THEN RAISE EXCEPTION 'Insufficient stock.'; END IF;
  UPDATE public.inventory_items
    SET quantity_on_hand = quantity_on_hand + delta,
        unit_cost = CASE WHEN p_unit_cost > 0 THEN p_unit_cost ELSE unit_cost END,
        updated_at = now()
    WHERE id = p_item_id AND school_id = p_school_id;
  INSERT INTO public.inventory_transactions (
    id, school_id, item_id, transaction_type, quantity_delta,
    quantity_before, quantity_after, unit_cost, reference, note, performed_by
  ) VALUES (
    'itx-' || replace(gen_random_uuid()::text, '-', ''), p_school_id, p_item_id,
    p_transaction_type, delta, item_row.quantity_on_hand,
    item_row.quantity_on_hand + delta, COALESCE(NULLIF(p_unit_cost, 0), item_row.unit_cost),
    NULLIF(p_reference, ''), NULLIF(p_note, ''), p_performed_by
  ) RETURNING * INTO result_row;
  RETURN result_row;
END;
$$;
REVOKE ALL ON FUNCTION public.schoolos_adjust_inventory(varchar,varchar,varchar,numeric,numeric,varchar,text,varchar) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schoolos_adjust_inventory(varchar,varchar,varchar,numeric,numeric,varchar,text,varchar) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;