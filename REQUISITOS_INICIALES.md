# THOR — alcance inicial

## Operación

- País y moneda: Perú, soles (PEN).
- Ubicación inicial: **Almacén Central**, que también vende y tiene caja propia. El sistema crecerá a tres tiendas, con un almacén por tienda.
- Roles: superadministrador (ajustes globales y auditoría), administrador (operación completa) y vendedor (una sola sede).
- Vendedores ven precio de venta, no costo ni utilidad. Pueden vender, registrar gastos, solicitar/recibir transferencias y registrar entradas pendientes.

## Inventario y proveedores

- Equipos serializados: celulares, laptops y tablets. Cada uno requiere foto, código interno, marca, modelo, IMEI/serial y QR.
- Accesorios por cantidad: SKU, código de barras si existe y una foto por modelo.
- El IMEI es único. La cámara permite escanear IMEI/códigos.
- Equipos bloqueados para venta: vendidos, reservados, en traslado, en revisión, incidencia o baja.
- Lotes de proveedor sin orden de compra previa: proveedor, documento, foto, productos, costos, seriales/IMEI y pago pendiente. Un administrador aprueba la entrada.
- Reclamos a proveedor conservan motivo, evidencia y resultado.

## Ventas, caja y devoluciones

- Ventas desde la sede autorizada; una venta puede contener celular, cable, cargador y otros artículos.
- Cliente: nombre, DNI, teléfono y dirección opcional; si faltan se usa Cliente General.
- Métodos de pago configurables, inicialmente efectivo, Yape/Plin, transferencia y tarjeta; se permiten pagos combinados.
- Se genera PDF interno numerado con productos, IMEI/seriales y firma en pantalla. No integra SUNAT todavía.
- Todo descuento, anulación, devolución, corrección o baja requiere aprobación administrativa.
- Una devolución pasa a revisión; solo se puede aprobar cambio, devolución de dinero o rechazo. No habrá saldo a favor inicialmente.
- Cada caja maneja apertura, cierre, monto esperado, efectivo contado, diferencia, ventas y gastos. Un vendedor ve solo su caja; administradores ven todas.
- Gastos: fecha, categoría, descripción, monto, medio de pago, foto de comprobante y usuario. Los pagos a proveedores son egresos de caja.

## Transferencias y reportes

- Flujo: solicitud de origen → aprobación → despacho → recepción completa de destino.
- No hay recepción parcial. Ante daño/diferencia queda incidencia en destino y se registra retorno físico al origen.
- Panel: ventas diarias, utilidad, gastos, caja, inventario valorizado por almacén, productos más vendidos, ventas por vendedor y reclamos.
- Costeo: costo real por equipo serializado y costo promedio ponderado para accesorios.

## Tecnología

- Aplicación web instalable y móvil primero, preparada para Android e iPhone.
- Sin conexión se consulta/prepara; ventas y transferencias se confirman al recuperar Internet.
- Base de datos D1, fotos/PDF en R2, respaldo diario y repositorio privado.

## Documentación y manuales

- Cada módulo nuevo debe incluir manuales de funcionamiento específicos para cada tipo de usuario con acceso a él (superadministrador, administrador y vendedor, según corresponda).
- Debe mantenerse un manual general del sistema, actualizado con cada cambio funcional, de interfaz o de permisos que se implemente.
