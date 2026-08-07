# THOR · Inventario, ventas y caja

Sistema móvil para equipos y accesorios: inventario por almacén, ventas, caja, gastos, proveedores, transferencias y devoluciones.

## Base de datos

THOR usa Supabase (PostgreSQL, Auth y Storage) y se publica como aplicación estática en GitHub Pages.

1. La estructura de la base está en `supabase/migrations/202608040001_initial_thor.sql`.
2. Para el acceso desde GitHub Pages, ejecuta después `supabase/migrations/202608040002_github_pages_access.sql` en Supabase > SQL Editor.

Las migraciones crean almacenes, usuarios, equipos con IMEI y foto, accesorios, precios, proveedores, lotes, caja, gastos, ventas, transferencias, devoluciones y auditoría.

La migración `202608060003_complete_sale.sql` agrega la confirmación transaccional de ventas: guarda la venta y sus pagos, descuenta el stock, registra el movimiento y deja auditoría en una sola operación.

## Datos de demostración

Después de ejecutar las migraciones y crear el primer superadministrador, puedes cargar datos de prueba controlados en Supabase > SQL Editor:

```sql
set app.thor_seed_demo = 'true';
-- luego ejecuta el contenido de supabase/seed_demo.sql
```

Ejecuta esa línea y el contenido de `supabase/seed_demo.sql` juntos, en la misma consulta. El script crea dos celulares con IMEI, accesorios, precios y existencias identificadas con el prefijo `DEMO-`. Tiene una protección que evita su ejecución accidental si no se define esa variable de sesión.

Para retirar después solo los datos de prueba, ejecuta juntos:

```sql
set app.thor_cleanup_demo = 'true';
-- luego ejecuta el contenido de supabase/cleanup_demo.sql
```

El limpiador borra únicamente registros asociados a productos con SKU `DEMO-`; no borra usuarios, sedes ni información real. No mezcles productos `DEMO-` y reales dentro de una misma venta.

## Pruebas automáticas

```powershell
npm.cmd run test
npm.cmd run check
```

Las pruebas actuales validan cálculos de venta y pagos combinados. El flujo de GitHub Actions ejecuta estas pruebas, el lint y la compilación ante cada envío o pull request.

## GitHub Pages

1. En GitHub abre **Settings > Pages > Build and deployment** y selecciona **GitHub Actions**.
2. Abre **Settings > Secrets and variables > Actions > Variables** y crea:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
3. Cada cambio enviado a `main` actualiza automáticamente:
   `https://ingcesarohiggins-beep.github.io/thor/`

La clave Publishable/Anon es la que usa la aplicación. No se necesita ni se debe subir la clave `service_role` a GitHub.

## Desarrollo local

```powershell
npm.cmd install
npm.cmd run dev
```

Las cuentas se crean dentro del módulo **Usuarios**. El Superadmin puede crear vendedores y administradores; el Administrador solo puede crear vendedores.
