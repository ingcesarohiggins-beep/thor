-- Flujo profesional: cabecera de lote, productos/IMEI y confirmacion final.
alter table public.receipt_lots
  add column if not exists payment_method text,
  add column if not exists freight_amount numeric(12,2) not null default 0 check (freight_amount >= 0),
  add column if not exists freight_payment_method text,
  add column if not exists freight_description text;

alter table public.receipt_lot_lines
  add column if not exists sale_price numeric(12,2) not null default 0 check (sale_price >= 0),
  add column if not exists identifiers jsonb not null default '[]'::jsonb;

create or replace function public.create_purchase_lot(
  p_supplier_id uuid,
  p_location_id uuid,
  p_receipt_number text,
  p_payment_method text,
  p_receipt_photo_path text,
  p_freight_amount numeric,
  p_freight_payment_method text,
  p_freight_description text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_role text;
  v_lot_id uuid;
  v_lot_code text := 'LOT-' || to_char(now(), 'YYYYMMDDHH24MISS') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4));
begin
  select id, role into v_user_id, v_role from public.app_users where auth_user_id = auth.uid() and active = true;
  if v_user_id is null or v_role not in ('admin', 'superadmin') then raise exception 'Solo un Administrador o Superadministrador puede crear lotes.'; end if;
  if not exists (select 1 from public.suppliers where id = p_supplier_id and active = true) then raise exception 'El proveedor seleccionado no está activo.'; end if;
  if not exists (select 1 from public.locations where id = p_location_id and active = true) then raise exception 'El almacén seleccionado no está activo.'; end if;
  if nullif(trim(p_receipt_number), '') is null then raise exception 'Registra el número de factura o guía.'; end if;
  if p_payment_method not in ('cash_box', 'central_cash', 'bank_transfer', 'yape_plin') then raise exception 'Selecciona el pago inmediato de la factura.'; end if;
  if coalesce(p_freight_amount, 0) > 0 and p_freight_payment_method not in ('cash_box', 'central_cash', 'bank_transfer', 'yape_plin') then raise exception 'Selecciona el pago del flete.'; end if;
  if p_payment_method = 'central_cash' or p_freight_payment_method = 'central_cash' then
    if not exists (select 1 from public.locations where id = p_location_id and type = 'central') then
      raise exception 'Para caja central, selecciona primero el Almacén Central.';
    end if;
  end if;

  insert into public.receipt_lots (
    code, supplier_id, location_id, receipt_number, receipt_photo_path, status,
    registered_by, payment_method, freight_amount, freight_payment_method, freight_description
  ) values (
    v_lot_code, p_supplier_id, p_location_id, trim(p_receipt_number), nullif(trim(p_receipt_photo_path), ''), 'pending',
    v_user_id, p_payment_method, coalesce(p_freight_amount, 0), nullif(trim(p_freight_payment_method), ''), nullif(trim(p_freight_description), '')
  ) returning id into v_lot_id;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, detail)
  values (v_user_id, 'purchase.lot_created', 'receipt_lot', v_lot_id, jsonb_build_object('code', v_lot_code, 'receipt_number', trim(p_receipt_number)));
  return jsonb_build_object('lot_id', v_lot_id, 'code', v_lot_code);
end;
$$;

