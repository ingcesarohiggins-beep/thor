-- Recepcion inmediata de compras por lote. No se permite credito a proveedores.
create or replace function public.receive_supplier_lot(
  p_supplier_id uuid,
  p_location_id uuid,
  p_receipt_number text,
  p_payment_method text,
  p_receipt_photo_path text,
  p_lines jsonb
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
  v_line jsonb;
  v_product_id uuid;
  v_inventory_id uuid;
  v_sku text;
  v_name text;
  v_category text;
  v_quantity integer;
  v_cost numeric(12,2);
  v_price numeric(12,2);
  v_total numeric(12,2) := 0;
  v_identifier text;
  v_identifier_count integer;
  v_cash_session_id uuid;
begin
  select id, role into v_user_id, v_role
  from public.app_users
  where auth_user_id = auth.uid() and active = true;

  if v_user_id is null or v_role not in ('admin', 'superadmin') then
    raise exception 'Solo un Administrador o Superadministrador puede registrar compras.';
  end if;
  if not exists (select 1 from public.suppliers where id = p_supplier_id and active = true) then
    raise exception 'El proveedor seleccionado no está activo.';
  end if;
  if not exists (select 1 from public.locations where id = p_location_id and active = true) then
    raise exception 'El almacén seleccionado no está activo.';
  end if;
  if nullif(trim(p_receipt_number), '') is null then
    raise exception 'Registra el número de factura o guía de compra.';
  end if;
  if p_payment_method not in ('cash_box', 'central_cash', 'bank_transfer', 'yape_plin') then
    raise exception 'Selecciona un medio de pago válido. Las compras son de pago inmediato.';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Agrega al menos un producto al lote.';
  end if;
  if p_payment_method = 'central_cash' and not exists (
    select 1 from public.locations where id = p_location_id and type = 'central'
  ) then
    raise exception 'Para usar caja central, selecciona el Almacén Central como destino de la compra.';
  end if;

  if p_payment_method in ('cash_box', 'central_cash') then
    select id into v_cash_session_id
    from public.cash_sessions
    where location_id = p_location_id and opened_by = v_user_id and closed_at is null
    order by opened_at desc limit 1;
    if v_cash_session_id is null then
      raise exception 'Abre tu caja antes de pagar una compra en efectivo.';
    end if;
  end if;

  insert into public.receipt_lots (
    code, supplier_id, location_id, receipt_number, receipt_photo_path,
    status, total_cost, paid_amount, registered_by, approved_by
  ) values (
    v_lot_code, p_supplier_id, p_location_id, trim(p_receipt_number),
    nullif(trim(p_receipt_photo_path), ''), 'approved', 0, 0, v_user_id, v_user_id
  ) returning id into v_lot_id;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    v_sku := upper(trim(v_line ->> 'sku'));
    v_name := trim(v_line ->> 'name');
    v_category := trim(v_line ->> 'category');
    v_quantity := coalesce((v_line ->> 'quantity')::integer, 0);
    v_cost := coalesce((v_line ->> 'unit_cost')::numeric, -1);
    v_price := coalesce((v_line ->> 'sale_price')::numeric, -1);

    if v_sku is null or v_sku = '' or v_name is null or v_name = '' then
      raise exception 'Cada producto necesita SKU y nombre.';
    end if;
    if v_category not in ('phone', 'laptop', 'tablet', 'accessory') then
      raise exception 'Tipo de producto no válido para %.', v_name;
    end if;
    if v_quantity <= 0 or v_cost < 0 or v_price < 0 then
      raise exception 'Revisa cantidad, costo y precio de %.', v_name;
    end if;

    select id into v_product_id from public.products where sku = v_sku;
    if v_product_id is null then
      insert into public.products (sku, name, category, serialised, active)
      values (v_sku, v_name, v_category, v_category <> 'accessory', true)
      returning id into v_product_id;
    elsif exists (
      select 1 from public.products
      where id = v_product_id and (category <> v_category or serialised <> (v_category <> 'accessory'))
    ) then
      raise exception 'El SKU % ya existe con un tipo diferente.', v_sku;
    end if;

    if v_category <> 'accessory' then
      select count(*) into v_identifier_count
      from jsonb_array_elements_text(coalesce(v_line -> 'identifiers', '[]'::jsonb)) value
      where nullif(trim(value), '') is not null;
      if v_identifier_count <> v_quantity then
        raise exception 'Los equipos serializados de % requieren un IMEI o serie por cada unidad.', v_name;
      end if;
    end if;

    insert into public.receipt_lot_lines (receipt_lot_id, product_id, quantity, unit_cost)
    values (v_lot_id, v_product_id, v_quantity, v_cost);

    update public.product_prices
    set active = false
    where product_id = v_product_id and location_id = p_location_id and active = true;
    insert into public.product_prices (product_id, location_id, price, changed_by, active)
    values (v_product_id, p_location_id, v_price, v_user_id, true);

    if v_category = 'accessory' then
      insert into public.stock_balances (product_id, location_id, quantity, average_cost)
      values (v_product_id, p_location_id, v_quantity, v_cost)
      on conflict (product_id, location_id) do update
      set average_cost = (
            (public.stock_balances.quantity * public.stock_balances.average_cost)
            + (excluded.quantity * excluded.average_cost)
          ) / nullif(public.stock_balances.quantity + excluded.quantity, 0),
          quantity = public.stock_balances.quantity + excluded.quantity,
          updated_at = now();
      insert into public.stock_movements (
        product_id, to_location_id, quantity, type, reference_code, performed_by, note
      ) values (
        v_product_id, p_location_id, v_quantity, 'receipt', v_lot_code, v_user_id, trim(p_receipt_number)
      );
    else
      for v_identifier in
        select trim(value) from jsonb_array_elements_text(coalesce(v_line -> 'identifiers', '[]'::jsonb)) value
        where nullif(trim(value), '') is not null
      loop
        insert into public.inventory_items (
          code, product_id, receipt_lot_id, location_id, imei_1, serial, cost, status, photo_path
        ) values (
          'REC-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
          v_product_id, v_lot_id, p_location_id,
          case when v_category = 'phone' then v_identifier else null end,
          case when v_category = 'phone' then null else v_identifier end,
          v_cost, 'available', coalesce(nullif(trim(p_receipt_photo_path), ''), 'system/no-photo')
        ) returning id into v_inventory_id;
        insert into public.stock_movements (
          product_id, inventory_item_id, to_location_id, quantity, type, reference_code, performed_by, note
        ) values (
          v_product_id, v_inventory_id, p_location_id, 1, 'receipt', v_lot_code, v_user_id, trim(p_receipt_number)
        );
      end loop;
    end if;
    v_total := v_total + (v_quantity * v_cost);
  end loop;

  update public.receipt_lots set total_cost = v_total, paid_amount = v_total where id = v_lot_id;
  insert into public.supplier_payments (
    supplier_id, receipt_lot_id, cash_session_id, location_id, amount, payment_method, recorded_by
  ) values (
    p_supplier_id, v_lot_id, v_cash_session_id, p_location_id, v_total,
    case p_payment_method
      when 'cash_box' then 'Efectivo - caja de sede'
      when 'central_cash' then 'Efectivo - caja central'
      when 'bank_transfer' then 'Transferencia bancaria - tesorería central'
      else 'Yape/Plin - tesorería central'
    end,
    v_user_id
  );

  if v_cash_session_id is not null then
    insert into public.expenses (
      cash_session_id, location_id, recorded_by, category, description, amount, payment_method, expense_date
    ) values (
      v_cash_session_id, p_location_id, v_user_id, 'Compra a proveedor',
      'Pago de factura ' || trim(p_receipt_number) || ' · lote ' || v_lot_code,
      v_total, 'Efectivo', current_date
    );
  end if;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, detail)
  values (
    v_user_id, 'purchase.received', 'receipt_lot', v_lot_id,
    jsonb_build_object('code', v_lot_code, 'receipt_number', trim(p_receipt_number), 'total', v_total, 'payment_method', p_payment_method)
  );

  return jsonb_build_object('lot_id', v_lot_id, 'code', v_lot_code, 'total', v_total);
end;
$$;

grant execute on function public.receive_supplier_lot(uuid, uuid, text, text, text, jsonb) to authenticated;
