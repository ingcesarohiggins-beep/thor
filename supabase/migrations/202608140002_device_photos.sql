-- Una foto propia por equipo serializado, separada de la foto de la factura del lote.
alter table public.receipt_lot_lines
  add column if not exists item_photo_paths jsonb not null default '[]'::jsonb;

create or replace function public.add_catalog_product_to_lot(
  p_lot_id uuid,
  p_product_id uuid,
  p_quantity integer,
  p_unit_cost numeric,
  p_sale_price numeric,
  p_identifiers jsonb,
  p_item_photo_paths jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_role text;
  v_product public.products%rowtype;
  v_identifier_count integer;
  v_photo_count integer;
begin
  select id, role into v_user_id, v_role
  from public.app_users
  where auth_user_id = auth.uid() and active = true;

  if v_user_id is null or v_role not in ('admin', 'superadmin') then
    raise exception 'No tienes permiso para registrar productos.';
  end if;
  if not exists (select 1 from public.receipt_lots where id = p_lot_id and status = 'pending') then
    raise exception 'El lote no está disponible para agregar productos.';
  end if;
  select * into v_product from public.products where id = p_product_id and active = true;
  if not found then
    raise exception 'Selecciona un producto activo del catálogo.';
  end if;
  if p_quantity <= 0 or p_unit_cost < 0 or p_sale_price < 0 then
    raise exception 'Revisa cantidad, costo y precio.';
  end if;

  if jsonb_typeof(coalesce(p_item_photo_paths, '[]'::jsonb)) <> 'array' then
    raise exception 'Las fotos de los equipos deben enviarse como una lista.';
  end if;
  if v_product.serialised then
    select count(*) into v_identifier_count
    from jsonb_array_elements_text(coalesce(p_identifiers, '[]'::jsonb)) value
    where nullif(trim(value), '') is not null;
    if v_identifier_count <> p_quantity then
      raise exception 'Registra un IMEI o serie por cada equipo.';
    end if;
    select count(*) into v_photo_count
    from jsonb_array_elements_text(coalesce(p_item_photo_paths, '[]'::jsonb)) value
    where nullif(trim(value), '') is not null;
    if v_photo_count > 0 and v_photo_count <> p_quantity then
      raise exception 'Adjunta una foto por cada equipo serializado.';
    end if;
  end if;

  insert into public.receipt_lot_lines (
    receipt_lot_id, product_id, quantity, unit_cost, sale_price, identifiers, item_photo_paths
  ) values (
    p_lot_id, p_product_id, p_quantity, p_unit_cost, p_sale_price,
    coalesce(p_identifiers, '[]'::jsonb), coalesce(p_item_photo_paths, '[]'::jsonb)
  );

  insert into public.audit_log (actor_id, action, entity_type, entity_id, detail)
  values (
    v_user_id, 'purchase.line_added', 'receipt_lot', p_lot_id,
    jsonb_build_object(
      'sku', v_product.sku,
      'quantity', p_quantity,
      'individual_photos', coalesce(jsonb_array_length(p_item_photo_paths), 0)
    )
  );
  return p_product_id;
end;
$$;

-- Mantiene la compatibilidad de los lotes iniciados antes de publicar la nueva pantalla.
create or replace function public.add_catalog_product_to_lot(
  p_lot_id uuid,
  p_product_id uuid,
  p_quantity integer,
  p_unit_cost numeric,
  p_sale_price numeric,
  p_identifiers jsonb
)
returns uuid
language sql
security definer
set search_path = public
as $$
  select public.add_catalog_product_to_lot(
    p_lot_id, p_product_id, p_quantity, p_unit_cost, p_sale_price,
    p_identifiers, '[]'::jsonb
  );
$$;

create or replace function public.assign_received_item_photo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_photo_path text;
begin
  if new.receipt_lot_id is null then
    return new;
  end if;

  select nullif(trim(line.item_photo_paths ->> ((identifier.ordinality - 1)::integer)), '')
  into v_photo_path
  from public.receipt_lot_lines line
  cross join lateral jsonb_array_elements_text(line.identifiers) with ordinality as identifier(value, ordinality)
  where line.receipt_lot_id = new.receipt_lot_id
    and line.product_id = new.product_id
    and trim(identifier.value) = coalesce(new.imei_1, new.serial)
  limit 1;

  if v_photo_path is not null then
    update public.inventory_items
    set photo_path = v_photo_path, updated_at = now()
    where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists inventory_items_assign_received_photo on public.inventory_items;
create trigger inventory_items_assign_received_photo
after insert on public.inventory_items
for each row execute function public.assign_received_item_photo();

grant execute on function public.add_catalog_product_to_lot(uuid, uuid, integer, numeric, numeric, jsonb, jsonb) to authenticated;
grant execute on function public.add_catalog_product_to_lot(uuid, uuid, integer, numeric, numeric, jsonb) to authenticated;
