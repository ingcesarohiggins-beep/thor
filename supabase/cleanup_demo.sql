-- Limpieza segura del piloto THOR.
-- Elimina productos DEMO y QA, sus movimientos, lotes, ventas, caja y clientes QA.
-- Conserva usuarios, sedes, catalogo comercial normal y proveedores no-QA.
-- Ejecutar en la MISMA consulta despues de:
--   set app.thor_cleanup_demo = 'true';
do $$
declare
  v_product_ids uuid[] := '{}'::uuid[];
  v_lot_ids uuid[] := '{}'::uuid[];
  v_lot_codes text[] := '{}'::text[];
  v_sale_ids uuid[] := '{}'::uuid[];
  v_sale_codes text[] := '{}'::text[];
  v_cash_ids uuid[] := '{}'::uuid[];
  v_item_ids uuid[] := '{}'::uuid[];
  v_transfer_ids uuid[] := '{}'::uuid[];
begin
  if current_setting('app.thor_cleanup_demo', true) is distinct from 'true' then
    raise exception 'Proteccion activa: este script solo se ejecuta con app.thor_cleanup_demo=true.';
  end if;

  -- Productos de prueba: los sembrados por seed_demo y los creados durante QA.
  select coalesce(array_agg(id), '{}'::uuid[]) into v_product_ids
  from public.products
  where sku like 'DEMO-%' or upper(coalesce(brand, '')) = 'QA';

  -- Lotes QA y cualquier lote que contenga un producto de prueba.
  select coalesce(array_agg(distinct l.id), '{}'::uuid[]),
         coalesce(array_agg(distinct l.code), '{}'::text[])
  into v_lot_ids, v_lot_codes
  from public.receipt_lots l
  where l.receipt_number like 'QA-%'
     or exists (
       select 1 from public.receipt_lot_lines ll
       where ll.receipt_lot_id = l.id and ll.product_id = any(v_product_ids)
     );

  -- Nunca toca una venta que mezcle un producto de prueba con uno real.
  if exists (
    select 1
    from public.sales s
    where exists (
      select 1 from public.sale_lines sl
      where sl.sale_id = s.id and sl.product_id = any(v_product_ids)
    )
    and exists (
      select 1 from public.sale_lines sl
      where sl.sale_id = s.id and sl.product_id <> all(v_product_ids)
    )
  ) then
    raise exception 'Hay una venta mezclada con productos de prueba y reales. No se limpiara automaticamente.';
  end if;

  select coalesce(array_agg(distinct s.id), '{}'::uuid[]),
         coalesce(array_agg(distinct s.code), '{}'::text[])
  into v_sale_ids, v_sale_codes
  from public.sales s
  where s.customer_name like 'QA %'
     or exists (
       select 1 from public.sale_lines sl
       where sl.sale_id = s.id and sl.product_id = any(v_product_ids)
     );

  select coalesce(array_agg(id), '{}'::uuid[]) into v_item_ids
  from public.inventory_items
  where product_id = any(v_product_ids) or receipt_lot_id = any(v_lot_ids);

  select coalesce(array_agg(distinct t.id), '{}'::uuid[]) into v_transfer_ids
  from public.transfers t
  where exists (
    select 1 from public.transfer_lines tl
    where tl.transfer_id = t.id
      and (tl.product_id = any(v_product_ids) or tl.inventory_item_id = any(v_item_ids))
  );

  select coalesce(array_agg(distinct c.id), '{}'::uuid[]) into v_cash_ids
  from public.cash_sessions c
  where c.note like 'QA %'
     or c.id in (
       select sp.cash_session_id from public.sale_payments sp
       where sp.sale_id = any(v_sale_ids) and sp.cash_session_id is not null
     )
     or c.id in (
       select pp.cash_session_id from public.supplier_payments pp
       where pp.receipt_lot_id = any(v_lot_ids) and pp.cash_session_id is not null
     );

  -- Dependencias de ventas, caja y stock.
  delete from public.return_requests where sale_id = any(v_sale_ids);
  delete from public.sale_payments where sale_id = any(v_sale_ids);
  delete from public.sale_lines where sale_id = any(v_sale_ids);
  delete from public.sales where id = any(v_sale_ids);

  delete from public.expenses e
  where e.cash_session_id = any(v_cash_ids)
     or e.description like 'QA %'
     or exists (
       select 1 from unnest(v_lot_codes) as lot_code
       where e.description like '%' || lot_code || '%'
     );

  delete from public.supplier_payments where receipt_lot_id = any(v_lot_ids);
  delete from public.supplier_claims
  where receipt_lot_id = any(v_lot_ids) or inventory_item_id = any(v_item_ids);
  delete from public.stock_movements
  where product_id = any(v_product_ids)
     or inventory_item_id = any(v_item_ids)
     or reference_code = any(v_lot_codes)
     or reference_code = any(v_sale_codes);

  delete from public.transfer_lines
  where transfer_id = any(v_transfer_ids)
     or product_id = any(v_product_ids)
     or inventory_item_id = any(v_item_ids);
  delete from public.transfers where id = any(v_transfer_ids);

  delete from public.inventory_items where id = any(v_item_ids);
  delete from public.receipt_lot_lines
  where receipt_lot_id = any(v_lot_ids) or product_id = any(v_product_ids);
  delete from public.receipt_lots where id = any(v_lot_ids);
  delete from public.cash_sessions where id = any(v_cash_ids);

  delete from public.product_prices where product_id = any(v_product_ids);
  delete from public.stock_balances where product_id = any(v_product_ids);
  delete from public.products where id = any(v_product_ids);
  delete from public.product_catalog_templates where upper(brand) = 'QA';

  delete from public.customers
  where name like 'QA %' or dni like '7999999%';
  delete from public.suppliers
  where name like 'QA %' or ruc like '20999999%';

  -- La bitacora no se borra: deja evidencia de que se ejecutaron pruebas y limpieza.
  raise notice 'Limpieza completada. Productos: %, lotes: %, ventas: %, cajas: %.',
    cardinality(v_product_ids), cardinality(v_lot_ids), cardinality(v_sale_ids), cardinality(v_cash_ids);
end;
$$;
