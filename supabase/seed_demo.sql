-- Catálogo completo de demostración. Todos los SKU y códigos comienzan por DEMO-.
-- En Supabase SQL Editor, ejecuta primero (en la misma consulta): set app.thor_seed_demo = 'true';
-- Es seguro volver a ejecutarlo: restablece las existencias DEMO a disponibles.
do $$
declare
  v_location uuid;
  v_user uuid;
  v_product_id uuid;
  v_model record;
  v_accessory record;
  v_unit integer;
begin
  if current_setting('app.thor_seed_demo', true) is distinct from 'true' then
    raise exception 'Protección activa: este script solo se ejecuta con app.thor_seed_demo=true.';
  end if;

  select id into v_location from public.locations where name = 'Almacén Central' limit 1;
  select id into v_user from public.app_users where location_id = v_location and active = true order by created_at limit 1;
  if v_location is null or v_user is null then
    raise exception 'Primero crea el superadministrador y el Almacén Central.';
  end if;

  -- iPhone 14 en adelante y Galaxy S24 en adelante. Cada equipo tiene entre 3 y 6 unidades.
  for v_model in
    select * from (values
      (1,  'DEMO-APL-IP14',       'iPhone 14',                 'Apple',   2200::numeric, 2799::numeric, 3),
      (2,  'DEMO-APL-IP14-PLUS',  'iPhone 14 Plus',            'Apple',   2500::numeric, 3199::numeric, 3),
      (3,  'DEMO-APL-IP14-PRO',   'iPhone 14 Pro',             'Apple',   2900::numeric, 3699::numeric, 4),
      (4,  'DEMO-APL-IP14-PMAX',  'iPhone 14 Pro Max',         'Apple',   3300::numeric, 4199::numeric, 4),
      (5,  'DEMO-APL-IP15',       'iPhone 15',                 'Apple',   2600::numeric, 3299::numeric, 3),
      (6,  'DEMO-APL-IP15-PLUS',  'iPhone 15 Plus',            'Apple',   2900::numeric, 3699::numeric, 3),
      (7,  'DEMO-APL-IP15-PRO',   'iPhone 15 Pro',             'Apple',   3500::numeric, 4499::numeric, 4),
      (8,  'DEMO-APL-IP15-PMAX',  'iPhone 15 Pro Max',         'Apple',   3900::numeric, 4999::numeric, 4),
      (9,  'DEMO-APL-IP16',       'iPhone 16',                 'Apple',   3000::numeric, 3799::numeric, 3),
      (10, 'DEMO-APL-IP16-PLUS',  'iPhone 16 Plus',            'Apple',   3300::numeric, 4199::numeric, 3),
      (11, 'DEMO-APL-IP16-PRO',   'iPhone 16 Pro',             'Apple',   4100::numeric, 5199::numeric, 4),
      (12, 'DEMO-APL-IP16-PMAX',  'iPhone 16 Pro Max',         'Apple',   4600::numeric, 5799::numeric, 5),
      (13, 'DEMO-APL-IP16E',      'iPhone 16e',                'Apple',   2300::numeric, 2999::numeric, 3),
      (14, 'DEMO-APL-IP17',       'iPhone 17',                 'Apple',   3400::numeric, 4299::numeric, 3),
      (15, 'DEMO-APL-IP17-AIR',   'iPhone Air',                'Apple',   3900::numeric, 4899::numeric, 3),
      (16, 'DEMO-APL-IP17-PRO',   'iPhone 17 Pro',             'Apple',   4800::numeric, 5999::numeric, 4),
      (17, 'DEMO-APL-IP17-PMAX',  'iPhone 17 Pro Max',         'Apple',   5300::numeric, 6699::numeric, 5),
      (18, 'DEMO-APL-IP17E',      'iPhone 17e',                'Apple',   2700::numeric, 3499::numeric, 3),
      (19, 'DEMO-SAM-S24',        'Samsung Galaxy S24',        'Samsung', 2200::numeric, 2899::numeric, 3),
      (20, 'DEMO-SAM-S24-PLUS',   'Samsung Galaxy S24+',       'Samsung', 2700::numeric, 3499::numeric, 3),
      (21, 'DEMO-SAM-S24-ULTRA',  'Samsung Galaxy S24 Ultra',  'Samsung', 3600::numeric, 4599::numeric, 5),
      (22, 'DEMO-SAM-S24-FE',     'Samsung Galaxy S24 FE',     'Samsung', 1900::numeric, 2499::numeric, 3),
      (23, 'DEMO-SAM-S25',        'Samsung Galaxy S25',        'Samsung', 2900::numeric, 3699::numeric, 3),
      (24, 'DEMO-SAM-S25-PLUS',   'Samsung Galaxy S25+',       'Samsung', 3400::numeric, 4299::numeric, 3),
      (25, 'DEMO-SAM-S25-ULTRA',  'Samsung Galaxy S25 Ultra',  'Samsung', 4400::numeric, 5599::numeric, 5),
      (26, 'DEMO-SAM-S25-EDGE',   'Samsung Galaxy S25 Edge',   'Samsung', 3700::numeric, 4699::numeric, 3),
      (27, 'DEMO-SAM-S25-FE',     'Samsung Galaxy S25 FE',     'Samsung', 2500::numeric, 3199::numeric, 3),
      (28, 'DEMO-SAM-S26',        'Samsung Galaxy S26',        'Samsung', 3500::numeric, 4399::numeric, 3),
      (29, 'DEMO-SAM-S26-PLUS',   'Samsung Galaxy S26+',       'Samsung', 4100::numeric, 5099::numeric, 3),
      (30, 'DEMO-SAM-S26-ULTRA',  'Samsung Galaxy S26 Ultra',  'Samsung', 5200::numeric, 6599::numeric, 6)
    ) as models(seq, sku, name, brand, cost, price, quantity)
  loop
    insert into public.products (sku, name, brand, category, serialised, photo_path)
    values (v_model.sku, v_model.name, v_model.brand, 'phone', true, 'demo/' || lower(v_model.sku) || '.jpg')
    on conflict (sku) do update set name = excluded.name, brand = excluded.brand, active = true
    returning id into v_product_id;

    for v_unit in 1..v_model.quantity loop
      insert into public.inventory_items (code, product_id, location_id, imei_1, cost, status, photo_path)
      values (
        format('DEMO-CEL-%s-%s', lpad(v_model.seq::text, 2, '0'), lpad(v_unit::text, 2, '0')),
        v_product_id,
        v_location,
        '35' || lpad((v_model.seq * 100 + v_unit)::text, 13, '0'),
        v_model.cost,
        'available',
        'demo/' || lower(v_model.sku) || '.jpg'
      )
      on conflict (code) do update set
        product_id = excluded.product_id,
        location_id = excluded.location_id,
        cost = excluded.cost,
        status = 'available';
    end loop;

    update public.product_prices set active = false
    where location_id = v_location and product_id = v_product_id and active;
    insert into public.product_prices (product_id, location_id, price, changed_by, active)
    values (v_product_id, v_location, v_model.price, v_user, true);
  end loop;

  -- Cargadores y accesorios Apple de prueba. Son stock no serializado para probar ventas por cantidad.
  for v_accessory in
    select * from (values
      ('DEMO-CHG-5W',       'Cargador USB 5W',                    'THOR',  8::numeric,  19::numeric, 20),
      ('DEMO-CHG-12W',      'Cargador USB 12W',                   'THOR', 10::numeric,  29::numeric, 20),
      ('DEMO-CHG-18W',      'Cargador USB-C 18W',                 'THOR', 13::numeric,  39::numeric, 18),
      ('DEMO-CHG-20W',      'Cargador USB-C 20W',                 'THOR', 16::numeric,  49::numeric, 25),
      ('DEMO-CHG-25W',      'Cargador USB-C 25W',                 'THOR', 18::numeric,  55::numeric, 24),
      ('DEMO-CHG-30W',      'Cargador USB-C 30W',                 'THOR', 22::numeric,  69::numeric, 18),
      ('DEMO-CHG-35W',      'Cargador USB-C 35W',                 'THOR', 27::numeric,  79::numeric, 16),
      ('DEMO-CHG-45W',      'Cargador USB-C 45W',                 'THOR', 32::numeric,  95::numeric, 16),
      ('DEMO-CHG-65W',      'Cargador USB-C 65W',                 'THOR', 45::numeric, 129::numeric, 14),
      ('DEMO-CHG-100W',     'Cargador USB-C 100W',                'THOR', 65::numeric, 179::numeric, 12),
      ('DEMO-CHG-120W',     'Cargador USB-C 120W',                'THOR', 78::numeric, 219::numeric, 10),
      ('DEMO-APL-CHG-20W',  'Apple adaptador USB-C 20W',          'Apple', 70::numeric, 109::numeric, 15),
      ('DEMO-APL-CHG-30W',  'Apple adaptador USB-C 30W',          'Apple', 110::numeric, 159::numeric, 12),
      ('DEMO-APL-CHG-35W',  'Apple adaptador USB-C doble 35W',    'Apple', 140::numeric, 199::numeric, 10),
      ('DEMO-APL-CHG-70W',  'Apple adaptador USB-C 70W',          'Apple', 220::numeric, 299::numeric, 8),
      ('DEMO-APL-CHG-96W',  'Apple adaptador USB-C 96W',          'Apple', 290::numeric, 399::numeric, 6),
      ('DEMO-APL-CHG-140W', 'Apple adaptador USB-C 140W',         'Apple', 380::numeric, 529::numeric, 5),
      ('DEMO-APL-AIRPODS4', 'Apple AirPods 4',                    'Apple', 360::numeric, 549::numeric, 10),
      ('DEMO-APL-APPRO3',   'Apple AirPods Pro 3',                'Apple', 700::numeric, 999::numeric, 8)
    ) as accessories(sku, name, brand, cost, price, quantity)
  loop
    insert into public.products (sku, name, brand, category, serialised, photo_path)
    values (v_accessory.sku, v_accessory.name, v_accessory.brand, 'accessory', false, 'demo/' || lower(v_accessory.sku) || '.jpg')
    on conflict (sku) do update set name = excluded.name, brand = excluded.brand, active = true
    returning id into v_product_id;

    insert into public.stock_balances (product_id, location_id, quantity, average_cost)
    values (v_product_id, v_location, v_accessory.quantity, v_accessory.cost)
    on conflict (product_id, location_id) do update set
      quantity = excluded.quantity,
      average_cost = excluded.average_cost;

    update public.product_prices set active = false
    where location_id = v_location and product_id = v_product_id and active;
    insert into public.product_prices (product_id, location_id, price, changed_by, active)
    values (v_product_id, v_location, v_accessory.price, v_user, true);
  end loop;
end;
$$;
