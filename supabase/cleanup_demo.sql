-- Borra solamente datos de prueba cuyo SKU comience por DEMO-.
-- Ejecutar en la misma consulta después de: set app.thor_cleanup_demo = 'true';
do $$
declare
  v_product_ids uuid[];
  v_sale_ids uuid[];
  v_sale_codes text[];
begin
  if current_setting('app.thor_cleanup_demo', true) is distinct from 'true' then
    raise exception 'Protección activa: este script solo se ejecuta con app.thor_cleanup_demo=true.';
  end if;

  select coalesce(array_agg(id), '{}'::uuid[]) into v_product_ids
  from public.products where sku like 'DEMO-%';
  if cardinality(v_product_ids) = 0 then
    raise notice 'No se encontraron productos de prueba para borrar.';
    return;
  end if;

  -- Nunca elimina una venta que mezcle productos DEMO con productos reales.
  if exists (
    select 1 from public.sales s
    where exists (select 1 from public.sale_lines sl where sl.sale_id = s.id and sl.product_id = any(v_product_ids))
      and exists (select 1 from public.sale_lines sl where sl.sale_id = s.id and sl.product_id <> all(v_product_ids))
  ) then
    raise exception 'Hay una venta mezclada con productos DEMO y reales. Revísala antes de limpiar.';
  end if;

  select coalesce(array_agg(distinct s.id), '{}'::uuid[]), coalesce(array_agg(distinct s.code), '{}'::text[])
  into v_sale_ids, v_sale_codes
  from public.sales s
  where exists (select 1 from public.sale_lines sl where sl.sale_id = s.id and sl.product_id = any(v_product_ids));

  delete from public.return_requests where sale_id = any(v_sale_ids);
  delete from public.audit_log where entity_type = 'sale' and entity_id = any(v_sale_ids);
  delete from public.sale_payments where sale_id = any(v_sale_ids);
  delete from public.sale_lines where sale_id = any(v_sale_ids);
  delete from public.sales where id = any(v_sale_ids);
  delete from public.stock_movements where product_id = any(v_product_ids) or reference_code = any(v_sale_codes);
  delete from public.supplier_claims where inventory_item_id in (select id from public.inventory_items where product_id = any(v_product_ids));
  delete from public.inventory_items where product_id = any(v_product_ids);
  delete from public.product_prices where product_id = any(v_product_ids);
  delete from public.stock_balances where product_id = any(v_product_ids);
  delete from public.products where id = any(v_product_ids);
end;
$$;
