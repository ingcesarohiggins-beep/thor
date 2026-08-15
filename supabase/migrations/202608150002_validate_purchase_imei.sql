-- Evita IMEI/series repetidos en una misma recepción y da mensajes claros
-- antes de confirmar el lote.
create or replace function public.validate_receipt_lot_identifiers(p_lot_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_duplicate text;
begin
  select id into v_user_id
  from public.app_users
  where auth_user_id = auth.uid() and active = true;
  if v_user_id is null then
    raise exception 'Inicia sesión para validar el lote.';
  end if;

  select identifier into v_duplicate
  from (
    select lower(trim(value)) as identifier
    from public.receipt_lot_lines line
    cross join lateral jsonb_array_elements_text(coalesce(line.identifiers, '[]'::jsonb)) value
    where line.receipt_lot_id = p_lot_id
      and nullif(trim(value), '') is not null
  ) identifiers
  group by identifier
  having count(*) > 1
  limit 1;
  if v_duplicate is not null then
    raise exception 'El IMEI o serie % está repetido dentro de este lote. Corrígelo antes de confirmar.', v_duplicate;
  end if;

  select identifier into v_duplicate
  from (
    select lower(trim(value)) as identifier
    from public.receipt_lot_lines line
    cross join lateral jsonb_array_elements_text(coalesce(line.identifiers, '[]'::jsonb)) value
    where line.receipt_lot_id = p_lot_id
      and nullif(trim(value), '') is not null
  ) identifiers
  join public.inventory_items item
    on lower(coalesce(item.imei_1, item.serial, '')) = identifiers.identifier
  limit 1;
  if v_duplicate is not null then
    raise exception 'El IMEI o serie % ya existe en el inventario. No puede volver a ingresarse.', v_duplicate;
  end if;
end;
$$;

create or replace function public.prevent_duplicate_receipt_lot_identifier()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_duplicate text;
begin
  select lower(trim(value)) into v_duplicate
  from jsonb_array_elements_text(coalesce(new.identifiers, '[]'::jsonb)) value
  where nullif(trim(value), '') is not null
  group by lower(trim(value))
  having count(*) > 1
  limit 1;
  if v_duplicate is not null then
    raise exception 'El IMEI o serie % está repetido en este registro.', v_duplicate;
  end if;

  select lower(trim(value)) into v_duplicate
  from jsonb_array_elements_text(coalesce(new.identifiers, '[]'::jsonb)) value
  join public.receipt_lot_lines existing
    on existing.receipt_lot_id = new.receipt_lot_id
   and existing.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
  cross join lateral jsonb_array_elements_text(coalesce(existing.identifiers, '[]'::jsonb)) saved(value)
  where nullif(trim(value), '') is not null
    and lower(trim(saved.value)) = lower(trim(value))
  limit 1;
  if v_duplicate is not null then
    raise exception 'El IMEI o serie % ya fue agregado a este lote.', v_duplicate;
  end if;
  return new;
end;
$$;

drop trigger if exists receipt_lot_lines_prevent_duplicate_identifier on public.receipt_lot_lines;
create trigger receipt_lot_lines_prevent_duplicate_identifier
before insert or update of identifiers on public.receipt_lot_lines
for each row execute function public.prevent_duplicate_receipt_lot_identifier();

create or replace function public.prevent_duplicate_inventory_identifier()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_identifier text := lower(coalesce(new.imei_1, new.serial, ''));
begin
  if nullif(v_identifier, '') is not null and exists (
    select 1 from public.inventory_items item
    where item.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
      and lower(coalesce(item.imei_1, item.serial, '')) = v_identifier
  ) then
    raise exception 'El IMEI o serie % ya existe en el inventario.', v_identifier;
  end if;
  return new;
end;
$$;

drop trigger if exists inventory_items_prevent_duplicate_identifier on public.inventory_items;
create trigger inventory_items_prevent_duplicate_identifier
before insert or update of imei_1, serial on public.inventory_items
for each row execute function public.prevent_duplicate_inventory_identifier();

grant execute on function public.validate_receipt_lot_identifiers(uuid) to authenticated;
