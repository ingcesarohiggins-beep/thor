-- THOR · REINICIO OPERATIVO PARA ENTREGA
-- Deja vacíos los datos de operación y conserva la configuración base:
--   - Usuarios, roles, contraseñas y fotos de perfil.
--   - Sedes activas.
--   - Plantillas de catálogo (modelos/capacidades disponibles para crear).
--   - Categorías de egreso configurables.
--   - Estructura, permisos, funciones, migraciones y bucket de Storage.
--
-- ELIMINA DE FORMA IRREVERSIBLE:
-- productos creados, precios, stock, IMEI, fotos de equipos, lotes, facturas,
-- pagos a proveedores, ventas, cajas, egresos, clientes, proveedores,
-- transferencias, reclamos, devoluciones, actividad y bitácora.
--
-- PASO OBLIGATORIO: ejecuta esta línea y TODO este archivo en la misma consulta:
--   set app.thor_reset_operational = 'CONFIRMAR_REINICIO_TOTAL';
--
-- No ejecutar sobre una operación real sin exportar un respaldo primero.

do $$
begin
  if current_setting('app.thor_reset_operational', true)
       is distinct from 'CONFIRMAR_REINICIO_TOTAL' then
    raise exception
      'Protección activa. Ejecuta set app.thor_reset_operational = ''CONFIRMAR_REINICIO_TOTAL'' junto con este archivo.';
  end if;

  if not exists (
    select 1 from public.app_users
    where role = 'superadmin' and active = true
  ) then
    raise exception
      'Cancelado: debe existir al menos un Superadministrador activo antes de reiniciar.';
  end if;

  -- Dependencias de ventas, transferencias y stock.
  delete from public.return_requests;
  delete from public.supplier_claims;
  delete from public.transfer_lines;
  delete from public.transfers;
  delete from public.sale_payments;
  delete from public.sale_lines;
  delete from public.sales;
  delete from public.supplier_payments;
  delete from public.expenses;
  delete from public.cash_sessions;
  delete from public.stock_movements;
  delete from public.inventory_items;
  delete from public.receipt_lot_lines;
  delete from public.receipt_lots;
  delete from public.product_prices;
  delete from public.stock_balances;
  delete from public.products;
  delete from public.customers;
  delete from public.suppliers;

  -- La bitácora y la presencia también quedan vacías para iniciar la entrega.
  delete from public.user_activity_sessions;
  delete from public.audit_log;

  -- Solo borra evidencia operativa. Conserva los avatares de usuarios.
  delete from storage.objects
  where bucket_id = 'thor-files'
    and (name like 'inventory/%' or name like 'receipts/%');

  raise notice
    'Reinicio finalizado. Se conservaron usuarios, sedes, plantillas de catálogo y categorías de egreso.';
end;
$$;

-- Verificación: todas estas cantidades deben quedar en 0.
select
  (select count(*) from public.products) as productos,
  (select count(*) from public.inventory_items) as equipos,
  (select count(*) from public.stock_balances where quantity > 0) as saldos_con_stock,
  (select count(*) from public.receipt_lots) as lotes,
  (select count(*) from public.sales) as ventas,
  (select count(*) from public.cash_sessions) as cajas,
  (select count(*) from public.customers) as clientes,
  (select count(*) from public.suppliers) as proveedores;
