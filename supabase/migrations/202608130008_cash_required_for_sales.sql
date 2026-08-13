-- Cada vendedor abre y cierra su propia caja antes de operar ventas.
create unique index if not exists cash_sessions_one_open_per_user_location_idx
on public.cash_sessions (location_id, opened_by)
where closed_at is null;

-- Solo el superadministrador puede modificar roles o permisos de usuarios.
create or replace function public.thor_is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.app_users
    where auth_user_id = auth.uid() and role = 'superadmin' and active = true
  );
$$;

grant execute on function public.thor_is_superadmin() to authenticated;

drop policy if exists "thor admins manage users" on public.app_users;
create policy "thor superadmins manage users"
on public.app_users for all to authenticated
using (public.thor_is_superadmin())
with check (public.thor_is_superadmin());

create policy "thor members open own cash"
on public.cash_sessions for insert to authenticated
with check (
  public.thor_is_member()
  and opened_by = (select id from public.app_users where auth_user_id = auth.uid() and active = true)
);

create policy "thor members close own cash"
on public.cash_sessions for update to authenticated
using (
  opened_by = (select id from public.app_users where auth_user_id = auth.uid() and active = true)
  and closed_at is null
)
with check (
  opened_by = (select id from public.app_users where auth_user_id = auth.uid() and active = true)
);

create or replace function public.complete_sale(
  p_location_id uuid,
  p_seller_id uuid,
  p_customer_name text,
  p_customer_dni text,
  p_customer_phone text,
  p_customer_address text,
  p_lines jsonb,
  p_payments jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale_id uuid;
  v_sale_code text := 'V-' || to_char(now(), 'YYYYMMDDHH24MISS') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 5));
  v_line jsonb;
  v_payment jsonb;
  v_product_id uuid;
  v_inventory_item_id uuid;
  v_quantity integer;
  v_price numeric(12,2);
  v_cost numeric(12,2);
  v_total numeric(12,2) := 0;
  v_paid numeric(12,2) := 0;
  v_inventory record;
  v_balance record;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión para confirmar una venta.';
  end if;

  if not exists (
    select 1 from public.app_users
    where id = p_seller_id
      and auth_user_id = auth.uid()
      and active = true
      and (location_id = p_location_id or role in ('admin', 'superadmin'))
  ) then
    raise exception 'No tienes autorización para vender en esta sede.';
  end if;

  if not exists (
    select 1 from public.cash_sessions
    where location_id = p_location_id and opened_by = p_seller_id and closed_at is null
  ) then
    raise exception 'Debes abrir tu caja antes de confirmar una venta.';
  end if;

  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'La venta debe tener al menos un producto.';
  end if;
  if jsonb_typeof(p_payments) <> 'array' or jsonb_array_length(p_payments) = 0 then
    raise exception 'La venta debe tener al menos un pago.';
  end if;

  insert into public.sales (
    code, location_id, seller_id, customer_name, customer_dni, customer_phone, customer_address, status, total
  ) values (
    v_sale_code, p_location_id, p_seller_id, coalesce(nullif(trim(p_customer_name), ''), 'Cliente General'),
    nullif(trim(p_customer_dni), ''), nullif(trim(p_customer_phone), ''), nullif(trim(p_customer_address), ''), 'draft', 0
  ) returning id into v_sale_id;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    v_product_id := (v_line ->> 'product_id')::uuid;
    v_inventory_item_id := nullif(v_line ->> 'inventory_item_id', '')::uuid;
    v_quantity := coalesce((v_line ->> 'quantity')::integer, 0);
    if v_quantity <= 0 then raise exception 'La cantidad debe ser mayor que cero.'; end if;
    select price into v_price from public.product_prices
      where product_id = v_product_id and location_id = p_location_id and active = true
      order by created_at desc limit 1;
    if v_price is null then raise exception 'El producto no tiene un precio activo.'; end if;

    if v_inventory_item_id is not null then
      if v_quantity <> 1 then raise exception 'Un equipo serializado solo puede venderse una vez.'; end if;
      select id, cost into v_inventory from public.inventory_items
        where id = v_inventory_item_id and product_id = v_product_id and location_id = p_location_id and status = 'available'
        for update;
      if not found then raise exception 'El equipo ya no está disponible.'; end if;
      v_cost := v_inventory.cost;
      update public.inventory_items set status = 'sold' where id = v_inventory_item_id;
    else
      select quantity, average_cost into v_balance from public.stock_balances
        where product_id = v_product_id and location_id = p_location_id for update;
      if not found or v_balance.quantity < v_quantity then raise exception 'No hay stock suficiente del accesorio.'; end if;
      v_cost := v_balance.average_cost;
      update public.stock_balances set quantity = quantity - v_quantity where product_id = v_product_id and location_id = p_location_id;
    end if;

    insert into public.sale_lines (sale_id, product_id, inventory_item_id, quantity, unit_price, unit_cost)
      values (v_sale_id, v_product_id, v_inventory_item_id, v_quantity, v_price, v_cost);
    insert into public.stock_movements (product_id, inventory_item_id, from_location_id, quantity, type, reference_code, performed_by)
      values (v_product_id, v_inventory_item_id, p_location_id, v_quantity, 'sale', v_sale_code, p_seller_id);
    v_total := v_total + (v_price * v_quantity);
  end loop;

  for v_payment in select value from jsonb_array_elements(p_payments)
  loop
    if nullif(trim(v_payment ->> 'method'), '') is null or coalesce((v_payment ->> 'amount')::numeric, 0) <= 0 then
      raise exception 'Cada pago debe incluir método y monto mayor que cero.';
    end if;
    insert into public.sale_payments (sale_id, payment_method, amount)
      values (v_sale_id, trim(v_payment ->> 'method'), (v_payment ->> 'amount')::numeric);
    v_paid := v_paid + (v_payment ->> 'amount')::numeric;
  end loop;

  if abs(v_total - v_paid) > 0.01 then
    raise exception 'Los pagos no coinciden con el total de la venta.';
  end if;

  update public.sales set subtotal = v_total, total = v_total, status = 'completed' where id = v_sale_id;
  insert into public.audit_log (actor_id, action, entity_type, entity_id, detail)
    values (p_seller_id, 'sale.completed', 'sale', v_sale_id, jsonb_build_object('code', v_sale_code, 'total', v_total));
  return jsonb_build_object('sale_id', v_sale_id, 'code', v_sale_code, 'total', v_total);
end;
$$;

grant execute on function public.complete_sale(uuid, uuid, text, text, text, text, jsonb, jsonb) to authenticated;
