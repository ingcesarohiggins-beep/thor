-- Impide que un producto de catálogo se cree dos veces con la misma marca, modelo y variante.
create or replace function public.create_catalog_product(p_template_id uuid, p_variant text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid;
  v_role text;
  v_template public.product_catalog_templates%rowtype;
  v_product public.products%rowtype;
  v_sku text;
begin
  select id, role into v_user_id, v_role from public.app_users where auth_user_id = auth.uid() and active = true;
  if v_user_id is null or v_role not in ('admin', 'superadmin') then raise exception 'Solo un Administrador o Superadministrador puede crear productos en el catálogo.'; end if;

  select * into v_template from public.product_catalog_templates where id = p_template_id and active = true;
  if not found then raise exception 'El modelo seleccionado no está disponible.'; end if;
  if not exists (select 1 from jsonb_array_elements_text(v_template.variant_options) value where value = trim(p_variant)) then raise exception 'Selecciona una capacidad o variante válida.'; end if;

  select * into v_product from public.products
  where lower(coalesce(brand, '')) = lower(v_template.brand)
    and lower(name) = lower(v_template.name)
    and lower(coalesce(variant, '')) = lower(trim(p_variant))
    and category = v_template.category
  limit 1;
  if found then
    raise exception 'El producto % · % · % ya existe en el catálogo.', v_template.brand, v_template.name, trim(p_variant);
  end if;

  v_sku := v_template.sku_prefix || '-' || upper(regexp_replace(trim(p_variant), '[^a-zA-Z0-9]+', '', 'g'));
  insert into public.products (sku, name, brand, category, serialised, variant, active)
  values (v_sku, v_template.name, v_template.brand, v_template.category, v_template.category <> 'accessory', trim(p_variant), true)
  returning * into v_product;
  insert into public.audit_log (actor_id, action, entity_type, entity_id, detail)
  values (v_user_id, 'catalog.product_created', 'product', v_product.id, jsonb_build_object('sku', v_product.sku, 'variant', v_product.variant));
  return jsonb_build_object('id', v_product.id, 'sku', v_product.sku, 'name', v_product.name, 'brand', v_product.brand, 'category', v_product.category, 'variant', v_product.variant);
end;
$$;

grant execute on function public.create_catalog_product(uuid, text) to authenticated;
