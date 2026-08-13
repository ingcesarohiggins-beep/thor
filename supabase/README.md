# Base de datos de THOR

1. Abre **Supabase > SQL Editor > New query**.
2. Copia y ejecuta el contenido de `migrations/202608040001_initial_thor.sql`.
3. En **Authentication > Providers**, deja habilitado Email para los usuarios de THOR.
4. En **Storage**, confirma que exista el bucket privado `thor-files`.

La primera cuenta creada en Supabase Auth se convierte en el superadministrador mediante la función `bootstrap_thor_admin(nombre, usuario)`. La aplicación incorporará ese paso al iniciar por primera vez.

## Variables locales

Duplica `.env.example` como `.env.local` y completa únicamente tus valores. El archivo local queda ignorado por Git.

No publiques `SUPABASE_SERVICE_ROLE_KEY`: esa clave permite administrar toda la base de datos.

## Crear los demas usuarios

1. Ejecuta `migrations/202608060006_admin_user_management.sql` en Supabase SQL Editor.
2. En Supabase CLI despliega la funcion: `supabase functions deploy create-thor-user`.
3. En THOR, el Superadmin crea vendedores o administradores desde **Usuarios**. Un Administrador solo crea vendedores.

La funcion usa la clave segura de Supabase en el servidor; nunca la copies a las variables publicas de THOR.

## Almacenes, vendedores y caja

1. Ejecuta tambien `migrations/202608130007_customers.sql` y `migrations/202608130008_cash_required_for_sales.sql` en el SQL Editor, en ese orden.
2. El Superadministrador crea administradores y vendedores. El Administrador puede crear vendedores y asignarlos a cualquier almacén activo.
3. Cada vendedor trabaja en el almacén asignado. El Administrador puede seleccionar el almacén que administra desde el menú lateral.
4. Antes de confirmar una venta, cada persona debe abrir su propia caja y registrar su fondo inicial. THOR bloquea la venta en la pantalla y en la base de datos hasta que exista una caja abierta.
5. Al terminar el turno, registra el efectivo contado y cierra la caja. Solo el Superadministrador puede cambiar roles o privilegios de usuarios.

## Seguridad y foto de perfil

1. Ejecuta `migrations/202608130009_user_avatars.sql` después de las demás migraciones.
2. Cada sesión se cierra automáticamente después de 15 minutos sin actividad; THOR muestra un aviso a los 13 minutos.
3. Cada usuario puede hacer clic en sus iniciales, al pie del menú lateral, para cargar o reemplazar su foto de perfil. La imagen queda privada en el bucket `thor-files`.

## Supervisión exclusiva del Superadministrador

1. Ejecuta `migrations/202608130010_superadmin_activity_log.sql` después de todas las migraciones anteriores.
2. La etiqueta verde **Conectado** en el menú lateral confirma que THOR está conectado a Supabase sin ocupar el área principal.
3. En **Usuarios**, el Superadministrador verá usuarios conectados, tiempo desde el inicio de actividad, última señal y una bitácora. Administradores y vendedores no pueden consultar esos datos.

## Compras y recepción por lote

1. Ejecuta `migrations/202608130011_purchase_lots_and_supplier_payments.sql` para habilitar **Compras**.
2. Las compras son de pago inmediato: transferencia bancaria, Yape/Plin desde tesorería central o efectivo desde una caja abierta.
3. El efectivo central se registra con la sede **Almacén Central** activa; el efectivo de una sede se descuenta únicamente de su propia caja.
4. Los accesorios ingresan por cantidad y costo promedio. Los celulares, laptops y tablets requieren un IMEI o serie por cada unidad recibida.

## Lotes por etapas y flete

1. DespuÃ©s de ejecutar la migraciÃ³n 011, ejecuta `migrations/202608130012_two_step_purchase_lots_and_freight.sql`.
2. Primero crea el lote: proveedor, factura o guÃ­a, forma de pago, flete y comprobante. En celular, el comprobante permite tomar una foto con la cÃ¡mara.
3. DespuÃ©s agrega uno o varios productos al lote. Los accesorios ingresan por cantidad; celulares, laptops y tablets requieren un IMEI o serie por unidad. Puedes retomar un lote pendiente desde **Compras**.
4. Al confirmar se registra una sola vez el stock, el pago inmediato de la factura y el gasto de flete. No existe crÃ©dito a proveedores.
5. Efectivo central requiere tener activa la sede **AlmacÃ©n Central** y una caja abierta; el efectivo de una sede solo descuenta su propia caja. Transferencia y Yape/Plin se registran como salida de tesorerÃ­a sin afectar el efectivo de caja.

## Catálogo antes de inventario

1. Ejecuta `migrations/202608130013_product_catalog_and_scanner.sql` y después `migrations/202608130014_prevent_duplicate_catalog_products.sql`.
2. Ya no se ingresan equipos directamente desde **Inventario**. En **Catálogo** se crea el producto completo (marca, modelo y capacidad o potencia); después se selecciona en **Compras** y se agrega al lote.
3. El catálogo incluye iPhone 14 en adelante, Galaxy S24 en adelante y cargadores USB-C por potencia. Marca + modelo + capacidad/potencia es una combinación única: THOR no permite crear el mismo producto dos veces.
4. Si llega un modelo que no está en la lista, el Administrador o Superadministrador crea primero el modelo y luego el producto con su capacidad o potencia.
5. Para equipos serializados, **Compras** permite escanear el código de barras del IMEI desde la cámara cuando el navegador lo soporta. Si Safari no ofrece la lectura automática, se conserva el ingreso manual o por lector Bluetooth.

## Recuperacion de contrasena

En Supabase > Authentication > URL Configuration, agrega la URL publica de THOR en **Redirect URLs**. Luego cada usuario puede usar **Olvide mi contrasena** desde la pantalla de inicio de sesion.

## Datos de prueba

`seed_demo.sql` carga un catálogo identificado por `DEMO-`: iPhone 14 en adelante, Galaxy S24 en adelante, cargadores de distintas potencias y accesorios Apple. Ejecuta en una sola consulta `set app.thor_seed_demo = 'true';` seguido del contenido del archivo. Cuando terminen las pruebas, usa `cleanup_demo.sql` con su protección indicada; no borrará productos reales.
