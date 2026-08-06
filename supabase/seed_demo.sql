-- Datos de demostración identificados con el prefijo DEMO-.
-- En Supabase SQL Editor, ejecutar primero (en la misma consulta): set app.thor_seed_demo = 'true';
do $$
declare
  v_location uuid;
  v_user uuid;
  v_phone uuid;
  v_accessory uuid;
begin
  if current_setting('app.thor_seed_demo', true) is distinct from 'true' then
    raise exception 'Protección activa: este script solo se ejecuta con app.thor_seed_demo=true.';
  end if;

  select id into v_location from public.locations where name = 'Almacén Central' limit 1;
  select id into v_user from public.app_users where location_id = v_location and active = true order by created_at limit 1;
  if v_location is null or v_user is null then
    raise exception 'Primero crea el superadministrador y el Almacén Central.';
  end if;

  insert into public.products (sku, name, brand, category, serialised, photo_path)
  values ('DEMO-SAM-A56-256', 'Samsung Galaxy A56 256GB', 'Samsung', 'phone', true, 'demo/samsung-a56.jpg')
  on conflict (sku) do update set name = excluded.name, active = true
  returning id into v_phone;
  insert into public.products (sku, name, brand, category, serialised, photo_path)
  values ('DEMO-CARG-25W', 'Cargador rápido 25W', 'THOR', 'accessory', false, 'demo/cargador-25w.jpg')
  on conflict (sku) do update set name = excluded.name, active = true
  returning id into v_accessory;

  insert into public.inventory_items (code, product_id, location_id, imei_1, cost, status, photo_path)
  values ('DEMO-CEL-001', v_phone, v_location, '359999990000001', 830, 'available', 'demo/samsung-a56.jpg')
  on conflict (code) do update set status = 'available', location_id = excluded.location_id, product_id = excluded.product_id;
  insert into public.inventory_items (code, product_id, location_id, imei_1, cost, status, photo_path)
  values ('DEMO-CEL-002', v_phone, v_location, '359999990000002', 830, 'available', 'demo/samsung-a56.jpg')
  on conflict (code) do update set status = 'available', location_id = excluded.location_id, product_id = excluded.product_id;
  insert into public.stock_balances (product_id, location_id, quantity, average_cost)
  values (v_accessory, v_location, 24, 18)
  on conflict (product_id, location_id) do update set quantity = excluded.quantity, average_cost = excluded.average_cost;

  update public.product_prices set active = false where location_id = v_location and product_id in (v_phone, v_accessory) and active;
  insert into public.product_prices (product_id, location_id, price, changed_by, active)
  select v_phone, v_location, 1299.90, v_user, true
  where not exists (select 1 from public.product_prices where product_id = v_phone and location_id = v_location and active);
  insert into public.product_prices (product_id, location_id, price, changed_by, active)
  select v_accessory, v_location, 45.00, v_user, true
  where not exists (select 1 from public.product_prices where product_id = v_accessory and location_id = v_location and active);
end;
$$;
