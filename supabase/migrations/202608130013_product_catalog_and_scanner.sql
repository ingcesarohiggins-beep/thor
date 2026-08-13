-- Catálogo controlado: las referencias se crean antes de recibir un lote.
alter table public.products add column if not exists variant text;

create table if not exists public.product_catalog_templates (
  id uuid primary key default gen_random_uuid(),
  sku_prefix text not null unique,
  brand text not null,
  name text not null,
  category text not null check (category in ('phone', 'laptop', 'tablet', 'accessory')),
  variant_label text not null default 'Variante',
  variant_options jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger product_catalog_templates_updated_at before update on public.product_catalog_templates for each row execute function public.thor_set_updated_at();
alter table public.product_catalog_templates enable row level security;
create policy "thor members read catalog templates" on public.product_catalog_templates for select to authenticated using (public.thor_is_member());
create policy "thor admins manage catalog templates" on public.product_catalog_templates for all to authenticated using (public.thor_is_admin()) with check (public.thor_is_admin());
grant select, insert, update, delete on public.product_catalog_templates to authenticated;

insert into public.product_catalog_templates (sku_prefix, brand, name, category, variant_label, variant_options) values
  ('APL-IP14', 'Apple', 'iPhone 14', 'phone', 'Capacidad', '["128 GB", "256 GB", "512 GB"]'),
  ('APL-IP14P', 'Apple', 'iPhone 14 Plus', 'phone', 'Capacidad', '["128 GB", "256 GB", "512 GB"]'),
  ('APL-IP14PRO', 'Apple', 'iPhone 14 Pro', 'phone', 'Capacidad', '["128 GB", "256 GB", "512 GB", "1 TB"]'),
  ('APL-IP14PM', 'Apple', 'iPhone 14 Pro Max', 'phone', 'Capacidad', '["128 GB", "256 GB", "512 GB", "1 TB"]'),
  ('APL-IP15', 'Apple', 'iPhone 15', 'phone', 'Capacidad', '["128 GB", "256 GB", "512 GB"]'),
  ('APL-IP15P', 'Apple', 'iPhone 15 Plus', 'phone', 'Capacidad', '["128 GB", "256 GB", "512 GB"]'),
  ('APL-IP15PRO', 'Apple', 'iPhone 15 Pro', 'phone', 'Capacidad', '["128 GB", "256 GB", "512 GB", "1 TB"]'),
  ('APL-IP15PM', 'Apple', 'iPhone 15 Pro Max', 'phone', 'Capacidad', '["256 GB", "512 GB", "1 TB"]'),
  ('APL-IP16', 'Apple', 'iPhone 16', 'phone', 'Capacidad', '["128 GB", "256 GB", "512 GB"]'),
  ('APL-IP16P', 'Apple', 'iPhone 16 Plus', 'phone', 'Capacidad', '["128 GB", "256 GB", "512 GB"]'),
  ('APL-IP16PRO', 'Apple', 'iPhone 16 Pro', 'phone', 'Capacidad', '["128 GB", "256 GB", "512 GB", "1 TB"]'),
  ('APL-IP16PM', 'Apple', 'iPhone 16 Pro Max', 'phone', 'Capacidad', '["256 GB", "512 GB", "1 TB"]'),
  ('SAM-S24', 'Samsung', 'Galaxy S24', 'phone', 'Capacidad', '["128 GB", "256 GB"]'),
  ('SAM-S24P', 'Samsung', 'Galaxy S24+', 'phone', 'Capacidad', '["256 GB", "512 GB"]'),
  ('SAM-S24U', 'Samsung', 'Galaxy S24 Ultra', 'phone', 'Capacidad', '["256 GB", "512 GB", "1 TB"]'),
  ('SAM-S25', 'Samsung', 'Galaxy S25', 'phone', 'Capacidad', '["128 GB", "256 GB"]'),
  ('SAM-S25P', 'Samsung', 'Galaxy S25+', 'phone', 'Capacidad', '["256 GB", "512 GB"]'),
  ('SAM-S25U', 'Samsung', 'Galaxy S25 Ultra', 'phone', 'Capacidad', '["256 GB", "512 GB", "1 TB"]'),
  ('SAM-S26', 'Samsung', 'Galaxy S26', 'phone', 'Capacidad', '["256 GB", "512 GB"]'),
  ('SAM-S26U', 'Samsung', 'Galaxy S26 Ultra', 'phone', 'Capacidad', '["256 GB", "512 GB", "1 TB"]'),
  ('GEN-CHGUSBC', 'Genérico', 'Cargador USB-C', 'accessory', 'Potencia', '["20 W", "25 W", "30 W", "45 W", "65 W", "100 W", "120 W"]'),
  ('APL-CHGUSBC', 'Apple', 'Adaptador USB-C', 'accessory', 'Potencia', '["20 W", "30 W", "35 W", "70 W", "96 W", "140 W"]')
on conflict (sku_prefix) do update set brand = excluded.brand, name = excluded.name, category = excluded.category, variant_label = excluded.variant_label, variant_options = excluded.variant_options, active = true;

create or replace function public.create_catalog_product(p_template_id uuid, p_variant text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user_id uuid; v_role text; v_template public.product_catalog_templates%rowtype; v_product public.products%rowtype; v_sku text;
begin
  select id, role into v_user_id, v_role from public.app_users where auth_user_id = auth.uid() and active = true;
  if v_user_id is null or v_role not in ('admin', 'superadmin') then raise exception 'Solo un Administrador o Superadministrador puede crear referencias de catálogo.'; end if;
  select * into v_template from public.product_catalog_templates where id = p_template_id and active = true;
  if not found then raise exception 'La referencia del catálogo no está disponible.'; end if;
  if not exists (select 1 from jsonb_array_elements_text(v_template.variant_options) value where value = trim(p_variant)) then raise exception 'Selecciona una variante válida para esta referencia.'; end if;
  v_sku := v_template.sku_prefix || '-' || upper(regexp_replace(trim(p_variant), '[^a-zA-Z0-9]+', '', 'g'));
  insert into public.products (sku, name, brand, category, serialised, variant, active)
  values (v_sku, v_template.name, v_template.brand, v_template.category, v_template.category <> 'accessory', trim(p_variant), true)
  on conflict (sku) do update set active = true
  returning * into v_product;
  insert into public.audit_log (actor_id, action, entity_type, entity_id, detail) values (v_user_id, 'catalog.product_created', 'product', v_product.id, jsonb_build_object('sku', v_product.sku, 'variant', v_product.variant));
  return jsonb_build_object('id', v_product.id, 'sku', v_product.sku, 'name', v_product.name, 'brand', v_product.brand, 'category', v_product.category, 'variant', v_product.variant);
end;
$$;

create or replace function public.add_catalog_product_to_lot(p_lot_id uuid, p_product_id uuid, p_quantity integer, p_unit_cost numeric, p_sale_price numeric, p_identifiers jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_user_id uuid; v_role text; v_product public.products%rowtype; v_count integer;
begin
  select id, role into v_user_id, v_role from public.app_users where auth_user_id = auth.uid() and active = true;
  if v_user_id is null or v_role not in ('admin', 'superadmin') then raise exception 'No tienes permiso para registrar productos.'; end if;
  if not exists (select 1 from public.receipt_lots where id = p_lot_id and status = 'pending') then raise exception 'El lote no está disponible para agregar productos.'; end if;
  select * into v_product from public.products where id = p_product_id and active = true;
  if not found then raise exception 'Selecciona una referencia activa del catálogo.'; end if;
  if p_quantity <= 0 or p_unit_cost < 0 or p_sale_price < 0 then raise exception 'Revisa cantidad, costo y precio.'; end if;
  if v_product.serialised then
    select count(*) into v_count from jsonb_array_elements_text(coalesce(p_identifiers, '[]'::jsonb)) value where nullif(trim(value), '') is not null;
    if v_count <> p_quantity then raise exception 'Registra un IMEI o serie por cada equipo.'; end if;
  end if;
  insert into public.receipt_lot_lines (receipt_lot_id, product_id, quantity, unit_cost, sale_price, identifiers) values (p_lot_id, p_product_id, p_quantity, p_unit_cost, p_sale_price, coalesce(p_identifiers, '[]'::jsonb));
  insert into public.audit_log (actor_id, action, entity_type, entity_id, detail) values (v_user_id, 'purchase.line_added', 'receipt_lot', p_lot_id, jsonb_build_object('sku', v_product.sku, 'quantity', p_quantity));
  return p_product_id;
end;
$$;

grant execute on function public.create_catalog_product(uuid, text) to authenticated;
grant execute on function public.add_catalog_product_to_lot(uuid, uuid, integer, numeric, numeric, jsonb) to authenticated;
