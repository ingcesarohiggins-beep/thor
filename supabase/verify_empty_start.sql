-- Verificación posterior al reinicio de entrega.
-- Todos los resultados operativos deben ser 0.
select 'Productos creados' as control, count(*)::text as valor from public.products
union all select 'Equipos con IMEI/serie', count(*)::text from public.inventory_items
union all select 'Stock disponible', coalesce(sum(quantity), 0)::text from public.stock_balances
union all select 'Lotes de compra', count(*)::text from public.receipt_lots
union all select 'Ventas', count(*)::text from public.sales
union all select 'Sesiones de caja', count(*)::text from public.cash_sessions
union all select 'Clientes', count(*)::text from public.customers
union all select 'Proveedores', count(*)::text from public.suppliers
union all select 'Egresos', count(*)::text from public.expenses
union all select 'Pagos a proveedor', count(*)::text from public.supplier_payments
union all select 'Transferencias', count(*)::text from public.transfers
union all select 'Movimientos de stock', count(*)::text from public.stock_movements
order by control;
