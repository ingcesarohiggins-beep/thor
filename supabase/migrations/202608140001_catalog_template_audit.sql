-- Cierra el control del catálogo: un mismo modelo no se duplica y cada cambio queda auditado.
-- Se valida con trigger, en vez de un índice único, para que la migración no falle
-- si una base antigua ya contiene modelos repetidos que deben revisarse por separado.
create or replace function public.prevent_duplicate_catalog_template()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.product_catalog_templates template
    where template.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
      and lower(template.brand) = lower(trim(new.brand))
      and lower(template.name) = lower(trim(new.name))
      and template.category = new.category
  ) then
    raise exception 'Ese modelo ya existe en el catálogo. Usa el modelo existente y crea solo su capacidad o potencia.';
  end if;
  return new;
end;
$$;

drop trigger if exists product_catalog_templates_prevent_duplicate on public.product_catalog_templates;
create trigger product_catalog_templates_prevent_duplicate
before insert or update of brand, name, category on public.product_catalog_templates
for each row execute function public.prevent_duplicate_catalog_template();

create or replace function public.audit_catalog_template_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_action text;
  v_row jsonb;
begin
  -- Las cargas iniciales realizadas por SQL no representan una acción de usuario.
  if auth.uid() is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  select id into v_actor_id
  from public.app_users
  where auth_user_id = auth.uid() and active = true;

  if v_actor_id is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    v_action := 'catalog.model_created';
    v_row := to_jsonb(new);
  elsif tg_op = 'UPDATE' then
    v_action := 'catalog.model_updated';
    v_row := to_jsonb(new);
  else
    v_action := 'catalog.model_deleted';
    v_row := to_jsonb(old);
  end if;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, detail)
  values (
    v_actor_id,
    v_action,
    'product_catalog_template',
    (v_row ->> 'id')::uuid,
    jsonb_build_object(
      'brand', v_row ->> 'brand',
      'name', v_row ->> 'name',
      'category', v_row ->> 'category',
      'variants', v_row -> 'variant_options'
    )
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists product_catalog_templates_audit on public.product_catalog_templates;
create trigger product_catalog_templates_audit
after insert or update or delete on public.product_catalog_templates
for each row execute function public.audit_catalog_template_change();