create or replace function public.add_purchase_lot_line(
  p_lot_id uuid,
  p_sku text,
  p_name text,
  p_category text,
  p_quantity integer,
  p_unit_cost numeric,
  p_sale_price numeric,
  p_identifiers jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_role text;
  v_product_id uuid;
  v_count integer;
begin
  select id, role into v_user_id, v_role from public.app_users where auth_user_id = auth.uid() and active = true;
  if v_user_id is null or v_role not in ('admin', 'superadmin') then raise exception 'No tienes permiso para registrar productos.'; end if;
  if not exists (select 1 from public.receipt_lots where id = p_lot_id and status = 'pending') then raise exception 'El lote no está disponible para agregar productos.'; end if;
  p_sku := upper(trim(p_sku)); p_name := trim(p_name); p_category := trim(p_category);
  if p_sku = '' or p_name = '' or p_category not in ('phone', 'laptop', 'tablet', 'accessory') or p_quantity <= 0 or p_unit_cost < 0 or p_sale_price < 0 then
    raise exception 'Revisa SKU, producto, tipo, cantidad, costo y precio.';
  end if;
  if p_category <> 'accessory' then
    select count(*) into v_count from jsonb_array_elements_text(coalesce(p_identifiers, '[]'::jsonb)) value where nullif(trim(value), '') is not null;
    if v_count <> p_quantity then raise exception 'Registra un IMEI o serie por cada equipo.'; end if;
  end if;
  select id into v_product_id from public.products where sku = p_sku;
  if v_product_id is null then
    insert into public.products (sku, name, category, serialised, active) values (p_sku, p_name, p_category, p_category <> 'accessory', true) returning id into v_product_id;
  elsif exists (select 1 from public.products where id = v_product_id and (category <> p_category or serialised <> (p_category <> 'accessory'))) then
    raise exception 'El SKU ya existe con un tipo distinto.';
  end if;
  insert into public.receipt_lot_lines (receipt_lot_id, product_id, quantity, unit_cost, sale_price, identifiers)
  values (p_lot_id, v_product_id, p_quantity, p_unit_cost, p_sale_price, coalesce(p_identifiers, '[]'::jsonb));
  insert into public.audit_log (actor_id, action, entity_type, entity_id, detail)
  values (v_user_id, 'purchase.line_added', 'receipt_lot', p_lot_id, jsonb_build_object('sku', p_sku, 'quantity', p_quantity));
  return v_product_id;
end;
$$;

create or replace function public.confirm_purchase_lot(p_lot_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid; v_role text; v_lot public.receipt_lots%rowtype; v_line record;
  v_total numeric(12,2) := 0; v_cash_session_id uuid; v_freight_cash_session_id uuid;
  v_inventory_id uuid; v_identifier text; v_method text;
begin
  select id, role into v_user_id, v_role from public.app_users where auth_user_id = auth.uid() and active = true;
  if v_user_id is null or v_role not in ('admin', 'superadmin') then raise exception 'No tienes permiso para confirmar compras.'; end if;
  select * into v_lot from public.receipt_lots where id = p_lot_id for update;
  if not found or v_lot.status <> 'pending' then raise exception 'El lote ya fue confirmado o no existe.'; end if;
  if not exists (select 1 from public.receipt_lot_lines where receipt_lot_id = p_lot_id) then raise exception 'Agrega productos antes de confirmar el lote.'; end if;
  if v_lot.payment_method in ('cash_box', 'central_cash') then
    select id into v_cash_session_id from public.cash_sessions where location_id = v_lot.location_id and opened_by = v_user_id and closed_at is null order by opened_at desc limit 1;
    if v_cash_session_id is null then raise exception 'Abre tu caja antes de pagar la factura en efectivo.'; end if;
  end if;
  if v_lot.freight_amount > 0 and v_lot.freight_payment_method in ('cash_box', 'central_cash') then
    v_freight_cash_session_id := v_cash_session_id;
    if v_freight_cash_session_id is null then
      select id into v_freight_cash_session_id from public.cash_sessions where location_id = v_lot.location_id and opened_by = v_user_id and closed_at is null order by opened_at desc limit 1;
      if v_freight_cash_session_id is null then raise exception 'Abre tu caja antes de pagar el flete en efectivo.'; end if;
    end if;
  end if;
  for v_line in select l.*, p.category from public.receipt_lot_lines l join public.products p on p.id = l.product_id where l.receipt_lot_id = p_lot_id
  loop
    update public.product_prices set active = false where product_id = v_line.product_id and location_id = v_lot.location_id and active = true;
    insert into public.product_prices (product_id, location_id, price, changed_by, active) values (v_line.product_id, v_lot.location_id, v_line.sale_price, v_user_id, true);
    if v_line.category = 'accessory' then
      insert into public.stock_balances (product_id, location_id, quantity, average_cost) values (v_line.product_id, v_lot.location_id, v_line.quantity, v_line.unit_cost)
      on conflict (product_id, location_id) do update set average_cost = ((public.stock_balances.quantity * public.stock_balances.average_cost) + (excluded.quantity * excluded.average_cost)) / nullif(public.stock_balances.quantity + excluded.quantity, 0), quantity = public.stock_balances.quantity + excluded.quantity, updated_at = now();
      insert into public.stock_movements (product_id, to_location_id, quantity, type, reference_code, performed_by, note) values (v_line.product_id, v_lot.location_id, v_line.quantity, 'receipt', v_lot.code, v_user_id, v_lot.receipt_number);
    else
      for v_identifier in select trim(value) from jsonb_array_elements_text(v_line.identifiers) value where nullif(trim(value), '') is not null
      loop
        insert into public.inventory_items (code, product_id, receipt_lot_id, location_id, imei_1, serial, cost, status, photo_path)
        values ('REC-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)), v_line.product_id, p_lot_id, v_lot.location_id, case when v_line.category = 'phone' then v_identifier else null end, case when v_line.category = 'phone' then null else v_identifier end, v_line.unit_cost, 'available', coalesce(v_lot.receipt_photo_path, 'system/no-photo')) returning id into v_inventory_id;
        insert into public.stock_movements (product_id, inventory_item_id, to_location_id, quantity, type, reference_code, performed_by, note) values (v_line.product_id, v_inventory_id, v_lot.location_id, 1, 'receipt', v_lot.code, v_user_id, v_lot.receipt_number);
      end loop;
    end if;
    v_total := v_total + (v_line.quantity * v_line.unit_cost);
  end loop;
  update public.receipt_lots set status = 'approved', total_cost = v_total, paid_amount = v_total, approved_by = v_user_id where id = p_lot_id;
  insert into public.supplier_payments (supplier_id, receipt_lot_id, cash_session_id, location_id, amount, payment_method, recorded_by)
  values (v_lot.supplier_id, p_lot_id, v_cash_session_id, v_lot.location_id, v_total, case v_lot.payment_method when 'cash_box' then 'Efectivo - caja de sede' when 'central_cash' then 'Efectivo - caja central' when 'bank_transfer' then 'Transferencia bancaria - tesorería central' else 'Yape/Plin - tesorería central' end, v_user_id);
  if v_cash_session_id is not null then insert into public.expenses (cash_session_id, location_id, recorded_by, category, description, amount, payment_method, expense_date) values (v_cash_session_id, v_lot.location_id, v_user_id, 'Compra a proveedor', 'Pago de factura ' || v_lot.receipt_number || ' · lote ' || v_lot.code, v_total, 'Efectivo', current_date); end if;
  if v_lot.freight_amount > 0 then
    v_method := case v_lot.freight_payment_method when 'cash_box' then 'Efectivo - caja de sede' when 'central_cash' then 'Efectivo - caja central' when 'bank_transfer' then 'Transferencia bancaria - tesorería central' else 'Yape/Plin - tesorería central' end;
    insert into public.expenses (cash_session_id, location_id, recorded_by, category, description, amount, payment_method, expense_date) values (v_freight_cash_session_id, v_lot.location_id, v_user_id, 'Flete de compra', coalesce(nullif(v_lot.freight_description, ''), 'Flete de lote ' || v_lot.code), v_lot.freight_amount, v_method, current_date);
  end if;
  insert into public.audit_log (actor_id, action, entity_type, entity_id, detail) values (v_user_id, 'purchase.confirmed', 'receipt_lot', p_lot_id, jsonb_build_object('code', v_lot.code, 'invoice_total', v_total, 'freight', v_lot.freight_amount));
  return jsonb_build_object('code', v_lot.code, 'invoice_total', v_total, 'freight', v_lot.freight_amount, 'total_outflow', v_total + v_lot.freight_amount);
end;
$$;

grant execute on function public.create_purchase_lot(uuid, uuid, text, text, text, numeric, text, text) to authenticated;
grant execute on function public.add_purchase_lot_line(uuid, text, text, text, integer, numeric, numeric, jsonb) to authenticated;
grant execute on function public.confirm_purchase_lot(uuid) to authenticated;
