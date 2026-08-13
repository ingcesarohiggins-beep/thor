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

## Recuperacion de contrasena

En Supabase > Authentication > URL Configuration, agrega la URL publica de THOR en **Redirect URLs**. Luego cada usuario puede usar **Olvide mi contrasena** desde la pantalla de inicio de sesion.

## Datos de prueba

`seed_demo.sql` carga un catálogo identificado por `DEMO-`: iPhone 14 en adelante, Galaxy S24 en adelante, cargadores de distintas potencias y accesorios Apple. Ejecuta en una sola consulta `set app.thor_seed_demo = 'true';` seguido del contenido del archivo. Cuando terminen las pruebas, usa `cleanup_demo.sql` con su protección indicada; no borrará productos reales.
