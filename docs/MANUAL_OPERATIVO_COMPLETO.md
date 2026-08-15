# THOR · Manual operativo completo

## Roles y permisos

| Rol | Alcance principal |
| --- | --- |
| Superadministrador | Configura sedes, crea administradores y vendedores, consulta actividad/bitácora y controla toda la operación. |
| Administrador | Opera inventario, catálogo, compras, proveedores, clientes, caja y ventas de las sedes disponibles. Crea vendedores, no administradores. |
| Vendedor | Opera únicamente en su sede: abre/cierra su caja, consulta inventario, registra clientes y confirma ventas. |

## Inicio y seguridad

1. Ingresa con correo y contraseña.
2. Si olvidaste la contraseña, usa la opción de recuperación y revisa el correo.
3. Revisa la sede activa antes de operar. Un vendedor no puede cambiarla.
4. Para salir, usa **Salir** en el perfil lateral. La sesión también se cierra
   tras 15 minutos sin actividad.

## Inicio / Dashboard

Muestra ventas del día, gastos, inventario valorizado, resultado operativo y
ventas recientes de la sede activa. Desde aquí se puede ir a una nueva venta.

## Inventario

- Consulta únicamente existencias disponibles de la sede activa.
- Busca por nombre, SKU, modelo, capacidad/GB, código o IMEI.
- En equipos con foto, la tarjeta de venta muestra la foto vinculada a esa
  unidad/IMEI.
- No se ingresan productos desde Inventario: se crean en Catálogo y se reciben
  mediante Compras.

## Catálogo

1. Selecciona la marca/modelo de la lista y luego su capacidad (GB) o potencia
   (W) según corresponda.
2. THOR evita repetir una misma combinación marca + modelo + variante.
3. Si no existe el modelo, usa **Nuevo modelo** antes de intentar recibirlo.
4. El catálogo define referencias; el stock real aparece recién al confirmar un
   lote de compra.

## Compras y lotes

### Crear llegada

1. Selecciona proveedor, factura o guía y origen del pago.
2. Registra flete y su método de pago si corresponde.
3. Adjunta comprobante; las fotos grandes se optimizan antes de subirlas.
4. Crea la cabecera. El lote queda pendiente y no altera stock ni caja todavía.

### Agregar mercadería

- Selecciona una referencia existente del catálogo.
- **Accesorios:** registra cantidad, costo unitario y precio de venta.
- **Equipos:** registra cantidad, costo y precio. Debe existir un IMEI/serie
  único por cada unidad; al subir la cantidad aparecen los campos y las fotos
  correspondientes. El lector con cámara confirma la captura con sonido y
  vibración cuando el navegador lo permite.
- Un IMEI no puede repetirse dentro del lote ni estar registrado previamente.
- Antes de confirmar puedes revisar cada línea, sus IMEI y usar **Quitar** para
  corregirla; luego agrégala nuevamente con los datos correctos.

### Confirmar lote

Al confirmar, THOR valida IMEI, crea el stock, actualiza precios, registra el
pago inmediato al proveedor, registra flete y guarda movimientos. No existe
crédito a proveedor en esta versión.

## Ventas

1. Abre Caja antes de vender.
2. Busca por modelo, GB, SKU, código o IMEI. La búsqueda filtra mientras se
   escribe.
3. Para vender un equipo exacto, pulsa **Escanear IMEI** o escribe el IMEI. La
   coincidencia muestra modelo, capacidad e IMEI; al seleccionarla se añade esa
   unidad exacta a la venta.
4. Selecciona productos por modelo cuando la unidad exacta no sea relevante.
5. Al agregar un celular aparecen sugerencias de cargador/cable. Son opcionales
   y deben agregarse manualmente.
6. Elige Cliente general o un cliente registrado. Nombre, DNI y teléfono se
   pueden completar en la misma venta.
7. Registra uno o varios pagos (efectivo, Yape/Plin, transferencia o tarjeta).
8. Confirma solo si el total pagado coincide exactamente con la venta.

## Caja y egresos

- Cada usuario abre y cierra su propia caja.
- Para abrir, registra el fondo inicial; para cerrar, registra el efectivo
  contado.
- Los egresos requieren categoría, descripción, monto, fecha y método de pago.
- El Superadministrador administra las categorías; desactivarlas no altera
  registros históricos.
- Efectivo de compras desde la sede central requiere la caja abierta de
  Almacén Central. Transferencias/Yape no alteran el efectivo físico de caja.

## Clientes

Registra nombre, DNI, teléfono y dirección. Para ventas simples se usa Cliente
general. Buscar por nombre, DNI o teléfono evita duplicar información.

## Proveedores

Registra razón social, RUC, contacto, teléfono y dirección. El proveedor se
selecciona al crear un lote de compra y queda asociado a su factura/pago.

## Usuarios

- Superadministrador: crea administradores y vendedores, y puede cambiar roles.
- Administrador: crea solo vendedores.
- Cada vendedor debe tener sede asignada antes de iniciar.
- Cada perfil puede incluir foto.

## Supervisión y bitácora

Solo el Superadministrador ve usuarios conectados, tiempo de actividad, última
señal y bitácora. La bitácora registra sesiones, catálogo, lotes, pagos, ventas
y cambios relevantes para auditoría.

## Transferencias entre almacenes

La base está preparada para transferencias con estado pendiente, aprobado, en
tránsito, recibido o incidente. Antes de usar este proceso operativo, verifica
que el módulo visual de transferencias esté publicado para la versión del
cliente; nunca uses una venta para mover mercadería entre sedes.

## Regla de actualización de manuales

Cada módulo nuevo o cambio de permisos debe actualizar:

1. Este manual general.
2. El manual del rol afectado en **Manuales** dentro de THOR.
3. La guía de entrega si cambia la instalación, el inicio o el cierre.
