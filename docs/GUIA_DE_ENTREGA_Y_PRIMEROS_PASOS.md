# THOR · Guía de entrega y primeros pasos

Esta guía deja THOR listo para comenzar una operación real desde cero. No crea
inventario ficticio ni requiere una segunda base de datos.

## 1. Antes de entregar al cliente

1. Confirma que todas las migraciones de `supabase/migrations` fueron ejecutadas
   en orden ascendente.
2. Confirma que la función Edge `create-thor-user` está desplegada.
3. En Supabase > Authentication > URL Configuration agrega la URL pública de
   THOR como Redirect URL para recuperación de contraseña.
4. Verifica que existe el bucket privado `thor-files`.
5. En GitHub > Settings > Pages confirma que la publicación usa GitHub Actions
   y que existen `NEXT_PUBLIC_SUPABASE_URL` y
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` como variables de Actions.
6. Haz un respaldo de la base desde Supabase antes de borrar pruebas.

### Orden de migraciones para una instalación nueva

Ejecuta cada archivo completo en Supabase > SQL Editor en este orden. No vuelvas
a ejecutarlo si ya se aplicó correctamente.

1. `202608040001_initial_thor.sql`
2. `202608040002_github_pages_access.sql`
3. `202608060003_complete_sale.sql`
4. `202608060006_admin_user_management.sql`
5. `202608130007_customers.sql`
6. `202608130008_cash_required_for_sales.sql`
7. `202608130009_user_avatars.sql`
8. `202608130010_superadmin_activity_log.sql`
9. `202608130011_purchase_lots_and_supplier_payments.sql`
10. `202608130012_two_step_purchase_lots_and_freight.sql`
11. `202608130013_product_catalog_and_scanner.sql`
12. `202608130014_prevent_duplicate_catalog_products.sql`
13. `202608140001_catalog_template_audit.sql`
14. `202608140002_device_photos.sql`
15. `202608140003_managed_users_rpc.sql`
16. `202608150001_expense_categories.sql`
17. `202608150002_validate_purchase_imei.sql`
18. `202608150003_manage_pending_purchase_lines.sql`

Después despliega `supabase/functions/create-thor-user/index.ts` como Edge
Function. La función necesita las credenciales seguras administradas por
Supabase; no coloques una `service_role` en la web ni en GitHub.

## 2. Dejar la operación en blanco

Hay dos scripts distintos. Usa solo uno según el objetivo.

| Objetivo | Archivo | Qué borra | Qué conserva |
| --- | --- | --- | --- |
| Terminar una demostración | `supabase/cleanup_demo.sql` | Solo registros `DEMO-` y `QA` | Datos reales, usuarios, sedes y configuración |
| Entrega vacía al cliente | `supabase/reset_operational_data.sql` | Toda la operación: productos, stock, lotes, ventas, caja, clientes y proveedores | Usuarios, sedes, plantillas de catálogo y categorías de egreso |

Para una entrega nueva, abre Supabase > SQL Editor > New query, pega primero la
siguiente línea y debajo todo el contenido de `reset_operational_data.sql`.
Ejecuta ambas partes como una sola consulta:

```sql
set app.thor_reset_operational = 'CONFIRMAR_REINICIO_TOTAL';
```

Al finalizar, ejecuta `supabase/verify_empty_start.sql`. Todos los controles
operativos deben devolver `0`.

> El reinicio es irreversible. No lo ejecutes después de iniciar la operación
> real sin exportar antes una copia de seguridad.

## 3. Orden de configuración inicial

El Superadministrador realiza estos pasos una sola vez:

1. **Ingresar y completar perfil.** Inicia sesión, cambia la foto de perfil si
   corresponde y confirma que aparece la sede activa.
2. **Crear sedes.** Mantén `Almacén Central` para tesorería/almacén central y
   crea cada tienda o almacén que operará ventas.
3. **Crear usuarios.** Crea Gerentes Generales y vendedores. Cada vendedor debe
   quedar asignado a una sede. El Superadministrador es el único que puede crear
   Gerentes Generales.
4. **Revisar categorías de egreso.** En Caja, el Superadministrador puede
   activar, desactivar o crear categorías antes de empezar a registrar gastos.
5. **Crear catálogo.** En Catálogo selecciona un modelo y su capacidad/potencia.
   Si el modelo no existe, usa Nuevo modelo. No se reciben productos que no
   existan primero en el catálogo.
6. **Registrar proveedores.** Guarda razón social, RUC, contacto y teléfono.
7. **Preparar caja.** Cada persona que venderá abre su propia caja con el fondo
   inicial al inicio de su turno.

## 4. Primera compra real

1. El Gerente General elige la sede que recibirá el stock.
2. En **Compras**, crea una llegada: proveedor, número de factura/guía, origen
   del pago, flete y comprobante si lo tiene.
3. Agrega al lote productos ya creados en Catálogo.
4. Para accesorios, ingresa cantidad, costo unitario y precio de venta.
5. Para celulares, laptops o tablets, ingresa una fila por producto con la
   cantidad recibida. THOR muestra un IMEI/serie y una foto por cada unidad.
   Puede capturarse el IMEI con cámara o lector Bluetooth.
6. Revisa el contenido del lote. Mientras esté pendiente puedes quitar una línea
   incorrecta y volver a agregarla.
7. Confirma el lote solo cuando factura, flete, costo, pago e IMEI estén
   revisados. Recién entonces ingresan stock, pago al proveedor y movimientos.

## 5. Primera venta real

1. El vendedor abre su caja; sin caja abierta THOR bloquea la venta.
2. En Ventas busca por modelo, capacidad/GB, código o IMEI. Para una unidad
   exacta usa Escanear IMEI con la cámara o escribe el IMEI y pulsa la
   coincidencia encontrada.
3. Al añadir un equipo, THOR sugiere cargador/cable disponible. Es una sugerencia
   y nunca se agrega sin que el vendedor lo elija.
4. Selecciona un cliente registrado o usa Cliente general. DNI y teléfono son
   opcionales para venta rápida.
5. Registra uno o varios medios de pago. El total pagado debe coincidir con el
   total de la venta.
6. Confirma la venta. THOR descuenta stock y deja la venta, pagos, caja y
   bitácora en una única operación.

## 6. Cierre diario

1. Revisa ventas y gastos de cada sede.
2. Registra los egresos con una categoría y método de pago reales.
3. Cada vendedor registra el efectivo contado y cierra su propia caja.
4. El Gerente General revisa diferencias y el Superadministrador consulta la
   bitácora, usuarios conectados y actividad.

## 7. Soporte y seguridad

- La sesión se cierra después de 15 minutos sin actividad.
- Las fotos, comprobantes e IMEI se almacenan en el bucket privado
  `thor-files`.
- Nunca compartas la clave `service_role` ni la agregues a GitHub.
- El usuario puede recuperar su contraseña desde la pantalla de acceso.
- Toda modificación importante queda registrada para revisión del
  Superadministrador.
